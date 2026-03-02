// src/firebaseMessaging.js
import { getToken, onMessage, isSupported } from "firebase/messaging";
import { messaging, db } from "./firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

/* =================================================
   Request permission + get & save FCM token
================================================= */
export async function requestNotificationPermission(user) {
  if (!user || !user.uid) {
    throw new Error("User not authenticated");
  }

  /* Check browser support */
  const supported = await isSupported();
  if (!supported) {
    console.warn("[FCM] Messaging not supported in this browser");
    return null;
  }

  /* Ask permission */
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission denied");
  }

  if (!messaging) {
    throw new Error("Firebase messaging not initialized");
  }

  /* Get token */
  const token = await getToken(messaging, {
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
  });

  if (!token) {
    throw new Error("Failed to obtain FCM token");
  }

  /* Save token to Firestore (merge-safe) */
  await setDoc(
    doc(db, "users", user.uid),
    {
      fcmToken: token,
      fcmUpdatedAt: serverTimestamp(),
      notificationsEnabled: true,
    },
    { merge: true }
  );

  console.info("[FCM] Token registered for user:", user.uid);
  return token;
}

/* =================================================
   Foreground message listener
================================================= */
export function listenForegroundMessages(callback) {
  if (!messaging) {
    console.warn("[FCM] Messaging not available");
    return;
  }

  onMessage(messaging, (payload) => {
    console.log("[FCM] Foreground message received:", payload);

    /* Pass payload to UI if needed */
    if (typeof callback === "function") {
      callback(payload);
    }

    /* Show native system notification (foreground) */
    if (
      Notification.permission === "granted" &&
      payload?.notification
    ) {
      const { title, body, icon } = payload.notification;

      new Notification(title || "GiveAura", {
        body: body || "You have a new update",
        icon: icon || "/icon-192.png",
        data: payload.data || {},
      });
    }
  });
}
