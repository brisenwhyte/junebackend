// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { db, auth } from "./firebaseAdmin.js";
import { mg, sendWelcomeEmail } from "./mailgunClient.js";
import admin from "firebase-admin";

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
// ✅ MIDDLEWARE CONFIGURATION
// -----------------------------------------------------
const allowedOrigins = [
  "https://june.money",
  "https://june.netlify.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

const corsOptions = {
  origin: function (origin, callback) {
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

app.use(cors(corsOptions));
app.use(express.json());

console.log('✅ Middleware configured');

// -----------------------------------------------------
// ✅ HELPER FUNCTIONS
// -----------------------------------------------------

// Generate unique referral code
function generateReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'JUNE-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Check if referral code exists and is valid
async function validateReferralCode(code) {
  if (!code) return null;
  
  try {
    const usersSnapshot = await db.collection('users')
      .where('referralCode', '==', code)
      .limit(1)
      .get();
    
    if (usersSnapshot.empty) {
      return null;
    }
    
    return usersSnapshot.docs[0].id; // Returns email of referrer
  } catch (error) {
    console.error('Error validating referral code:', error);
    return null;
  }
}

// -----------------------------------------------------
// ✅ ROUTES
// -----------------------------------------------------

app.get("/", (req, res) => {
  res.status(200).send("✅ June Backend is live!");
});
console.log('✅ Route registered: GET /');

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
// ✅ CHECK IF USER EXISTS
// -----------------------------------------------------
app.post("/api/check-user", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });

    const userDoc = await db.collection('users').doc(email).get();
    
    if (userDoc.exists) {
      return res.json({ 
        exists: true, 
        message: "User already registered" 
      });
    }
    
    res.json({ exists: false });
  } catch (error) {
    console.error("❌ Error checking user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
console.log('✅ Route registered: POST /api/check-user');

// -----------------------------------------------------
// ✅ SEND SIGN-IN EMAIL
// -----------------------------------------------------
app.post("/api/send-signin-email", async (req, res) => {
  const { email, referralCode } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });

  try {
    // Check if user already exists
    const userDoc = await db.collection('users').doc(email).get();
    if (userDoc.exists) {
      return res.status(400).json({ 
        error: "Email already registered",
        exists: true 
      });
    }

    // Validate referral code if provided
    let referrerEmail = null;
    if (referralCode) {
      referrerEmail = await validateReferralCode(referralCode);
      if (!referrerEmail) {
        return res.status(400).json({ 
          error: "Invalid referral code" 
        });
      }
    }

    // Store referral info temporarily (we'll use it after verification)
    if (referrerEmail) {
      await db.collection('pending_referrals').doc(email).set({
        email,
        referredBy: referrerEmail,
        referralCode,
        createdAt: new Date().toISOString()
      });
    }

    const actionCodeSettings = {
      url: "https://june.money/verify",
      handleCodeInApp: true,
    };

    const link = await auth.generateSignInWithEmailLink(
      email,
      actionCodeSettings
    );
    console.log(`✅ Generated sign-in link for: ${email}`);

    const messageData = {
      from: process.env.MAILGUN_FROM,
      to: email,
      subject: "You’re early 🌞 Let’s finish setting up your June access",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin:auto; padding: 20px; background: #f5f5f5;">
          <div style="background: linear-gradient(135deg, #004499, #ff7733); padding: 30px; border-radius: 10px; color: white; text-align:center;">
            <h1>Welcome to JUNE</h1>
            <p>Your money's new season begins here.</p>
          </div>
          <div style="padding: 20px; text-align:center; background:white; border-radius: 8px; margin-top:20px;">
            <h2>Hey there 👋</h2>
            <p>Tap below to confirm your spot and join the early list for June</p>
            <p>The new way to save for your family’s future.</p>
            <a href="${link}" style="display:inline-block; margin-top:20px; padding:12px 24px; background:#004499; color:white; text-decoration:none; border-radius:6px;">Confirm & Join June</a>
            ${referralCode ? `<p style="margin-top:20px; color:#666;">Referred by code: <strong>${referralCode}</strong></p>` : ''}
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
// ✅ SAVE VERIFIED USER + SEND WELCOME EMAIL
// -----------------------------------------------------
app.post("/api/verify-success", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });

    // Check if user already exists
    const userDoc = await db.collection('users').doc(email).get();
    if (userDoc.exists) {
      console.log("⚠️ User already exists:", email);
      return res.status(200).json({ 
        success: true, 
        message: "User already registered" 
      });
    }

    // Generate unique referral code
    let referralCode = generateReferralCode();
    let isUnique = false;
    
    // Ensure referral code is unique
    while (!isUnique) {
      const existingCode = await db.collection('users')
        .where('referralCode', '==', referralCode)
        .limit(1)
        .get();
      
      if (existingCode.empty) {
        isUnique = true;
      } else {
        referralCode = generateReferralCode();
      }
    }

    // Check for pending referral
    const pendingReferralDoc = await db.collection('pending_referrals').doc(email).get();
    let referredBy = null;
    
    if (pendingReferralDoc.exists) {
      referredBy = pendingReferralDoc.data().referredBy;
      
      // Increment referrer's count
      if (referredBy) {
        const referrerDoc = db.collection('users').doc(referredBy);
        await referrerDoc.update({
          referralCount: admin.firestore.FieldValue.increment(1)
        });
        console.log(`✅ Incremented referral count for: ${referredBy}`);
      }
      
      // Delete pending referral
      await db.collection('pending_referrals').doc(email).delete();
    }

    // Save user to Firestore
    await db.collection('users').doc(email).set({
      email,
      referralCode,
      referralCount: 0,
      referredBy: referredBy || null,
      createdAt: new Date().toISOString(),
    });
    console.log("✅ User saved:", email, "with code:", referralCode);

    // Send Welcome Email
    const sent = await sendWelcomeEmail(email, referralCode);
    if (sent) {
      console.log("📩 Welcome email sent successfully to:", email);
    } else {
      console.warn("⚠️ Could not send welcome email to:", email);
    }

    res.status(200).json({ 
      success: true, 
      referralCode 
    });
  } catch (error) {
    console.error("❌ Error saving verified user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
console.log('✅ Route registered: POST /api/verify-success');

// -----------------------------------------------------
// ✅ GET LEADERBOARD
// -----------------------------------------------------
app.get("/api/leaderboard", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    const leaderboardSnapshot = await db.collection('users')
      .orderBy('referralCount', 'desc')
      .limit(limit)
      .get();
    
    const leaderboard = leaderboardSnapshot.docs.map((doc, index) => ({
      rank: index + 1,
      email: doc.data().email,
      referralCode: doc.data().referralCode,
      referralCount: doc.data().referralCount,
      // Optionally mask email for privacy
      maskedEmail: doc.data().email.replace(/(.{2})(.*)(@.*)/, '$1***$3')
    }));
    
    res.json({ leaderboard });
  } catch (error) {
    console.error("❌ Error fetching leaderboard:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
console.log('✅ Route registered: GET /api/leaderboard');

// -----------------------------------------------------
// ✅ VALIDATE REFERRAL CODE
// -----------------------------------------------------
app.post("/api/validate-referral", async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: "Referral code required" });

    const referrerEmail = await validateReferralCode(code);
    
    if (referrerEmail) {
      res.json({ valid: true, message: "Valid referral code" });
    } else {
      res.json({ valid: false, message: "Invalid referral code" });
    }
  } catch (error) {
    console.error("❌ Error validating referral:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
console.log('✅ Route registered: POST /api/validate-referral');

// -----------------------------------------------------
// ✅ ERROR HANDLERS
// -----------------------------------------------------
app.use((req, res) => {
  console.log('❌ 404 - Route not found:', req.method, req.path);
  res.status(404).json({ 
    error: 'Route not found',
    method: req.method,
    path: req.path
  });
});

app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({ error: err.message });
});

// -----------------------------------------------------
// ✅ START SERVER
// -----------------------------------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Access at: http://localhost:${PORT}`);
  console.log('📋 Available routes:');
  console.log('   GET  /');
  console.log('   GET  /api/test');
  console.log('   POST /api/check-user');
  console.log('   POST /api/send-signin-email');
  console.log('   POST /api/verify-success');
  console.log('   POST /api/validate-referral');
  console.log('   GET  /api/leaderboard');
});