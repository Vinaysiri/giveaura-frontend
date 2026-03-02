// src/pages/admin/Settings.jsx
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "./admincomponents/Modal.jsx";
import Toast from "./admincomponents/Toast.jsx";
import LoadingSpinner from "./admincomponents/LoadingSpinner.jsx";
import {
  getPlatformStats,
  subscribePlatformStats,
  getAllUsers,
  saveUserProfile,
} from "../../services/firestoreService";
import { useAuth } from "../../context/AuthContext";
import {
  collection,
  collectionGroup,
  getDocs,
  onSnapshot,
} from "firebase/firestore";
import { db, auth } from "../../firebase";

/* ---------------- ADMIN EMAIL OVERRIDE ---------------- */
const ADMIN_EMAILS = ["kotipallynagavinay12323@gmail.com"];

export default function Settings() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const mountedRef = useRef(true);
  const unsubStatsRef = useRef(null);
  const unsubCampaignsRef = useRef(null);

  /* ---------------- STATE ---------------- */
  const [loading, setLoading] = useState(true);

  const [platformStats, setPlatformStats] = useState({});
  const [campaignCount, setCampaignCount] = useState(0);

  const [donationAgg, setDonationAgg] = useState({
    totalAmount: 0,
    totalCount: 0,
    uniqueDonors: 0,
  });

  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(null);
  const [profileSaving, setProfileSaving] = useState(false);

  const [dangerOpen, setDangerOpen] = useState(false);

  /* ---------------- ADMIN GUARD ---------------- */
  const isAdmin =
    currentUser?.role === "admin" ||
    currentUser?.isAdmin === true ||
    ADMIN_EMAILS.includes(currentUser?.email);

  /* ---------------- INITIAL LOAD ---------------- */
  useEffect(() => {
    mountedRef.current = true;

    async function init() {
      setLoading(true);

      /* Platform stats (summary doc) */
      try {
        const stats = await getPlatformStats();
        mountedRef.current && setPlatformStats(stats || {});
      } catch {
        setPlatformStats({});
      }

      /* Live platform stats */
      try {
        unsubStatsRef.current = subscribePlatformStats((snap) => {
          mountedRef.current && setPlatformStats(snap || {});
        });
      } catch {
        /* ignore */
      }

      /* Campaign count (LIVE) */
      try {
        unsubCampaignsRef.current = onSnapshot(
          collection(db, "campaigns"),
          (snap) => {
            mountedRef.current && setCampaignCount(snap.size);
          }
        );
      } catch {
        setCampaignCount(0);
      }

      /* Donation aggregates */
      await loadDonationAggregates();

      mountedRef.current && setLoading(false);
    }

    init();

    return () => {
      mountedRef.current = false;
      if (unsubStatsRef.current) unsubStatsRef.current();
      if (unsubCampaignsRef.current) unsubCampaignsRef.current();
    };
  }, []);

  /* ---------------- DONATION AGGREGATION ---------------- */
  const loadDonationAggregates = async () => {
    try {
      const snap = await getDocs(collectionGroup(db, "donations"));

      let total = 0;
      let count = 0;
      const donors = new Set();

      snap.docs.forEach((doc) => {
        const d = doc.data() || {};
        const amt = Number(d.amount || 0);
        if (!isNaN(amt)) {
          total += amt;
          count += 1;
        }
        if (d.donorId) donors.add(d.donorId);
        else if (d.donorEmail) donors.add(d.donorEmail);
      });

      mountedRef.current &&
        setDonationAgg({
          totalAmount: Math.round(total),
          totalCount: count,
          uniqueDonors: donors.size,
        });
    } catch (err) {
      console.error("[Settings] Donation aggregation failed", err);
    }
  };

  /* ---------------- USERS ---------------- */
  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const list = await getAllUsers();
      mountedRef.current && setUsers(Array.isArray(list) ? list : []);
    } finally {
      mountedRef.current && setUsersLoading(false);
    }
  };

  const saveEditingProfile = async () => {
    if (!editingProfile?.id) return;

    setProfileSaving(true);
    try {
      await saveUserProfile(editingProfile.id, {
        displayName: editingProfile.displayName || "",
        photoURL: editingProfile.photoURL || "",
        bio: editingProfile.bio || "",
        role: editingProfile.role || "user",
      });
      setProfileModalOpen(false);
      loadUsers();
    } finally {
      mountedRef.current && setProfileSaving(false);
    }
  };

  /* ---------------- DERIVED ANALYTICS ---------------- */
  const totalUsers = users.length;
  const uniqueDonors = donationAgg.uniqueDonors;

  const donorConversionPct =
    totalUsers > 0
      ? Math.round((uniqueDonors / totalUsers) * 100)
      : 0;

  const donorHealth =
    donorConversionPct < 30
      ? { label: "Low", color: "#dc2626" }
      : donorConversionPct < 60
      ? { label: "Moderate", color: "#f59e0b" }
      : { label: "High", color: "#16a34a" };

  const platformAgeDays = platformStats?.startedAt
    ? Math.max(
        1,
        Math.floor(
          (Date.now() - new Date(platformStats.startedAt).getTime()) /
            86400000
        )
      )
    : null;

  const donorVelocity =
    platformAgeDays && uniqueDonors
      ? (uniqueDonors / platformAgeDays).toFixed(2)
      : "—";

  const fmtINR = (n) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(Number(n || 0));

  /* ---------------- ACCESS DENIED ---------------- */
  if (!isAdmin) {
    return (
      <div style={{ padding: 48, color: "#b91c1c", fontWeight: 700 }}>
        Access denied. Administrators only.
      </div>
    );
  }

  const [resetLoading, setResetLoading] = useState(false);

const handleResetPlatformStats = async () => {
  try {
    if (!currentUser) return;

    const confirmReset = window.confirm(
      "Are you sure you want to reset platform statistics?"
    );
    if (!confirmReset) return;

    setResetLoading(true);

    const token = await auth.currentUser.getIdToken();

    const res = await fetch(
      "https://asia-southeast1-fundraiser-donations.cloudfunctions.net/api/resetPlatformStats",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error || "Reset failed");
    }

    alert("Platform statistics reset successfully");

    // Reload stats after reset
    const stats = await getPlatformStats();
    setPlatformStats(stats || {});
    await loadDonationAggregates();

    setDangerOpen(false);
  } catch (err) {
    console.error("Reset failed:", err);
    alert("Reset failed: " + err.message);
  } finally {
    setResetLoading(false);
  }
};

  /* ---------------- RENDER ---------------- */
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 16 }}>
      <h2 style={{ fontWeight: 900 }}>Admin Settings</h2>

      {loading ? (
        <div style={{ padding: 60, textAlign: "center" }}>
          <LoadingSpinner size={28} />
        </div>
      ) : (
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 360px",
            gap: 20,
          }}
        >
          {/* LEFT */}
          <div style={{ display: "grid", gap: 16 }}>
            <div className="card">
              <h3>Platform Analytics (Live)</h3>

              <div className="stats-grid">
                <div>Total users <strong>{totalUsers}</strong></div>
                <div>Campaigns <strong>{campaignCount}</strong></div>
                <div>Unique donors <strong>{platformStats.donorsSupported || 0}</strong></div>
                <div>Total donations <strong>{fmtINR(platformStats.totalDonationsAmount)}</strong></div>
                <div>Donation count <strong>{platformStats.totalDonationsCount}</strong></div>
                <div>Avg donor gift <strong>{fmtINR(platformStats.avgDonorGift)}</strong></div>
              </div>

              <hr />

              <div className="stats-grid">
                <div>Donor conversion <strong>{donorConversionPct}%</strong></div>
                <div>
                  Donor health{" "}
                  <strong style={{ color: donorHealth.color }}>
                    {donorHealth.label}
                  </strong>
                </div>
                <div>Donors / day <strong>{donorVelocity}</strong></div>
              </div>
            </div>

            <div className="card">
              <h3>User Management</h3>
              <button className="btn" onClick={loadUsers}>Load users</button>

              {usersLoading ? (
                <LoadingSpinner size={20} />
              ) : (
                <div className="user-list">
                  {users.map((u) => (
                    <div key={u.id} className="user-row" style={{ gap: 12 }}>
                      <img
                        src={
                          u.photoURL ||
                          `https://ui-avatars.com/api/?name=${encodeURIComponent(
                            u.displayName || u.email
                          )}`
                        }
                        alt=""
                        style={{ width: 44, height: 44, borderRadius: "50%" }}
                      />
                      <div style={{ flex: 1 }}>
                        <strong>{u.displayName || "Unnamed"}</strong>
                        <div className="muted">{u.email}</div>
                        <div className="muted small">Role: {u.role || "user"}</div>
                      </div>
                      <button
                        className="btn-outline"
                        onClick={() => {
                          setEditingProfile({ ...u });
                          setProfileModalOpen(true);
                        }}
                      >
                        Edit
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT */}
          <aside style={{ display: "grid", gap: 16 }}>
            <div className="card">
              <h4>Admin Operations</h4>
              <button className="btn" onClick={() => navigate("/admin/events")}>Manage events</button>
              <button className="btn" onClick={() => navigate("/admin/campaigns")}>Manage campaigns</button>
              <button className="btn-outline" onClick={() => navigate("/admin/donations")}>Export donations</button>
            </div>

            <div className="card danger">
              <h4>Danger Zone</h4>
              <button className="btn-danger" onClick={() => setDangerOpen(true)}>
                Reset platform stats
              </button>
            </div>
          </aside>
        </section>
      )}

      {/* PROFILE EDIT MODAL */}
      <Modal open={profileModalOpen} title="Edit user profile" onClose={() => setProfileModalOpen(false)}>
        {editingProfile && (
          <>
            <input
              value={editingProfile.displayName || ""}
              placeholder="Name"
              onChange={(e) =>
                setEditingProfile((s) => ({ ...s, displayName: e.target.value }))
              }
            />
            <input
              value={editingProfile.photoURL || ""}
              placeholder="Photo URL"
              onChange={(e) =>
                setEditingProfile((s) => ({ ...s, photoURL: e.target.value }))
              }
            />
            <textarea
              value={editingProfile.bio || ""}
              placeholder="Bio"
              onChange={(e) =>
                setEditingProfile((s) => ({ ...s, bio: e.target.value }))
              }
            />
            <select
              value={editingProfile.role || "user"}
              onChange={(e) =>
                setEditingProfile((s) => ({ ...s, role: e.target.value }))
              }
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>

            <div className="btn-row">
              <button className="btn" onClick={saveEditingProfile} disabled={profileSaving}>
                {profileSaving ? "Saving…" : "Save"}
              </button>
              <button className="btn-outline" onClick={() => setProfileModalOpen(false)}>
                Cancel
              </button>
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={dangerOpen}
        title="Reset platform statistics"
        onClose={() => setDangerOpen(false)}
      >
        <p className="muted">
          This will reset aggregated analytics values (not donation history).
        </p>

        <div className="btn-row">
          <button
            className="btn-danger"
            onClick={handleResetPlatformStats}
            disabled={resetLoading}
          >
            {resetLoading ? "Resetting…" : "Confirm Reset"}
          </button>

          <button
            className="btn-outline"
            onClick={() => setDangerOpen(false)}
            disabled={resetLoading}
          >
            Cancel
          </button>
        </div>
      </Modal>
      <Toast />
    </div>
  );
}
