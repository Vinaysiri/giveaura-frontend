// src/pages/admin/AdminLogin.jsx
import React, { useEffect, useState } from "react";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
} from "firebase/auth";
import logo from "../../assets/GiveAuraLogo.mp4";
import "./AdminLogin.css";

/**
 * Safe environment access for both Vite (import.meta.env) and Node-like envs (process.env)
 */
function getEnvVars() {
  try {
    if (
      typeof import.meta !== "undefined" &&
      import.meta &&
      import.meta.env
    )
      return import.meta.env;
  } catch (e) {}
  try {
    if (typeof process !== "undefined" && process && process.env)
      return process.env;
  } catch (e) {}
  return {};
}
const ENV = getEnvVars();

// support either VITE_ADMIN_PASSWORD or REACT_APP_ADMIN_PASSWORD as fallback
const ADMIN_PASSWORD =
  ENV.VITE_ADMIN_PASSWORD || ENV.REACT_APP_ADMIN_PASSWORD || "";

/**
 * AdminLogin
 * - Password login uses VITE_ADMIN_PASSWORD
 * - Optional Google login (uses Firebase popup). onSuccess() is called on success.
 *
 * UX:
 * - shows an "unlocked" visual state when the password is correct
 * - sets sessionStorage giveaura_admin
 * - shows a Proceed button so user sees the unlocked state before navigating
 * - still supports Google login
 */
export default function AdminLogin({ onSuccess }) {
  const [password, setPassword] = useState("");
  const [loadingPw, setLoadingPw] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [message, setMessage] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [autoProceedTimer, setAutoProceedTimer] = useState(null);

  useEffect(() => {
    return () => {
      if (autoProceedTimer) clearTimeout(autoProceedTimer);
    };
  }, [autoProceedTimer]);

  const markAdminSession = () => {
    try {
      sessionStorage.setItem("giveaura_admin", "true");
    } catch (e) {
      // ignore sessionStorage errors (private mode, etc.)
    }
  };

  const handlePasswordLogin = async () => {
    setMessage("");
    if (!ADMIN_PASSWORD) {
      setMessage("Admin password missing. Set VITE_ADMIN_PASSWORD in .env");
      return;
    }
    setLoadingPw(true);
    try {
      // small debounce-like UX
      await new Promise((r) => setTimeout(r, 250));
      if (password === ADMIN_PASSWORD) {
        markAdminSession();
        // show unlocked UI instead of immediately navigating so user sees feedback
        setIsUnlocked(true);

        // auto-proceed after a short friendly delay, but allow user to click Proceed earlier
        const t = setTimeout(() => {
          onSuccess && onSuccess();
        }, 700);
        setAutoProceedTimer(t);
      } else {
        setMessage(" Incorrect password");
      }
    } catch (err) {
      setMessage("Unexpected error. Try again.");
      console.error("handlePasswordLogin:", err);
    } finally {
      setLoadingPw(false);
    }
  };

  const handleGoogleLogin = async () => {
    setMessage("");
    setLoadingGoogle(true);
    try {
      const auth = getAuth();
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const email = result?.user?.email ?? "";
      // Optionally restrict domain:
      // if (!email.endsWith("@giveaura.com")) throw new Error("Unauthorized email domain");

      markAdminSession();
      onSuccess && onSuccess();
    } catch (err) {
      console.error("Google login failed:", err);
      setMessage("Google login failed: " + (err?.message || String(err)));
    } finally {
      setLoadingGoogle(false);
    }
  };

  const handleProceedClick = () => {
    if (autoProceedTimer) clearTimeout(autoProceedTimer);
    onSuccess && onSuccess();
  };

  const resetUnlock = () => {
    setIsUnlocked(false);
    setPassword("");
    setMessage("");
  };

  return (
    <div className="admin-login-root">
      <div
        className="admin-login-card"
        role="region"
        aria-labelledby="admin-login-title"
      >
        {/* Left / Header side */}
        <div className="admin-login-header">
          {/* 🔥 Use logo video instead of image */}
          <video
            src={logo}
            className="admin-login-logo"
            autoPlay
            muted
            loop
            playsInline
          />
          <div>
            <h1 id="admin-login-title" className="admin-login-title">
              GiveAura Admin
            </h1>
            <p className="admin-login-sub">
              Secure admin access — manage campaigns, events and users.
            </p>
          </div>
        </div>

        {/* Right / Form side */}
        <div className="admin-login-body">
          {isUnlocked ? (
            <div className="unlock-panel">
              <div className="unlock-icon" aria-hidden="true">
                <span>🔓</span>
              </div>
              <h2 className="unlock-title">Access granted</h2>
              <p className="unlock-text">
                Welcome back — you may proceed to the admin area.
              </p>

              <div className="unlock-actions">
                <button
                  onClick={handleProceedClick}
                  className="btn-primary"
                >
                  Proceed
                </button>
                <button
                  onClick={resetUnlock}
                  className="btn-secondary"
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <label
                htmlFor="admin-password"
                className="admin-label"
              >
                Admin password
              </label>
              <input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handlePasswordLogin();
                }}
                className="admin-input"
                placeholder="Enter admin password"
                aria-label="Admin password"
                autoComplete="current-password"
              />

              <button
                onClick={handlePasswordLogin}
                disabled={loadingPw || loadingGoogle}
                className="btn-primary"
                aria-busy={loadingPw}
                type="button"
              >
                {loadingPw ? (
                  <>
                    <span className="spinner" /> Signing in…
                  </>
                ) : (
                  "Login with password"
                )}
              </button>

              <div className="login-divider">
                <hr />
                <span>or</span>
                <hr />
              </div>

              <button
                onClick={handleGoogleLogin}
                disabled={loadingGoogle || loadingPw}
                className="btn-google"
                aria-busy={loadingGoogle}
                type="button"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 48 48"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.9 0 7.2 1.4 9.9 3.6l7.4-7.4C36.8 2.8 30.8 0 24 0 14 0 5.6 5.9 1.9 14.3l8.7 6.7C12.7 15 17.9 9.5 24 9.5z"
                  />
                  <path
                    fill="#34A853"
                    d="M46.5 24c0-1.6-.1-3.1-.4-4.6H24v9h12.9c-.6 3-2.7 5.6-5.9 7.2l9 7c5.3-4.9 8.5-12.1 8.5-18.6z"
                  />
                  <path
                    fill="#4A90E2"
                    d="M10.6 29l-8.7 6.7C6.2 39.8 14 44 24 44c6.8 0 12.8-2.8 17-7.3l-9-7C30.9 32.8 27.6 34 24 34 17.9 34 12.7 28.5 10.6 22z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M24 9.5c6.9 0 12.9 4.2 15 10.3l9.5-7.3C44.4 4.2 33.2 0 24 0 14 0 5.6 5.9 1.9 14.3l8.7 6.7C12.7 15 17.9 9.5 24 9.5z"
                    opacity="0.0"
                  />
                </svg>
                <span>
                  {loadingGoogle ? "Continuing…" : "Continue with Google"}
                </span>
              </button>

              {message && (
                <div
                  className="login-message"
                  role="alert"
                >
                  {message}
                </div>
              )}

              <div className="login-tip">
                Tip: admin password is read from{" "}
                <code>VITE_ADMIN_PASSWORD</code> in your <code>.env</code>.
              </div>
            </>
          )}
        </div>

        <div className="admin-login-footer">
          GiveAura — built with care
        </div>
      </div>
    </div>
  );
}
