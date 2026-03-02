// src/components/BoostPlans.jsx
import React from "react";
import { useNavigate } from "react-router-dom";


const PLAN_CONFIG = [
  {
    id: "none",
    label: "No Boost",
    badge: "Default",
    description: "Your campaign will still be visible in the main list and search.",
    priceText: "0% extra platform fee",
    highlights: [
      "Standard listing in category",
      "Appears in search results",
      "Good for small personal campaigns",
    ],
    recommended: false,
  },
  {
    id: "basic",
    label: "⭐ Basic Boost",
    badge: "More visibility",
    description: "Highlight your campaign slightly higher in lists.",
    priceText: "+0% fee (intro offer)",
    highlights: [
      "Priority placement in category lists (light boost)",
      "Higher chances to be seen by donors",
      "Good for new campaigns",
    ],
    recommended: false,
  },
  {
    id: "premium",
    label: "⚡ Premium Boost",
    badge: "Recommended",
    description: "Stronger visibility with badges and priority ranking.",
    priceText: "+0% fee (limited period)",
    highlights: [
      "Highlighted “Boosted” badge on your card",
      "Priority placement above non-boosted campaigns",
      "Eligible for social media shoutouts (where applicable)",
    ],
    recommended: true,
  },
  {
    id: "super",
    label: "🔥 Super Boost",
    badge: "Max visibility",
    description: "Best for urgent or large goal campaigns.",
    priceText: "+0% fee (admin controlled)",
    highlights: [
      "Top placement in urgency lists (subject to review)",
      "Marked as “Super Boosted” on Home page",
      "Best for emergency / time-bound needs",
    ],
    recommended: false,
  },
];

function getHintForType(campaignType) {
  if (!campaignType) return null;
  const t = String(campaignType).toLowerCase().trim();
  if (!t) return null;

  if (["emergency", "disaster", "urgent"].includes(t)) {
    return "For emergency campaigns, Super Boost can help you reach donors faster.";
  }
  if (["medical", "health", "treatment"].includes(t)) {
    return "For medical campaigns, Premium or Super Boost is ideal when time is critical.";
  }
  if (["ngo", "social", "community"].includes(t)) {
    return "NGO / community campaigns often benefit from Premium Boost for consistent visibility.";
  }
  if (["education", "student", "school"].includes(t)) {
    return "Education campaigns perform well with Basic or Premium Boost.";
  }
  if (["csr", "corporate"].includes(t)) {
    return "CSR / corporate campaigns usually prefer Premium or Super Boost.";
  }
  if (["global", "international"].includes(t)) {
    return "Global campaigns can use higher boosts to reach more donors.";
  }
  return null;
}

export default function BoostPlans({
  value = "none",
  onChange,
  disabled = false,
  campaignType,
}) {
  const hint = getHintForType(campaignType);
  const navigate = useNavigate();

  const handleSelect = (planId) => {
    if (disabled) return;
    if (typeof onChange === "function") {
      onChange(planId);
    }
  };

  return (
    <section
      className="boost-plans-section"
      aria-label="Boost visibility plans"
      style={{
        borderRadius: 12,
        padding: 16,
        marginTop: 16,
        background: "#f9fafb",
        border: "1px solid #e5e7eb",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          alignItems: "baseline",
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <button onClick={() => navigate(-1)}>
          ← Back
        </button>
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 600,
              color: "#111827",
            }}
          >
            Boost visibility (optional)
          </h3>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#4b5563",
            }}
          >
            Donors always see the full amount they donate. Boost only affects visibility, not the
            donation amount shown.
          </p>
        </div>
        {value && value !== "none" && (
          <span
            style={{
              fontSize: 12,
              padding: "4px 8px",
              borderRadius: 999,
              background: "#e0f2fe",
              color: "#0369a1",
              fontWeight: 600,
            }}
          >
            Selected:{" "}
            {PLAN_CONFIG.find((p) => p.id === value)?.label || "Custom"}
          </span>
        )}
      </div>

      {hint && (
        <p
          style={{
            margin: "6px 0 10px",
            fontSize: 12,
            color: "#6b7280",
            fontStyle: "italic",
          }}
        >
          💡 {hint}
        </p>
      )}

      <div
        className="boost-plans-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: 12,
        }}
      >
        {PLAN_CONFIG.map((plan) => {
          const isSelected = value === plan.id;
          const isDisabled = disabled;

          const border = isSelected
            ? "2px solid #2563eb"
            : "1px solid #e5e7eb";
          const bg = isSelected ? "#eff6ff" : "#ffffff";
          const shadow = isSelected
            ? "0 6px 18px rgba(37,99,235,0.2)"
            : "0 2px 6px rgba(15,23,42,0.06)";

          return (
            <button
              key={plan.id}
              type="button"
              disabled={isDisabled}
              onClick={() => handleSelect(plan.id)}
              className="boost-plan-card"
              style={{
                textAlign: "left",
                borderRadius: 10,
                padding: 12,
                background: bg,
                border,
                boxShadow: shadow,
                cursor: isDisabled ? "not-allowed" : "pointer",
                opacity: isDisabled ? 0.6 : 1,
                transition: "all 0.18s ease",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 6,
                  alignItems: "center",
                  marginBottom: 4,
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#111827",
                  }}
                >
                  {plan.label}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {plan.recommended && (
                    <span
                      style={{
                        fontSize: 10,
                        padding: "3px 6px",
                        borderRadius: 999,
                        background: "#f97316",
                        color: "#fff",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: 0.4,
                      }}
                    >
                      Recommended
                    </span>
                  )}
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      border: "2px solid #2563eb",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: isSelected ? "#2563eb" : "#ffffff",
                    }}
                    aria-hidden="true"
                  >
                    {isSelected && (
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: "#ffffff",
                        }}
                      />
                    )}
                  </span>
                </div>
              </div>

              <p
                style={{
                  margin: "2px 0 4px",
                  fontSize: 12,
                  color: "#4b5563",
                }}
              >
                {plan.description}
              </p>

              <p
                style={{
                  margin: "2px 0 6px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#2563eb",
                }}
              >
                {plan.priceText}
              </p>

              <ul
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  fontSize: 11.5,
                  color: "#6b7280",
                }}
              >
                {plan.highlights.map((h, idx) => (
                  <li key={idx}>{h}</li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      <p
        style={{
          marginTop: 10,
          fontSize: 11,
          color: "#9ca3af",
        }}
      >
        Note: Platform fee % is calculated from the campaign&apos;s category
        (Emergency, Medical, NGO, Global, etc). Boost plans do not change the
        amount shown to donors – they only improve where and how your campaign
        appears on GiveAura.
      </p>
    </section>
  );
}
