// src/services/storage.js
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth } from "../firebase";

/**
 * uploadReceipt
 * - uploads a file to `users/{userId}/receipts/` and returns a download URL
 * - requires an authenticated user
 * - options:
 *    { public: true } -> will set file under `public/uploads/...` (no user folder) only if you explicitly allow it
 *
 * Throws clear errors when unauthenticated or when upload fails.
 */
export const uploadReceipt = async (file, userId = null, opts = {}) => {
  if (!file) throw new Error("uploadReceipt: file required");

  // Prefer explicit userId param; otherwise use current authenticated user
  const currentUser = auth && auth.currentUser ? auth.currentUser : null;

  // If userId is provided, ensure it matches currentUser (if present)
  if (userId && currentUser && String(userId) !== String(currentUser.uid)) {
    // mismatch - treat as unauthorized (don't allow writing to another user's folder)
    const e = new Error("uploadReceipt: provided userId does not match authenticated user");
    e.code = "user_mismatch";
    throw e;
  }

  // If app requires authentication for writes, ensure we have a user
  if (!currentUser && !opts.public) {
    const e = new Error("uploadReceipt: not authenticated. Sign in before uploading files.");
    e.code = "storage_unauthenticated";
    throw e;
  }

  // Determine path
  let remotePath;
  if (opts.public) {
    // explicit public upload (use sparingly)
    const safeName = (file.name || "file").replace(/[^a-zA-Z0-9.\-_]/g, "_");
    remotePath = `public/uploads/${Date.now()}_${safeName}`;
  } else {
    const uid = userId || currentUser.uid;
    const safeName = (file.name || "file").replace(/[^a-zA-Z0-9.\-_]/g, "_");
    remotePath = `users/${uid}/receipts/${Date.now()}_${safeName}`;
  }

  try {
    const storage = getStorage();
    const storageRef = ref(storage, remotePath);

    // uploadBytes returns a snapshot; uploadBytes is enough for small files (no progress)
    const snapshot = await uploadBytes(storageRef, file);

    // getDownloadURL
    const url = await getDownloadURL(snapshot.ref);
    return url;
  } catch (err) {
    // Normalize typical errors for easier handling by UI
    const code = err?.code || err?.message || "storage_upload_failed";
    const message = err?.message || String(err);
    const e = new Error(`uploadReceipt failed: ${message}`);
    e.original = err;
    e.code = code;
    throw e;
  }
};
