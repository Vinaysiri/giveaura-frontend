// src/pages/CSRDashboard.jsx
import React, { useEffect, useState, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from "firebase/firestore";
import { getCategoryFeeConfig } from "../services/boostService";

function fmtINR(amount) {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(Math.round(Number(amount || 0)));
  } catch {
    return `₹${Math.round(Number(amount || 0) || 0)}`;
  }
}

function fmtDate(d) {
  if (!d) return "—";
  const date =
    d.toDate?.() ??
    (typeof d === "number" ? new Date(d) : new Date(String(d)));
  if (!date || Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CSRDashboard() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [donations, setDonations] = useState([]);
  const [error, setError] = useState(null);
  const [filterYear, setFilterYear] = useState("all");

  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      setDonations([]);
      return;
    }

    const fetchDonations = async () => {
      setLoading(true);
      setError(null);

      try {
        const colRef = collection(db, "donations");

        const promises = [];

        // donorId == uid
        if (currentUser.uid) {
          const qById = query(
            colRef,
            where("donorId", "==", currentUser.uid),
            orderBy("createdAt", "desc")
          );
          promises.push(getDocs(qById));
        }

        // donorEmail == email
        if (currentUser.email) {
          const qByEmail = query(
            colRef,
            where("donorEmail", "==", currentUser.email),
            orderBy("createdAt", "desc")
          );
          promises.push(getDocs(qByEmail));
        }

        const snaps = await Promise.all(promises);
        const map = new Map();

        const pushSnap = (snap) => {
          snap.forEach((doc) => {
            const data = doc.data() || {};
            const id = doc.id;

            let createdAt;
            if (data.createdAt?.toDate) createdAt = data.createdAt.toDate();
            else if (data.createdAt?.seconds)
              createdAt = new Date(data.createdAt.seconds * 1000);
            else if (typeof data.createdAt === "number")
              createdAt =
                data.createdAt > 1e12
                  ? new Date(data.createdAt)
                  : new Date(data.createdAt * 1000);
            else if (typeof data.createdAt === "string")
              createdAt = new Date(data.createdAt);
            else createdAt = new Date();

            map.set(id, {
              id,
              ...data,
              createdAt,
            });
          });
        };

        snaps.forEach(pushSnap);

        const list = Array.from(map.values()).sort(
          (a, b) => b.createdAt - a.createdAt
        );

        setDonations(list);
      } catch (err) {
        console.error("CSRDashboard load donations failed:", err);
        setError(
          "Unable to load donation history. Please try again later or contact support."
        );
        setDonations([]);
      } finally {
        setLoading(false);
      }
    };

    fetchDonations();
  }, [currentUser]);

  const filteredDonations = useMemo(() => {
    if (!donations || donations.length === 0) return [];
    if (filterYear === "all") return donations;

    const yearNum = Number(filterYear);
    if (!yearNum) return donations;

    return donations.filter((d) => {
      const dt = d.createdAt || d.donatedAt;
      const date =
        dt?.toDate?.() ??
        (typeof dt === "number" ? new Date(dt) : new Date(String(dt)));
      if (!date || Number.isNaN(date.getTime())) return false;
      return date.getFullYear() === yearNum;
    });
  }, [donations, filterYear]);


  const aggregates = useMemo(() => {
    const result = {
      totalGross: 0,
      totalFundraiserShare: 0,
      totalPlatformShare: 0,
      byCategory: {},
    };

    for (const d of filteredDonations) {
      const gross =
        Number(
          d.amount ??
            d.grossAmount ??
            d.donatedAmount ??
            d.total ??
            d.rawAmount ??
            0
        ) || 0;

      const fundraiser =
        Number(d.fundraiserShare ?? d.creatorShare ?? 0) || 0;

      const platform =
        Number(
          d.platformShare ??
            (Number(d.platformTaxes ?? 0) +
              Number(d.platformEventsFund ?? 0))
        ) || 0;

      result.totalGross += gross;
      result.totalFundraiserShare += fundraiser;
      result.totalPlatformShare += platform;

      let catKey = "other";
      let catLabel = "Other";

      if (d.splitMeta && d.splitMeta.categoryKey) {
        catKey = d.splitMeta.categoryKey;
        catLabel = d.splitMeta.categoryLabel || catKey;
      } else if (d.campaignType) {
        const cfg = getCategoryFeeConfig(d.campaignType);
        catKey = cfg.key;
        catLabel = cfg.label;
      } else {
        const cfg = getCategoryFeeConfig("other");
        catKey = cfg.key;
        catLabel = cfg.label;
      }

      if (!result.byCategory[catKey]) {
        result.byCategory[catKey] = {
          key: catKey,
          label: catLabel,
          gross: 0,
          fundraiser: 0,
          platform: 0,
        };
      }

      result.byCategory[catKey].gross += gross;
      result.byCategory[catKey].fundraiser += fundraiser;
      result.byCategory[catKey].platform += platform;
    }

    return result;
  }, [filteredDonations]);

  const yearsOptions = useMemo(() => {
    const years = new Set();
    for (const d of donations) {
      const dt = d.createdAt || d.donatedAt;
      const date =
        dt?.toDate?.() ??
        (typeof dt === "number" ? new Date(dt) : new Date(String(dt)));
      if (!date || Number.isNaN(date.getTime())) continue;
      years.add(date.getFullYear());
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [donations]);

  if (!currentUser) {
    return (
      <div
        style={{
          padding: 24,
          textAlign: "center",
          fontFamily: "'Poppins', sans-serif",
        }}
      >
        <h2>CSR Dashboard</h2>
        <p>You must be logged in to view CSR / impact reports.</p>
        <button
          className="btn"
          onClick={() => navigate("/login")}
          style={{ marginTop: 16 }}
        >
          Go to Login
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: 20,
        maxWidth: 1100,
        margin: "0 auto",
        fontFamily: "'Poppins', sans-serif",
      }}
    >
      {/* Header */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          marginBottom: 18,
        }}
      >
        <button
    type="button"
    onClick={() => navigate(-1)}
    className="btn"
    style={{
      padding: "6px 10px",
      borderRadius: 10,
      border: "1px solid #e5e7eb",
      background: "#ffffff",
      color: "#111827",
      fontSize: 13,
      lineHeight: 1,
      height: "fit-content",
    }}
  >
    ← Back
  </button>
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 700,
              color: "#111827",
            }}
          >
            CSR & Impact Dashboard
          </h1>
          <p
            style={{
              margin: "6px 0 0",
              color: "#4b5563",
              fontSize: 13,
            }}
          >
            Track how your organisation&apos;s donations are distributed across
            categories and fundraisers.
          </p>
        </div>

        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontSize: 12,
              color: "#6b7280",
              marginBottom: 4,
            }}
          >
            Signed in as
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#111827",
            }}
          >
            {currentUser.email}
          </div>

          <div style={{ marginTop: 8 }}>
            <label
              style={{
                fontSize: 12,
                color: "#6b7280",
                marginRight: 6,
              }}
            >
              Filter by year:
            </label>
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              style={{
                padding: "4px 8px",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                fontSize: 12,
              }}
            >
              <option value="all">All years</option>
              {yearsOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Errors / Loading */}
      {loading && (
        <div style={{ marginBottom: 16, color: "#6b7280" }}>
          ⏳ Loading donation data…
        </div>
      )}
      {error && (
        <div
          style={{
            marginBottom: 16,
            color: "#b91c1c",
            background: "#fef2f2",
            borderRadius: 8,
            padding: 10,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {/* Summary cards */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: 12,
          marginBottom: 18,
        }}
      >
        <div
          style={{
            background: "#eff6ff",
            borderRadius: 12,
            padding: 14,
            border: "1px solid #bfdbfe",
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: "#1d4ed8",
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            Total donated
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "#1d4ed8",
            }}
          >
            {fmtINR(aggregates.totalGross)}
          </div>
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
            Full amount you paid via GiveAura
          </div>
        </div>

        <div
          style={{
            background: "#ecfdf3",
            borderRadius: 12,
            padding: 14,
            border: "1px solid #bbf7d0",
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: "#15803d",
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            Reached fundraisers
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "#15803d",
            }}
          >
            {fmtINR(aggregates.totalFundraiserShare)}
          </div>
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
            Net amount credited to campaigns
          </div>
        </div>

        <div
          style={{
            background: "#fef3c7",
            borderRadius: 12,
            padding: 14,
            border: "1px solid #fde68a",
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: "#b45309",
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            Platform share
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "#b45309",
            }}
          >
            {fmtINR(aggregates.totalPlatformShare)}
          </div>
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
            Category-based fees and platform costs
          </div>
        </div>
      </section>

      {/* Category breakdown */}
      <section
        style={{
          background: "#ffffff",
          borderRadius: 12,
          padding: 16,
          border: "1px solid #e5e7eb",
          marginBottom: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 10,
            alignItems: "center",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 600,
              color: "#111827",
            }}
          >
            Distribution by category
          </h2>
          <span style={{ fontSize: 11, color: "#6b7280" }}>
            Based on campaign type (Emergency, Medical, NGO, Global, etc.)
          </span>
        </div>

        {Object.keys(aggregates.byCategory).length === 0 ? (
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            No donations found for this filter.
          </p>
        ) : (
          <div
            style={{
              overflowX: "auto",
              fontSize: 13,
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                minWidth: 520,
              }}
            >
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "8px 10px",
                      borderBottom: "1px solid #e5e7eb",
                    }}
                  >
                    Category
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      padding: "8px 10px",
                      borderBottom: "1px solid #e5e7eb",
                    }}
                  >
                    Total donated
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      padding: "8px 10px",
                      borderBottom: "1px solid #e5e7eb",
                    }}
                  >
                    To fundraisers
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      padding: "8px 10px",
                      borderBottom: "1px solid #e5e7eb",
                    }}
                  >
                    Platform share
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      padding: "8px 10px",
                      borderBottom: "1px solid #e5e7eb",
                    }}
                  >
                    Platform %
                  </th>
                </tr>
              </thead>
              <tbody>
                {Object.values(aggregates.byCategory).map((cat) => {
                  const pct =
                    cat.gross > 0
                      ? (cat.platform / cat.gross) * 100
                      : 0;
                  return (
                    <tr key={cat.key}>
                      <td
                        style={{
                          padding: "8px 10px",
                          borderBottom: "1px solid #f3f4f6",
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>{cat.label}</div>
                      </td>
                      <td
                        style={{
                          padding: "8px 10px",
                          borderBottom: "1px solid #f3f4f6",
                          textAlign: "right",
                        }}
                      >
                        {fmtINR(cat.gross)}
                      </td>
                      <td
                        style={{
                          padding: "8px 10px",
                          borderBottom: "1px solid #f3f4f6",
                          textAlign: "right",
                        }}
                      >
                        {fmtINR(cat.fundraiser)}
                      </td>
                      <td
                        style={{
                          padding: "8px 10px",
                          borderBottom: "1px solid #f3f4f6",
                          textAlign: "right",
                        }}
                      >
                        {fmtINR(cat.platform)}
                      </td>
                      <td
                        style={{
                          padding: "8px 10px",
                          borderBottom: "1px solid #f3f4f6",
                          textAlign: "right",
                          color: "#6b7280",
                        }}
                      >
                        {pct.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recent donations list */}
      <section
        style={{
          background: "#ffffff",
          borderRadius: 12,
          padding: 16,
          border: "1px solid #e5e7eb",
          marginBottom: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 600,
              color: "#111827",
            }}
          >
            Recent donations
          </h2>
          <span style={{ fontSize: 11, color: "#6b7280" }}>
            Showing up to {Math.min(filteredDonations.length, 50)} entries
          </span>
        </div>

        {filteredDonations.length === 0 ? (
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            No donations found for this period.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filteredDonations.slice(0, 50).map((d) => {
              const gross =
                Number(
                  d.amount ??
                    d.grossAmount ??
                    d.donatedAmount ??
                    d.total ??
                    d.rawAmount ??
                    0
                ) || 0;
              const fundraiser =
                Number(d.fundraiserShare ?? d.creatorShare ?? 0) || 0;
              const platform =
                Number(
                  d.platformShare ??
                    (Number(d.platformTaxes ?? 0) +
                      Number(d.platformEventsFund ?? 0))
                ) || 0;

              let catLabel = "Other";
              if (d.splitMeta && d.splitMeta.categoryLabel) {
                catLabel = d.splitMeta.categoryLabel;
              } else if (d.campaignType) {
                catLabel = getCategoryFeeConfig(d.campaignType).label;
              }

              const title =
                d.campaignTitle ||
                (d.campaignId
                  ? `Campaign (${String(d.campaignId).slice(0, 6)})`
                  : "Campaign");

              return (
                <div
                  key={d.id}
                  style={{
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    padding: 10,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "#111827",
                        marginBottom: 2,
                        cursor: d.campaignId ? "pointer" : "default",
                      }}
                      onClick={() =>
                        d.campaignId &&
                        navigate(`/campaign/${d.campaignId}`)
                      }
                    >
                      {title}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                        marginBottom: 2,
                      }}
                    >
                      {fmtDate(d.createdAt || d.donatedAt)}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "#4b5563",
                      }}
                    >
                      Category: <strong>{catLabel}</strong>
                    </div>
                  </div>

                  <div
                    style={{
                      textAlign: "right",
                      fontSize: 12,
                      minWidth: 180,
                    }}
                  >
                    <div>
                      <span style={{ color: "#6b7280" }}>Donated: </span>
                      <strong>{fmtINR(gross)}</strong>
                    </div>
                    <div>
                      <span style={{ color: "#6b7280" }}>
                        To fundraiser:{" "}
                      </span>
                      <strong>{fmtINR(fundraiser)}</strong>
                    </div>
                    <div>
                      <span style={{ color: "#6b7280" }}>Platform: </span>
                      <strong>{fmtINR(platform)}</strong>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div
        style={{
          fontSize: 11,
          color: "#9ca3af",
          textAlign: "right",
        }}
      >
        Need export for CSR reporting (PDF/Excel)? – This can be added later
        from the same data.
      </div>
    </div>
  );
}
