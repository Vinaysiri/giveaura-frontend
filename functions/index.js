// functions/index.js

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const Razorpay = require("razorpay");


/* ======================================================
    INITIALIZE FIREBASE ADMIN (ONCE – VERY IMPORTANT)
====================================================== */
admin.initializeApp();
const razorpay = new Razorpay({
  key_id: functions.config().razorpay.key_id,
  key_secret: functions.config().razorpay.key_secret,
});

const app = express();
const REGION = "asia-southeast1";

/** Allowed origins (env / functions.config / fallback) */
const RAW_ALLOWED_ORIGINS =
  (functions.config &&
    functions.config().custom &&
    functions.config().custom.allowed_origins) ||
  process.env.FUNCTIONS_ALLOWED_ORIGINS ||
  "https://fundraiser-donations.web.app,http://localhost:5173,http://localhost:5000";

const allowedOrigins = String(RAW_ALLOWED_ORIGINS)
  .split(",")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

/* ======================================================
   🛠 HELPERS
====================================================== */

function verifyRazorpaySignature(orderId, paymentId, signature) {
  const secret = functions.config().razorpay.key_secret;
  const body = `${orderId}|${paymentId}`;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  return expected === signature;
}


function pickAllowedProfileFields(obj = {}) {
  const ALLOWED = [
    "displayName",
    "photoURL",
    "bio",
    "contact",
    "bank",
    "phone",
    "publicProfile",
  ];
  const out = {};
  for (const k of ALLOWED) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
  }
  return out;
}

function safeString(v, max = 2000) {
  if (!v && v !== 0) return null;
  const s = String(v);
  return s.length > max ? s.slice(0, max) : s;
}

function makeId(prefix = "s") {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

/* ======================================================
   NOTIFICATION WRITER (REUSABLE)
====================================================== */
async function createNotification({
  recipientId,
  recipientEmail = null,
  title,
  message,
  source,
  campaignId = null,
  donationId = null,
}) {
  if (!recipientId && !recipientEmail) return;

  await admin.firestore().collection("notifications").add({
    recipientId: recipientId || null,
    recipientEmail: recipientEmail || null,
    title,
    message,
    source,
    campaignId,
    donationId,
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}


function setCorsHeadersForResponse(req, res) {
  const origin = req.get("Origin") || req.get("origin") || "";
  if (!origin) {
    res.set("Access-Control-Allow-Origin", "*");
  } else if (
    allowedOrigins.length === 0 ||
    allowedOrigins.indexOf(origin) !== -1
  ) {
    res.set("Access-Control-Allow-Origin", origin);
  }
  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Credentials", "true");
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

/* ======================================================
   🔐 AUTH MIDDLEWARE
====================================================== */
async function requireAuth(req, res, next) {
  try {
    const authHeader =
      req.headers.authorization || req.headers.Authorization || "";
    if (!authHeader) {
      setCorsHeadersForResponse(req, res);
      return res
        .status(401)
        .json({ error: "Unauthorized - missing authorization header" });
    }
    const tokenMatch = authHeader.match(/Bearer\s+(.+)$/i);
    if (!tokenMatch) {
      setCorsHeadersForResponse(req, res);
      return res
        .status(401)
        .json({ error: "Unauthorized - missing bearer token" });
    }
    const idToken = tokenMatch[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.user = decoded;
    return next();
  } catch (err) {
    console.error("Auth verify error:", err);
    setCorsHeadersForResponse(req, res);
    return res
      .status(401)
      .json({ error: "Unauthorized", details: err.message });
  }
}

/* ======================================================
   👑 ADMIN CHECK
====================================================== */
function isAdminToken(decodedToken) {
  if (!decodedToken) return false;
  if (decodedToken.admin === true) return true;
  if (decodedToken.isAdmin === true) return true;
  if (
    decodedToken.email &&
    decodedToken.email === "kotipallynagavinay12323@gmail.com"
  )
    return true;
  return false;
}

/* ======================================================
    EXPRESS SETUP (PRODUCTION SAFE)
====================================================== */

// Body parsers (keep BEFORE routes)
app.use(bodyParser.json({ limit: "1mb" }));
app.use(express.json({ limit: "1mb" }));

/* ------------------------------------------------------
   CREATE ORDER (RENDER – PAYMENT SERVER)
------------------------------------------------------ */
app.post("/api/payment/create-order", async (req, res) => {
  try {
    const {
      amount,
      campaignId = null,
      purpose = "donation", // "donation" | "event"
      meta = {},
    } = req.body || {};

    /* ---------- Validation ---------- */
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount",
      });
    }

    // Only require campaignId for donations
    if (purpose === "donation" && !campaignId) {
      return res.status(400).json({
        success: false,
        message: "campaignId is required for donations",
      });
    }

    // Ensure Razorpay keys exist (Firebase Functions env)
    if (
      !functions.config().razorpay ||
      !functions.config().razorpay.key_id ||
      !functions.config().razorpay.key_secret
    ) {
      return res.status(500).json({
        success: false,
        message: "Razorpay keys not configured",
      });
    }

    /* ---------- Create Razorpay Order ---------- */
    const order = await razorpay.orders.create({
      amount: Math.round(numericAmount * 100), // paise
      currency: "INR",
      payment_capture: 1,
      notes: {
        purpose,
        ...(campaignId ? { campaignId } : {}),
        ...meta,
      },
    });

    return res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: "INR",
      key: functions.config().razorpay.key_id,
    });
  } catch (err) {
    console.error(" payment/create-order error:", err);

    return res.status(500).json({
      success: false,
      message: "Order creation failed",
    });
  }
});

/* ------------------------------------------------------
   CREATE EVENT BOOKING ORDER
------------------------------------------------------ */
app.post("/api/events/create-booking-order", async (req, res) => {
  try {
    const { eventId, seats = 1 } = req.body || {};
    if (!eventId || seats <= 0) {
      return res.status(400).json({ error: "Invalid booking request" });
    }

    const db = admin.firestore();
    const eventRef = db.collection("events").doc(eventId);
    const snap = await eventRef.get();

    if (!snap.exists) {
      return res.status(404).json({ error: "Event not found" });
    }

    const event = snap.data();

    if (!event.bookingEnabled) {
      return res.status(403).json({ error: "Booking disabled for this event" });
    }

    if (event.ticketType !== "paid") {
      return res.status(400).json({ error: "Event is not paid" });
    }

    const available =
      Number(event.totalSeats || 0) - Number(event.seatsSold || 0);

    if (seats > available) {
      return res.status(409).json({ error: "Not enough seats available" });
    }

    const amount = Number(event.ticketPrice || 0) * seats;
    if (amount <= 0) {
      return res.status(400).json({ error: "Invalid ticket price" });
    }

    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency: "INR",
      payment_capture: 1,
      notes: {
        eventId,
        seats,
        purpose: "event-booking",
      },
    });

    return res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: "INR",
      key: functions.config().razorpay.key_id,
    });
  } catch (err) {
    console.error("event booking order error:", err);
    return res.status(500).json({ error: "Failed to create booking order" });
  }
});

/* ------------------------------------------------------
   CONFIRM PAYMENT (RENDER + FIRESTORE)
------------------------------------------------------ */

app.post("/api/payment/confirm", async (req, res) => {
  try {
    const {
      paymentId,
      orderId,
      signature,
      campaignId,
      amount,
    } = req.body || {};

    /* ---------- Validation ---------- */
    if (!paymentId || !orderId || !signature || !campaignId || !amount) {
      return res.status(400).json({
        success: false,
        message: "Missing payment fields",
      });
    }

    /* ---------- Razorpay Signature Verification ---------- */
    const expectedSignature = crypto
  .createHmac("sha256", functions.config().razorpay.key_secret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    if (expectedSignature !== signature) {
      return res.status(401).json({
        success: false,
        message: "Invalid Razorpay signature",
      });
    }

    /* ---------- Firestore Transaction ---------- */
    const db = admin.firestore();
    const donationId = `don_${Date.now()}`;

    const campaignRef = db.collection("campaigns").doc(campaignId);
    const donationRef = campaignRef
      .collection("donations")
      .doc(donationId);

await db.runTransaction(async (tx) => {

      const numericAmount = Number(amount);

    if (!numericAmount || numericAmount <= 0) {
      throw new Error("Invalid donation amount");
    }

  const existing = await tx.get(
    db.collectionGroup("donations")
      .where("paymentId", "==", paymentId)
      .limit(1)
  );

  if (!existing.empty) {
    throw new Error("Duplicate payment detected");
  }

  const snap = await tx.get(campaignRef);
      if (!snap.exists) throw new Error("Campaign not found");


      tx.set(donationRef, {
        donationId,
        campaignId,
        amount: Number(amount),
        paymentId,
        orderId,
        source: "render-confirm",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });



      tx.update(campaignRef, {
        fundsRaised: admin.firestore.FieldValue.increment(Number(amount)),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

/* ---------- Send Appreciation Notification to Donor (With Campaign Title) ---------- */

try {
  const donorId = req.body.donorId || null;
  const donorEmail = req.body.donorEmail || null;

  // Fetch campaign title
  const campaignSnap = await admin
    .firestore()
    .collection("campaigns")
    .doc(campaignId)
    .get();

  const campaignTitle = campaignSnap.exists
    ? campaignSnap.data().title
    : "our campaign";

  if (donorId || donorEmail) {
    await createNotification({
      recipientId: donorId,
      recipientEmail: donorEmail,
      title: "🙏 Thank You for Your Support!",
      message: `Your donation of ₹${amount} towards "${campaignTitle}" has been successfully received. Your generosity is making a real difference 💛`,
      source: "donation-success",
      campaignId,
      donationId,
    });
  }
} catch (notifyErr) {
  console.error("Appreciation notification error:", notifyErr);
}

    return res.json({
      success: true,
      donationId,
    });
  } catch (err) {
    console.error(" payment/confirm error:", err);
    return res.status(500).json({
      success: false,
      message: "Payment confirmation failed",
    });
  }
});

app.use((req, res, next) => {
  setCorsHeadersForResponse(req, res);
  next();
});
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (allowedOrigins.length === 0) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.options("*", (req, res) => res.sendStatus(204));

/* -------------------------
   Core settlement implementation (transactional)
------------------------- */
async function performSettlement(payload = {}) {
  if (!payload?.donationId) {
    throw new Error("donationId required");
  }

  const db = admin.firestore();

  const donationId = String(payload.donationId);
  const campaignId = payload.campaignId ? String(payload.campaignId) : null;
  const topLevelId = payload.topLevelDonationId
    ? String(payload.topLevelDonationId)
    : donationId;

  const settledBy = payload.settledByUid || null;
  const note = safeString(payload.note || null, 2000);
  const settlementId = makeId("settlement");

  const campaignDonationRef = campaignId
    ? db.collection("campaigns").doc(campaignId)
        .collection("donations").doc(donationId)
    : null;

  const topLevelDonationRef =
    db.collection("donations").doc(topLevelId);

  const settlementRef =
    db.collection("settlements").doc(settlementId);

  let notifyDonor = null;
  let notifyCampaignCreator = null;

  const result = {
    settlementId,
    campaignUpdated: false,
    topLevelUpdated: false,
    alreadySettled: false,
  };

  await db.runTransaction(async (tx) => {
  /* ===============================
     1️ READ PHASE (ALL READS FIRST)
  =============================== */

  const statsRef = db.collection("platformStats").doc("summary");

  const reads = [];

  if (campaignDonationRef) {
    reads.push(tx.get(campaignDonationRef));
  } else {
    reads.push(Promise.resolve(null));
  }

  reads.push(tx.get(topLevelDonationRef));

  if (campaignId) {
    reads.push(tx.get(db.collection("campaigns").doc(campaignId)));
  } else {
    reads.push(Promise.resolve(null));
  }

  //read platform stats
  reads.push(tx.get(statsRef));

  const [
    campaignDonationSnap,
    topDonationSnap,
    campaignSnap,
    statsSnap,
  ] = await Promise.all(reads);

  let donationData =
    campaignDonationSnap?.exists
      ? campaignDonationSnap.data()
      : topDonationSnap?.exists
      ? topDonationSnap.data()
      : null;

  if (!donationData) {
    throw new Error("Donation not found");
  }

  const alreadySettled =
    donationData?.settlement?.status === "settled";

  if (alreadySettled) {
    result.alreadySettled = true;
    return; //  idempotent exit (NO WRITES)
  }

  const campaignMeta = campaignSnap?.exists
    ? campaignSnap.data()
    : null;

  const stats = statsSnap?.exists ? statsSnap.data() : {};

  /* ===============================
     2️ WRITE PHASE
  =============================== */

  const settlementPatch = {
    "settlement.status": "settled",
    "settlement.settledAt":
      admin.firestore.FieldValue.serverTimestamp(),
    "settlement.settledBy": settledBy,
    ...(note ? { "settlement.note": note } : {}),
    settled: true,
  };

  if (campaignDonationRef && campaignDonationSnap?.exists) {
    tx.update(campaignDonationRef, settlementPatch);
    result.campaignUpdated = true;
  }

  if (topDonationSnap?.exists) {
    tx.update(topLevelDonationRef, settlementPatch);
    result.topLevelUpdated = true;
  }

  tx.set(settlementRef, {
    donationId,
    campaignId,
    topLevelDonationId: topLevelId,
    settledBy,
    note,
    status: "settled",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  /* ===============================
     3️ UPDATE PLATFORM STATS
  =============================== */

  const donationAmount =
    Number(donationData?.amount || donationData?.grossAmount || 0);

  tx.set(
    statsRef,
    {
      totalDonationsAmount:
        (stats.totalDonationsAmount || 0) + donationAmount,
      totalDonationsCount:
        (stats.totalDonationsCount || 0) + 1,
    },
    { merge: true }
  );

  /* ===============================
     4️ UNIQUE DONOR TRACKING
  =============================== */

  const donorId =
    donationData?.donorId || donationData?.userId || null;

  if (donorId) {
    // IMPORTANT: only increment if first donation ever
    const donorQuery = await db
      .collectionGroup("donations")
      .where("donorId", "==", donorId)
      .limit(2)
      .get();

    if (donorQuery.size === 1) {
      tx.set(
        statsRef,
        {
          donorsSupported:
            (stats.donorsSupported || 0) + 1,
        },
        { merge: true }
      );
    }
  }

  /* ===============================
     5️ PREPARE NOTIFICATIONS
  =============================== */

  const donorEmail =
    donationData?.donorEmail || donationData?.email || null;

  const campaignTitle =
    campaignMeta?.title || donationData?.campaignTitle || null;

  const campaignCreatorId =
    campaignMeta?.creatorId || campaignMeta?.userId || null;

  if (campaignCreatorId) {
    notifyCampaignCreator = {
      recipientId: campaignCreatorId,
      title: "Donation Received 🎉",
      message: `A donation${
        donationAmount ? ` of ₹${donationAmount}` : ""
      } was successfully settled${
        campaignTitle ? ` for "${campaignTitle}"` : ""
      }.`,
      source: "campaign-donation-settled",
      campaignId,
      donationId,
    };
  }
});  return result;

}

/* -------------------------
   HTTP endpoints (express)
   - /getUserProfile
   - /setUserProfile (requires auth)
   - /settleDonation (requires auth & admin)
   ------------------------- */

app.get("/getUserProfile", async (req, res) => {
  try {
    setCorsHeadersForResponse(req, res);
    const uid = req.query.uid || req.query.userId;
    if (!uid) return res.status(400).json({ error: "uid query parameter required" });
    const snap = await admin.firestore().collection("users").doc(String(uid)).get();
    if (!snap || !snap.exists) return res.status(404).json({ error: "User not found" });
    return res.json({ id: snap.id, ...(snap.data() || {}) });
  } catch (err) {
    console.error("GET /getUserProfile error:", err);
    setCorsHeadersForResponse(req, res);
    return res.status(500).json({ error: "internal", details: String(err && err.message ? err.message : err) });
  }
});

app.post("/setUserProfile", requireAuth, async (req, res) => {
  try {
    setCorsHeadersForResponse(req, res);
    const uid = req.user && req.user.uid;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    const profile = req.body || {};
    const safe = pickAllowedProfileFields(profile);
    safe.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    await admin.firestore().collection("users").doc(uid).set(safe, { merge: true });
    return res.json({ success: true, userId: uid });
  } catch (err) {
    console.error("POST /setUserProfile error:", err);
    setCorsHeadersForResponse(req, res);
    return res.status(500).json({ error: "internal", details: String(err && err.message ? err.message : err) });
  }
});

app.post("/settleDonation", requireAuth, async (req, res) => {
  try {
    setCorsHeadersForResponse(req, res);
    const decoded = req.user;
    if (!decoded) return res.status(401).json({ error: "Unauthorized" });
    if (!isAdminToken(decoded)) {
      return res.status(403).json({ error: "Forbidden - admin only" });
    }

    const body = req.body || {};
    const donationId = body.donationId || body.id;
    if (!donationId) return res.status(400).json({ error: "donationId (or id) required in body" });

    const payload = {
      donationId,
      campaignId: body.campaignId || null,
      topLevelDonationId: body.topLevelDonationId || null,
      note: body.note || null,
      settledByUid: decoded.uid || null,
    };

    const result = await performSettlement(payload);
    return res.json({ ok: true, result });
  } catch (err) {
    console.error("POST /settleDonation error:", err);
    setCorsHeadersForResponse(req, res);
    return res.status(500).json({ error: "internal", details: String(err && err.message ? err.message : err) });
  }
});

/* -------------------------
   Export express app as `api` (so URL: .../api/settleDonation)
   ------------------------- */
exports.api = functions.region(REGION).https.onRequest(app);

/* -------------------------
   Direct onRequest wrapper for settleDonation
   - This ensures direct path /settleDonation exists if caller expects it (avoids 404)
   - The wrapper reuses the same logic (verifies token from Authorization header)
   ------------------------- */
exports.settleDonation = functions.region(REGION).https.onRequest(async (req, res) => {
  try {
    setCorsHeadersForResponse(req, res);
    if (req.method === "OPTIONS") return res.status(204).send("");

    // require POST
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    // auth header
    const authHeader = req.headers.authorization || req.headers.Authorization || "";
    if (!authHeader) return res.status(401).json({ error: "Unauthorized - missing Authorization header" });
    const tokenMatch = authHeader.match(/Bearer\s+(.+)$/i);
    if (!tokenMatch) return res.status(401).json({ error: "Unauthorized - missing bearer token" });

    const idToken = tokenMatch[1];
    const decoded = await admin.auth().verifyIdToken(idToken).catch((e) => {
      console.error("verifyIdToken failed in /settleDonation wrapper:", e);
      throw e;
    });

    if (!isAdminToken(decoded)) {
      return res.status(403).json({ error: "Forbidden - admin only" });
    }

    const body = req.body || {};
    const donationId = body.donationId || body.id;
    if (!donationId) return res.status(400).json({ error: "donationId (or id) required in body" });

    const payload = {
      donationId,
      campaignId: body.campaignId || null,
      topLevelDonationId: body.topLevelDonationId || null,
      note: body.note || null,
      settledByUid: decoded.uid || null,
    };

    const result = await performSettlement(payload);
    return res.json({ ok: true, result });
  } catch (err) {
    console.error("exports.settleDonation wrapper error:", err);
    setCorsHeadersForResponse(req, res);
    return res.status(500).json({ error: "internal", details: String(err && err.message ? err.message : err) });
  }
});

/* -------------------------
   Callable function: settleDonationCallable
   - Use from client via firebase.functions().httpsCallable('settleDonationCallable', { region: 'asia-southeast1' })
   - Enforces auth via context.auth
   ------------------------- */
exports.settleDonationCallable = functions.region(REGION).https.onCall(async (data, context) => {
  try {
    if (!context || !context.auth || !context.auth.uid) {
      throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    const decoded = context.auth.token || {};
    if (!isAdminToken(decoded)) {
      throw new functions.https.HttpsError("permission-denied", "Only admins can settle donations.");
    }

    const donationId = (data && (data.donationId || data.id)) || null;
    if (!donationId) {
      throw new functions.https.HttpsError("invalid-argument", "donationId is required.");
    }

    const payload = {
      donationId,
      campaignId: data.campaignId || null,
      topLevelDonationId: data.topLevelDonationId || null,
      note: data.note || null,
      settledByUid: context.auth.uid,
    };

    const result = await performSettlement(payload);
    return { ok: true, result };
  } catch (err) {
    console.error("settleDonationCallable error:", err);
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError("internal", String(err && err.message ? err.message : err));
  }
});

/* -------------------------
   Backwards-compatible wrappers for user profile (onRequest + callable)
   ------------------------- */
exports.setUserProfile = functions.region(REGION).https.onRequest(async (req, res) => {
  try {
    setCorsHeadersForResponse(req, res);
    if (req.method === "OPTIONS") return res.status(204).send("");

    const authHeader = req.headers.authorization || req.headers.Authorization || "";
    const tokenMatch = authHeader.match(/Bearer\s+(.+)$/i);
    if (!tokenMatch) return res.status(401).json({ error: "Unauthorized - missing bearer token" });
    const idToken = tokenMatch[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded.uid;

    const profile = req.body || {};
    const safe = pickAllowedProfileFields(profile);
    safe.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    await admin.firestore().collection("users").doc(uid).set(safe, { merge: true });
    return res.json({ success: true });
  } catch (err) {
    console.error("exports.setUserProfile wrapper error:", err);
    setCorsHeadersForResponse(req, res);
    return res.status(500).json({ error: "internal", details: String(err && err.message ? err.message : err) });
  }
});

exports.getUserProfile = functions.region(REGION).https.onRequest(async (req, res) => {
  try {
    setCorsHeadersForResponse(req, res);
    if (req.method === "OPTIONS") return res.status(204).send("");
    const uid = req.query.uid || req.query.userId;
    if (!uid) return res.status(400).json({ error: "uid query parameter required" });
    const snap = await admin.firestore().collection("users").doc(String(uid)).get();
    if (!snap || !snap.exists) return res.status(404).json({ error: "User not found" });
    return res.json({ id: snap.id, ...(snap.data() || {}) });
  } catch (err) {
    console.error("exports.getUserProfile error:", err);
    setCorsHeadersForResponse(req, res);
    return res.status(500).json({ error: "internal", details: String(err && err.message ? err.message : err) });
  }
});

/* Callable helpers for user profile */
async function writeProfileForUid(uid, profilePayload) {
  const safe = pickAllowedProfileFields(profilePayload || {});
  safe.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  await admin.firestore().collection("users").doc(uid).set(safe, { merge: true });
  return { success: true };
}

async function handleSetUserProfileCallable(data, context) {
  if (!context || !context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
  }
  const callerUid = context.auth.uid;

  let targetUid = callerUid;
  let profile = {};
  if (data && typeof data === "object") {
    if (data.userId && data.profile) {
      if (String(data.userId) !== String(callerUid)) {
        throw new functions.https.HttpsError("permission-denied", "Not authorized to update another user's profile.");
      }
      targetUid = data.userId;
      profile = data.profile || {};
    } else {
      profile = data;
    }
  }

  await writeProfileForUid(targetUid, profile);
  return { success: true, userId: targetUid };
}

exports.setUserProfileCallable = functions.region(REGION).https.onCall(async (data, context) => {
  try {
    return await handleSetUserProfileCallable(data, context);
  } catch (err) {
    console.error("setUserProfileCallable error:", err);
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError("internal", String(err && err.message ? err.message : err));
  }
});

exports.getUserProfileCallable = functions.region(REGION).https.onCall(async (data, context) => {
  try {
    const uid = (data && (data.uid || data.userId)) || null;
    if (!uid) {
      throw new functions.https.HttpsError("invalid-argument", "uid is required.");
    }
    const snap = await admin.firestore().collection("users").doc(String(uid)).get();
    if (!snap || !snap.exists) return null;
    return { id: snap.id, ...(snap.data() || {}) };
  } catch (err) {
    console.error("getUserProfileCallable error:", err);
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError("internal", String(err && err.message ? err.message : err));
  }
});

/* compat aliases */
exports.getUserProfileCallableCompat = exports.getUserProfileCallable;
exports.setUserProfileCallableCompat = exports.setUserProfileCallable;


/* ======================================================
    SEND PUSH NOTIFICATION ON FIRESTORE NOTIFICATION
====================================================== */
exports.sendPushOnNotificationCreate = functions
  .region("asia-southeast1")
  .firestore
  .document("notifications/{notificationId}")
  .onCreate(async (snap) => {
    try {
      const data = snap.data();
      if (!data) return null;

      const recipientId = data.recipientId;
      if (!recipientId) return null;

      // Fetch user FCM token
      const userSnap = await admin
        .firestore()
        .collection("users")
        .doc(recipientId)
        .get();

      if (!userSnap.exists) return null;

      const user = userSnap.data();
      const token = user?.fcmToken;

      if (!token) {
        console.log("No FCM token for user:", recipientId);
        return null;
      }

      const message = {
        token,
        notification: {
          title: data.title || "GiveAura",
          body: data.message || "You have a new notification",
        },
        data: {
          notificationId: snap.id,
          source: data.source || "system",
        },
        webpush: {
          headers: {
            Urgency: "high",
          },
          notification: {
            icon: "/icon-192.png",
            badge: "/badge-72.png",
            vibrate: [200, 100, 200],
          },
        },
      };

      await admin.messaging().send(message);
      console.log(" Push sent to:", recipientId);

      return null;
    } catch (err) {
      console.error(" Push send failed:", err);
      return null;
    }
  });


  /* ======================================================
   ONE-CLICK PUSH TEST (ADMIN ONLY)
   Endpoint: POST /testPush
====================================================== */
exports.testPush = functions
  .region("asia-southeast1")
  .https.onRequest(async (req, res) => {
    try {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

      if (req.method === "OPTIONS") {
        return res.status(204).send("");
      }

      /* ---- Verify Admin Auth ---- */
      const authHeader = req.headers.authorization || "";
      const match = authHeader.match(/Bearer\s+(.+)/);
      if (!match) {
        return res.status(401).json({ error: "Missing Bearer token" });
      }

      const decoded = await admin.auth().verifyIdToken(match[1]);
      if (
        !decoded.admin &&
        !decoded.isAdmin &&
        decoded.email !== "kotipallynagavinay12323@gmail.com"
      ) {
        return res.status(403).json({ error: "Admin only" });
      }

      /* ---- Target user ---- */
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "userId required" });
      }

      const userSnap = await admin.firestore().collection("users").doc(userId).get();
      if (!userSnap.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const token = userSnap.data()?.fcmToken;
      if (!token) {
        return res.status(400).json({ error: "User has no FCM token" });
      }

      /* ---- Send Push ---- */
      await admin.messaging().send({
        token,
        notification: {
          title: "🚀 Push Test Successful",
          body: "This notification came from GiveAura Cloud Functions",
        },
        webpush: {
          notification: {
            icon: "/icon-192.png",
            badge: "/badge-72.png",
            vibrate: [200, 100, 200],
          },
        },
      });

      return res.json({ success: true });
    } catch (err) {
      console.error(" testPush error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  /* ======================================================
   RESET PLATFORM STATS (ADMIN ONLY)
   Endpoint: POST /resetPlatformStats
====================================================== */
app.post("/resetPlatformStats", requireAuth, async (req, res) => {
  try {
    setCorsHeadersForResponse(req, res);

    const decoded = req.user;
    if (!decoded) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!isAdminToken(decoded)) {
      return res.status(403).json({ error: "Admin only" });
    }

    const db = admin.firestore();
    const statsRef = db.collection("platformStats").doc("summary");

    await statsRef.set(
      {
        totalDonationsAmount: 0,
        totalDonationsCount: 0,
        donorsSupported: 0,
        lastResetAt: admin.firestore.FieldValue.serverTimestamp(),
        lastResetBy: decoded.uid,
      },
      { merge: true }
    );

    return res.json({
      success: true,
      message: "Platform statistics reset successfully",
    });
  } catch (err) {
    console.error("resetPlatformStats error:", err);
    setCorsHeadersForResponse(req, res);
    return res.status(500).json({
      error: "Reset failed",
      details: err.message,
    });
  }
});
