import express from "express";
import cors from "cors";
import admin from "firebase-admin";
import { loadRules, decideAction } from "./pokerEngine.js";

const app = express();
const PORT = process.env.PORT || 5000;

// ====== Firebase Admin init ======
/*
 * In Render, set env var:
 * FIREBASE_SERVICE_ACCOUNT_JSON = (the JSON of your service account)
 */
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!serviceAccountJson) {
  console.error("Missing FIREBASE_SERVICE_ACCOUNT_JSON env var");
  process.exit(1);
}
const serviceAccount = JSON.parse(serviceAccountJson);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// ====== Middleware ======
app.use(cors({
  origin: process.env.CORS_ORIGIN || "*",
  credentials: true
}));
app.use(express.json());

// Auth middleware
async function verifyFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: "Missing Authorization Bearer token" });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = { uid: decoded.uid };
    next();
  } catch (err) {
    console.error("Token verification failed:", err.message);
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ====== Load rules ======
loadRules();

// ====== Routes ======
app.get("/", (req, res) => {
  res.send("Poker bot server is running.");
});

app.post("/api/poker/decide", verifyFirebaseToken, (req, res) => {
  try {
    const {
      hand,
      stage,
      style,
      numPlayers,
      potSize,
      toCall,
      board
    } = req.body;

    if (!hand) {
      return res.status(400).json({ error: "hand is required" });
    }

    const decision = decideAction({
      stage,
      style,
      hand,
      numPlayers: numPlayers || 6,
      potSize: potSize || 0,
      toCall: toCall || 0,
      board: board || ""
    });

    res.json({
      uid: req.user.uid,
      ...decision
    });
  } catch (err) {
    console.error("Decision error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ====== Start ======
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
