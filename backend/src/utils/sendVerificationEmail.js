import SibApiV3Sdk from "sib-api-v3-sdk";

const defaultClient = SibApiV3Sdk.ApiClient.instance;
defaultClient.authentications["api-key"].apiKey = process.env.BREVO_API_KEY;

const client = new SibApiV3Sdk.TransactionalEmailsApi();

const sendVerificationEmail = async (to, otp) => {
  if (!process.env.BREVO_API_KEY || !process.env.FROM_EMAIL) {
    throw new Error("Brevo service is not configured");
  }


  try {
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

    sendSmtpEmail.sender = { name: "CERKYL", email: process.env.FROM_EMAIL };
    sendSmtpEmail.to = [{ email: to }];
    sendSmtpEmail.subject = "Verify Your Email Address";
    sendSmtpEmail.htmlContent = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #4CAF50;">Welcome to CERKYL!</h2>
        <p>Thank you for signing up. To complete your registration, please verify your email address.</p>
        <p><strong>Your verification code is:</strong> <span style="font-size: 18px; color: #000;">${otp}</span></p>
        <p>This code will expire in <strong>10 minutes</strong>.</p>
        <hr />
        <p style="font-size: 12px; color: #777;">If you did not request this code, you can safely ignore this email.</p>
      </div>
    `;

    await client.sendTransacEmail(sendSmtpEmail);
    console.log("Verification email sent successfully");
  } catch (error) {
    console.error("Error sending verification email:", error);
    throw new Error("Failed to send verification email");
  }
};

export default sendVerificationEmail;