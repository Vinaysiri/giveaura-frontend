// src/pages/admin/AdminShell.jsx
import React from "react";
import logo from "../../assets/Logo-GiveAura.png";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import "./styles/admin.css";
import Toast from "./admincomponents/Toast.jsx";
import LoadingSpinner from "./admincomponents/LoadingSpinner.jsx";

export default function AdminShell({ loading = false }) {
  const navigate = useNavigate();

  return (
    <div className="ga-shell" style={{ minHeight: "100vh" }}>
      <aside className="ga-sidebar" aria-label="Admin navigation">
        <div className="ga-brand" style={{ marginBottom: 6 }}>
          <img src={logo} alt="GiveAura" className="ga-logo" />
        </div>

        <nav className="ga-nav" role="navigation" aria-label="Admin pages">
          <NavLink to="/admin/dashboard" className={({isActive}) => "ga-nav-item" + (isActive ? " active" : "")} end>🏠<span>Dashboard</span></NavLink>
          <NavLink to="/admin/campaigns" className={({isActive}) => "ga-nav-item" + (isActive ? " active" : "")}>📣<span>Campaigns</span></NavLink>
          <NavLink to="/admin/events" className={({isActive}) => "ga-nav-item" + (isActive ? " active" : "")}>📅<span>Events</span></NavLink>
          <NavLink to="/admin/donations" className={({isActive}) => "ga-nav-item" + (isActive ? " active" : "")}>💸<span>Donations</span></NavLink>
          <NavLink to="/admin/boostersubscribers" className={({isActive}) => "ga-nav-item" + (isActive ? " active" : "")}>🚀<span>Boosts</span></NavLink>
          <NavLink to="/admin/users" className={({isActive}) => "ga-nav-item" + (isActive ? " active" : "")}>👥<span>Users</span></NavLink>
          <NavLink to="/admin/popups" className={({isActive}) => "ga-nav-item" + (isActive ? " active" : "")}>🔔<span>Popups</span></NavLink>
          <NavLink to="/admin/support" className={({isActive}) => "ga-nav-item" + (isActive ? " active" : "")}>🛟<span>Support</span></NavLink>
          <NavLink to="/admin/settings" className={({isActive}) => "ga-nav-item" + (isActive ? " active" : "")}>⚙️<span>Settings</span></NavLink>
        </nav>

        <div className="ga-sidebar-footer">v1.0 • GiveAura</div>
      </aside>

      <main className="ga-main" aria-live="polite">
        <header className="ga-topbar">
          <div className="ga-search"><input aria-label="Search admin" placeholder="Search campaigns, donors, events..." /></div>

          <div className="ga-top-actions" role="toolbar" aria-label="Top actions">
            <button className="icon" title="Notifications" onClick={() => navigate("/admin/notifications")}>🔔</button>
            <button className="icon" title="Messages">✉️</button>
            <div className="profile-pill" title="Admin profile">Admin ▾</div>
          </div>
        </header>

        <section style={{ marginTop: 12 }}>
          <Outlet />
        </section>

        <footer className="ga-footer muted" style={{ marginTop: 18 }}>GiveAura — built with care</footer>
      </main>

      {loading && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(2,6,23,0.25)", zIndex: 9999 }}>
          <LoadingSpinner size={56} />
        </div>
      )}

      <Toast />
    </div>
  );
}
