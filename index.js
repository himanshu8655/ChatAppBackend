import dotenv from 'dotenv';
import express from 'express';
import jwt from 'jsonwebtoken';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';   
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname.split(" ").join("_"));
  },
});
const upload = multer({ storage });

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN_ALLOWED_HOST,
    methods: ["GET", "POST"],
  },
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const PORT = process.env.PORT || 3000;

const usersDB = { '1': { username: '1', password: '1' }, '2': { username: '2', password: '2' }, '3': { username: '3', password: '3' }  }

const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        return res.sendStatus(403);
      }
      req.user = user;
      next();
    });
  } else {
    res.sendStatus(401);
  }
};

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error'));
  }
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return next(new Error('Invalid token'));
    }
    socket.user = decoded;
    next();
  });
});

const users = new Map();
const groups = new Map();

io.on('connection', (socket) => {
  const userId = socket.user.id;
  users.set(userId, socket);

  console.log(`${userId} connected`);

  socket.on('private_message', ({ toUserId, message, fileUri }) => {
    const recipientSocket = users.get(toUserId);
    if (recipientSocket) {
      recipientSocket.emit('private_message', { from: userId, message, fileUri });
    } else {
      socket.emit('private_message_error', { error: 'User not connected' });
    }
  });
  socket.on('join_room', (roomId) => {
    socket.join(roomId);
});

socket.on('message', (data) => {
  io.to(data.room).emit('message', data);
});

  socket.on('typing', ({ userId, roomId }) => {
    io.to(roomId).emit("typing",{userId:userId});
});

  socket.on('disconnect', () => {
    users.delete(userId);
    console.log(`${userId} disconnected`);
  });
});

app.post('/groups', authenticateJWT, (req, res) => {
  const { name, userIds } = req.body;
  const currentUserId = req.user.id;

  if (groups.has(name)) {
    return res.status(400).json({ message: 'Group name already exists' });
  }

  if (!userIds.includes(currentUserId)) {
    userIds.push(currentUserId); 
  }

  groups.set(name, {
    members: userIds,
  });

  res.status(201).json({ message: 'Group created successfully', groupName: name });
});

app.get('/groups', authenticateJWT, (req, res) => {
  const currentUserId = req.user.id; 
  const userGroups = [];

  groups.forEach((group, groupName) => {
    if (group.members && group.members.includes(currentUserId)) {
      userGroups.push({
        groupName: groupName,
        members: group.members, 
      });
    }
  });
  
  res.status(200).json(userGroups);
});
app.post('/upload', authenticateJWT, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }
  const fileUrl = `${req.protocol}://${req.get('host')}/file?name=${req.file.filename}`;

  res.status(200).json({
    message: 'File uploaded successfully',
    fileUrl: fileUrl 
  });
});

app.post('/signup', (req, res) => {
  const { username, password } = req.body;
  if (usersDB[username]) {
    return res.status(400).json({ message: 'User already exists' });
  }
  usersDB[username] = { username, password };
  res.status(201).json({ message: 'User created successfully' });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = usersDB[username];
  if (!user || user.password !== password) {
    return res.status(400).json({ message: 'Invalid credentials' });
  }
  const token = jwt.sign({ id: username }, JWT_SECRET, { expiresIn: '1h' });
  res.json({token: token, userId: username });
});

app.get('/users', authenticateJWT, (req, res) => {
  const currentUserId = req.user.id;
  
  const users = Object.keys(usersDB)
    .filter((key) => key !== currentUserId)
    .map((key) => ({
      id: key, 
      username: usersDB[key].username,
    }));
  
  res.status(200).json(users); 
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.get('/file', (req, res) => {
  const { name } = req.query;
  if (!name) {
    return res.status(400).json({ message: 'Filename is required' });
  }

  const filePath = path.join(__dirname, 'uploads', name);

  fs.stat(filePath, (err) => {
    if (err) {
      return res.status(404).json({ message: 'File not found' });
    }

    res.sendFile(filePath, (err) => {
      if (err) {
        res.status(500).json({ message: 'Error sending the file' });
      }
    });
  });
});


server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
