import pool from "./database.js";

export const getAllUsers = async (currentUserId) => {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query(
      "SELECT username, id FROM Users where id!=? ",
      [currentUserId]
    );
    return rows;
  } catch (error) {
    console.error("Error fetching users:", error);
    throw error;
  } finally {
    connection.release();
  }
};

export const getGroups = async (userId) => {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query(
      `SELECT gd.id AS group_id, gd.name AS group_name
        FROM Group_Details gd
        JOIN Group_Members gm ON gd.id = gm.group_id
        WHERE gm.user_id = ?;`,
      [userId]
    );
    return rows;
  } catch (error) {
    console.error("Error fetching users:", error);
    throw error;
  } finally {
    connection.release();
  }
};

export const createGroup = async (groupName, userIds, adminId) => {
  const connection = await pool.getConnection();
  try {
    const [groupRow] = await connection.query(
      "INSERT INTO group_details (name, admin_id) VALUES (?, ?)",
      [groupName, adminId]
    );
    const groupId = groupRow.insertId;
    const groupMembers = userIds.map((userId) => [groupId, userId]);
    groupMembers.push([groupId, adminId]);
    await connection.query(
      "INSERT INTO group_members (group_id, user_id) VALUES ?",
      [groupMembers]
    );
    await connection.commit();
    const res = { groupId: groupId, message: "Group Created Successfully!" };
    return res;
  } catch (error) {
    console.log("eror", error);
    if (connection) await connection.rollback();
    throw error;
  } finally {
    if (connection) connection.release();
  }
};

export const storeMessages = async (message) => {
  const connection = await pool.getConnection();
  try {
    const query = `
      INSERT INTO messages (from_user, message, is_file, msg_status, group_id, client_offset)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const [result] = await connection.query(query, [
      message.from,
      message.message,      
      message.isFile,       
      message.msgStatus,   
      message.group,       
      message.clientOffset
    ]);
    return result.insertId;
  } catch (error) {
    console.error("Error storing message:", error);
    throw error;
  } finally {
    connection.release();
  }
};


export const getMissingMessages = async (groupId, clientOffset) => {
  const connection = await pool.getConnection();
  try {
    const query = `
      SELECT * FROM messages 
      WHERE group_id = ? 
      ORDER BY id ASC
    `;
    const [rows] = await connection.query(query, [groupId]);
    return rows;
  } catch (error) {
    console.error("Error fetching missing messages:", error);
    throw error;
  } finally {
    connection.release();
  }
};

export const deleteMessageById = async (messageId) => {
  const connection = await pool.getConnection();
  try {
    const query = `
      DELETE FROM messages 
      WHERE id = ?
    `;
    const [result] = await connection.query(query, [messageId]);
    return result.affectedRows > 0;
  } catch (error) {
    console.error("Error deleting message:", error);
    throw error;
  } finally {
    connection.release();
  }
};

