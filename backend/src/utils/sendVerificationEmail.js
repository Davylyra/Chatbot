import nodemailer from "nodemailer";

const sendVerificationEmail = async (to, otp) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error("Email service is not configured");
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.verify();

  const mailOptions = {
    from: `"CERKYL" <${process.env.EMAIL_USER}>`,
    to,
    subject: "Email Verification ",
    text: `Your verification code is ${otp}. It will expire in 10 minutes.\nPlease enter this code to verify your email address.
    \nIf you did not request this code, please ignore this email.`,
  };

  await transporter.sendMail(mailOptions);
};

export default sendVerificationEmail;