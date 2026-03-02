// src/index.js
import * as functions from "firebase-functions";
import express from "express";
import cors from "cors";
import admin from "firebase-admin";
import bodyParser from "body-parser";

// --- Configuration / allowed origins ---
const DEFAULT_ALLOWED = [
  "https://fundraiser-donations.web.app",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
];

const allowedEnv = (process.env.ALLOWED_ORIGINS || "").trim();
const allowedOrigins = allowedEnv ? allowedEnv.split(",").map((s) => s.trim()).filter(Boolean) : DEFAULT_ALLOWED;

// --- Admin init with safe fallbacks ---
function initAdminSafely() {
  if (admin.apps && admin.apps.length) {
    console.info("[functions] admin already initialized");
    return admin.app();
  }

  let projectId =
    process.env.GCLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT_ID ||
    process.env.FUNCTIONS_EMULATOR_PROJECT_ID ||
    process.env.FIREBASE_PROJECT ||
    (process.env.FIREBASE_CONFIG ? (() => {
      try { return JSON.parse(process.env.FIREBASE_CONFIG).projectId; } catch { return undefined; }
    })() : undefined);

  let storageBucket =
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.FUNCTIONS_STORAGE_BUCKET ||
    (process.env.FIREBASE_CONFIG ? (() => {
      try { return JSON.parse(process.env.FIREBASE_CONFIG).storageBucket; } catch { return undefined; }
    })() : undefined);

  const initOpts = {};
  if (projectId) initOpts.projectId = projectId;
  if (storageBucket) initOpts.storageBucket = storageBucket;

  try {
    admin.initializeApp(initOpts);
    console.info("[functions] admin.initializeApp() done", { projectId, storageBucket });
  } catch (err) {
    console.warn("[functions] admin.initializeApp() failed, trying default init:", err);
    try {
      admin.initializeApp();
      console.info("[functions] admin.initializeApp() fallback succeeded");
    } catch (err2) {
      console.error("[functions] admin.initializeApp() fallback failed — functions requiring admin may error:", err2);
      throw err2;
    }
  }
}

initAdminSafely();

// --- Express + CORS setup ---
const app = express();
app.use(bodyParser.json({ limit: "1mb" }));
app.use(bodyParser.urlencoded({ extended: false }));

const corsOptionsDelegate = function (req, callback) {
  const origin = req.header("Origin") || req.header("origin");
  if (!origin) {
    callback(null, { origin: true });
    return;
  }
  if (allowedOrigins.indexOf(origin) !== -1) {
    callback(null, { origin: true, credentials: true });
  } else {
    callback(new Error("CORS origin not allowed"), { origin: false });
  }
};

app.use((req, res, next) => {
  cors(corsOptionsDelegate)(req, res, (err) => {
    if (err) {
      res.setHeader("Access-Control-Allow-Origin", "null");
      return res.status(403).json({ error: "CORS blocked: origin not allowed" });
    }
    next();
  });
});

app.get("/_health", (req, res) => {
  res.json({ ok: true, projectId: !!(process.env.GCLOUD_PROJECT || process.env.FIREBASE_CONFIG) });
});

/**
 * POST /setUserProfile
 * Body: { uid, email }
 * Header: Authorization: Bearer <idToken>
 */
app.post("/setUserProfile", async (req, res) => {
  try {
    const authHeader = req.get("Authorization") || req.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid Authorization header" });
    }
    const idToken = authHeader.split(" ")[1];

    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch (err) {
      console.warn("[setUserProfile] verifyIdToken failed:", err?.message || err);
      return res.status(401).json({ error: "Invalid ID token" });
    }

    const callerUid = decoded.uid;
    const isAdminFlag = !!decoded.admin;

    const { uid, email } = req.body || {};
    if (!uid || !email) {
      return res.status(400).json({ error: "Missing required body fields: uid and email" });
    }

    if (!isAdminFlag && callerUid !== uid) {
      return res.status(403).json({ error: "Not authorized to set that user's profile" });
    }

    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    const db = admin.firestore();
    const userRef = db.doc(`users/${uid}`);

    await userRef.set({ email: email, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

    return res.json({ success: true, uid, email });
  } catch (err) {
    console.error("[setUserProfile] unexpected error:", err);
    return res.status(500).json({ error: "internal", details: (err && err.message) || String(err) });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "not_found" });
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/firebase-messaging-sw.js")
    .then(() => console.log("FCM Service Worker registered"))
    .catch((err) => console.error(" SW registration failed", err));
}



// Export the API as one function named "api"
export const api = functions.https.onRequest(app);
