import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { getCollection } from "../../config/db.js";
import { ObjectId } from "mongodb";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { rateLimiters } from "../rateLimiter.js";
import {
  validateAuthPayload,
  validateEmail,
  validateGmailDomain,
  validatePassword,
} from "../inputValidation.js";
import sendVerificationEmail from "../../utils/sendVerificationEmail.js";

dotenv.config();

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

console.log("Auth router file is executing");

// Step 1: User enters email → we send verification code
router.post("/send-signup-verification", rateLimiters.authRateLimit, async (req, res) => {
  const { email } = req.body;

  const errors = [];
  if (!email) {
    errors.push('Email is required');
  }

  if (errors.length > 0) {
    return res.status(400).json({ 
      success: false, 
      message: 'Validation failed',
      errors
    });
  }

  const normalizedEmail = String(email).toLowerCase();

  if (!validateEmail(normalizedEmail)) {
    return res.status(400).json({ 
      success: false,
      message: 'Invalid email format',
      errors: ['Invalid email format']
    });
  }

  if (!validateGmailDomain(normalizedEmail)) {
    return res.status(400).json({ 
      success: false,
      message: 'Email must end with @gmail.com',
      errors: ['Email must end with @gmail.com']
    });
  }

  try {
    const usersCollection = await getCollection("users");
    const signupVerificationsCollection = await getCollection("signup_verifications");
    
    const existingUser = await usersCollection.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ 
        success: false,
        message: "Email already registered",
        errors: ["An account with this email already exists"]
      });
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await signupVerificationsCollection.updateOne(
      { email: normalizedEmail },
      { 
        $set: { 
          email: normalizedEmail,
          verification_code: verificationCode, 
          expires_at: expiresAt,
          created_at: new Date()
        }
      },
      { upsert: true }
    );

    await sendVerificationEmail(normalizedEmail, verificationCode);

    console.log(' Verification code sent:', { email: normalizedEmail });

    return res.status(200).json({
      success: true,
      message: 'Verification code sent to your email. Valid for 10 minutes.',
      email: normalizedEmail
    });
  } catch (err) {
    console.error(' Send verification error:', err);
    return res.status(500).json({ 
      success: false,
      message: "Failed to send verification code",
      errors: ["Please try again later"]
    });
  }
});

// VERIFY SIGNUP AND CREATE ACCOUNT
// Step 2: User enters verification code → we create account
router.post("/verify-signup", rateLimiters.authRateLimit, async (req, res) => {
  const { email, verification_code, name, password } = req.body;

  const errors = [];
  
  if (!email) {
    errors.push('Email is required');
  }
  if (!verification_code) {
    errors.push('Verification code is required');
  }
  if (!name) {
    errors.push('Name is required');
  }
  if (!password) {
    errors.push('Password is required');
  }

  if (errors.length > 0) {
    return res.status(400).json({ 
      success: false, 
      message: 'Validation failed',
      errors
    });
  }

  const normalizedEmail = String(email).toLowerCase();

  if (name.trim().length < 3) {
    errors.push('Name must be at least 3 characters');
  } else if (name.length > 100) {
    errors.push('Name must not exceed 100 characters');
  }

  if (!validateEmail(normalizedEmail)) {
    errors.push('Invalid email format');
  }
  if (!validateGmailDomain(normalizedEmail)) {
    errors.push('Email must end with @gmail.com');
  }

  const pwdValidation = validatePassword(password);
  if (!pwdValidation.valid) {
    errors.push(...pwdValidation.errors);
  }

  if (errors.length > 0) {
    return res.status(400).json({ 
      success: false,
      message: 'Validation failed',
      errors
    });
  }

  try {
    const usersCollection = await getCollection("users");
    const signupVerificationsCollection = await getCollection("signup_verifications");
    
    const existingUser = await usersCollection.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ 
        success: false,
        message: "Email already registered",
        errors: ["An account with this email already exists"]
      });
    }

    const verificationRecord = await signupVerificationsCollection.findOne({ 
      email: normalizedEmail 
    });

    if (!verificationRecord) {
      return res.status(400).json({ 
        success: false,
        message: "Verification code not found",
        errors: ["Please request a new verification code"]
      });
    }

    if (verificationRecord.verification_code !== String(verification_code)) {
      return res.status(400).json({ 
        success: false,
        message: "Invalid verification code",
        errors: ["The code you entered is incorrect"]
      });
    }

    if (new Date() > verificationRecord.expires_at) {
      await signupVerificationsCollection.deleteOne({ email: normalizedEmail });
      return res.status(400).json({ 
        success: false,
        message: "Verification code expired",
        errors: ["Please request a new verification code"]
      });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    const newUser = {
      name: name.trim(),
      email: normalizedEmail,
      password_hash,
      is_verified: true,  // Email verified via signup verification flow
      created_at: new Date(),
      updated_at: new Date()
    };
    
    const result = await usersCollection.insertOne(newUser);

    await signupVerificationsCollection.deleteOne({ email: normalizedEmail });

    console.log(' Account created after verification:', { name, email: normalizedEmail, userId: result.insertedId });

    return res.status(201).json({
      success: true,
      message: 'Account created successfully! Please log in.',
      email: normalizedEmail
    });
  } catch (err) {
    console.error(' Verify signup error:', err);
    return res.status(500).json({ 
      success: false,
      message: "Failed to create account",
      errors: ["Please try again later"]
    });
  }
});



// LEGACY SIGNUP ENDPOINT - NOW USES TWO-STEP VERIFICATION FLOW
// 1. POST /api/auth/send-signup-verification (send email with code)
// 2. POST /api/auth/verify-signup (verify code and create account)

// LOGIN
// LOGIN
router.post("/login", rateLimiters.authRateLimit, validateAuthPayload, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(401).json({ message: "Email and password are required" });

  try {
    const usersCollection = await getCollection("users");
    
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

    const userProfilesCollection = await getCollection("user_profiles");
    const userProfile = userProfilesCollection ? await userProfilesCollection.findOne({ user_id: user._id }) : null;
    const assessmentCompleted = userProfile ? (userProfile.assessment_count > 0) : false;

    res.status(200).json({
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        is_verified: user.is_verified,
        assessmentCompleted
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