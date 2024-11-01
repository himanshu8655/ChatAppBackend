import dotenv from "dotenv";
import express from "express";
import jwt from "jsonwebtoken";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs, { access } from "fs";
import { fileURLToPath } from "url";
import {
  getAllUsers,
  createGroup,
  getGroups,
  storeMessages,
  getMissingMessages,
  deleteMessageById,
} from "./connections/userDbHandler.js";
import { login, signup } from "./connections/authDbHandler.js";
import NodeRSA from "node-rsa";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname.split(" ").join("_"));
  },
});
const upload = multer({ storage });

const server = http.createServer(app);
const io = new Server(server, {
  connectionStateRecovery: {},
  cors: {
    origin: process.env.CORS_ORIGIN_ALLOWED_HOST.split(","),
    methods: ["GET", "POST"],
  },
});

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const PORT = process.env.PORT || 3000;

const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split(" ")[1];
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        return res.status(403).send({ message: "Unauthorized Access" });
      }
      req.user = user;
      next();
    });
  } else {
    res.sendStatus(403).send({ message: "Unauthorized Access" });
  }
};

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error("Authentication error"));
  }
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return next(new Error("Invalid token"));
    }
    socket.user = decoded;
    next();
  });
});

const users = new Map();

const validateAccess = async (userId, groupId) => {
  if (groupId.includes("_")) {
    const [id_1, id_2] = groupId.split("_");
    if (id_1 == userId || id_2 == userId) return true;
    else return false;
  }
  const groups = await getGroups(userId);
  const groupExists = groups.some((group) => group.group_id == groupId);
  return groupExists;
};

io.on("connection", (socket) => {
  const userId = socket.user.id;
  console.log(userId);
  users.set(userId, socket);

  console.log(`${userId} connected`);
  socket.on("join_group", async (data) => {
    const access = await validateAccess(userId, data.room_id);
    if (access) {
      socket.join(data.room_id);
      console.log("offet", data.clientOffset);
      const missingMessages = await getMissingMessages(
        data.room_id,
        data.clientOffset
      );
      missingMessages.forEach((message) => {
        message.from = message.from_user;
        message.isFile = message.is_file;
        message.group = message.group_id;
        message.msgStatus = message.msg_status;
        message.newMessage = false;
        io.to(message.group).emit("message", message);
      });
    } else {
      socket.emit("unauthorized_access", { access: false });
      users.delete(userId);
      socket.disconnect();
    }
  });

  socket.on("message", async (data) => {
    data.msgStatus = "read";
    const result = await storeMessages(data);
    data.id = result;
    io.to(data.group).emit("message", data);
    io.to(data.group).emit("messageStatusUpdate", {
      id: data.id,
      msgStatus: "delivered",
    });
  });

  socket.on("typing", ({ userId, groupId }) => {
    io.to(groupId).emit("typing", { userId: userId });
  });

  socket.on("admin_control", ({ type, messageId, userId, groupId }) => {
    if (type == "delete") {
      deleteMessageById(messageId);
      io.to(groupId).emit("admin_control", { type, messageId, userId });
    }

    if(type == "edit"){

    }
  });
  socket.on("disconnect", () => {
    users.delete(userId);
    console.log(`${userId} disconnected`);
  });
});

app.get("/test", async (req, res) => {
  try {
    const key = new NodeRSA({ b: 2048 });
    const publicKey = key.exportKey("public");
    const privateKey = key.exportKey("private");
    res.json({ message: "working", keyPair: { publicKey, privateKey } });
  } catch (error) {
    res.status(500).json({ message: "Error generating keys", error });
  }
});

app.post("/groups", authenticateJWT, async (req, res) => {
  const { groupName, userIds } = req.body;
  const currentUserId = req.user.id;
  if (!groupName || !Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ message: "Invalid request data" });
  }
  try {
    const result = await createGroup(groupName, userIds, currentUserId);
    return res.status(201).json(result);
  } catch (error) {
    return res.status(500).json({
      message: "Error creating group and adding members",
      error: error,
    });
  }
});

app.get("/groups", authenticateJWT, async (req, res) => {
  const userId = req.user.id;
  try {
    const groups = await getGroups(userId);
    return res.status(200).send(groups);
  } catch (error) {
    return res.status(500).json({
      message: "Error fetching user list",
    });
  }
});
app.post("/upload", authenticateJWT, upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }
  const fileUrl = `${req.protocol}://${req.get("host")}/file?name=${
    req.file.filename
  }`;

  res.status(200).json({
    message: "File uploaded successfully",
    fileUrl: fileUrl,
  });
});

app.post("/signup", async (req, res) => {
  const { username, password, name, publickey } = req.body;
  try {
    const userId = await signup(username, password, name, publickey);
    const jwtResponse = generateJwtTokenResponse(userId, username, name);
    res.status(201).json(jwtResponse);
  } catch (error) {
    return res.status(400).json({ message: "User already exists" });
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await login(username, password);
  if (user == null) {
    return res.status(400).json({ message: "Invalid credentials" });
  }
  const jwtResponse = generateJwtTokenResponse(
    user.id,
    user.username,
    user.name
  );
  return res.status(200).json(jwtResponse);
});

const generateJwtTokenResponse = (userId, userName, name) => {
  const token = jwt.sign({ id: userId }, JWT_SECRET, {
    expiresIn: "1h",
  });
  const res = {
    token: token,
    userId: userId,
    name: name,
    userName: userName,
  };
  return res;
};

app.get("/users", authenticateJWT, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const users = await getAllUsers(currentUserId);
    res.status(200).json(users);
  } catch (error) {
    res.status(500).send({ error: "Error fetching users!" });
  }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.get("/file", (req, res) => {
  const { name } = req.query;
  if (!name) {
    return res.status(400).json({ message: "Filename is required" });
  }

  const filePath = path.join(__dirname, "uploads", name);

  fs.stat(filePath, (err) => {
    if (err) {
      return res.status(404).json({ message: "File not found" });
    }

    res.sendFile(filePath, (err) => {
      if (err) {
        res.status(500).json({ message: "Error sending the file" });
      }
    });
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
