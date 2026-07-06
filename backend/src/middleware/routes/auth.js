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

router.post("/send-signup-verification", rateLimiters.authRateLimit, async (req, res) => {
  const { email } = req.body;

  const validationFailures = [];
  if (!email) validationFailures.push('Email is required');

  if (validationFailures.length > 0) {
    return res.status(400).json({ 
      success: false, 
      message: 'Validation failed',
      errors: validationFailures
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
    
    const registeredAccount = await usersCollection.findOne({ email: normalizedEmail });
    if (registeredAccount) {
      return res.status(409).json({ 
        success: false,
        message: "Email already registered",
        errors: ["An account with this email already exists"]
      });
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

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
    console.error('Error sending verification code', err);
    return res.status(500).json({ 
      success: false,
      message: "Failed to send code",
      errors: ["Please try again later"]
    });
  }
});

router.post("/verify-signup", rateLimiters.authRateLimit, async (req, res) => {
  const { email, verification_code, name, password } = req.body;

  const validationFailures = [];
  
  if (!email) validationFailures.push('Email is required');
  if (!verification_code) validationFailures.push('Code is required');
  if (!name) validationFailures.push('Name is required');
  if (!password) validationFailures.push('Password is required');

  if (validationFailures.length > 0) {
    return res.status(400).json({ 
      success: false, 
      message: 'Validation failed',
      errors: validationFailures
    });
  }

  const normalizedEmail = String(email).toLowerCase();

  if (name.trim().length < 3) validationFailures.push('Name too short');
  if (!validateEmail(normalizedEmail)) validationFailures.push('Invalid email');
  if (!validateGmailDomain(normalizedEmail)) validationFailures.push('Invalid domain');

  const pwd = validatePassword(password);
  if (!pwd.valid) validationFailures.push(...pwd.errors);

  if (validationFailures.length > 0) {
    return res.status(400).json({ 
      success: false,
      message: 'Validation failed',
      errors: validationFailures
    });
  }

  try {
    const users = await getCollection("users");
    const codes = await getCollection("signup_verifications");
    
    const exists = await users.findOne({ email: normalizedEmail });
    if (exists) {
      return res.status(409).json({ 
        success: false,
        message: "Email already registered"
      });
    }

    const record = await codes.findOne({ email: normalizedEmail });

    if (!record || record.verification_code !== String(verification_code)) {
      return res.status(400).json({ 
        success: false,
        message: "Invalid or missing code"
      });
    }

    if (new Date() > record.expires_at) {
      await codes.deleteOne({ email: normalizedEmail });
      return res.status(400).json({ 
        success: false,
        message: "Code expired"
      });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const user = {
      name: name.trim(),
      email: normalizedEmail,
      password_hash,
      is_verified: true,
      created_at: new Date()
    };
    
    await users.insertOne(user);
    await codes.deleteOne({ email: normalizedEmail });

    return res.status(201).json({
      success: true,
      message: 'Account created.'
    });
  } catch (err) {
    return res.status(500).json({ 
      success: false,
      message: "Server error"
    });
  }
});

router.post("/login", rateLimiters.authRateLimit, validateAuthPayload, async (req, res) => {
  const { email, password } = req.body;

  try {
    const users = await getCollection("users");
    const user = await users.findOne({ email: String(email).toLowerCase() });

    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign({ id: user._id.toString() }, JWT_SECRET, { expiresIn: "7d" });
    const profiles = await getCollection("user_profiles");
    const profile = profiles ? await profiles.findOne({ user_id: user._id }) : null;

    res.status(200).json({
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        is_verified: user.is_verified,
        assessmentCompleted: profile?.assessment_count > 0
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/login/guest", rateLimiters.authRateLimit, async (req, res) => {
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