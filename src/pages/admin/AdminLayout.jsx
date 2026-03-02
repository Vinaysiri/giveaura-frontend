// src/pages/admin/AdminLayout.jsx
import React, { useEffect, useRef, useState, useCallback } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { auth } from "../../firebase";
import { onAuthStateChanged, signOut, getIdTokenResult } from "firebase/auth";
import {
  getUserProfile,
  getAdminNotifications,
  markNotificationRead,
} from "../../services/firestoreService";
import LogoVideo from "../../assets/GiveAuraLogo.mp4";
import "./AdminLayout.css";
import { createPortal } from "react-dom";

export default function AdminLayout({ children }) {
  const navigate = useNavigate();
  const mountedRef = useRef(true);

  const [collapsed, setCollapsed] = useState(false); // sidebar collapsed (desktop)
  const [mobileOpen, setMobileOpen] = useState(false); // mobile drawer
  const [user, setUser] = useState(null); // firebase auth user
  const [profile, setProfile] = useState(null); // users/{uid} doc
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [isAdminClaim, setIsAdminClaim] = useState(false); // firebase custom claim `admin`
  const [adminNotifications, setAdminNotifications] = useState([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifPollRef = useRef(null);
  const notifRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ===== AUTH + PROFILE + ADMIN CLAIMS =====
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      try {
        if (!mountedRef.current) return;
        setUser(u || null);

        if (u) {
          // ---- detect admin via custom claim ----
          try {
            const idTokenRes = await getIdTokenResult(u, /* forceRefresh */ false);
            const claims = idTokenRes?.claims || {};
            const adminClaim =
              claims.admin === true ||
              claims.isAdmin === true ||
              claims.role === "admin";

            if (mountedRef.current) setIsAdminClaim(!!adminClaim);
            if (!adminClaim) {
              console.warn(
                "User lacks admin claim — some Firestore admin reads may be blocked by rules."
              );
            }
          } catch (err) {
            console.warn("Failed to fetch id token result for claims:", err);
            if (mountedRef.current) setIsAdminClaim(false);
          }

          // ---- load admin profile doc ----
          if (!mountedRef.current) return;
          setLoadingProfile(true);
          try {
            const p = await getUserProfile(u.uid);
            if (!mountedRef.current) return;
            setProfile(p || null);
          } catch (err) {
            console.warn("getUserProfile failed:", err);
            if (mountedRef.current) setProfile(null);
          } finally {
            if (mountedRef.current) setLoadingProfile(false);
          }
        } else {
          // user signed out
          if (mountedRef.current) {
            setProfile(null);
            setLoadingProfile(false);
            setIsAdminClaim(false);
          }
        }
      } catch (err) {
        console.error("onAuthStateChanged callback error:", err);
        if (mountedRef.current) {
          setUser(null);
          setProfile(null);
          setLoadingProfile(false);
          setIsAdminClaim(false);
        }
      }
    });

    return () => {
      try {
        unsub();
      } catch {
        // ignore
      }
    };
  }, []);

  // ===== ADMIN NOTIFICATIONS (poll via getAdminNotifications) =====
  const fetchNotifications = useCallback(async () => {
    try {
      setNotifLoading(true);
      const notes = await getAdminNotifications();
      setAdminNotifications(Array.isArray(notes) ? notes : []);
    } catch (err) {
      console.error("Failed to fetch admin notifications:", err);
    } finally {
      setNotifLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const hasAdminRole =
      user &&
      (isAdminClaim || profile?.role === "admin" || profile?.isAdmin === true);

    if (hasAdminRole) {
      // initial fetch
      fetchNotifications();

      // auto-refresh every 20s
      notifPollRef.current = setInterval(() => {
        if (mounted) fetchNotifications();
      }, 20000);
    } else {
      setAdminNotifications([]);
      if (notifPollRef.current) {
        clearInterval(notifPollRef.current);
        notifPollRef.current = null;
      }
    }

    return () => {
      mounted = false;
      if (notifPollRef.current) {
        clearInterval(notifPollRef.current);
        notifPollRef.current = null;
      }
    };
  }, [user, isAdminClaim, profile?.role, profile?.isAdmin, fetchNotifications]);

  // ===== CLOSE NOTIF DROPDOWN on outside click / Esc =====
  useEffect(() => {
    const onDocClick = (e) => {
      if (!notifRef.current) return;
      if (!notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    const onEsc = (e) => {
      if (e.key === "Escape") setNotifOpen(false);
    };

    if (notifOpen) {
      document.addEventListener("mousedown", onDocClick);
      document.addEventListener("keydown", onEsc);
    }

    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [notifOpen]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate("/admin/login");
    } catch (err) {
      console.error("Sign out failed:", err);
      try {
        navigate("/admin/login");
      } catch {
        // ignore
      }
    }
  };

  // ===== SMALL HELPERS =====
  const avatarContent = () => {
    const photo = profile?.photoURL || user?.photoURL || null;
    const rawName =
      profile?.displayName ||
      user?.displayName ||
      (user?.email ? user.email.split?.("@")?.[0] : null) ||
      "Admin";
    const name = (rawName || "Admin").toString();

    if (photo) {
      return (
        <img
          src={photo}
          alt={name}
          style={{ width: 36, height: 36, borderRadius: 10, objectFit: "cover" }}
        />
      );
    }

    const initials = (name || "")
      .split(" ")
      .map((s) => (s || "").charAt(0))
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();

    return (
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg,#eef2ff,#e0f2fe)",
          color: "#1d4ed8",
          fontWeight: 800,
          fontSize: 14,
        }}
      >
        {initials || "A"}
      </div>
    );
  };

  const navItems = [
    { to: "/admin", label: "Overview", emoji: "🏠" },
    { to: "/admin/campaigns", label: "Campaigns", emoji: "📣" },
    { to: "/admin/donations", label: "Donations", emoji: "💸" },
    { to: "/admin/events", label: "Events", emoji: "📅" },
    { to: "/admin/boostersubscribers", label: "Boosts", emoji: "🚀" },
    { to: "/admin/users", label: "Users", emoji: "👥" },
    { to: "/admin/support", label: "Support", emoji: "🆘" },
    { to: "/admin/settings", label: "Settings", emoji: "⚙️" },
  ];

  const unreadCount = adminNotifications.filter((n) => !n.read).length;

  const openNotifications = () => {
    setNotifOpen((s) => !s);
  };

  const onClickNotification = async (n) => {
    try {
      if (!n) return;

      // mark read (best-effort)
      if (!n.read && n.id) {
        try {
          await markNotificationRead(n.id, true);
          setAdminNotifications((prev) =>
            prev.map((x) => (x.id === n.id ? { ...x, read: true } : x))
          );
        } catch (err) {
          console.warn("markNotificationRead failed:", err);
        }
      }

      // navigate to related entity
      if (n.campaignId) {
        navigate(`/admin/campaigns/${n.campaignId}`);
        return;
      }
      if (n.data && n.data.eventId) {
        navigate(`/admin/events/${n.data.eventId}`);
        return;
      }

      // fallback: dedicated admin notifications page
      navigate("/admin/notifications");
    } catch (err) {
      console.error("onClickNotification error:", err);
    }
  };

  const handleMessagesClick = () => {
    try {
      navigate("/admin/messages");
    } catch {
      window.location.href = "mailto:support@giveaura.com";
    }
  };

  // ====== STYLES ======
  const shellStyle = {
    minHeight: "100vh",
    display: "flex",
    background: "linear-gradient(135deg,#f1f5f9,#e0f2fe)",
  };

  const sidebarStyle = {
    width: collapsed ? 88 : 260,
    transition: "width 180ms ease",
    position: "relative",
    background: "linear-gradient(180deg,#020617,#0f172a)",
    color: "#e5e7eb",
    boxShadow: "2px 0 24px rgba(15,23,42,0.35)",
    zIndex: 40,
  };

  const sidebarInnerStyle = {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    padding: 16,
    boxSizing: "border-box",
  };

  const brandRowStyle = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  };

  const brandTextStyle = {
    fontWeight: 800,
    fontSize: 18,
    letterSpacing: "0.04em",
  };

  const collapseBtnStyle = {
    marginLeft: "auto",
    background: "rgba(15,23,42,0.9)",
    borderRadius: 999,
    border: "1px solid rgba(148,163,184,0.3)",
    cursor: "pointer",
    color: "#9ca3af",
    width: 28,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 16,
  };

  const navSectionStyle = {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    flex: "1 1 auto",
    marginTop: 6,
  };

  const navItemStyle = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "9px 11px",
    borderRadius: 10,
    textDecoration: "none",
    color: "#e5e7eb",
    fontSize: 14,
  };

  const bottomPanelStyle = {
    marginTop: 12,
    borderTop: "1px solid rgba(15,23,42,0.7)",
    paddingTop: 12,
  };

  const adminMainStyle = {
    flex: 1,
    display: "flex",
    flexDirection: "column",
  };

  const adminTopStyle = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 18px",
    borderBottom: "1px solid #e2e8f0",
    background: "linear-gradient(90deg,#0f172a,#1e293b)",
    color: "#e5e7eb",
    position: "sticky",
    top: 0,
    zIndex: 30,
  };

  const topSearchInputStyle = {
    width: "100%",
    maxWidth: 560,
    borderRadius: 999,
    border: "1px solid rgba(148,163,184,0.7)",
    padding: "8px 12px",
    background: "rgba(15,23,42,0.8)",
    color: "#e5e7eb",
    fontSize: 13,
    outline: "none",
  };

  const topIconBtnStyle = {
    borderRadius: 999,
    border: "1px solid rgba(148,163,184,0.6)",
    background: "rgba(15,23,42,0.85)",
    width: 36,
    height: 36,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    color: "#e5e7eb",
  };

  const notifBadgeStyle = {
    position: "absolute",
    top: -6,
    right: -6,
    background: "#ef4444",
    color: "#fff",
    fontSize: 11,
    padding: "2px 6px",
    borderRadius: 999,
    fontWeight: 700,
    lineHeight: 1,
  };

  const contentWrapperStyle = {
    flex: "1 1 auto",
    overflow: "auto",
    padding: 18,
  };

  return (
    <div className="admin-shell" style={shellStyle}>
      {/* Sidebar */}
      <aside
        className="admin-left"
        style={sidebarStyle}
        aria-hidden={mobileOpen ? "false" : "true"}
      >
        <div style={sidebarInnerStyle}>
          <div style={brandRowStyle}>
            {/* 🔥 Video logo in sidebar brand */}
            <video
              src={LogoVideo}
              autoPlay
              loop
              muted
              playsInline
              style={{ width: 36, height: 36, borderRadius: 10, objectFit: "contain" }}
            />
            {!collapsed && (
              <div style={brandTextStyle}>
                GiveAura
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: "#9ca3af",
                    marginTop: 2,
                  }}
                >
                  Admin Console
                </div>
              </div>
            )}
            <button
              aria-label="Collapse sidebar"
              onClick={() => setCollapsed((s) => !s)}
              style={collapseBtnStyle}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? "›" : "‹"}
            </button>
          </div>

          <nav
            className="nav-section"
            aria-label="Admin navigation"
            style={navSectionStyle}
          >
            {navItems.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `nav-item${isActive ? " nav-active" : ""}`
                }
                style={({ isActive }) => ({
                  ...navItemStyle,
                  background: isActive
                    ? "linear-gradient(135deg,#1d4ed8,#2563eb)"
                    : "transparent",
                  color: isActive ? "#f9fafb" : "#e5e7eb",
                  border: !isActive && "1px solid rgba(30,64,175,0.35)",
                })}
                onClick={() => setMobileOpen(false)}
              >
                <span style={{ width: 26, textAlign: "center" }}>
                  {n.emoji}
                </span>
                {!collapsed && (
                  <span style={{ fontWeight: 600 }}>{n.label}</span>
                )}
              </NavLink>
            ))}

            {/* Quick tasks */}
            <div style={{ marginTop: 12 }}>
              {!collapsed ? (
                <>
                  <div
                    className="text-muted small"
                    style={{ marginBottom: 6, fontSize: 11, color: "#9ca3af" }}
                  >
                    Quick tasks
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    <button
                      className="btn"
                      onClick={() => navigate("/admin/campaigns/new")}
                    >
                      Create campaign
                    </button>
                    <button
                      className="btn-outline"
                      onClick={() => navigate("/admin/donations")}
                    >
                      Export donations
                    </button>
                    <button
                      className="btn"
                      onClick={() => navigate("/admin/popups")}
                    >
                      Create popup
                    </button>
                    <button
                      className="btn"
                      onClick={() => navigate("/admin/ads")}
                    >
                      Create ad
                    </button>
                  </div>
                </>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    marginTop: 4,
                  }}
                >
                  <button
                    className="btn small"
                    onClick={() => navigate("/admin/campaigns/new")}
                    title="Create campaign"
                  >
                    ＋
                  </button>
                  <button
                    className="btn small"
                    onClick={() => navigate("/admin/donations")}
                    title="Export donations"
                  >
                    ⇩
                  </button>
                </div>
              )}
            </div>
          </nav>

          <div style={bottomPanelStyle}>
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
              }}
            >
              <div aria-hidden>{avatarContent()}</div>
              {!collapsed && (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div
                    style={{ fontWeight: 700, fontSize: 14, color: "#f9fafb" }}
                  >
                    {loadingProfile
                      ? "Loading…"
                      : profile?.displayName ||
                        user?.displayName ||
                        user?.email?.split?.("@")?.[0] ||
                        "Admin"}
                  </div>
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>
                    {profile?.role || "Administrator"}
                  </div>
                </div>
              )}
              <div
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  gap: 6,
                  flexWrap: "nowrap",
                }}
              >
                <button
                  className="btn"
                  onClick={() => navigate("/admin/profile")}
                  title="Profile"
                >
                  ⚙️
                </button>
                <button
                  className="btn-outline"
                  onClick={handleSignOut}
                  title="Sign out"
                >
                  Sign out
                </button>
              </div>
            </div>

            <div
              style={{
                marginTop: 10,
                fontSize: 11,
                color: "#6b7280",
              }}
            >
              v1.0 — GiveAura
            </div>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <main className="admin-main" style={adminMainStyle}>
        {/* Topbar */}
        <header className="admin-top" style={adminTopStyle}>
          <button
            aria-label="Toggle mobile menu"
            onClick={() => setMobileOpen((s) => !s)}
            style={topIconBtnStyle}
          >
            ☰
          </button>

          <div style={{ flex: "1 1 auto" }}>
            <input
              className="search-input"
              placeholder="Search campaigns, donors, events..."
              style={topSearchInputStyle}
            />
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {/* Notifications with badge & dropdown */}
            <div style={{ position: "relative" }} ref={notifRef}>
              <button
                className="icon-btn"
                title="Notifications"
                onClick={openNotifications}
                aria-haspopup="true"
                aria-expanded={notifOpen}
                style={{ ...topIconBtnStyle, position: "relative" }}
              >
                🔔
                {unreadCount > 0 && (
                  <span aria-hidden style={notifBadgeStyle}>
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen &&
                createPortal(
                  <div
                    role="menu"
                    aria-label="Admin notifications"
                    style={{
                      position: "fixed",
                      top: 70,
                      right: 20,
                      width: 360,
                      maxHeight: 420,
                      overflow: "auto",
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                      boxShadow: "0 18px 40px rgba(15,23,42,0.25)",
                      borderRadius: 12,
                      zIndex: 99999,
                    }}
                  >
                    <div
                      style={{
                        padding: 12,
                        borderBottom: "1px solid #f1f5f9",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        background: "#f8fafc",
                      }}
                    >
                      <div style={{ fontWeight: 800, fontSize: 14 }}>
                        Notifications
                      </div>

                      <div
                        style={{
                          marginLeft: "auto",
                          fontSize: 12,
                          color: "#64748b",
                        }}
                      >
                        {notifLoading
                          ? "Loading…"
                          : `${adminNotifications.length} total`}
                      </div>

                      <button
                        title="Refresh"
                        onClick={async () => {
                          setNotifLoading(true);
                          try {
                            const fresh = await getAdminNotifications();
                            setAdminNotifications(Array.isArray(fresh) ? fresh : []);
                          } catch (err) {
                            console.error("Manual refresh notifications failed:", err);
                          } finally {
                            setNotifLoading(false);
                          }
                        }}
                        style={{
                          marginLeft: 8,
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          fontSize: 16,
                        }}
                      >
                        ↺
                      </button>
                    </div>

                    <div>
                      {adminNotifications.length === 0 ? (
                        <div
                          style={{
                            padding: 14,
                            color: "#6b7280",
                            fontSize: 13,
                          }}
                        >
                          No notifications yet.
                        </div>
                      ) : (
                        adminNotifications.map((n) => (
                          <div
                            key={n.id}
                            onClick={() => {
                              onClickNotification(n);
                              setNotifOpen(false);
                            }}
                            style={{
                              padding: 12,
                              display: "flex",
                              gap: 10,
                              borderBottom: "1px solid #f4f7fb",
                              cursor: "pointer",
                              background: n.read ? "#ffffff" : "#f9fafb",
                            }}
                          >
                            <div
                              style={{
                                width: 36,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 18,
                              }}
                            >
                              {n.read ? "🔔" : "✨"}
                            </div>

                            <div style={{ flex: "1 1 auto" }}>
                              <div
                                style={{
                                  fontWeight: n.read ? 600 : 800,
                                  fontSize: 14,
                                }}
                              >
                                {n.title || "Notification"}
                              </div>

                              <div
                                style={{
                                  fontSize: 13,
                                  color: "#6b7280",
                                  marginTop: 4,
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {n.message ||
                                  (n.data && JSON.stringify(n.data)) ||
                                  ""}
                              </div>
                            </div>

                            <div
                              style={{
                                fontSize: 11,
                                color: "#94a3b8",
                                alignSelf: "flex-start",
                                minWidth: 90,
                                textAlign: "right",
                              }}
                            >
                              {n.createdAt?.toDate
                                ? n.createdAt.toDate().toLocaleString()
                                : n.createdAt
                                ? new Date(n.createdAt).toLocaleString()
                                : ""}
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div
                      style={{
                        padding: 10,
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                        borderTop: "1px solid #e2e8f0",
                        background: "#f8fafc",
                      }}
                    >
                      <button
                        className="btn-outline"
                        onClick={async () => {
                          try {
                            const toMark = adminNotifications.filter((x) => !x.read);
                            await Promise.all(
                              toMark.map((x) =>
                                x.id
                                  ? markNotificationRead(x.id, true)
                                  : Promise.resolve()
                              )
                            );
                            setAdminNotifications((prev) =>
                              prev.map((x) => ({ ...x, read: true }))
                            );
                          } catch (err) {
                            console.warn("Mark all read failed:", err);
                          }
                        }}
                      >
                        Mark all read
                      </button>

                      <button
                        className="btn"
                        onClick={() => {
                          navigate("/admin/notifications");
                          setNotifOpen(false);
                        }}
                      >
                        View all
                      </button>
                    </div>
                  </div>,
                  document.body
                )}
            </div>

            {/* Messages */}
            <div style={{ position: "relative" }}>
              <button
                className="icon-btn"
                title="Messages"
                onClick={handleMessagesClick}
                style={topIconBtnStyle}
              >
                💬
              </button>
            </div>

            {/* Profile button on topbar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
              }}
              onClick={() => navigate("/admin/profile")}
            >
              <div aria-hidden>{avatarContent()}</div>
              <div style={{ display: collapsed ? "none" : "block" }}>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 13,
                    color: "#f9fafb",
                  }}
                >
                  {loadingProfile
                    ? "Loading…"
                    : profile?.displayName ||
                      user?.displayName ||
                      user?.email?.split?.("@")?.[0] ||
                      "Admin"}
                </div>
                <div
                  style={{ fontSize: 12, color: "#9ca3af" }}
                >
                  Admin
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* content */}
        <div style={contentWrapperStyle}>{children}</div>
      </main>

      {/* Mobile overlay: slide-in sidebar (reuse same nav) */}
      {mobileOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            display: "flex",
            background: "rgba(0,0,0,0.35)",
          }}
          onClick={() => setMobileOpen(false)}
        >
          <div
            style={{
              width: 300,
              background: "#020617",
              height: "100%",
              boxShadow: "0 20px 40px rgba(2,6,23,0.45)",
              color: "#e5e7eb",
              padding: 14,
              boxSizing: "border-box",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              {/* 🔥 Video logo in mobile drawer */}
              <video
                src={LogoVideo}
                autoPlay
                loop
                muted
                playsInline
                style={{ width: 36, height: 36, borderRadius: 10, objectFit: "contain" }}
              />
              <div style={{ fontWeight: 800 }}>GiveAura Admin</div>
              <button
                style={{
                  marginLeft: "auto",
                  border: "none",
                  background: "transparent",
                  color: "#9ca3af",
                  cursor: "pointer",
                }}
                onClick={() => setMobileOpen(false)}
              >
                ✕
              </button>
            </div>

            <nav
              style={{
                marginTop: 16,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {navItems.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  className={({ isActive }) =>
                    `nav-item${isActive ? " nav-active" : ""}`
                  }
                  onClick={() => setMobileOpen(false)}
                  style={{
                    padding: "8px 6px",
                    textDecoration: "none",
                    color: "#e5e7eb",
                    borderRadius: 8,
                  }}
                >
                  <span style={{ marginRight: 8 }}>{n.emoji}</span>
                  {n.label}
                </NavLink>
              ))}
            </nav>

            <div style={{ marginTop: 18 }}>
              <button
                className="btn"
                onClick={() => navigate("/admin/campaigns/new")}
              >
                Create campaign
              </button>
              <button
                className="btn-outline"
                style={{ marginLeft: 8 }}
                onClick={() => navigate("/admin/donations")}
              >
                Export
              </button>
            </div>

            <div style={{ marginTop: 18 }}>
              <div
                style={{ display: "flex", gap: 10, alignItems: "center" }}
              >
                <div aria-hidden>{avatarContent()}</div>
                <div>
                  <div style={{ fontWeight: 700 }}>
                    {profile?.displayName ||
                      user?.displayName ||
                      user?.email?.split?.("@")?.[0] ||
                      "Admin"}
                  </div>
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>
                    {profile?.role || "Administrator"}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <button
                  className="btn-outline"
                  onClick={() => navigate("/admin/profile")}
                >
                  Profile
                </button>
                <button
                  className="btn"
                  style={{ marginLeft: 8 }}
                  onClick={handleSignOut}
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
