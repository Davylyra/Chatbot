import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { getCollection } from "../config/db.js";
import dotenv from "dotenv";
dotenv.config();

export const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const validationFailures = [];

    if (!name || typeof name !== 'string') validationFailures.push('Name is required');
    else {
      const trimmedName = name.trim();
      if (trimmedName.length < 3) validationFailures.push('Name must be at least 3 characters long');
      if (trimmedName.length > 100) validationFailures.push('Name must not exceed 100 characters');
      if (!/^[a-zA-Z\s'-]+$/.test(trimmedName)) validationFailures.push('Name can only contain letters, spaces, hyphens and apostrophes');
    }

    if (!email || typeof email !== 'string') validationFailures.push('Email is required');
    else {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) validationFailures.push('Invalid email format');
      if (email.length > 255) validationFailures.push('Email must not exceed 255 characters');
      if (!email.toLowerCase().endsWith('@gmail.com')) validationFailures.push('Email must end with @gmail.com');
    }

    if (!password || typeof password !== 'string') validationFailures.push('Password is required');
    else {
      if (password.length < 6) validationFailures.push('Password must be at least 6 characters long');
      if (password.length > 128) validationFailures.push('Password must not exceed 128 characters');
      if (!/[A-Z]/.test(password)) validationFailures.push('Password must contain at least one uppercase letter');
      if (!/[0-9]/.test(password)) validationFailures.push('Password must contain at least one number');
    }

    if (validationFailures.length) {
      return res.status(400).json({ success: false, message: "Validation failed", errors: validationFailures });
    }

    const registeredUsersCollection = await getCollection("users");
    const normalizedEmail = email.toLowerCase();
    
    if (await registeredUsersCollection.findOne({ email: normalizedEmail })) {
      return res.status(409).json({ success: false, message: "An account with this email already exists. Please login instead." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newStudentProfile = {
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      isEmailVerified: false,
      status: 'active',
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
      registrationIp: req.ip || req.connection.remoteAddress
    };

    await registeredUsersCollection.insertOne(newStudentProfile);

    return res.status(201).json({ success: true, message: 'Account created successfully, please log in.' });
  } catch (authError) {
    if (authError.code === 11000) {
      return res.status(409).json({ success: false, message: "An account with this email already exists. Please login instead." });
    }
    res.status(500).json({ success: false, message: "Registration failed due to a server error. Please try again." });
  }
};

export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const loginFailures = [];
    
    if (!email || typeof email !== 'string') loginFailures.push('Email is required');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) loginFailures.push('Invalid email format');

    if (!password || typeof password !== 'string') loginFailures.push('Password is required');
    else if (password.length < 6) loginFailures.push('Password must be at least 6 characters');

    if (loginFailures.length) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: loginFailures });
    }

    const registeredUsersCollection = await getCollection("users");
    const matchedAccount = await registeredUsersCollection.findOne({ email: email.toLowerCase() });

    if (!matchedAccount || !matchedAccount.password) {
      return res.status(401).json({ success: false, message: "Invalid email or password. Please check your credentials and try again." });
    }

    const isPasswordMatch = await bcrypt.compare(password, matchedAccount.password);
    if (!isPasswordMatch) {
      return res.status(401).json({ success: false, message: "Invalid email or password. Please check your credentials and try again." });
    }

    if (['suspended', 'deleted'].includes(matchedAccount.status)) {
      return res.status(403).json({ success: false, message: "Your account has been suspended. Please contact support." });
    }

    const authenticationToken = jwt.sign(
      { id: matchedAccount._id.toString(), email: matchedAccount.email, isEmailVerified: matchedAccount.isEmailVerified || false },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    await registeredUsersCollection.updateOne(
      { _id: matchedAccount._id },
      { $set: { lastLogin: new Date(), lastLoginIp: req.ip || req.connection.remoteAddress } }
    );

    res.json({ 
      success: true,
      token: authenticationToken,
      user: { 
        id: matchedAccount._id.toString(), 
        name: matchedAccount.name, 
        email: matchedAccount.email,
        isEmailVerified: matchedAccount.isEmailVerified || false,
        createdAt: matchedAccount.createdAt || matchedAccount.created_at
      },
      message: `Login successful! Welcome back, ${matchedAccount.name}`
    });
  } catch (authError) {
    res.status(500).json({ success: false, message: "Login failed due to a server error. Please try again in a moment." });
  }
};
