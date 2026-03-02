// src/App.jsx
import "./styles/global.css";
import "./App.css";
import React, { useEffect, useState, useCallback } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import AdminRouter from "./pages/admin/index.jsx";
import Home from "./pages/Home";
import CSRDashboard from "./pages/CSRDashboard.jsx";
import CreateCampaign from "./pages/CreateCampaign";
import Donate from "./pages/Donate";
import Login from "./pages/Login";
import ProtectedRoute from "./routes/ProtectedRoute";
import DonationHistory from "./pages/DonationHistory";
import EditCampaign from "./pages/EditCampaign";
import Profile from "./pages/Profile";
import EditProfile from "./pages/EditProfile";
import NotificationsPage from "./pages/Notifications";
import CampaignView from "./pages/CampaignView";
import Events from "./pages/Events";
import About from "./pages/About.jsx";
import Membership from "./pages/Membership.jsx";
import Help from "./pages/Help.jsx";
import Terms from "./pages/Terms.jsx";
import MobileHeader from "./components/MobileHeader.jsx";
import DesktopHeader from "./components/DesktopHeader.jsx";
import RefundPolicy from "./pages/RefundPolicy.jsx";
import AdminAds from "./pages/admin/AdminAds.jsx";
import GiveAuraAdDonate from "./pages/GiveAuraAdDonate.jsx";
import BoostPayment from "./pages/BoostPayment.jsx";
import MyCampaigns from "./pages/MyCampaigns.jsx";
import Landing from "./pages/Landing.jsx";
import ReferralDashboard from "./pages/ReferralDashboard.jsx";
import CriticalCampaignCTA from "./components/CriticalCampaignCTA.jsx";
import DonateEntry from "./pages/DonateEntry";

// ⭐ NEW PAGES
import BoostPlans from "./pages/BoostPlans.jsx";
import Marketplace from "./pages/Marketplace.jsx";
import Subscriptions from "./pages/Subscriptions.jsx";
import Wallet from "./pages/Wallet.jsx";

import { getRecentDonations } from "./services/firestoreService";
import { computeSplits } from "./utils/money";

// notifications imports
import { useAuth } from "./context/AuthContext";
import { db, auth } from "./firebase";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from "firebase/firestore";
import { getIdTokenResult } from "firebase/auth";
import { requestNotificationPermission } from "./firebaseMessaging";
import {preloadRazorpay} from "./utils/razorpayLoader";

const inferGross = (d = {}) => {
  if (!d || typeof d !== "object") return 0;

  const grossCandidates = [
    d.grossAmount,
    d.gross,
    d.amountGross,
    d.amount_raw,
    d.amountRaw,
    d.total,
    d.donatedAmount,
    d.originalAmount,
    d.amountCollected,
    d.rawAmount,
  ];

  for (const c of grossCandidates) {
    if (typeof c === "number" && !Number.isNaN(c) && c > 0) return Number(c);
    if (typeof c === "string" && c.trim() !== "" && !Number.isNaN(Number(c))) {
      return Number(c);
    }
  }

  // fallback: amount field if looks numeric
  if (typeof d.amount === "number" && d.amount > 0) return Number(d.amount);
  if (
    typeof d.amount === "string" &&
    d.amount.trim() !== "" &&
    !Number.isNaN(Number(d.amount))
  ) {
    return Number(d.amount);
  }

  return 0;
};

// wrapper around computeSplits so we always get fundraiser + platform cleanly
const computeTickerSplits = (gross) => {
  if (!gross || Number(gross) <= 0) {
    return {
      gross: 0,
      gst: 0,
      platform: 0,
      fundraiser: 0,
      netAfterGst: 0,
    };
  }
  const s = computeSplits(Number(gross));
  return {
    gross: Number(s.gross || gross),
    gst: Number(s.gst || 0),
    platform: Number(s.platform || 0),
    fundraiser: Number(s.fundraiser || 0),
    netAfterGst: Number(
      s.netAfterGst || (Number(s.gross || gross) - Number(s.gst || 0))
    ),
  };
};

// INR formatter – no decimals
const fmtINRNoDecimals = (n) => {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(Math.round(Number(n || 0)));
  } catch {
    return `₹${Math.round(n || 0)}`;
  }
};

/**
 * App (pure component)
 * - BrowserRouter, AuthProvider, ErrorBoundary are in main.jsx
 */

export default function App() {
  const location = useLocation();
  const { currentUser: user } = useAuth() || {};
  const [searchQuery, setSearchQuery] = useState("");
  const [sortType, setSortType] = useState("newest");
  const [urgencyFilter, setUrgencyFilter] = useState("all");
  const [showMyCampaigns, setShowMyCampaigns] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [showNotifPopup, setShowNotifPopup] = useState(false);


  const [isMobile, setIsMobile] = useState(false);

const [notifEnabled, setNotifEnabled] = useState(
  typeof Notification !== "undefined" &&
  Notification.permission === "granted"
);


const enableNotifications = async () => {
  try {
    if (!user) {
      alert("Please login first");
      return;
    }

    if (typeof Notification === "undefined") {
      alert("Notifications not supported in this browser");
      return;
    }

    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      alert("Notifications blocked");
      return;
    }

    const token = await requestNotificationPermission(user);
    console.log(" FCM token registered:", token);
    setNotifEnabled(true);

localStorage.setItem(
  "notifPromptShown",
  Date.now().toString()
);


    alert("Notifications enabled successfully");
  } catch (err) {
    console.error("Enable notifications failed:", err);
    alert("Failed to enable notifications");
  }
};


  // ===== TICKER STATE (used by headers) =====
  const [latestDonation, setLatestDonation] = useState(null);

  // NOTIFICATION COUNTS (for both headers)
  const [unreadCount, setUnreadCount] = useState(0);
  const [adminUnreadCount, setAdminUnreadCount] = useState(0);

  // build the same style of message as in Home.jsx
  const getOneTimeTickerMessage = useCallback((d) => {
    if (!d) return "";
    const gross = inferGross(d);
    if (!gross || gross <= 0) return "";

    const { fundraiser, platform } = computeTickerSplits(gross);

    const name =
      d.donorName || (d.donorEmail ? d.donorEmail.split("@")[0] : "Someone");

    const title =
      d.campaignTitle && d.campaignTitle !== "Test Campaign"
        ? d.campaignTitle
        : d.campaignId
        ? `Campaign (${String(d.campaignId).slice(0, 6)})`
        : "a campaign";

    return `${name} has donated ${fmtINRNoDecimals(
      gross
    )} to ${title}`;
  }, []);

  useEffect(() => {
  preloadRazorpay()
    .then(() => {
      console.log("Razorpay preloaded globally");
    })
    .catch((err) => {
      console.warn("Razorpay failed to preload", err);
    });
}, []);

useEffect(() => {
  if (!user) return;

  if (typeof Notification === "undefined") return;

  if (Notification.permission !== "default") return;

  const lastShown = localStorage.getItem("notifPromptShown");

  // Show again only after 7 days
  if (
    lastShown &&
    Date.now() - Number(lastShown) < 7 * 24 * 60 * 60 * 1000
  ) {
    return;
  }

  const timer = setTimeout(() => {
    setShowNotifPopup(true);
  }, 180000); // 3 minutes

  return () => clearTimeout(timer);
}, [user]);


  // =====  NOTIFICATION SUBSCRIPTIONS (moved from Home to App) =====
  useEffect(() => {
    if (!user || !user.uid) {
      setUnreadCount(0);
      setAdminUnreadCount(0);
      return;
    }

    console.log(" Notifications effect running for uid:", user.uid);

    let mounted = true;

    let unsubRecipient = null;
    let unsubUserId = null;
    let unsubAdminRole = null;
    let unsubAdminIsAdmin = null;

    // simple sets to de-duplicate across queries
    const userNotifIdsRef = { recipient: new Set(), userId: new Set() };
    const adminNotifIdsRef = { recipientRole: new Set(), isAdmin: new Set() };

    const updateUserUnread = () => {
      if (!mounted) return;
      const merged = new Set([
        ...userNotifIdsRef.recipient,
        ...userNotifIdsRef.userId,
      ]);
      setUnreadCount(merged.size);
    };

    const updateAdminUnread = () => {
      if (!mounted) return;
      const merged = new Set([
        ...adminNotifIdsRef.recipientRole,
        ...adminNotifIdsRef.isAdmin,
      ]);
      setAdminUnreadCount(merged.size);
    };

    const detectAdmin = async () => {
      const fbUser =
        user && typeof user.getIdToken === "function"
          ? user
          : auth?.currentUser || null;

      try {
        if (fbUser) {
          const tokenRes = await getIdTokenResult(fbUser);
          const claims = tokenRes?.claims || {};

          if (
            claims.admin === true ||
            claims.isAdmin === true ||
            claims.role === "admin"
          ) {
            return true;
          }
        }
      } catch (err) {
        console.warn("getIdTokenResult failed (admin detect):", err);
      }

      // fallback to env email
      return (
        user?.email ===
        (import.meta.env?.VITE_ADMIN_EMAIL || "admin@giveaura.com")
      );
    };

    const makeUserListeners = () => {
      try {
        const baseCol = collection(db, "notifications");

        // A: recipientId == user.uid
        const qRec = query(
          baseCol,
          where("recipientId", "==", user.uid),
          where("read", "==", false),
          orderBy("createdAt", "desc"),
          limit(500)
        );

        // B: userId == user.uid
        const qUserId = query(
          baseCol,
          where("userId", "==", user.uid),
          where("read", "==", false),
          orderBy("createdAt", "desc"),
          limit(500)
        );

        unsubRecipient = onSnapshot(
          qRec,
          (snap) => {
            if (!mounted) return;
            userNotifIdsRef.recipient = new Set(snap.docs.map((d) => d.id));
            updateUserUnread();
          },
          (err) => {
            console.warn("user recipient notifications listener err:", err);
          }
        );

        unsubUserId = onSnapshot(
          qUserId,
          (snap) => {
            if (!mounted) return;
            userNotifIdsRef.userId = new Set(snap.docs.map((d) => d.id));
            updateUserUnread();
          },
          (err) => {
            console.warn("userId notifications listener err:", err);
          }
        );
      } catch (err) {
        console.warn("subscribe user notifications failed:", err);
      }
    };

    const makeAdminListeners = () => {
      const baseCol = collection(db, "notifications");

      try {
        const qAdminRole = query(
          baseCol,
          where("recipientRole", "==", "admin"),
          where("read", "==", false),
          orderBy("createdAt", "desc"),
          limit(500)
        );

        unsubAdminRole = onSnapshot(
          qAdminRole,
          (snap) => {
            if (!mounted) return;
            adminNotifIdsRef.recipientRole = new Set(
              snap.docs.map((d) => d.id)
            );
            updateAdminUnread();
          },
          (err) => {
            console.warn("admin recipientRole listener err:", err);
          }
        );
      } catch (err) {
        console.warn("subscribe admin.recipientRole failed:", err);
      }

      try {
        const qAdminIsAdmin = query(
          baseCol,
          where("isAdmin", "==", true),
          where("read", "==", false),
          orderBy("createdAt", "desc"),
          limit(500)
        );

        unsubAdminIsAdmin = onSnapshot(
          qAdminIsAdmin,
          (snap) => {
            if (!mounted) return;
            adminNotifIdsRef.isAdmin = new Set(snap.docs.map((d) => d.id));
            updateAdminUnread();
          },
          (err) => {
            console.warn("admin isAdmin listener err:", err);
          }
        );
      } catch (err) {
        console.warn("subscribe admin.isAdmin failed:", err);
      }
    };

    (async () => {
      try {
        const isAdmin = await detectAdmin();

        // always listen for user notifications
        makeUserListeners();

        if (isAdmin) {
          makeAdminListeners();
        } else {
          setAdminUnreadCount(0);
        }
      } catch (err) {
        console.error("notifications effect setup failed:", err);
      }
    })();

    return () => {
      mounted = false;
      try {
        unsubRecipient && unsubRecipient();
      } catch {}
      try {
        unsubUserId && unsubUserId();
      } catch {}
      try {
        unsubAdminRole && unsubAdminRole();
      } catch {}
      try {
        unsubAdminIsAdmin && unsubAdminIsAdmin();
      } catch {}
    };
  }, [user]);

  // poll recent donations just to drive the header ticker
  useEffect(() => {
    let mounted = true;

    const fetchLatest = async () => {
      try {
        const data = await getRecentDonations(1); // newest first
        if (!mounted) return;
        if (Array.isArray(data) && data.length > 0) {
          setLatestDonation(data[0]);
        }
      } catch (err) {
        console.warn("[App] Failed to fetch latest donation for ticker:", err);
      }
    };

    fetchLatest();
    const interval = setInterval(fetchLatest, 8000); // refresh every 8s

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // detect mobile vs desktop
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

const showHeader = location.pathname == "/campaigns";
  useEffect(() => {
    let mounted = true;

    const tryFlush = async () => {
      try {
        const mod = await import("./services/firestoreService");
        if (!mounted) return;

        if (typeof mod.flushLocalDonations === "function") {
          console.info("Attempting to flush queued donations...");
          try {
            const res = await mod.flushLocalDonations();
            console.info("flushLocalDonations result:", res);
          } catch (err) {
            console.warn("flushLocalDonations threw:", err);
          }
        }
      } catch (err) {
        console.warn("Could not run flushLocalDonations:", err);
      }
    };

    tryFlush();

    const onVisibility = () =>
      document.visibilityState === "visible" && tryFlush();
    const onFocus = () => tryFlush();
    const onOnline = () => tryFlush();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);

    return () => {
      mounted = false;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  // ========= NORMAL APP RENDER =========
  return (
    <>
      

      {/* Global header: desktop vs mobile, hidden on admin routes */}
{showHeader && (
  <>
    {isMobile ? (
      <MobileHeader
        /* existing props */
        latestDonation={latestDonation}
        getOneTimeTickerMessage={getOneTimeTickerMessage}
        unreadCount={unreadCount}
        adminUnreadCount={adminUnreadCount}

        /* 🔹 search + filters (optional for mobile, but safe to pass) */
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}

        selectedCategories={selectedCategories}
        onCategoryChange={setSelectedCategories}

        sortType={sortType}
        onSortTypeChange={setSortType}

        urgencyFilter={urgencyFilter}
        onUrgencyFilterChange={setUrgencyFilter}

        showMyCampaigns={showMyCampaigns}
        onToggleMyCampaigns={() =>
          setShowMyCampaigns((prev) => !prev)
        }
      />
    ) : (
      <DesktopHeader
        /* existing props */
        latestDonation={latestDonation}
        getOneTimeTickerMessage={getOneTimeTickerMessage}
        unreadCount={unreadCount}
        adminUnreadCount={adminUnreadCount}
        
        selectedCategories={selectedCategories}
        onCategoryChange={setSelectedCategories}

        /*  REQUIRED FOR FILTER POPUP */
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}

        sortType={sortType}
        onSortTypeChange={setSortType}

           

        urgencyFilter={urgencyFilter}
        onUrgencyFilterChange={setUrgencyFilter}

        showMyCampaigns={showMyCampaigns}
        onToggleMyCampaigns={() =>
          setShowMyCampaigns((prev) => !prev)

        
        }
      />
    )}
  </>
)}

{showNotifPopup && !notifEnabled && (
  <div
    style={{
      position: "fixed",
      bottom: 30,
      right: 30,
      background: "#fff",
      padding: "20px",
      borderRadius: "12px",
      boxShadow: "0 8px 30px rgba(0,0,0,0.2)",
      width: "320px",
      zIndex: 9999,
    }}
  >
    <h4 style={{ marginBottom: "10px" }}> Stay Updated</h4>
    <p style={{ fontSize: "14px", marginBottom: "15px" }}>
      Enable notifications to receive donation alerts and campaign updates.
    </p>

    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <button
  onClick={() => {
    localStorage.setItem("notifPromptShown", "true");
    setShowNotifPopup(false);
  }}
        style={{
          background: "#e5e7eb",
          border: "none",
          padding: "8px 14px",
          borderRadius: "6px",
          cursor: "pointer",
        }}
      >
        Later
      </button>

      <button
        onClick={async () => {
          await enableNotifications();
          setShowNotifPopup(false);
        }}
        style={{
          background: "#2563eb",
          color: "#fff",
          border: "none",
          padding: "8px 14px",
          borderRadius: "6px",
          cursor: "pointer",
        }}
      >
        Allow
      </button>
    </div>
  </div>
)}


      {/* Add spacing so content is not hidden under sticky header */}
      <div style={{ paddingTop: showHeader ? 0 : "0px" }}>
        <Routes>
          {/* Public routes */}
          <Route
            path="/campaigns"
            element={
              <Home
                selectedCategories={selectedCategories}
                urgencyFilter={urgencyFilter}
                sortType={sortType}
                searchQuery={searchQuery}
                showMyCampaigns={showMyCampaigns}
              />
            }
          />

          <Route path="/donate/:id" element={<DonateEntry />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/help" element={<Help />} />
          <Route path="/referrals" element={<ReferralDashboard />} />
          <Route path="/" element={<Landing />} />

          {/* Admin section: has its own layout/header */}
          <Route path="/admin/*" element={<AdminRouter />} />

          <Route path="/campaign/:id" element={<CampaignView />} />

          {/* Events */}
          <Route path="/events" element={<Events />} />
          <Route path="/events/:id" element={<Events />} />
          <Route path="/refund-policy" element={<RefundPolicy />} />
          <Route path="/about" element={<About />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/membership" element={<Membership />} />

          {/* Optional: direct header test route (desktop header) */}
          <Route path="/header" element={<DesktopHeader />} />

          <Route
            path="/notifications"
            element={
              <ProtectedRoute>
                <NotificationsPage />
              </ProtectedRoute>
            }
          />

          <Route path="/admin/ads" element={<AdminAds />} />
          <Route
            path="/boost-payment/:campaignId"
            element={<BoostPayment />}
          />
          <Route
            path="/giveaura/ads/:adId"
            element={<GiveAuraAdDonate />}
          />

          <Route
            path="/csr-dashboard"
            element={
                <CSRDashboard />
            }
          />

          {/* Protected routes */}
          <Route
            path="/create"
            element={
              <ProtectedRoute>
                <CreateCampaign />
              </ProtectedRoute>
            }
          />

          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />

          <Route
            path="/edit-profile"
            element={
              <ProtectedRoute>
                <EditProfile />
              </ProtectedRoute>
            }
          />

          <Route
            path="/donations"
            element={
              <ProtectedRoute>
                <DonationHistory />
              </ProtectedRoute>
            }
          />

          <Route
            path="/edit/:id"
            element={
              <ProtectedRoute>
                <EditCampaign />
              </ProtectedRoute>
            }
          />

          {/* ⭐ NEW: Wallet page */}
          <Route
            path="/wallet"
            element={
              <ProtectedRoute>
                <Wallet />
              </ProtectedRoute>
            }
          />

          {/* ⭐ NEW: Boost plans page */}
          <Route
            path="/boost-plans"
            element={
              <ProtectedRoute>
                <BoostPlans />
              </ProtectedRoute>
            }
          />

          {/* ⭐ NEW: Subscriptions page */}
          <Route
            path="/subscriptions"
            element={
              <ProtectedRoute>
                <Subscriptions />
              </ProtectedRoute>
            }
          />
          
          {/* Fallback */}
          <Route
            path="*"
            element={
              <Home
                selectedCategories={selectedCategories}
                urgencyFilter={urgencyFilter}
                sortType={sortType}
                searchQuery={searchQuery}
                showMyCampaigns={showMyCampaigns}
              />
            }
          />


          <Route path="/my-campaigns" element={<MyCampaigns />} />
        </Routes>
      </div>
    </>
  );
}
