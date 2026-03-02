// src/authReady.js
// Small helper that resolves when Firebase Auth has finished initialising.
// Uses a dynamic import of ./firebase to avoid circular import/build-time issues.

import { onAuthStateChanged } from "firebase/auth";

/**
 * authReady is a Promise that resolves with the current user (or null)
 * once the initial onAuthStateChanged fires. Await this before doing
 * client writes that depend on auth being settled.
 *
 * Usage:
 *   await authReady; // resolves to the current user or null
 */
export const authReady = new Promise((resolve) => {
  // dynamic-import firebase to avoid build-time circular import issues
  // (don't import `auth` at module-top-level).
  import("./firebase")
    .then((mod) => {
      const auth = mod && mod.auth ? mod.auth : null;
      if (!auth) {
        // If auth not available, resolve null quickly but log for diagn.
        console.warn("[authReady] firebase auth not found during authReady import.");
        return resolve(null);
      }

      let resolved = false;
      const unsubs = [];

      const unsub = onAuthStateChanged(
        auth,
        (user) => {
          if (!resolved) {
            resolved = true;
            try {
              resolve(user || null);
            } finally {
              // cleanup
              if (typeof unsub === "function") unsub();
              unsubs.forEach((u) => typeof u === "function" && u());
            }
          }
        },
        (err) => {
          console.warn("[authReady] onAuthStateChanged error:", err);
          if (!resolved) {
            resolved = true;
            resolve(null);
          }
        }
      );

      // safety: if onAuthStateChanged didn't call within X ms, resolve with currentUser
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try {
            resolve(auth.currentUser || null);
          } finally {
            if (typeof unsub === "function") unsub();
            unsubs.forEach((u) => typeof u === "function" && u());
          }
        }
      }, 4000);

      // ensure we clear timeout when promise resolves (best-effort)
      authReady.finally && authReady.finally(() => clearTimeout(timeout));
    })
    .catch((err) => {
      console.warn("[authReady] dynamic import failed:", err);
      resolve(null);
    });
});

export default authReady;
