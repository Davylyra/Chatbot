import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { getCollection } from "../config/db.js";
import dotenv from "dotenv";
dotenv.config();


export const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const errors = [];

    if (!name || typeof name !== 'string') {
      errors.push('Name is required');
    } else {
      if (name.trim().length < 3) {
        errors.push('Name must be at least 3 characters long');
      }
      if (name.trim().length > 100) {
        errors.push('Name must not exceed 100 characters');
      }
      if (!/^[a-zA-Z\s'-]+$/.test(name.trim())) {
        errors.push('Name can only contain letters, spaces, hyphens and apostrophes');
      }
    }

    if (!email || typeof email !== 'string') {
      errors.push('Email is required');
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        errors.push('Invalid email format');
      }
      if (email.length > 255) {
        errors.push('Email must not exceed 255 characters');
      }
    }

    if (!password || typeof password !== 'string') {
      errors.push('Password is required');
    } else {
      if (password.length < 6) {
        errors.push('Password must be at least 6 characters long');
      }
      if (password.length > 128) {
        errors.push('Password must not exceed 128 characters');
      }
      // Optional: Add password strength requirements
      if (!/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
      }
      if (!/[0-9]/.test(password)) {
        errors.push('Password must contain at least one number');
       }
    }

    if (errors.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Validation failed",
        errors
      });
    }
    // Enforce gmail-only addresses for signup
    if (!email.toLowerCase().endsWith('@gmail.com')) {
      return res.status(400).json({ success: false, message: 'Email must end with @gmail.com' });
    }
    const usersCollection = await getCollection("users");
    
    const existingUser = await usersCollection.findOne({ 
      email: email.toLowerCase() 
    });
    
    if (existingUser) {
      return res.status(409).json({ 
        success: false, 
        message: "An account with this email already exists. Please login instead." 
      });
    }

    const hashed = await bcrypt.hash(password, 10);

    const newUser = {
      name: name.trim(),
      email: email.toLowerCase(),
      password: hashed,
      isEmailVerified: false,
      status: 'active',
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
      registrationIp: req.ip || req.connection.remoteAddress
    };

    console.log(`Registering new user: ${newUser.email}`);

    const result = await usersCollection.insertOne(newUser);

    console.log(`Registration saved for ${newUser.email} (insertedId: ${result.insertedId})`);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully, please log in.'
    });
  } catch (err) {
    console.error("Registration error:", err);
    
    if (err.code === 11000) {
      return res.status(409).json({ 
        success: false,
        message: "An account with this email already exists. Please login instead."
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: "Registration failed due to a server error. Please try again."
    });
  }
};

export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const errors = [];
    
    if (!email || typeof email !== 'string') {
      errors.push('Email is required');
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        errors.push('Invalid email format');
      }
    }

    if (!password || typeof password !== 'string') {
      errors.push('Password is required');
    } else if (password.length < 6) {
      errors.push('Password must be at least 6 characters');
    }

    if (errors.length > 0) {
      return res.status(400).json({ 
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    const usersCollection = await getCollection("users");
    
    // Case-insensitive email lookup
    const user = await usersCollection.findOne({ 
      email: email.toLowerCase() 
    });

    if (!user) {
      console.log(`Login failed: User not found for email ${email}`);
      return res.status(401).json({ 
        success: false,
        message: "Invalid email or password. Please check your credentials and try again." 
      });
    }

    if (!user.password) {
      console.error(`User ${user._id} has no password field`);
      return res.status(500).json({ 
        success: false,
        message: "Account configuration error. Please contact support." 
      });
    }

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      console.log(`Login failed: Invalid password for user ${user._id}`);
      return res.status(401).json({ 
        success: false,
        message: "Invalid email or password. Please check your credentials and try again." 
      });
    }

    if (user.status === 'suspended' || user.status === 'deleted') {
      return res.status(403).json({ 
        success: false,
        message: "Your account has been suspended. Please contact support." 
      });
    }

    const token = jwt.sign(
      { 
        id: user._id.toString(),
        email: user.email,
        isEmailVerified: user.isEmailVerified || false
      }, 
      process.env.JWT_SECRET, 
      { expiresIn: "7d" }
    );

    await usersCollection.updateOne(
      { _id: user._id },
      { 
        $set: { 
          lastLogin: new Date(),
          lastLoginIp: req.ip || req.connection.remoteAddress
        } 
      }
    );

    console.log(`Login successful for user ${user._id} (${user.email})`);

    res.json({ 
      success: true,
      token, 
      user: { 
        id: user._id.toString(), 
        name: user.name, 
        email: user.email,
        isEmailVerified: user.isEmailVerified || false,
        createdAt: user.createdAt || user.created_at
      },
      message: "Login successful! Welcome back, " + user.name
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ 
      success: false,
      message: "Login failed due to a server error. Please try again in a moment."
    });
  }
};