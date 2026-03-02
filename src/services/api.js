// src/services/api.js
// Small helper to call an authenticated backend endpoint with the user's ID token.
//
// Improvements:
// - Automatically uses correct region (asia-southeast1) for your Cloud Functions
// - Optional timeout via AbortController (default 25s)
// - Safer JSON parsing and clearer errors with status/code
// - Defensive checks for `auth` and fetch availability

import { auth } from "../firebase";

const ENV = (() => {
  try {
    if (typeof import.meta !== "undefined" && import.meta.env) return import.meta.env;
  } catch {}
  try {
    if (typeof process !== "undefined" && process.env) return process.env;
  } catch {}
  return {};
})();

// prefer env overrides, fallback to correct region asia-southeast1
const DEFAULT_SET_EMAIL_URL =
  (ENV && (ENV.BACKEND_SET_EMAIL_URL || ENV.VITE_BACKEND_SET_EMAIL_URL)) ||
  "https://asia-southeast1-fundraiser-donations.cloudfunctions.net/api/setUserProfile";

function safeParseJSON(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function callAuthBackend(
  path = DEFAULT_SET_EMAIL_URL,
  method = "POST",
  body = {},
  opts = {}
) {
  const timeoutMs = typeof opts.timeoutMs === "number" ? opts.timeoutMs : 25000;

  if (!path || typeof path !== "string") {
    throw new Error("Invalid path provided to callAuthBackend");
  }

  if (typeof fetch !== "function") {
    const e = new Error("Fetch API unavailable in this environment");
    e.code = "no_fetch";
    throw e;
  }

  const current = auth?.currentUser;
  if (!current) {
    const e = new Error("Not authenticated");
    e.code = "not_authenticated";
    throw e;
  }


  let idToken;
  try {
    idToken = await current.getIdToken(true);
  } catch (err) {
    const e = new Error("Failed to acquire ID token");
    e.code = "token_error";
    e.original = err;
    throw e;
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  let timeoutId = null;
  if (controller) {
    timeoutId = setTimeout(() => {
      try {
        controller.abort();
      } catch {}
    }, timeoutMs);
  }

  const fetchOpts = {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: method.toUpperCase() === "GET" ? undefined : JSON.stringify(body),
    signal: controller ? controller.signal : undefined,
  };

  try {
    const res = await fetch(path, fetchOpts);
    const text = await res.text();
    const parsed = safeParseJSON(text);

    if (!res.ok) {
      const err = new Error(`Backend error ${res.status}`);
      err.status = res.status;
      err.response = parsed;
      err.code = "backend_error";
      err.message = `Backend returned HTTP ${res.status} - ${
        typeof parsed === "string" ? parsed : JSON.stringify(parsed)
      }`;
      throw err;
    }

    return parsed;
  } catch (err) {
    if (err && err.name === "AbortError") {
      const e = new Error(`Request timed out after ${timeoutMs} ms`);
      e.code = "timeout";
      throw e;
    }

    if (err && err.code) throw err;

    const e = new Error("Network or backend call failed");
    e.code = "network_error";
    e.original = err;
    throw e;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
