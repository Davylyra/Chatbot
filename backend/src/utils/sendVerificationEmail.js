// src/utils/sendVerificationEmail.js
import nodemailer from "nodemailer";

const sendVerificationEmail = async (to, otp) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: `"AI Chatbot" <${process.env.EMAIL_USER}>`,
    to,
    subject: "Email Verification - AI Chatbot",
    text: `Your verification code is ${otp}. It will expire in 10 minutes.`,
  };

  await transporter.sendMail(mailOptions);
};

export default sendVerificationEmail;