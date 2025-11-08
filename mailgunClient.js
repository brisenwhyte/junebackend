import formData from "form-data";
import Mailgun from "mailgun.js";
import dotenv from "dotenv";

dotenv.config();

const mailgun = new Mailgun(formData);
const mg = mailgun.client({
  username: "api",
  key: process.env.MAILGUN_API_KEY,
});

export { mg }; // ✅ add this

export async function sendWelcomeEmail(email) {
  try {
    const messageData = {
      from: process.env.MAILGUN_FROM,
      to: email,
      subject: "Welcome to JUNE 🌞",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin:auto; padding: 20px; background: #f5f5f5;">
          <div style="background: linear-gradient(135deg, #004499, #ff7733); padding: 30px; border-radius: 10px; color: white; text-align:center;">
            <h1>Welcome to JUNE</h1>
            <p>Money's new season begins with you.</p>
          </div>
          <div style="padding: 20px; text-align:center; background:white; border-radius: 8px; margin-top:20px;">
            <h2>Hey there 👋</h2>
            <p>Thanks for verifying your email! You’re officially part of JUNE’s early access list.</p>
            <p>We’ll keep you posted with updates and exclusive invites soon.</p>
            <a href="https://june.money/" style="display:inline-block; margin-top:20px; padding:12px 24px; background:#004499; color:white; text-decoration:none; border-radius:6px;">Visit Our Site</a>
          </div>
          <p style="font-size:12px; color:#666; margin-top:30px; text-align:center;">© 2025 JUNE. All rights reserved.</p>
        </div>
      `,
    };

    const result = await mg.messages.create(process.env.MAILGUN_DOMAIN, messageData);
    console.log("✅ Welcome email sent:", result.id);
    return true;
  } catch (error) {
    console.error("❌ Mailgun send error:", error);
    return false;
  }
}
