import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { db } from "./firebaseAdmin.js";
import { sendWelcomeEmail } from "./mailgunClient.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Save verified user + send Mailgun email
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
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error saving verified user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
