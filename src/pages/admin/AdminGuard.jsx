// src/pages/admin/AdminGuard.jsx
import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import AdminLogin from "./AdminLogin.jsx";

/**
 * AdminGuard
 * Wrap your entire admin panel with this.
 *
 * Conditions to show dashboard:
 *  1. User is logged in (currentUser)
 *  2. User has custom claim admin === true
 *  3. (Optional) Admin password passed in this tab (sessionStorage flag)
 */
const ADMIN_SESSION_KEY = "giveaura_admin_panel_ok";

export default function AdminGuard({ children }) {
  const { currentUser, loading } = useAuth() || {};
  const location = useLocation();

  const [claimsChecked, setClaimsChecked] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [localGateOk, setLocalGateOk] = useState(
    () => sessionStorage.getItem(ADMIN_SESSION_KEY) === "1"
  );
  const [claimsError, setClaimsError] = useState(null);

  // When auth changes, check custom claims
  useEffect(() => {
    let cancelled = false;

    async function checkClaims() {
      setClaimsError(null);
      if (!currentUser) {
        setIsAdminUser(false);
        setClaimsChecked(true);
        sessionStorage.removeItem(ADMIN_SESSION_KEY);
        setLocalGateOk(false);
        return;
      }

      try {
        const result = await currentUser.getIdTokenResult(true);
        if (cancelled) return;
        const isAdmin = result?.claims?.admin === true;
        setIsAdminUser(isAdmin);
        setClaimsChecked(true);

        if (!isAdmin) {
          sessionStorage.removeItem(ADMIN_SESSION_KEY);
          setLocalGateOk(false);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("[AdminGuard] getIdTokenResult error", err);
        setClaimsError(err.message || String(err));
        setIsAdminUser(false);
        setClaimsChecked(true);
      }
    }

    checkClaims();
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  // While auth/claims are loading
  if (loading || !claimsChecked) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Checking admin access…</h2>
      </div>
    );
  }

  // Not logged in → redirect to normal login
  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Logged in but no admin claim → hard block
  if (!isAdminUser) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Not authorized</h2>
        <p>This area is only for GiveAura admins.</p>
        {claimsError && (
          <p style={{ color: "red", marginTop: 8 }}>Error: {claimsError}</p>
        )}
      </div>
    );
  }

  // Has admin claim but has NOT passed your extra password gate yet
  if (!localGateOk) {
    return (
      <AdminLogin
        onSuccess={() => {
          sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
          setLocalGateOk(true);
        }}
      />
    );
  }

  // All checks passed → render the actual admin UI
  return <>{children}</>;
}
