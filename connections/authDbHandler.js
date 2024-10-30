import pool from "./database.js";

export const login = async (username, password) => {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query(
      "SELECT * FROM Users where username = ? and password = ?",
      [username, password]
    );
    return rows.length == 0 ? null : rows[0];
  } catch (error) {
    console.error("Error fetching users:", error);
    throw error;
  } finally {
    connection.release();
  }
};

export const signup = async (username, password, name, publickey) => {
  const query = `INSERT INTO Users (username, password, name, publickey) VALUES (?, ?, ?, ?)`;

  try {
    const [result] = await pool.execute(query, [
      username,
      password,
      name,
      publickey,
    ]);
    return result.insertId;
  } catch (error) {
    console.error("Database error:", error);
    throw error;
  }
};
