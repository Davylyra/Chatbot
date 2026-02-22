import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { getCollection } from "../config/db.js";
import { ObjectId } from "mongodb";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { rateLimiters } from "../middleware/rateLimiter.js";
import {
  validateAuthPayload,
  validateEmail,
  validateGmailDomain,
  validatePassword,
} from "../middleware/inputValidation.js";

dotenv.config();

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key" ;

console.log("Auth router file is executing");

// REGISTER
router.post("/signup", rateLimiters.authRateLimit, validateAuthPayload, async (req, res) => {
  const { name, email, password } = req.body;

  // Validate required fields
  const errors = [];
  
  if (!name || !name.trim()) {
    errors.push('Name is required');
  } else if (name.trim().length < 3) {
    errors.push('Name must be at least 3 characters');
  } else if (name.length > 100) {
    errors.push('Name must not exceed 100 characters');
  }

  if (!email) {
    errors.push('Email is required');
  }

  if (!password) {
    errors.push('Password is required');
  }

  if (errors.length > 0) {
    console.log('🔍 Signup validation failed:', { name, email, hasPassword: !!password, errors });
    return res.status(400).json({ 
      success: false, 
      message: 'Validation failed',
      errors,
      errorDetails: errors.join('; ')
    });
  }

  // Normalize email
  const normalizedEmail = String(email).toLowerCase();

  // Use shared validators
  if (!validateEmail(normalizedEmail)) {
    console.log('🔍 Email format invalid:', normalizedEmail);
    return res.status(400).json({ 
      success: false,
      message: 'Invalid email format',
      errors: ['Invalid email format']
    });
  }

  if (!validateGmailDomain(normalizedEmail)) {
    console.log('🔍 Email not @gmail.com:', normalizedEmail);
    return res.status(400).json({ 
      success: false,
      message: 'Email must end with @gmail.com',
      errors: ['Email must end with @gmail.com']
    });
  }

  const pwdValidation = validatePassword(password);
  if (!pwdValidation.valid) {
    console.log('🔍 Password validation failed:', pwdValidation.errors);
    return res.status(400).json({ 
      success: false,
      message: 'Password does not meet requirements',
      errors: pwdValidation.errors,
      errorDetails: pwdValidation.errors.join('; ')
    });
  }

  try {
    const usersCollection = await getCollection("users");
    
    // Check if user exists
    const existingUser = await usersCollection.findOne({ email: normalizedEmail });
    if (existingUser) {
      console.log('🔍 User already exists:', normalizedEmail);
      return res.status(400).json({ 
        success: false,
        message: "Email already registered",
        errors: ["An account with this email already exists"]
      });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Insert user (email not verified yet)
    const newUser = {
      name: name.trim(),
      email: normalizedEmail,
      password_hash,
      is_verified: false,
      created_at: new Date(),
      updated_at: new Date()
    };
    
    const result = await usersCollection.insertOne(newUser);

    console.log('✅ Signup successful:', { name, email: normalizedEmail, userId: result.insertedId });

    // IMPORTANT: Do NOT auto-login or issue a token on signup. Require explicit login.
    return res.status(201).json({
      success: true,
      message: 'Account created successfully, please log in.'
    });
  } catch (err) {
    console.error('❌ Signup error:', err);
    return res.status(500).json({ 
      success: false,
      message: "Signup failed due to server error",
      errors: ["Please try again later"]
    });
  }
});

// LOGIN
// LOGIN
router.post("/login", rateLimiters.authRateLimit, validateAuthPayload, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(401).json({ message: "Email and password are required" });

  try {
    const usersCollection = await getCollection("users");
    
    // Normalize email for lookup
    const normalizedEmail = String(email).toLowerCase();
    const user = await usersCollection.findOne({ email: normalizedEmail });

    if (!user)
      return res.status(401).json({ message: "Invalid email or password" });

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch)
      return res.status(401).json({ message: "Invalid email or password" });

    const token = jwt.sign(
      { id: user._id.toString() },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(200).json({
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        is_verified: user.is_verified,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// GUEST LOGIN (explicit, no token)
router.post('/guest', rateLimiters.authRateLimit, async (req, res) => {
  try {
    // Return guest session info - frontend should treat this as guest-only (no token)
    return res.status(200).json({
      guest: true,
      user: {
        id: 'guest',
        name: 'Guest User',
        email: 'guest@glinax.com'
      }
    });
  } catch (err) {
    console.error('Guest login error', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

//  SEND EMAIL VERIFICATION CODE (called when user tries to pay)
router.post("/send-verification-code", async (req, res) => {
  const { email } = req.body;

  try {
    const usersCollection = await getCollection("users");
    
    const user = await usersCollection.findOne({ email });

    if (!user)
      return res.status(404).json({ message: "User not found" });

    if (user.is_verified)
      return res.status(400).json({ message: "Email already verified" });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await usersCollection.updateOne(
      { email },
      { 
        $set: { 
          verification_code: code, 
          verification_expires: expires,
          updated_at: new Date()
        } 
      }
    );

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: `"AI Chatbot" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Email Verification Code",
      text: `Your verification code is ${code}. It expires in 10 minutes.`,
    });

    res.status(200).json({ message: "Verification code sent to email" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

//  CONFIRM EMAIL CODE
router.post("/confirm-email", async (req, res) => {
  const { email, code } = req.body;

  try {
    const usersCollection = await getCollection("users");
    
    const user = await usersCollection.findOne({ email });

    if (!user)
      return res.status(404).json({ message: "User not found" });

    if (user.verification_code !== code)
      return res.status(400).json({ message: "Invalid verification code" });

    if (new Date() > new Date(user.verification_expires))
      return res.status(400).json({ message: "Verification code expired" });

    await usersCollection.updateOne(
      { email },
      { 
        $set: { 
          is_verified: true,
          updated_at: new Date()
        },
        $unset: {
          verification_code: "",
          verification_expires: ""
        }
      }
    );

    res.status(200).json({ message: "Email verified successfully!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;