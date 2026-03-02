import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import BoosterAnalytics from "./BoosterAnalytics";
import { normalizeBoost } from "./BoosterUtils";
import { expireBoostersIfNeeded } from "../../services/boostService";

/* =====================================================
   BOOST META (DISPLAY ONLY — BACKEND IS SOURCE OF TRUTH)
===================================================== */
const BOOST_META = {
  basic: {
    label: "Basic Boost",
    price: 399,
    color: "#22c55e",
  },
  premium: {
    label: "Premium Boost",
    price: 999,
    color: "#6366f1",
  },
  super: {
    label: "Super Boost",
    price: 4999,
    color: "#f59e0b",
  },
};

/* =====================================================
   MAIN COMPONENT
===================================================== */
export default function BoosterSubscribers() {
  const [loading, setLoading] = useState(true);
  const [boosts, setBoosts] = useState([]);
  const [adDonations, setAdDonations] = useState([]);


  /* ---------------- LOAD BOOSTS ---------------- */
  useEffect(() => {
  const init = async () => {
    await expireBoostersIfNeeded();
  };

  init();

  /* ---------------- BOOST LISTENER ---------------- */
  const boostQuery = query(
    collection(db, "campaignBoosts"),
    orderBy("createdAt", "desc")
  );

  const unsubBoost = onSnapshot(boostQuery, (snapshot) => {
    const rows = snapshot.docs.map((d) =>
      normalizeBoost({
        id: d.id,
        ...d.data(),
      })
    );

    setBoosts(rows);
    setLoading(false);
  });

  /* ---------------- HERO AD DONATIONS LISTENER ---------------- */
  const adQuery = query(
    collection(db, "platform_contributions"),
    where("kind", "==", "giveaura-ad"),
    orderBy("createdAt", "desc")
  );

  const unsubAds = onSnapshot(adQuery, (snapshot) => {
    const ads = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    setAdDonations(ads);
  });

  return () => {
    unsubBoost();
    unsubAds();
  };
}, []);


  /* ---------------- GROUPING ---------------- */
  const grouped = useMemo(
    () => ({
      basic: boosts.filter((b) => b.plan === "basic"),
      premium: boosts.filter((b) => b.plan === "premium"),
      super: boosts.filter((b) => b.plan === "super"),
    }),
    [boosts]
  );

  /* ---------------- KPIs (MATCH BACKEND) ---------------- */
  const kpis = useMemo(() => {
  const boostRevenue = boosts.reduce(
    (sum, b) => sum + Number(b.amount || 0),
    0
  );

  const adRevenue = adDonations.reduce(
    (sum, a) => sum + Number(a.amount || 0),
    0
  );

  const active = boosts.filter((b) => b.status === "active");

  return {
    totalBoosts: boosts.length,
    activeBoosts: active.length,
    revenue: boostRevenue + adRevenue,
    heroAds: adDonations.length,
    posterAds: active.filter((b) =>
      b.visibility?.includes("Poster Banner")
    ).length,
  };
}, [boosts, adDonations]);

  /* ---------------- UI ---------------- */
  if (loading) {
    return <div style={{ padding: 20 }}>⏳ Loading booster data…</div>;
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontWeight: 800 }}>🚀 Booster Subscribers</h2>
        <p style={{ color: "#64748b" }}>
          Live campaign boost placements (Admin)
        </p>
      </div>

      {/* KPI CARDS */}
      <div
        style={{
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 32,
        }}
      >
        <KpiCard title="Total Boosts" value={kpis.totalBoosts} />
        <KpiCard title="Active Boosts" value={kpis.activeBoosts} />
        <KpiCard
          title="Boost Revenue"
          value={`₹${kpis.revenue.toLocaleString("en-IN")}`}
        />
        <KpiCard title="Hero Banner Ads" value={kpis.heroAds} />
        <KpiCard title="Poster Banner Ads" value={kpis.posterAds} />
      </div>

      {/* PLAN SECTIONS */}
      {["basic", "premium", "super"].map((plan) => (
        <BoostSection
          key={plan}
          boosts={grouped[plan]}
          meta={BOOST_META[plan]}
        />
      ))}

      {/* ANALYTICS */}
      <BoosterAnalytics boosts={boosts} />
    </div>
  );
}

/* =====================================================
   UI HELPERS
===================================================== */

function KpiCard({ title, value }) {
  return (
    <div
      style={{
        background: "#ffffff",
        borderRadius: 14,
        padding: 18,
        minWidth: 180,
        boxShadow: "0 8px 22px rgba(15,23,42,0.08)",
      }}
    >
      <div style={{ fontSize: 12, color: "#64748b" }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function BoostSection({ boosts, meta }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <h3 style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: meta.color,
          }}
        />
        {meta.label} ({boosts.length})
      </h3>

      <p style={{ fontSize: 13, color: "#64748b" }}>
        Price ₹{meta.price} • Visibility from backend engine
      </p>

      {boosts.length === 0 ? (
        <p style={{ color: "#9ca3af", marginTop: 8 }}>
          No boosts in this category.
        </p>
      ) : (
        <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
          {boosts.map((b) => (
            <BoostRow key={b.id} boost={b} />
          ))}
        </div>
      )}
    </section>
  );
}

function BoostRow({ boost }) {
  const isActive = boost.status === "active";

  return (
    <div
      style={{
        background: "#ffffff",
        borderRadius: 14,
        padding: 16,
        boxShadow: "0 6px 18px rgba(15,23,42,0.08)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 16,
      }}
    >
      <div>
        <div style={{ fontWeight: 700 }}>
          {boost.campaignTitle || "Untitled Campaign"}
        </div>

        <div style={{ fontSize: 12, color: "#64748b" }}>
          Campaign ID: {boost.campaignId || "—"}
        </div>

        <div style={{ fontSize: 12, marginTop: 4 }}>
          Status:{" "}
          <strong
            style={{
              color: isActive ? "#16a34a" : "#dc2626",
            }}
          >
            {isActive ? "Active" : "Expired"}
          </strong>
        </div>

        <div style={{ fontSize: 12, color: "#64748b" }}>
          Visibility:{" "}
          {boost.visibility?.length
            ? boost.visibility.join(", ")
            : "—"}
        </div>
      </div>

      <div style={{ textAlign: "right", fontSize: 12 }}>
        <div style={{ fontWeight: 700 }}>
          ₹{Number(boost.amount || 0).toLocaleString("en-IN")}
        </div>

        <div style={{ color: "#64748b" }}>
          Start:{" "}
          {boost.createdAt
            ? boost.createdAt.toLocaleDateString()
            : "—"}
        </div>

        <div style={{ color: "#64748b" }}>
          End:{" "}
          {boost.expiresAt
            ? boost.expiresAt.toLocaleDateString()
            : "—"}
        </div>
      </div>
    </div>
  );
}
