// src/pages/Subscriptions.jsx
import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
} from "firebase/firestore";
import "./Subscriptions.css";

export default function Subscriptions() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);

  // redirect if not logged in
  useEffect(() => {
    if (currentUser === undefined) return; // still loading auth
    if (!currentUser) {
      navigate("/login");
    }
  }, [currentUser, navigate]);

  useEffect(() => {
    if (!currentUser || !currentUser.uid) return;

    const qSubs = query(
      collection(db, "subscriptions"),
      where("userId", "==", currentUser.uid),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      qSubs,
      async (snap) => {
        const raw = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        // attach campaign details
        const withCampaigns = await Promise.all(
          raw.map(async (s) => {
            if (!s.campaignId) return s;
            try {
              const cRef = doc(db, "campaigns", s.campaignId);
              const cSnap = await getDoc(cRef);
              if (cSnap.exists()) {
                const c = cSnap.data();
                return {
                  ...s,
                  campaign: {
                    id: s.campaignId,
                    title: c.title || "Campaign",
                    imageUrl:
                      c.imageUrl ||
                      c.imageURL ||
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(
                        c.title || "Campaign"
                      )}`,
                    goalAmount: c.goalAmount || 0,
                    fundsRaised: c.fundsRaised || 0,
                    campaignType: c.campaignType || "other",
                  },
                };
              }
            } catch (err) {
              console.warn("Subscriptions: failed to fetch campaign", err);
            }
            return s;
          })
        );

        setSubs(withCampaigns);
        setLoading(false);
      },
      (err) => {
        console.error("Subscriptions listener failed:", err);
        setSubs([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [currentUser]);

  if (!currentUser) {
    return (
      <div className="subs-page">
        <div className="subs-card">
          <p>You need to log in to view Subscriptions.</p>
          <button className="btn-primary" onClick={() => navigate("/login")}>
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  const fmtINR = (n) => {
    try {
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }).format(Number(n || 0));
    } catch {
      return `₹${Math.round(Number(n || 0))}`;
    }
  };

  const formatDate = (d) => {
    if (!d) return "—";
    try {
      const jsDate = d.toDate ? d.toDate() : new Date(d);
      return jsDate.toLocaleDateString("en-IN", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "—";
    }
  };

  return (
    <div className="subs-page">
      <header className="subs-header">
        <h1>📅 My Subscriptions</h1>
        <p>
          See your recurring support to campaigns and manage CSR-style commitments.
        </p>
      </header>

      {loading && <div className="subs-loading">⏳ Loading your subscriptions...</div>}

      {!loading && subs.length === 0 && (
        <div className="subs-empty">
          <p>No active subscriptions found.</p>
          <button className="btn-primary" onClick={() => navigate("/marketplace")}>
            Explore campaigns
          </button>
        </div>
      )}

      {!loading && subs.length > 0 && (
        <main className="subs-list">
          {subs.map((s) => {
            const c = s.campaign || null;
            const status = (s.status || "active").toLowerCase();
            const badgeColor =
              status === "active"
                ? "#22c55e"
                : status === "paused"
                ? "#f97316"
                : "#9ca3af";

            return (
              <div key={s.id} className="subs-card">
                {c && (
                  <div className="subs-campaign" onClick={() => navigate(`/campaign/${c.id}`)}>
                    <img
                      src={c.imageUrl}
                      alt={c.title}
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                          c.title || "Campaign"
                        )}`;
                      }}
                    />
                    <div className="subs-c-info">
                      <h3>{c.title}</h3>
                      <p className="subs-c-type">
                        {c.campaignType ? c.campaignType.toUpperCase() : "CAMPAIGN"}
                      </p>
                      <p className="subs-c-progress">
                        Goal: {fmtINR(c.goalAmount)} • Raised:{" "}
                        {fmtINR(c.fundsRaised)}
                      </p>
                    </div>
                  </div>
                )}

                <div className="subs-meta">
                  <div className="subs-row">
                    <span className="subs-label">Amount</span>
                    <span className="subs-value">{fmtINR(s.amount)}</span>
                  </div>
                  <div className="subs-row">
                    <span className="subs-label">Frequency</span>
                    <span className="subs-value">
                      {s.frequency || "monthly"}
                    </span>
                  </div>
                  <div className="subs-row">
                    <span className="subs-label">Next charge</span>
                    <span className="subs-value">
                      {formatDate(s.nextChargeAt)}
                    </span>
                  </div>
                  <div className="subs-row">
                    <span className="subs-label">Status</span>
                    <span
                      className="subs-status-pill"
                      style={{ background: badgeColor }}
                    >
                      {status.toUpperCase()}
                    </span>
                  </div>
                </div>

                <div className="subs-actions">
                  <button
                    className="btn-outline"
                    onClick={() => navigate(`/campaign/${s.campaignId}`)}
                  >
                    View campaign
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={() => {
                      alert(
                        "Pause / cancel subscription: backend logic not yet implemented. You can design this later in Cloud Functions or Node server."
                      );
                    }}
                  >
                    Manage
                  </button>
                </div>
              </div>
            );
          })}
        </main>
      )}
    </div>
  );
}
