import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import LogoVideo from "../assets/GiveAuraLogo.mp4";
import { db } from "../firebase";
import AuraAIPopup from "../components/AuraAIPopup";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from "firebase/firestore";
import "../styles/desktopHeader.css";

/* Campaign categories */
const CAMPAIGN_CATEGORIES = [
  "Personal",
  "Emergency",
  "Medical",
  "Education",
  "NGO",
  "CSR",
];

export default function DesktopHeader({
  onSearch,
  onCreate,

  unreadCount = 0,
  adminUnreadCount = 0,

  liveEvent,
  latestDonation,
  getOneTimeTickerMessage,
  tickerMessage,

  searchQuery,
  onSearchQueryChange,
  sortType,
  onSortTypeChange,
  urgencyFilter,
  onUrgencyFilterChange,
  showMyCampaigns,
  onToggleMyCampaigns,
  onCategoryChange,
}) {
  const { currentUser, logout } = useAuth() || {};
  const navigate = useNavigate();

  /* ================= RESPONSIVE ================= */
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1200
  );
  const isDesktop = viewportWidth > 768;
  const isCompact = viewportWidth < 1150;

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /* ================= USER ================= */
  const user = currentUser;
  const avatarSrc = user?.photoURL || "/default-avatar.png";
  const displayName =
    user?.displayName || user?.email?.split("@")[0] || "GiveAura Wellwisher";

  const isAdminUser =
  !!user &&
  (user.email === "kotipallynagavinay12323@gmail.com" ||
    user?.claims?.admin === true);


  /* ================= NOTIFICATIONS ================= */
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [recentNotifications, setRecentNotifications] = useState([]);
  const notifRef = useRef(null);
  const totalUnread = (unreadCount || 0) + (adminUnreadCount || 0);

  useEffect(() => {
  if (!currentUser) {
    setRecentNotifications([]);
    return;
  }

  const q = query(
    collection(db, "notifications"),
    where("userId", "==", currentUser.uid),
    orderBy("createdAt", "desc"),
    limit(3)
  );

  const unsub = onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
    setRecentNotifications(list);
  });

  return () => unsub();
}, [currentUser]);


  useEffect(() => {
    if (!isDesktop) return;
    const onClick = (e) => {
      if (
        showNotifPanel &&
        notifRef.current &&
        !notifRef.current.contains(e.target)
      ) {
        setShowNotifPanel(false);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [showNotifPanel, isDesktop]);

  /* ================= HERO BANNERS ================= */
  const [headerBanners, setHeaderBanners] = useState([]);
  const carouselRef = useRef(null);
  const carouselIdx = useRef(0);
  const carouselTimer = useRef(null);

  useEffect(() => {
    const qRef = query(
      collection(db, "popups"),
      where("location", "==", "donate"),
      where("active", "==", true),
      orderBy("order", "asc"),
      limit(10)
    );

    const unsub = onSnapshot(qRef, (snap) => {
      const banners = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((d) => d.kind === "banner" && d.imageUrl);

      setHeaderBanners(banners);
      carouselIdx.current = 0;
      if (carouselRef.current) {
        carouselRef.current.style.transform = "translateX(0%)";
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (carouselTimer.current) clearInterval(carouselTimer.current);
    if (headerBanners.length <= 1) return;

    carouselTimer.current = setInterval(() => {
      carouselIdx.current =
        (carouselIdx.current + 1) % headerBanners.length;
      if (carouselRef.current) {
        carouselRef.current.style.transform = `translateX(-${
          carouselIdx.current * 100
        }%)`;
      }
    }, 4500);

    return () => clearInterval(carouselTimer.current);
  }, [headerBanners]);

/* ================= FILTER ================= */
const [filterOpen, setFilterOpen] = useState(false);

/**
 * Always store categories in normalized form (lowercase)
 * This MUST match campaign.campaignType in Firestore
 */
const [selectedCategories, setSelectedCategories] = useState([]);

/* ---------- Toggle category ---------- */
const toggleCategory = (cat) => {
  const value = cat.toLowerCase().trim();

  setSelectedCategories((prev) => {
    if (prev.includes(value)) {
      return prev.filter((c) => c !== value);
    }
    return [...prev, value];
  });
};

/* ---------- Apply filters ---------- */
const applyFilters = () => {
  if (typeof onCategoryChange !== "function") {
    console.warn("[DesktopHeader] onCategoryChange not provided");
    return;
  }

  // send a clean, unique array
  onCategoryChange([...new Set(selectedCategories)]);
  setFilterOpen(false);
};

/* ---------- Clear filters ---------- */
const clearFilters = () => {
  setSelectedCategories([]);
  if (typeof onCategoryChange === "function") {
    onCategoryChange([]);
  }
};

  /* ================= TICKER ================= */
  const computedTicker =
    latestDonation && typeof getOneTimeTickerMessage === "function"
      ? getOneTimeTickerMessage(latestDonation)
      : null;

  const finalTicker =
    tickerMessage ||
    computedTicker ||
    (liveEvent
      ? `Live: ${liveEvent.title || "Ongoing event"}`
      : "Welcome to GiveAura — create, donate, and support communities.");

  const shouldAnimateTicker = (txt = "") => txt.length > 40;

  if (!isDesktop) return null;

  return (
    <>
      <header className="header">
        <div className="inner">
          {/* ================= TOP ================= */}
          <div className="header-top">
            {/* LOGO */}
            <div
              className="logo-container"
              onClick={() => navigate("/")}
              role="button"
            >
              <video
                src={LogoVideo}
                autoPlay
                loop
                muted
                playsInline
                className="logo-video"
                style={{ height: isCompact ? 72 : 100 }}
              />
            </div>

            {/* HERO BANNER (Ads + Campaigns) */}
{headerBanners.length > 0 && (
  <div className="hero-carousel">
    <div
      ref={carouselRef}
      className="track"
      style={{
        transform: `translateX(-${carouselIdx.current * 100}%)`,
      }}
    >
      {headerBanners.map((b) => (
        <div
          key={b.id}
          className="item"
          role="button"
          aria-label={b.title || "Banner"}
          onClick={() => {
            //  GiveAura Ad banner → Ad Donate page
            if (b.kind === "banner") {
              navigate(`/giveaura/ads/${b.id}`);
              return;
            }

            // Campaign banner → Campaign Donate page
            if (b.campaignId) {
              navigate(`/donate/${b.campaignId}`);
            }
          }}
        >
          <img
            src={b.imageUrl}
            alt={b.title || "Advertisement"}
            loading="lazy"
          />
        </div>
      ))}
    </div>

    {/* Dots */}
    {headerBanners.length > 1 && (
      <div className="hero-dots">
        {headerBanners.map((_, i) => (
          <button
            key={i}
            className={i === carouselIdx.current ? "active" : ""}
            onClick={() => {
              carouselIdx.current = i;
              if (carouselRef.current) {
                carouselRef.current.style.transform = `translateX(-${i * 100}%)`;
              }
            }}
            aria-label={`Banner ${i + 1}`}
          />
        ))}
      </div>
    )}
  </div>
)}



            {/* ACTION BUTTONS */}
            <div className="header-buttons">
              {user ? (
                <>
                  <button
                    className="profile-btn"
                    onClick={() => navigate("/profile")}
                  >
                    <img src={avatarSrc} alt="avatar" className="avatar" />
                    <span>{displayName}</span>
                  </button>

                  <button className="btn" onClick={() => navigate("/create")}>
                    + Create
                  </button>

                  <button
                    className="btn"
                    onClick={() => navigate("/wallet")}
                  >
                    My Wallet
                  </button>

                  {isAdminUser && (
                    <button
                      className="btn"
                      onClick={() => navigate("/admin")}
                    >
                      🛡 Admin
                    </button>
                  )}

                  {/*  Notifications */}
                  <div
                    ref={notifRef}
                    style={{ position: "relative" }}
                    aria-live="polite"
                  >
                    <button
                      type="button"
                      className="icon-btn bell-button"
                      onClick={() => setShowNotifPanel((v) => !v)}
                      aria-label={`Notifications, ${totalUnread} unread`}
                      style={{
                        position: "relative",
                        width: 40,
                        height: 40,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {/* SVG Bell Icon */}
                      <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                      </svg>

                      {/*  Unread badge */}
                      {totalUnread > 0 && (
                        <span
                          className="notif-badge"
                          style={{
                            position: "absolute",
                            top: 4,
                            right: 4,
                            minWidth: 18,
                            height: 18,
                            padding: "0 5px",
                            borderRadius: 999,
                            background: "#ef4444",
                            color: "#fff",
                            fontSize: 11,
                            fontWeight: 700,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            lineHeight: 1,
                            pointerEvents: "none",
                          }}
                        >
                          {totalUnread > 9 ? "9+" : totalUnread}
                        </span>
                      )}
                    </button>

                  { /*  Notifications panel */}
                    {showNotifPanel && (
                      <div
                        className="notif-panel"
                        role="dialog"
                        aria-label="Notifications"
                        style={{
                          position: "absolute",
                          top: "calc(100% + 8px)",
                          right: 0,
                          width: 320,
                          background: "#0f172a",
                          borderRadius: 12,
                          padding: 12,
                          boxShadow: "0 20px 40px rgba(0,0,0,0.35)",
                          zIndex: 50,
                        }}
                      >
                        {recentNotifications.length === 0 ? (
                          <p
                            style={{
                              color: "#9ca3af",
                              fontWeight: 600,
                              textAlign: "center",
                              margin: 8,
                            }}
                          >
                            You’re all caught up 🎉
                          </p>
                        ) : (
                          <>
                            <p
                              style={{
                                color: "#e5e7eb",
                                fontWeight: 700,
                                fontSize: 13,
                                marginBottom: 8,
                              }}
                            >
                              Recent notifications
                            </p>

                            <div style={{ display: "grid", gap: 6 }}>
                              {recentNotifications.map((n) => (
                                <div
                                  key={n.id}
                                  style={{
                                    padding: "8px 10px",
                                    borderRadius: 8,
                                    background: n.read
                                      ? "rgba(148,163,184,0.08)"
                                      : "rgba(59,130,246,0.18)",
                                    fontSize: 12,
                                    cursor: "pointer",
                                    transition: "background 0.15s ease",
                                  }}
                                  onClick={() => {
                                    setShowNotifPanel(false);
                                    navigate("/notifications");
                                  }}
                                >
                                  <div
                                    style={{
                                      fontWeight: 700,
                                      color: "#e5e7eb",
                                      marginBottom: 2,
                                    }}
                                  >
                                    {n.title || "Notification"}
                                  </div>
                                  <div
                                    style={{
                                      color: "#cbd5f5",
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                    }}
                                  >
                                    {n.message || ""}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}

                        <button
                          className="btn"
                          style={{
                            marginTop: 10,
                            width: "100%",
                            fontSize: 13,
                          }}
                          onClick={() => {
                            setShowNotifPanel(false);
                            navigate("/notifications");
                          }}
                        >
                          View all notifications
                        </button>
                      </div>
                    )}
                  </div>


                  <button className="btn" onClick={() => navigate("/help")}>
                    ❓ Help
                  </button>

                  <button className="btn" onClick={logout}>
                    ⏻ Logout
                  </button>
                </>
              ) : (
                <button className="btn" onClick={() => navigate("/login")}>
                  Login
                </button>
              )}
            </div>
          </div>

          {/* ================= SEARCH ROW (RIGHT ALIGNED) ================= */}
          <div className="header-bottom">
            <div
              className="header-search"
              style={{
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
            <input
              className="search-input"
              placeholder="Search campaigns..."
              value={searchQuery ?? ""}
              onChange={(e) => onSearchQueryChange?.(e.target.value)}
              style={{ width: 330 }}
            />

              <button
                className="btn-outline"
                onClick={() => setFilterOpen((v) => !v)}
              >
                🎛 Filters
              </button>

              <select
                className="select"
                value={sortType || "newest"}
                onChange={(e) => onSortTypeChange?.(e.target.value)}
                style={{ width: 110 }}   // shortened
              >
                <option value="newest">New</option>
                <option value="mostFunded">Funded</option>
              </select>
            </div>
          </div>

          {/* ================= TICKER ================= */}
          <div className="ticker-bar">
            {shouldAnimateTicker(finalTicker) ? (
              <div className="giveaura-marquee">{finalTicker}</div>
            ) : (
              <div>{finalTicker}</div>
            )}
          </div>
        </div>
      </header>

      {/* ================= FILTER PANEL ================= */}
      {filterOpen && (
  <div
    className="filter-overlay"
    onClick={() => setFilterOpen(false)}
  >
    <div
      className="filter-panel-attached"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="filter-header">
        <div className="filter-title">Filter Campaigns</div>
        <button
          className="filter-close-btn"
          onClick={() => setFilterOpen(false)}
        >
          ✕
        </button>
      </div>

      <div className="filter-grid">
        {/* ================= URGENCY ================= */}
        <div>
          <label>Urgency</label>
          <select
            value={urgencyFilter || "all"}
            onChange={(e) =>
              onUrgencyFilterChange?.(e.target.value)
            }
          >
            <option value="all">All</option>
            <option value="red">Nearest</option>
            <option value="yellow">Medium</option>
            <option value="green">Normal</option>
            <option value="none">No end</option>
          </select>
        </div>

        {/* ================= OWNERSHIP ================= */}
        {user && (
          <div>
            <label>Ownership</label>
            <div className="filter-toggle">
              <button
                className={!showMyCampaigns ? "btn" : "btn-outline"}
                onClick={() => onToggleMyCampaigns?.(false)}
              >
                All
              </button>
              <button
                className={showMyCampaigns ? "btn" : "btn-outline"}
                onClick={() => onToggleMyCampaigns?.(true)}
              >
                Mine
              </button>
            </div>
          </div>
        )}

        {/* ================= CATEGORIES ================= */}
        <div>
          <label>Categories</label>
          <div className="category-grid">
            {CAMPAIGN_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                className={
                  selectedCategories.includes(cat.toLowerCase())
                    ? "btn"
                    : "btn-outline"
                }
                onClick={() => toggleCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ================= ACTIONS ================= */}
      <div className="filter-actions">
        <button className="btn apply" onClick={applyFilters}>
          Apply Filters
        </button>

        <button className="btn reset" onClick={clearFilters}>
          Clear
        </button>
      </div>
    </div>
  </div>
)}

    </>
  );
}
