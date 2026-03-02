// src/pages/Marketplace.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { getCategoryFeeConfig } from "../services/boostService";
import "./Marketplace.css";

export default function Marketplace() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  useEffect(() => {
    const q = query(
      collection(db, "campaigns"),
      where("isVerified", "==", true),
      orderBy("createdAt", "desc"),
      orderBy("isBoosted", "desc"),
      orderBy("boostedAt", "desc"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setCampaigns(list);
        setLoading(false);
      },
      (err) => {
        console.error("Marketplace campaigns load failed:", err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const filtered = campaigns
    .filter((c) => (filterCategory === "all" ? true : c.campaignType === filterCategory))
    .sort((a, b) => {
      if (sortBy === "goal") return Number(b.goalAmount) - Number(a.goalAmount);
      if (sortBy === "raised") return Number(b.fundsRaised) - Number(a.fundsRaised);
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

  return (
    <div className="market-container">
      <header className="market-header">
        <h1 className="market-title">🌍 GiveAura Marketplace</h1>
        <p className="market-sub">
          Verified campaigns curated for CSR & impactful donations.
        </p>

        <div className="market-filters">
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="all">All Categories</option>
            <option value="emergency">Emergency</option>
            <option value="medical">Medical</option>
            <option value="education">Education</option>
            <option value="ngo">NGO / Social</option>
            <option value="personal">Personal Care</option>
            <option value="global">Global Impact</option>
            <option value="csr">CSR</option>
            <option value="other">Other</option>
          </select>

          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="newest">Newest</option>
            <option value="goal">Highest Goal</option>
            <option value="raised">Most Funded</option>
          </select>
        </div>
      </header>

      {loading && <div className="market-loading">⏳ Loading Marketplace...</div>}

      {!loading && filtered.length === 0 && (
        <div className="market-empty">No campaigns available</div>
      )}

      <main className="market-grid">
        {filtered.map((c) => {
          const goal = Number(c.goalAmount || 0);
          const raised = Number(c.fundsRaised || 0);
          const pct = goal ? Math.min((raised / goal) * 100, 100) : 0;

          const catConfig = getCategoryFeeConfig(c.campaignType.toLowerCase());
          const categoryLabel = catConfig.label || "Campaign";

          const imageSrc =
            c.imageUrl ||
            c.imageURL ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(c.title || "Campaign")}`;

          return (
            <div key={c.id} className="market-card" onClick={() => navigate(`/campaign/${c.id}`)}>
              <div className="market-media">
                <img src={imageSrc} alt={c.title} />
              </div>

              <div className="market-body">
                <h3>{c.title}</h3>
                <p className="market-desc">{c.description?.slice(0, 100)}...</p>

                <span className="market-category">{categoryLabel}</span>

                {c.isBoosted && (
                  <span className="market-boost">
                    {c.boostPlan === "super"
                      ? "🔥 Super Boost"
                      : c.boostPlan === "premium"
                      ? "⚡ Premium Boost"
                      : "⭐ Boosted"}
                  </span>
                )}

                <div className="market-progress">
                  <div className="bar" style={{ width: `${pct}%` }} />
                </div>
                <p className="market-progress-text">{pct.toFixed(1)}% funded</p>

                <div className="market-stats">
                  <span>Goal: ₹{goal.toLocaleString("en-IN")}</span>
                  <span>Raised: ₹{raised.toLocaleString("en-IN")}</span>
                </div>
              </div>

              <div className="market-footer">
                <button className="market-btn">Donate</button>
                <button className="market-outline">View</button>
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}
