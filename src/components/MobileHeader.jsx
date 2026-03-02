// src/components/MobileHeader.jsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import LogoVideo from "../assets/GiveAuraLogo.mp4";
import { db } from "../firebase";
import {
collection,
query,
where,
orderBy,
limit,
onSnapshot,
} from "firebase/firestore";
import "../styles/mobileHeader.css";

export default function MobileHeader({
onSearch,
onCreate,

/* search & filters from App.jsx */
searchQuery,
onSearchQueryChange,
sortType,
onSortTypeChange,
urgencyFilter,
onUrgencyFilterChange,
showMyCampaigns,
onToggleMyCampaigns,

/* 🔹 notifications */
latestDonation,
tickerMessage,
getOneTimeTickerMessage,
unreadCount = 0,
adminUnreadCount = 0,
}) {
const { currentUser, logout } = useAuth() || {};
const navigate = useNavigate();

/* ---------------- MOBILE CHECK ---------------- */
const [isMobile, setIsMobile] = useState(
  typeof window !== "undefined" ? window.innerWidth <= 768 : true
);

useEffect(() => {
  const resize = () => setIsMobile(window.innerWidth <= 768);
  window.addEventListener("resize", resize, { passive: true });
  return () => window.removeEventListener("resize", resize);
}, []);

if (!isMobile) return null;

/* ---------------- STATE ---------------- */
const [drawerOpen, setDrawerOpen] = useState(false);
const [searchOpen, setSearchOpen] = useState(false);
const [filterOpen, setFilterOpen] = useState(false);
const [queryValue, setQueryValue] = useState(searchQuery || "");
useEffect(() => {
  setQueryValue(searchQuery || "");
}, [searchQuery]);

const [bannerIndex, setBannerIndex] = useState(0);
const handleShareAndEarn = () => {
  if (!currentUser?.uid) return;

  const referralLink = `${window.location.origin}/?ref=${currentUser.uid}`;

  navigator.clipboard.writeText(referralLink);

  setDrawerOpen(false);

  setTimeout(() => {
    go("/profile", {
      state: { copiedReferral: true },
    });
  }, 120);
};


const touchStartX = useRef(null);
const didSwipeRef = useRef(false);

/* ---------------- USER ---------------- */
const avatar = currentUser?.photoURL || "/default-avatar.png";
const displayName =
  currentUser?.displayName ||
  currentUser?.email?.split("@")[0] ||
  "Guest";

/* ---------------- NOTIFICATIONS ---------------- */
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
  const handleClickOutside = (e) => {
    if (
      showNotifPanel &&
      notifRef.current &&
      !notifRef.current.contains(e.target)
    ) {
      setShowNotifPanel(false);
    }
  };

  document.addEventListener("click", handleClickOutside);
  return () =>
    document.removeEventListener("click", handleClickOutside);
}, [showNotifPanel]);



/* ---------------- TICKER ---------------- */
const computedTickerMessage =
  latestDonation && typeof getOneTimeTickerMessage === "function"
    ? getOneTimeTickerMessage(latestDonation)
    : null;

const finalTickerMessage =
  tickerMessage || computedTickerMessage || "";

/* ---------------- BANNERS ---------------- */
const [banners, setBanners] = useState([]);
const indexRef = useRef(0);

useEffect(() => {
  const qRef = query(
    collection(db, "popups"),
    where("location", "==", "donate"),
    where("active", "==", true),
    orderBy("order", "asc"),
    limit(10)
  );

  const unsub = onSnapshot(qRef, (snap) => {
    const mapped = snap.docs
      .map((d) => {
        const b = d.data();
        const src =
          (Array.isArray(b.imageUrl) && b.imageUrl[0]) ||
          b.imageUrl ||
          b.image ||
          null;

        if (!src) return null;

        return {
          id: d.id,
          kind: b.kind || "banner",
          src,
          campaignId: b.campaignId || null,
          alt: b.title || "Donate banner",
        };
      })
      .filter(Boolean);

    setBanners(mapped);
    indexRef.current = 0;
    setBannerIndex(0);
  });

  return () => unsub();
}, []);

/* auto slide */
useEffect(() => {
  if (!banners.length) return;
  const timer = setInterval(() => {
    indexRef.current = (indexRef.current + 1) % banners.length;
    setBannerIndex(indexRef.current);
  }, 4500);
  return () => clearInterval(timer);
}, [banners]);

/* ---------------- NAV HELPERS ---------------- */
const go = useCallback(
  (path) => {
    setDrawerOpen(false);
    setSearchOpen(false);
    setFilterOpen(false);
    navigate(path);
  },
  [navigate]
);

const doLogout = async () => {
  try {
    await logout?.();
  } catch {}
  go("/login");
};

const submitSearch = (e) => {
  e.preventDefault();
  const q = queryValue.trim();
  if (!q) return;

  onSearchQueryChange?.(q);

  navigate("/campaigns");

  setSearchOpen(false);
};

const BellIcon = ({ size = 20, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);


/* ================= RENDER ================= */

return (
  <>
    {/* ---------------- TOP BAR ---------------- */}
    <header className="mobile-top-header">
      <button className="icon-btn" onClick={() => setDrawerOpen(true)}>
        ☰
      </button>

      <button onClick={() => go("/")} className="brand-btn">
        <video
          src={LogoVideo}
          autoPlay
          loop
          muted
          playsInline
          className="logo-video"
        />
        <span>GiveAura</span>
      </button>

      {/* Notifications */}
<div
  className = {'icon-btn bell-button ' + (totalUnread > 0 ? "has-unread" : "")}
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
      width: 36,
      height: 36,
      borderRadius: "50%",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <BellIcon size={20} />

    {totalUnread > 0 && (
      <span
        className="notif-badge"
        style={{
          position: "absolute",
          top: -4,
          right: -4,
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
        }}
      >
        {totalUnread > 9 ? "9+" : totalUnread}
      </span>
    )}
  </button>

  {showNotifPanel && (
    <div className="notif-panel" role="dialog">
      {recentNotifications.length === 0 ? (
        <p style={{ color: "#9ca3af", fontWeight: 600 }}>
          You’re all caught up 🎉
        </p>
      ) : (
        <>
          <p style={{ color: "#e5e7eb", fontWeight: 700 }}>
            Recent notifications
          </p>

          <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
            {recentNotifications.map((n) => (
              <div
                key={n.id}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: n.read
                    ? "rgba(148,163,184,0.08)"
                    : "rgba(59,130,246,0.15)",
                  fontSize: 12,
                  cursor: "pointer",
                }}
                onClick={() => {
                  setShowNotifPanel(false);
                  navigate("/notifications");
                }}
              >
                <div style={{ fontWeight: 700, color: "#e5e7eb" }}>
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
        style={{ marginTop: 10, width: "100%" }}
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


    </header>

{/* ---------------- BANNERS ---------------- */}
{Array.isArray(banners) && banners.length > 0 && (
  <div
    className="mobile-banner"
    onTouchStart={(e) => {
      touchStartX.current = e.touches[0].clientX;
      didSwipeRef.current = false;
    }}
    onTouchMove={(e) => {
      if (
        Math.abs(e.touches[0].clientX - touchStartX.current) > 10
      ) {
        didSwipeRef.current = true;
      }
    }}
    onTouchEnd={(e) => {
      const diff =
        e.changedTouches[0].clientX - touchStartX.current;

      if (Math.abs(diff) > 40) {
        indexRef.current =
          diff < 0
            ? (indexRef.current + 1) % banners.length
            : (indexRef.current - 1 + banners.length) %
              banners.length;

        setBannerIndex(indexRef.current);
      }
    }}
  >
    <div
      className="mobile-banner-track"
      style={{
        transform: `translateX(-${bannerIndex * 100}%)`,
      }}
    >
      {banners.map((b) => {
        if (!b || !b.id || !b.src) return null;

        return (
          <div
            key={b.id}
            className="mobile-banner-item"
            role="button"
            onClick={() => {
            // allow tap navigation
            const wasSwipe = didSwipeRef.current;
            didSwipeRef.current = false;

            if (wasSwipe) return;

            // GiveAura Ad
            if (b.kind === "banner") {
              navigate(`/giveaura/ads/${b.id}`);
              return;
            }

            // Campaign
            if (b.campaignId) {
              navigate(`/donate/${b.campaignId}`);
            }
          }}

          >
            <img
              src={b.src}
              alt={b.alt || "Advertisement"}
              loading="lazy"
            />
          </div>
        );
      })}
    </div>

    {/* Dots */}
    {banners.length > 1 && (
      <div className="mobile-banner-dots">
        {banners.map((_, i) => (
          <button
            key={i}
            className={i === bannerIndex ? "active" : ""}
            onClick={() => {
              indexRef.current = i;
              setBannerIndex(i);
            }}
            aria-label={`Banner ${i + 1}`}
          />
        ))}
      </div>
    )}
  </div>
)}


    {/* ---------------- TICKER ---------------- */}
    {finalTickerMessage && (
      <div className="mobile-ticker">
        <div className="mobile-ticker-inner">
          <div className="mobile-ticker-track">
            <span className="ticker-item">{finalTickerMessage}</span>
          </div>
        </div>
      </div>
    )}


{/* ---------------- SEARCH MODAL ---------------- */}
{searchOpen && (
  <div
    className="mobile-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="search-modal-title"
    onClick={() => setSearchOpen(false)}
  >
    <form
      className="mobile-modal-card search-modal-card"
      onClick={(e) => e.stopPropagation()}
      onSubmit={submitSearch}
    >
      {/* Header */}
      <div className="search-modal-header">
        <h3 id="search-modal-title">Search Campaigns</h3>
        <button
          type="button"
          className="search-close-btn"
          aria-label="Close search"
          onClick={() => setSearchOpen(false)}
        >
          ✕
        </button>
      </div>

      {/* Input */}
      <input
        type="text"
        value={queryValue}
        onChange={(e) => {
          setQueryValue(e.target.value);
          onSearchQueryChange?.(e.target.value);
        }}
        placeholder="Search by title, description or #tags"
        autoFocus
      />

      {/* Helper */}
      <p className="search-helper">
        Tip: Use <strong>#tags</strong> like <em>#medical</em>, <em>#education</em>
      </p>

      {/* Actions */}
      <div className="search-actions">
        <button type="submit" className="search-primary-btn">
          Search
        </button>
        <button
          type="button"
          className="search-secondary-btn"
          onClick={() => {
            setQueryValue("");
            onSearchQueryChange?.("");
          }}
        >
          Clear
        </button>
      </div>
    </form>
  </div>
)}

    {/* ---------------- FILTER MODAL ---------------- */}
{filterOpen && (
  <div className="mobile-modal" onClick={() => setFilterOpen(false)}>
    <div
      className="mobile-modal-card"
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
    >
      {/* Header */}
      <div className="mobile-modal-header">
        <h3>Filters</h3>
        <button
          className="modal-close-btn"
          onClick={() => setFilterOpen(false)}
          aria-label="Close filters"
        >
          ✕
        </button>
      </div>

      {/* Urgency */}
      <div className="filter-group">
        <label>Urgency</label>
        <select
          value={urgencyFilter || "all"}
          onChange={(e) => onUrgencyFilterChange?.(e.target.value)}
        >
          <option value="all">All</option>
          <option value="red">Nearest</option>
          <option value="yellow">Medium</option>
          <option value="green">Normal</option>
          <option value="none">No end</option>
        </select>
      </div>

      {/* Sort */}
      <div className="filter-group">
        <label>Sort by</label>
        <select
          value={sortType || "newest"}
          onChange={(e) => onSortTypeChange?.(e.target.value)}
        >
          <option value="newest">Newest</option>
          <option value="mostFunded">Most Funded</option>
        </select>
      </div>

      {/* My Campaigns */}
      {currentUser && (
        <div className="filter-group">
          <label>Campaigns</label>
          <div className="filter-toggle">
            <button
              type="button"
              className={!showMyCampaigns ? "active" : ""}
              onClick={() => onToggleMyCampaigns?.(false)}
            >
              All
            </button>
            <button
              type="button"
              className={showMyCampaigns ? "active" : ""}
              onClick={() => onToggleMyCampaigns?.(true)}
            >
              Mine
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="filter-actions">
        <button
          className="filter-apply-btn"
          onClick={() => setFilterOpen(false)}
        >
          Apply Filters
        </button>
      </div>
    </div>
  </div>
)}

    {/* ---------------- DRAWER ---------------- */}
    {drawerOpen && (
      <>
        <aside className="mobile-drawer">
          <button
            className="icon-btn"
            onClick={() => setDrawerOpen(false)}
          >
            ✕
          </button>

          <div className="drawer-user">
            <img src={avatar} alt={displayName} />
            <div>
              <strong>{displayName}</strong>
              <small>{currentUser?.email}</small>
            </div>
          </div>

          <nav>
            <button onClick={() => go("/create")}>
              Create campaign
            </button>
            <button onClick={() => go("/my-campaigns")}>
              My campaigns
            </button>
            <button onClick={() => go("/wallet")}>
              My Wallet
            </button>
            <button onClick={handleShareAndEarn}>
              Share & Earn
            </button>
            <button onClick={() => go("/help")}>
              Help & Support
            </button>
            <button onClick={doLogout} className="danger">
              Logout
            </button>
          </nav>
        </aside>
        <div
          className="backdrop"
          onClick={() => setDrawerOpen(false)}
        />
      </>
    )}

    {/* ---------------- TASKBAR ---------------- */}
    <nav className="mobile-taskbar">
      <button
        onClick={() => {
          navigate("/campaigns");
          setSearchOpen(true);
        }}
      >
        <svg
  width="18"
  height="18"
  viewBox="0 0 24 24"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <circle
    cx="11"
    cy="11"
    r="7"
    stroke="currentColor"
    strokeWidth="1.8"
  />
  <path
    d="M20 20L16.65 16.65"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
  />
</svg>
      </button>

      <button onClick={() => setFilterOpen(true)}><svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M4 6H20"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path
                  d="M7 12H17"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path
                  d="M10 18H14"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg></button>
      <button
        className="create-btn"
        onClick={() =>
          typeof onCreate === "function"
            ? onCreate()
            : go("/create")
        }
      >
        +
      </button>
      <button onClick={() => go("/my-campaigns")}><svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M3 7C3 5.89543 3.89543 5 5 5H9L11 7H19C20.1046 7 21 7.89543 21 9V17C21 18.1046 20.1046 19 19 19H5C3.89543 19 3 18.1046 3 17V7Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        </button>
      <button
        onClick={() => go("/profile")}
        className="profile-avatar-btn"
      >
        <img src={avatar} alt={displayName} />
      </button>
    </nav>
  </>
);
}
