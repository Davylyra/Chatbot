// middleware/verifyEmailMiddleware.js
import pool from "../config/db.js";

/**
 * Ensures the logged-in user has a verified email
 * To be used after authMiddleware
 */
const verifyEmailMiddleware = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      "SELECT is_verified FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const { is_verified } = result.rows[0];

    if (!is_verified) {
      return res.status(403).json({
        message: "Please verify your email before performing this action",
      });
    }

    next();
  } catch (err) {
    console.error("verifyEmailMiddleware error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export default verifyEmailMiddleware;