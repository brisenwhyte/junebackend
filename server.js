// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { db, auth } from "./firebaseAdmin.js";
import { mg, sendWelcomeEmail } from "./mailgunClient.js";

dotenv.config();

const app = express();

// -----------------------------------------------------
// ✅ ENVIRONMENT VARIABLE CHECK
// -----------------------------------------------------
const requiredEnvVars = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_PRIVATE_KEY',
  'FIREBASE_CLIENT_EMAIL',
  'MAILGUN_API_KEY',
  'MAILGUN_DOMAIN',
  'MAILGUN_FROM'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.error('❌ Missing environment variables:', missingVars);
  process.exit(1);
}

console.log('✅ All required environment variables present');

// -----------------------------------------------------
// ✅ 1️⃣ MIDDLEWARE CONFIGURATION
// -----------------------------------------------------

// Define allowed origins
const allowedOrigins = [
  "https://june.money",
  "https://june.netlify.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

// CORS options
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: "GET,POST,OPTIONS",
  allowedHeaders: "Content-Type,Authorization",
  optionsSuccessStatus: 204,
};

// Use CORS middleware
app.use(cors(corsOptions));

// Parse JSON bodies
app.use(express.json());

console.log('✅ Middleware configured');

// -----------------------------------------------------
// ✅ 2️⃣ HEALTH CHECK
// -----------------------------------------------------
app.get("/", (req, res) => {
  res.status(200).send("✅ June Backend is live on Render!");
});
console.log('✅ Route registered: GET /');

// -----------------------------------------------------
// ✅ 2.5️⃣ TEST ENDPOINT
// -----------------------------------------------------
app.get('/api/test', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    env: {
      hasFirebaseConfig: !!process.env.FIREBASE_PROJECT_ID,
      hasMailgunConfig: !!process.env.MAILGUN_API_KEY
    }
  });
});
console.log('✅ Route registered: GET /api/test');

// -----------------------------------------------------
// ✅ 3️⃣ SEND SIGN-IN EMAIL (Magic Link via Mailgun)
// -----------------------------------------------------
app.post("/api/send-signin-email", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });

  try {
    const actionCodeSettings = {
      url: "https://june.money/verify",
      handleCodeInApp: true,
    };

    const link = await auth.generateSignInWithEmailLink(
      email,
      actionCodeSettings
    );
    console.log(`✅ Generated sign-in link for: ${email}`);

    // Send the link via Mailgun
    const messageData = {
      from: process.env.MAILGUN_FROM,
      to: email,
      subject: "Sign in to JUNE 🌞",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin:auto; padding: 20px; background: #f5f5f5;">
          <div style="background: linear-gradient(135deg, #004499, #ff7733); padding: 30px; border-radius: 10px; color: white; text-align:center;">
            <h1>Welcome to JUNE</h1>
            <p>Your money's new season begins here.</p>
          </div>
          <div style="padding: 20px; text-align:center; background:white; border-radius: 8px; margin-top:20px;">
            <h2>Hey there 👋</h2>
            <p>Click below to securely verify your email and sign in:</p>
            <a href="${link}" style="display:inline-block; margin-top:20px; padding:12px 24px; background:#004499; color:white; text-decoration:none; border-radius:6px;">Verify & Join JUNE</a>
          </div>
          <p style="font-size:12px; color:#666; margin-top:30px; text-align:center;">
            If you didn't request this, please ignore this email.
          </p>
        </div>
      `,
    };

    const result = await mg.messages.create(
      process.env.MAILGUN_DOMAIN,
      messageData
    );
    console.log("📨 Verification email sent:", result.id);

    res.json({ success: true, message: "Verification email sent" });
  } catch (error) {
    console.error("❌ Error sending sign-in email:", error);
    res.status(500).json({ error: error.message });
  }
});
console.log('✅ Route registered: POST /api/send-signin-email');

// -----------------------------------------------------
// ✅ 4️⃣ SAVE VERIFIED USER + SEND WELCOME EMAIL
// -----------------------------------------------------
app.post("/api/verify-success", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });

    // Save user to Firestore
    await db.collection("verified_users").doc(email).set({
      email,
      verifiedAt: new Date().toISOString(),
    });
    console.log("✅ Verified email saved:", email);

    // Send Welcome Email
    const sent = await sendWelcomeEmail(email);
    if (sent) {
      console.log("📩 Welcome email sent successfully to:", email);
    } else {
      console.warn("⚠️ Could not send welcome email to:", email);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("❌ Error saving verified user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
console.log('✅ Route registered: POST /api/verify-success');

// -----------------------------------------------------
// ✅ ERROR HANDLERS
// -----------------------------------------------------

// Catch-all 404 handler
app.use((req, res) => {
  console.log('❌ 404 - Route not found:', req.method, req.path);
  res.status(404).json({ 
    error: 'Route not found',
    method: req.method,
    path: req.path,
    availableRoutes: [
      'GET /',
      'GET /api/test',
      'POST /api/send-signin-email',
      'POST /api/verify-success'
    ]
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({ error: err.message });
});

// -----------------------------------------------------
// ✅ 5️⃣ START SERVER
// -----------------------------------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Access at: http://localhost:${PORT}`);
  console.log('📋 Available routes:');
  console.log('   GET  /');
  console.log('   GET  /api/test');
  console.log('   POST /api/send-signin-email');
  console.log('   POST /api/verify-success');
});