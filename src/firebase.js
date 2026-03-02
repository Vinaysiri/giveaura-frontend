// src/firebase.js
import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  getFirestore,
  collection,
  getDocs,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import { getMessaging, isSupported } from "firebase/messaging";

/* -----------------------
   Env helpers
----------------------- */
function getEnvVars() {
  try {
    if (typeof import.meta !== "undefined" && import.meta?.env) {
      return import.meta.env;
    }
  } catch {}
  try {
    if (typeof process !== "undefined" && process?.env) {
      return process.env;
    }
  } catch {}
  return {};
}
const ENV = getEnvVars();

// Safe parse helper
function maybeParseJSON(v) {
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }
  return v;
}

/* -----------------------
   App init
----------------------- */
let firebaseApp;
try {
  const rawConfig =
    ENV?.VITE_FIREBASE_CONFIG || ENV?.FIREBASE_CONFIG || null;
  const parsedConfig = maybeParseJSON(rawConfig);

  let config =
    parsedConfig && typeof parsedConfig === "object"
      ? parsedConfig
      : {
          apiKey: ENV.VITE_FIREBASE_API_KEY,
          authDomain: ENV.VITE_FIREBASE_AUTH_DOMAIN,
          projectId: ENV.VITE_FIREBASE_PROJECT_ID,
          storageBucket: ENV.VITE_FIREBASE_STORAGE_BUCKET,
          messagingSenderId: ENV.VITE_FIREBASE_MESSAGING_SENDER_ID,
          appId: ENV.VITE_FIREBASE_APP_ID,
          measurementId: ENV.VITE_FIREBASE_MEASUREMENT_ID,
        };

  /* 🔒 HARD OVERRIDE: REAL STORAGE BUCKET */
  const originalBucket = config.storageBucket;
  config.storageBucket = "fundraiser-donations.firebasestorage.app";

  if (originalBucket !== config.storageBucket) {
    console.warn(
      "[firebase] storageBucket overridden:",
      originalBucket,
      "→",
      config.storageBucket
    );
  }

  firebaseApp = initializeApp(config);
  console.info("[firebase] App initialized:", config.projectId);
} catch (e) {
  console.error("[firebase] initializeApp failed:", e);
  throw e;
}

/* -----------------------
   Firestore
----------------------- */
let db;
try {
  const forceLongPolling =
    String(
      ENV.VITE_FIRESTORE_FORCE_LONGPOLLING ||
        ENV.FIRESTORE_FORCE_LONGPOLLING ||
        "false"
    ).toLowerCase() === "true";

  db = initializeFirestore(firebaseApp, {
    experimentalForceLongPolling: forceLongPolling,
  });
} catch {
  db = getFirestore(firebaseApp);
}

/* -----------------------
   Auth / Storage / Functions
----------------------- */
const auth = getAuth(firebaseApp);
const storage = getStorage(firebaseApp);

const functionsRegion =
  ENV.VITE_FUNCTIONS_REGION ||
  ENV.FUNCTIONS_REGION ||
  "asia-southeast1";

let functions;
try {
  functions = getFunctions(firebaseApp, functionsRegion);
} catch {
  functions = getFunctions(firebaseApp);
}

/* -----------------------
  Firebase Cloud Messaging
----------------------- */
let messaging = null;

(async () => {
  try {
    const supported = await isSupported();
    if (!supported) {
      console.warn("[firebase] FCM not supported in this browser");
      return;
    }
    messaging = getMessaging(firebaseApp);
    console.info("[firebase] Messaging initialized");
  } catch (err) {
    console.warn("[firebase] Messaging init failed:", err);
  }
})();

/* -----------------------
   Debug helpers
----------------------- */
if (typeof window !== "undefined") {
  window.firebaseApp = firebaseApp;
  window.firebaseAuth = auth;
  window.firebaseDB = db;
  window.firebaseStorage = storage;
  window.firebaseFunctions = functions;
  window.firebaseMessaging = messaging;

  window.debugListUsers = async () => {
    const snap = await getDocs(collection(db, "users"));
    console.table(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  };

  console.info("[firebase] Debug handles attached to window");
}

/* -----------------------
   Exports
----------------------- */
export {
  firebaseApp,
  db,
  auth,
  storage,
  functions,
  messaging,
};
