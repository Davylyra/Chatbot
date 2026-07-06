import SibApiV3Sdk from "sib-api-v3-sdk";

const defaultClient = SibApiV3Sdk.ApiClient.instance;
if (process.env.BREVO_API_KEY) {
  defaultClient.authentications["api-key"].apiKey = process.env.BREVO_API_KEY;
}
const client = new SibApiV3Sdk.TransactionalEmailsApi();

export const sendPurchaseEmail = async (to, universityName, serialKey, pin) => {
  if (!process.env.BREVO_API_KEY || !process.env.FROM_EMAIL) {
    console.warn(" Brevo service is not configured. Email not sent.");
    return;
  }

  try {
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.sender = { name: "Glinax Admissions", email: process.env.FROM_EMAIL };
    sendSmtpEmail.to = [{ email: to }];
    
    if (serialKey && pin) {
      sendSmtpEmail.subject = `Your ${universityName} Admission Form PIN & Serial`;
      sendSmtpEmail.htmlContent = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
          <h2 style="color: #4CAF50;">Payment Successful!</h2>
          <p>Thank you for purchasing the <strong>${universityName}</strong> admission form.</p>
          <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Serial Number:</strong> <span style="font-size: 18px; color: #000; letter-spacing: 1px;">${serialKey}</span></p>
            <p style="margin: 5px 0;"><strong>PIN:</strong> <span style="font-size: 18px; color: #000; letter-spacing: 2px;">${pin}</span></p>
          </div>
          <p>You can now proceed to the university's official portal to complete your application.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 12px; color: #777;">If you have any issues, please contact Glinax support.</p>
        </div>
      `;
    } else {
      sendSmtpEmail.subject = `Payment Received: ${universityName} Admission Form`;
      sendSmtpEmail.htmlContent = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
          <h2 style="color: #4CAF50;">Payment Successful!</h2>
          <p>Thank you for purchasing the <strong>${universityName}</strong> admission form.</p>
          <div style="background: #fff3cd; padding: 15px; border-radius: 5px; border-left: 4px solid #ffc107; margin: 20px 0;">
            <p style="margin: 0;"><strong>Note:</strong> We are currently assigning your Serial Number and PIN from our authentic inventory. This usually takes a few minutes.</p>
          </div>
          <p>You will receive a follow-up email with your credentials shortly.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 12px; color: #777;">If you have any issues, please contact Glinax support.</p>
        </div>
      `;
    }

    await client.sendTransacEmail(sendSmtpEmail);
    console.log(` Purchase email sent successfully to ${to}`);
  } catch (error) {
    console.error(" Error sending purchase email:", error.response?.text || error.message);
  }
};

export const sendAdminAlertEmail = async (universityName) => {
  if (!process.env.BREVO_API_KEY || !process.env.FROM_EMAIL || !process.env.ADMIN_EMAIL) {
    console.warn(" Brevo or ADMIN_EMAIL is not configured. Admin alert not sent.");
    return;
  }

  try {
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.sender = { name: "System Alerts", email: process.env.FROM_EMAIL };
    sendSmtpEmail.to = [{ email: process.env.ADMIN_EMAIL }];
    sendSmtpEmail.subject = `URGENT: Inventory Depletion for ${universityName}`;
    sendSmtpEmail.htmlContent = `
      <div style="font-family: Arial, sans-serif; color: #333;">
        <h2 style="color: #d9534f;">Inventory Alert</h2>
        <p>The form inventory for <strong>${universityName}</strong> is depleted.</p>
        <p>A user just purchased a form but no PIN was available to assign. Please replenish the inventory immediately.</p>
      </div>
    `;

    await client.sendTransacEmail(sendSmtpEmail);
    console.log(`Admin alert sent for ${universityName} inventory depletion`);
  } catch (error) {
    console.error(" Error sending admin alert:", error.response?.text || error.message);
  }
};
