import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMostCriticalCampaign } from "../services/criticalCampaignService";

const SESSION_KEY = "critical_cta_seen_count";

export default function CriticalCampaignCTA() {
  const [campaign, setCampaign] = useState(null);
  const [phase, setPhase] = useState("right");
  const navigate = useNavigate();

  useEffect(() => {
    getMostCriticalCampaign().then(setCampaign);
  }, []);

  useEffect(() => {
    if (!campaign) return;

    let seen = Number(sessionStorage.getItem(SESSION_KEY) || 0);
    if (seen >= 3) return;

    const interval = setInterval(() => {
      setPhase((p) =>
        p === "right" ? "center" : p === "center" ? "left" : "right"
      );
    }, 1800);

    sessionStorage.setItem(SESSION_KEY, seen + 1);
    return () => clearInterval(interval);
  }, [campaign]);

  if (!campaign) return null;

  /* ===== computed metrics ===== */
  const endMs = campaign.endDate.seconds * 1000;
  const hoursLeft = Math.max(
    1,
    Math.floor((endMs - Date.now()) / 3600000)
  );

  const fundedPct = Math.min(
    100,
    Math.round((campaign.fundsRaised / campaign.goalAmount) * 100)
  );

  const remaining = campaign.goalAmount - campaign.fundsRaised;

  /* ===== category colors ===== */
  const palette = {
    medical: { bg: "#7f1d1d", bar: "#ef4444" },
    disaster: { bg: "#7c2d12", bar: "#f97316" },
    default: { bg: "#1e3a8a", bar: "#38bdf8" },
  };

  const theme = palette[campaign.category] || palette.default;

  /* ===== animation positions ===== */
  const positionStyle = {
    right: { right: "-360px" },
    center: { right: "calc(50% - 180px)" },
    left: { left: "-360px" },
  }[phase];

  return (
    <div
      style={{
        position: "fixed",
        bottom: 120,
        width: 360,
        padding: 18,
        borderRadius: 20,
        background: theme.bg,
        color: "#fff",
        zIndex: 1000,
        boxShadow: "0 28px 60px rgba(0,0,0,0.55)",
        transition: "all 0.7s cubic-bezier(.4,0,.2,1)",
        ...positionStyle,
      }}
    >
      {/* HEADER */}
      <div style={{ fontWeight: 900, fontSize: 15 }}>
        🚨 MOST CRITICAL CAMPAIGN
      </div>

      {/* META */}
      <div style={{ fontSize: 13, marginTop: 6, opacity: 0.9 }}>
        ⏳ {hoursLeft} hours left · {fundedPct}% funded
      </div>

      {/* PROGRESS BAR */}
      <div
        style={{
          height: 8,
          background: "rgba(255,255,255,0.25)",
          borderRadius: 999,
          marginTop: 10,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${fundedPct}%`,
            height: "100%",
            background: theme.bar,
            transition: "width 0.5s ease",
          }}
        />
      </div>

      {/* URGENCY */}
      <div style={{ marginTop: 10, fontSize: 13 }}>
         Urgency Score:{" "}
        <b>{Math.min(100, campaign.urgencyScore)}/100</b>
      </div>

      {/* GAP */}
      <div style={{ fontSize: 13, marginTop: 4 }}>
         Needs ₹{remaining.toLocaleString("en-IN")} urgently
      </div>

      {/* CTA */}
      <button
        onClick={() => navigate(`/donate/${campaign.id}`)}
        style={{
          marginTop: 14,
          width: "100%",
          padding: "12px",
          borderRadius: 999,
          border: "none",
          background: "#fde047",
          color: "#1f2937",
          fontWeight: 900,
          fontSize: 14,
          cursor: "pointer",
        }}
      >
        Donate to Save a Life
      </button>
    </div>
  );
}
