import React, { useMemo } from "react";

/**
 * BoosterRevenueChart
 *
 * Props:
 *  - data: [{ month: "YYYY-MM", total: number }]
 */
export default function BoosterRevenueChart({ data = [] }) {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <p style={{ color: "#6b7280", marginTop: 16 }}>
        No revenue data available.
      </p>
    );
  }

  /* ---------------- NORMALIZE ---------------- */
  const normalized = useMemo(() => {
    return data
      .map((d) => ({
        ...d,
        total: Number(d.total || 0),
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [data]);

  const max = Math.max(...normalized.map((d) => d.total), 1);
  const totalRevenue = normalized.reduce((s, d) => s + d.total, 0);

  const formatMonth = (key) => {
    // key: YYYY-MM
    try {
      const [y, m] = key.split("-");
      return new Date(Number(y), Number(m) - 1).toLocaleString("en-IN", {
        month: "short",
        year: "numeric",
      });
    } catch {
      return key;
    }
  };

  return (
    <div style={{ marginTop: 32 }}>
      <h3 style={{ marginBottom: 4 }}>📈 Monthly Boost Revenue</h3>
      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
        Total revenue:{" "}
        <strong>₹{totalRevenue.toLocaleString("en-IN")}</strong>
      </p>

      <div style={{ display: "grid", gap: 14 }}>
        {normalized.map((d) => {
          const widthPct = Math.round((d.total / max) * 100);

          return (
            <div key={d.month}>
              {/* LABEL ROW */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                  marginBottom: 4,
                }}
              >
                <strong>{formatMonth(d.month)}</strong>
                <span>₹{d.total.toLocaleString("en-IN")}</span>
              </div>

              {/* BAR */}
              <div
                style={{
                  height: 12,
                  background: "#e5e7eb",
                  borderRadius: 8,
                  overflow: "hidden",
                }}
                title={`₹${d.total.toLocaleString("en-IN")}`}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${widthPct}%`,
                    background:
                      d.total === max ? "#16a34a" : "#2563eb",
                    transition: "width .4s ease",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* LEGEND */}
      <div
        style={{
          marginTop: 12,
          fontSize: 12,
          color: "#6b7280",
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <span>
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              background: "#2563eb",
              borderRadius: 3,
              marginRight: 6,
            }}
          />
          Monthly revenue
        </span>

        <span>
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              background: "#16a34a",
              borderRadius: 3,
              marginRight: 6,
            }}
          />
          Peak month
        </span>
      </div>
    </div>
  );
}
