import React, { useMemo } from "react";
import BoosterRevenueChart from "./BoosterRevenueChart";
import { monthKey, exportToCSV } from "./BoosterUtils";

export default function BoosterAnalytics({ boosts = [] }) {
  /* ================= KPIs ================= */
  const kpis = useMemo(() => {
    const revenue = boosts.reduce(
      (sum, b) => sum + Number(b.amount || 0),
      0
    );

    return {
      revenue,
      active: boosts.filter((b) => b.status === "active").length,
      expired: boosts.filter((b) => b.status === "expired").length,
      basic: boosts.filter((b) => b.plan === "basic").length,
      premium: boosts.filter((b) => b.plan === "premium").length,
      super: boosts.filter((b) => b.plan === "super").length,
    };
  }, [boosts]);

  /* ================= MONTHLY REVENUE ================= */
  const monthly = useMemo(() => {
    const map = {};
    boosts.forEach((b) => {
      if (!b.createdAt) return;
      const key = monthKey(b.createdAt);
      map[key] = (map[key] || 0) + Number(b.amount || 0);
    });

    return Object.entries(map)
      .map(([month, total]) => ({ month, total }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [boosts]);

  /* ================= PLAN REVENUE ================= */
  const planRevenue = useMemo(() => {
    return {
      basic: boosts
        .filter((b) => b.plan === "basic")
        .reduce((s, b) => s + Number(b.amount || 0), 0),
      premium: boosts
        .filter((b) => b.plan === "premium")
        .reduce((s, b) => s + Number(b.amount || 0), 0),
      super: boosts
        .filter((b) => b.plan === "super")
        .reduce((s, b) => s + Number(b.amount || 0), 0),
    };
  }, [boosts]);

  const maxPlanRevenue = Math.max(
    planRevenue.basic,
    planRevenue.premium,
    planRevenue.super,
    1
  );

  /* ================= EXPORT ================= */
  const exportData = () => {
    exportToCSV(
      boosts.map((b) => ({
        campaignId: b.campaignId,
        plan: b.plan,
        amount: b.amount,
        status: b.status,
        createdAt: b.createdAt?.toISOString?.() || "",
        expiresAt: b.expiresAt?.toISOString?.() || "",
      })),
      "booster-analytics.csv"
    );
  };

  return (
    <div style={{ marginTop: 48 }}>
      <h2>📊 Booster Analytics</h2>

      {/* ================= KPI CARDS ================= */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Kpi label="Total Revenue" value={`₹${kpis.revenue.toLocaleString("en-IN")}`} />
        <Kpi label="Active Boosts" value={kpis.active} />
        <Kpi label="Expired Boosts" value={kpis.expired} />
        <Kpi label="Basic Boosts" value={kpis.basic} />
        <Kpi label="Premium Boosts" value={kpis.premium} />
        <Kpi label="Super Boosts" value={kpis.super} />
      </div>

      {/* ================= MONTHLY GRAPH ================= */}
      <BoosterRevenueChart data={monthly} />

      {/* ================= PLAN REVENUE GRAPH ================= */}
      <div style={{ marginTop: 40 }}>
        <h3>Revenue by Boost Plan</h3>

        {[
          { label: "Basic", value: planRevenue.basic, color: "#22c55e" },
          { label: "Premium", value: planRevenue.premium, color: "#6366f1" },
          { label: "Super", value: planRevenue.super, color: "#f59e0b" },
        ].map((p) => (
          <div key={p.label} style={{ marginBottom: 12 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 13,
              }}
            >
              <strong>{p.label}</strong>
              <span>₹{p.value.toLocaleString("en-IN")}</span>
            </div>

            <div
              style={{
                height: 10,
                background: "#e5e7eb",
                borderRadius: 6,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${(p.value / maxPlanRevenue) * 100}%`,
                  background: p.color,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* ================= ACTIVE VS EXPIRED ================= */}
      <div style={{ marginTop: 40 }}>
        <h3>Boost Status Distribution</h3>

        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
          <StatusBox
            label="Active"
            value={kpis.active}
            color="#16a34a"
          />
          <StatusBox
            label="Expired"
            value={kpis.expired}
            color="#dc2626"
          />
        </div>
      </div>

      {/* ================= EXPORT ================= */}
      <div style={{ marginTop: 32 }}>
        <button onClick={exportData}>⬇ Export CSV</button>
      </div>
    </div>
  );
}

/* ================= UI HELPERS ================= */

function Kpi({ label, value }) {
  return (
    <div
      style={{
        background: "#fff",
        padding: 16,
        borderRadius: 12,
        minWidth: 160,
        boxShadow: "0 6px 18px rgba(15,23,42,0.06)",
      }}
    >
      <div style={{ fontSize: 12, color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function StatusBox({ label, value, color }) {
  return (
    <div
      style={{
        flex: 1,
        padding: 16,
        borderRadius: 12,
        background: "#fff",
        boxShadow: "0 6px 18px rgba(15,23,42,0.06)",
      }}
    >
      <div style={{ fontSize: 12, color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color }}>
        {value}
      </div>
    </div>
  );
}
