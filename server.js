import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { db } from "./firebaseAdmin.js";
import { sendWelcomeEmail } from "./mailgunClient.js";

dotenv.config();

const app = express();

// ✅ CORS: allow Netlify frontend only (for security)
const allowedOrigins = [
  "https://june.money", 
  "https://june.netlify.app",   // your Netlify frontend
  "http://localhost:5173"       // local dev
];
app.use(cors({
  origin: allowedOrigins,
  methods: ["GET", "POST"],
  credentials: true,
}));

app.use(express.json());

// ✅ Health check route (helps Render verify your app)
app.get("/", (req, res) => {
  res.status(200).send("✅ June Backend is live on Render!");
});

// ✅ Save verified user + send Mailgun email
app.post("/api/verify-success", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });

    // Save to Firestore
    await db.collection("verified_users").doc(email).set({
      email,
      verifiedAt: new Date().toISOString(),
    });

    console.log("✅ Verified email saved:", email);

    // Send Welcome Email via Mailgun
    const sent = await sendWelcomeEmail(email);
    if (!sent) {
      console.warn("⚠️ Could not send welcome email to:", email);
    } else {
      console.log("📩 Welcome email sent successfully to:", email);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("❌ Error saving verified user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ Dynamic port (for Render)
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
