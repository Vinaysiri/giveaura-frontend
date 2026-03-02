// src/pages/admin/index.jsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  Suspense,
} from "react";
import {
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import AdminLayout from "./AdminLayout.jsx";
import AdminLogin from "./AdminLogin.jsx";

import Dashboard from "./Dashboard.jsx";
import Events from "./Events.jsx";
import Popups from "./Popups.jsx";
import Users from "./Users.jsx";
import Support from "./Support.jsx";
import BoosterSubscribers from "./BoosterSubscribers.jsx";
import BoosterAnalytics from "./BoosterAnalytics.jsx";

/**
 * safeLazy(importFn, missingMessage)
 * Ensures the lazy import ALWAYS resolves to a usable React component (never `null`).
 */
function safeLazy(importFn, missingMessage) {
  return React.lazy(() =>
    importFn()
      .then((mod) => {
        // Prefer default export if it looks like a component
        if (
          mod &&
          mod.default &&
          (typeof mod.default === "function" ||
            typeof mod.default === "object")
        ) {
          return { default: mod.default };
        }

        // Common named export fallback
        if (
          mod &&
          mod.Settings &&
          (typeof mod.Settings === "function" ||
            typeof mod.Settings === "object")
        ) {
          return { default: mod.Settings };
        }

        // As a last resort, pick first exported value that looks like a component
        if (mod && typeof mod === "object") {
          for (const key of Object.keys(mod)) {
            const v = mod[key];
            if (
              v &&
              (typeof v === "function" || typeof v === "object")
            ) {
              return { default: v };
            }
          }
        }

        // Nothing usable found → fallback component
        return {
          default: () => (
            <div className="ga-card" style={{ padding: 16 }}>
              {missingMessage}
            </div>
          ),
        };
      })
      .catch((err) => {
        console.warn("safeLazy import failed:", err);
        return {
          default: () => (
            <div className="ga-card" style={{ padding: 16 }}>
              {missingMessage}
            </div>
          ),
        };
      })
  );
}

const CampaignsLazy = safeLazy(
  () => import("./Campaigns.jsx"),
  "Campaigns page not present. Create src/pages/admin/Campaigns.jsx."
);

const DonationsLazy = safeLazy(
  () => import("./Donations.jsx"),
  "Donations page not present. Create src/pages/admin/Donations.jsx."
);

const SettingsLazy = safeLazy(
  () => import("./Settings.jsx"),
  "Settings page not present. Create src/pages/admin/Settings.jsx."
);

// 🔐 Only THIS email will be allowed to even see the admin password screen
const ADMIN_EMAIL =
  import.meta.env.VITE_ADMIN_EMAIL || "founder@example.com";

const storageKey = "giveaura_admin";

const readAdminSession = () => {
  try {
    return sessionStorage.getItem(storageKey) === "true";
  } catch {
    return false;
  }
};

function NotAuthorized({ message, showLogin }) {
  const navigate = useNavigate();
  return (
    <div
      className="ga-page-center"
      style={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        className="ga-card"
        style={{
          padding: 24,
          maxWidth: 460,
          textAlign: "center",
        }}
      >
        <h2 style={{ marginBottom: 8 }}>Not authorized</h2>
        <p style={{ marginBottom: 16, color: "#9ca3af" }}>
          {message}
        </p>
        {showLogin && (
          <button
            className="btn"
            onClick={() => navigate("/login")}
          >
            Go to Login
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * AdminRouter
 *
 * /admin/*
 *
 * Behaviour:
 * - must be logged in (normal site login)
 * - only ADMIN_EMAIL can access admin
 * - that user still has to pass AdminLogin (password)
 * - after password success we store sessionStorage flag
 */
export default function AdminRouter() {
  const { currentUser, loading } = useAuth() || {};
  const navigate = useNavigate();

  const [hasAdminSession, setHasAdminSession] = useState(
    readAdminSession()
  );

  // keep session in sync across tabs
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === storageKey) {
        setHasAdminSession(readAdminSession());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const handleSuccess = useCallback(() => {
    try {
      sessionStorage.setItem(storageKey, "true");
    } catch {
      // ignore
    }
    setHasAdminSession(true);
    navigate("/admin/dashboard", { replace: true });
  }, [navigate]);

  // ====== AUTH / ACCESS GATES ======

  // still loading auth state
  if (loading) {
    return (
      <div
        className="ga-page-center"
        style={{
          minHeight: "50vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div className="ga-card" style={{ padding: 24 }}>
          Checking admin access…
        </div>
      </div>
    );
  }

  // not logged in → ask to login normally
  if (!currentUser) {
    return (
      <NotAuthorized
        message="You must log in to your GiveAura account before accessing the admin panel."
        showLogin
      />
    );
  }

  // logged in but wrong email → hard block
  const email = currentUser.email || "";
  const isAllowedAdminUser =
    email.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  if (!isAllowedAdminUser) {
    return (
      <NotAuthorized message="This account is not allowed to access the admin dashboard." />
    );
  }

  // From here: user is the allowed admin email.
  // If they haven't passed the admin password yet, show AdminLogin.
  return (
    <Routes>
      {/* /admin → show AdminLogin unless already unlocked in this session */}
      <Route
        index
        element={
          hasAdminSession ? (
            <Navigate to="/admin/dashboard" replace />
          ) : (
            <AdminLogin onSuccess={handleSuccess} />
          )
        }
      />

      {/* Protected admin area */}
      <Route
        path="/*"
        element={
          hasAdminSession ? (
            <AdminLayout>
              <Routes>
                <Route
                  index
                  element={
                    <Navigate
                      to="/admin/dashboard"
                      replace
                    />
                  }
                />

                <Route path="dashboard" element={<Dashboard />} />
                <Route path="events" element={<Events />} />
                <Route path="popups" element={<Popups />} />
                <Route path="users" element={<Users />} />
                <Route path="support" element={<Support />} />
                <Route path="boostersubscribers" element={<BoosterSubscribers />} /> 
                <Route path="boosteranalytics" element={<BoosterAnalytics />} />


                {/* optional / heavy pages: lazy loaded */}
                <Route
                  path="campaigns"
                  element={
                    <Suspense
                      fallback={
                        <div className="ga-card">
                          Loading campaigns…
                        </div>
                      }
                    >
                      <CampaignsLazy />
                    </Suspense>
                  }
                />

                <Route
                  path="donations"
                  element={
                    <Suspense
                      fallback={
                        <div className="ga-card">
                          Loading donations…
                        </div>
                      }
                    >
                      <DonationsLazy />
                    </Suspense>
                  }
                />

                <Route
                  path="settings"
                  element={
                    <Suspense
                      fallback={
                        <div className="ga-card">
                          Loading settings…
                        </div>
                      }
                    >
                      <SettingsLazy />
                    </Suspense>
                  }
                />

                {/* fallback → dashboard */}
                <Route
                  path="*"
                  element={
                    <Navigate
                      to="/admin/dashboard"
                      replace
                    />
                  }
                />
              </Routes>
            </AdminLayout>
          ) : (
            // if someone hits /admin/anything without a valid admin session,
            // push them back to /admin (password screen)
            <Navigate to="/admin" replace />
          )
        }
      />
    </Routes>
  );
}

/**
 * kept for compatibility (not strictly necessary)
 */
function LazyOrMissing({ Comp, missingMessage }) {
  const Resolved = useMemo(() => Comp, [Comp]);
  if (!Resolved) {
    return <div className="ga-card">{missingMessage}</div>;
  }
  return <Resolved />;
}
