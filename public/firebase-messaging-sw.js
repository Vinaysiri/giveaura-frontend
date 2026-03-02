/* public/firebase-messaging-sw.js */

/* =====================================================
   Firebase SDKs (COMPAT – REQUIRED FOR SERVICE WORKER)
===================================================== */
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");

/* =====================================================
   Firebase init (PUBLIC CONFIG ONLY)
===================================================== */
firebase.initializeApp({
  apiKey: "AIzaSyA00P16ZpwA1O6XUg1jfmWbouJcA9KzxxU",
  authDomain: "fundraiser-donations.firebaseapp.com",
  projectId: "fundraiser-donations",
  storageBucket: "fundraiser-donations.firebasestorage.app",
  messagingSenderId: "413991844748",
  appId: "1:413991844748:web:b947deed6f0f2a49e3f4a9",
});

/* =====================================================
   Messaging instance
===================================================== */
const messaging = firebase.messaging();

/* =====================================================
   BACKGROUND MESSAGE HANDLER (FCM)
===================================================== */
messaging.onBackgroundMessage((payload) => {
  console.log("[SW] Background FCM message:", payload);

  const title =
    payload?.notification?.title ||
    payload?.data?.title ||
    "GiveAura Notification";

  const body =
    payload?.notification?.body ||
    payload?.data?.message ||
    payload?.data?.body ||
    "You have a new update";

  const icon =
    payload?.notification?.icon ||
    payload?.data?.icon ||
    "/icon-192.png";

  const notificationOptions = {
    body,
    icon,
    badge: "/badge-72.png",

    // Keeps notification visible until user interacts
    requireInteraction: true,

    // Prevent duplicates
    tag: payload?.data?.notificationId || "giveaura-notification",

    data: {
      ...payload?.data,
      click_action: payload?.data?.click_action || "/notifications",
    },

    vibrate: [200, 100, 200],
  };

  self.registration.showNotification(title, notificationOptions);
});

/* =====================================================
    FALLBACK PUSH HANDLER (IMPORTANT)
   - Some browsers send raw push events
===================================================== */
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { body: event.data.text() };
  }

  const title =
    payload?.notification?.title ||
    payload?.data?.title ||
    "GiveAura Notification";

  const body =
    payload?.notification?.body ||
    payload?.data?.message ||
    payload?.data?.body ||
    "You have a new update";

  const options = {
    body,
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    requireInteraction: true,
    data: payload?.data || {},
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

/* =====================================================
   NOTIFICATION CLICK HANDLER
===================================================== */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl =
    event.notification?.data?.click_action || "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(targetUrl) && "focus" in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});

/* =====================================================
   🔄 LIFECYCLE STABILITY FIX (CRITICAL)
===================================================== */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
