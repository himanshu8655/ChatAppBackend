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

export const storeMessages = async (sender, groupId, content) => {
  const query = `INSERT INTO Messages (sender_id, group_id, content, timestamp, msgStatus) VALUES (?, ?, ?, ?, ?)`;

  try {
    const [result] = await pool.execute(query, [sender, groupId, content, new Date(), "delivered"]);
    return result.insertId;
  } catch (error) {
    console.error("Database error:", error);
    throw error;
  }
};
