// src/pages/Wallet.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Import as namespaces so missing functions won't break build
import * as walletService from "../services/walletService";
import * as boostService from "../services/boostService";
import GiveAuraLoader from "../components/GiveAuraLoader";

const fmtINR = (n) => {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(Math.round(Number(n || 0)));
  } catch {
    return `₹${Math.round(Number(n || 0))}`;
  }
};

export default function Wallet() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState({
    available: 0,
    pending: 0,
    lifetime: 0,
    campaignsEarnings: 0,
    csrEarnings: 0,
    boostsSpent: 0,
    subscriptionsSpent: 0,
  });
  const [activity, setActivity] = useState([]);
  const [error, setError] = useState(null);

  // Redirect if somehow not logged in (ProtectedRoute should already handle)
  useEffect(() => {
    if (!currentUser) {
      navigate("/login");
    }
  }, [currentUser, navigate]);

  useEffect(() => {
    if (!currentUser) return;

    let cancelled = false;

    const loadWallet = async () => {
      setLoading(true);
      setError(null);

      try {
        const uid = currentUser.uid;

        let overview = null;
        let logs = [];

        if (typeof walletService.getWalletOverview === "function") {
          overview = await walletService.getWalletOverview(uid);
        } else if (typeof walletService.getWalletOverview === "function") {
          // fallback to walletService if you implemented it there
          overview = await walletService.getWalletOverview(uid);
        }

        if (typeof walletService.getWalletActivity === "function") {
          logs = await walletService.getWalletActivity(uid);
        } else if (typeof walletService.getWalletActivity === "function") {
          logs = await walletService.getWalletActivity(uid);
        }

        // If no backend yet, keep some nice example values
        const safeOverview = overview || {
          available: 0,
          pending: 0,
          lifetime: 0,
          campaignsEarnings: 0,
          csrEarnings: 0,
          boostsSpent: 0,
          subscriptionsSpent: 0,
        };

        if (!cancelled) {
          setWallet({
            available: Number(safeOverview.available || 0),
            pending: Number(safeOverview.pending || 0),
            lifetime: Number(safeOverview.lifetime || 0),
            campaignsEarnings: Number(safeOverview.campaignsEarnings || 0),
            csrEarnings: Number(safeOverview.csrEarnings || 0),
            boostsSpent: Number(safeOverview.boostsSpent || 0),
            subscriptionsSpent: Number(safeOverview.subscriptionsSpent || 0),
          });
          setActivity(Array.isArray(logs) ? logs : []);
        }
      } catch (err) {
        console.warn("[Wallet] loadWallet failed:", err);
        if (!cancelled) {
          setError(
            err?.message || "Failed to load wallet data. Please try again."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadWallet();
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  const totalLocked =
    Number(wallet.pending || 0) +
    Number(wallet.boostsSpent || 0) +
    Number(wallet.subscriptionsSpent || 0);

  return (
    <div
      style={{
        padding: "20px 16px 40px",
        maxWidth: 1100,
        margin: "0 auto",
        fontFamily: "'Poppins', system-ui, -apple-system, BlinkMacSystemFont",
      }}
    >
      <header
  style={{
    display: "flex",
    flexDirection: "column",
    gap: 12,
    marginBottom: 18,
  }}
>
  {/* Top row: Back + actions */}
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 10,
    }}
  >
    <button
      type="button"
      onClick={() => navigate(-1)}
      className="btn"
      style={{
        padding: "6px 8px",
        borderRadius: 8,
        border: "1px solid #e5e7eb",
        background: "#ffffff",
        color: "#111827",
        fontSize: 12,
        lineHeight: 1,
      }}
    >
      ← Back
    </button>

    <div style={{ display: "flex", gap: 8 }}>
      <button
        type="button"
        onClick={() => navigate("/boost-plans")}
        className="btn"
        style={{
          padding: "6px 10px",
          borderRadius: 8,
          border: "none",
          background: "#0f766e",
          color: "#ffffff",
          fontWeight: 600,
          fontSize: 12,
        }}
      >
        Boost
      </button>

      <button
        type="button"
        onClick={() => navigate("/subscriptions")}
        className="btn"
        style={{
          padding: "6px 10px",
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          background: "#ffffff",
          color: "#111827",
          fontWeight: 500,
          fontSize: 12,
        }}
      >
        Subs
      </button>
    </div>
  </div>

  {/* Title */}
  <div>
    <h1
      style={{
        margin: 0,
        fontSize: 18,
        fontWeight: 700,
        color: "#0f172a",
      }}
    >
      Creator Wallet
    </h1>

    {/* Hide description on mobile */}
    <p
      style={{
        marginTop: 4,
        fontSize: 12,
        color: "#ffffff",
        maxWidth: 480,
        display: window.innerWidth < 640 ? "none" : "block",
      }}
    >
      Track earnings from campaigns, CSR partnerships, boosts and subscriptions.
    </p>
  </div>
</header>


      {loading ? (
        <div
          style={{
            marginTop: 40,
            textAlign: "center",
            color: "#6b7280",
            fontSize: 14,
          }}
        >
          <GiveAuraLoader/>
          <div style={{ marginTop: 12 }}>Loading wallet data...</div>
        </div>
      ) : error ? (
        <div
          style={{
            marginTop: 20,
            padding: 12,
            borderRadius: 10,
            background: "#fef2f2",
            color: "#b91c1c",
            fontSize: 14,
          }}
        >
          ⚠️ {error}
        </div>
      ) : (
        <>
          {/* Top summary cards */}
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
              gap: 16,
              marginBottom: 22,
            }}
          >
            <div
              style={{
                padding: 16,
                borderRadius: 14,
                background:
                  "radial-gradient(circle at top left,#22c55e1a 0,#ffffff 55%)",
                border: "1px solid #dcfce7",
                boxShadow: "0 8px 20px rgba(22,163,74,0.06)",
              }}
            >
              <div
                style={{ fontSize: 13, color: "#16a34a", fontWeight: 600 }}
              >
                Available balance
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 26,
                  fontWeight: 700,
                  color: "#0f172a",
                }}
              >
                {fmtINR(wallet.available)}
              </div>
              <p
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: "#6b7280",
                  lineHeight: 1.5,
                }}
              >
                Ready to withdraw or reinvest in boosts, events and
                subscriptions.
              </p>
              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  className="btn"
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: "none",
                    fontSize: 12,
                    background:
                      "linear-gradient(90deg,#22c55e,#16a34a,#22c55e)",
                    color: "#fff",
                    fontWeight: 600,
                  }}
                  onClick={() =>
                    alert(
                      "Payout flow not wired yet. Connect this to your bank withdrawal logic."
                    )
                  }
                >
                  ⬇ Withdraw to bank
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: "1px solid #bbf7d0",
                    background: "#ecfdf5",
                    color: "#166534",
                    fontSize: 12,
                  }}
                  onClick={() => navigate("/boost-plans")}
                >
                  🔁 Use for Boost plan
                </button>
              </div>
            </div>

            <div
              style={{
                padding: 16,
                borderRadius: 14,
                background:
                  "radial-gradient(circle at top left,#e5e7eb 0,#ffffff 55%)",
                border: "1px solid #e5e7eb",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  color: "#4b5563",
                  fontWeight: 600,
                }}
              >
                Pending & locked
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 20,
                  fontWeight: 700,
                  color: "#0f172a",
                }}
              >
                {fmtINR(totalLocked)}
              </div>
              <ul
                style={{
                  margin: "10px 0 0",
                  paddingLeft: 18,
                  fontSize: 12,
                  color: "#6b7280",
                  lineHeight: 1.6,
                }}
              >
                <li>Withdrawals under review & payment gateway hold</li>
                <li>Boost / subscription spends in current cycle</li>
              </ul>
            </div>

            <div
              style={{
                padding: 16,
                borderRadius: 14,
                background:
                  "radial-gradient(circle at top left,#dbeafe 0,#ffffff 55%)",
                border: "1px solid #bfdbfe",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  color: "#2563eb",
                  fontWeight: 600,
                }}
              >
                Lifetime earnings
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 22,
                  fontWeight: 700,
                  color: "#1d4ed8",
                }}
              >
                {fmtINR(wallet.lifetime)}
              </div>
              <p
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: "#4b5563",
                }}
              >
                Total received from campaigns, CSR donations and recurring
                support.
              </p>
            </div>
          </section>

          {/* Split view: Campaigns vs CSR / subscriptions / boosts */}
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)",
              gap: 18,
              marginBottom: 26,
            }}
          >
            <div
              style={{
                padding: 16,
                borderRadius: 14,
                background: "#ffffff",
                border: "1px solid #e5e7eb",
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: 15,
                  fontWeight: 600,
                  color: "#111827",
                }}
              >
                Campaign earnings
              </h2>
              <p
                style={{
                  margin: "4px 0 10px",
                  fontSize: 12,
                  color: "#6b7280",
                }}
              >
                Net earnings from your public campaigns on GiveAura.
              </p>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: 4,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 12,
                      textTransform: "uppercase",
                      letterSpacing: "0.03em",
                      color: "#9ca3af",
                    }}
                  >
                    Total from campaigns
                  </div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      color: "#111827",
                    }}
                  >
                    {fmtINR(wallet.campaignsEarnings)}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn"
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: "1px solid #e5e7eb",
                    background: "#f9fafb",
                    color: "#111827",
                    fontSize: 12,
                  }}
                  onClick={() => navigate("/donations")}
                >
                  📊 View donation history
                </button>
              </div>
            </div>

            <div
              style={{
                padding: 16,
                borderRadius: 14,
                background: "#ffffff",
                border: "1px solid #e5e7eb",
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: 15,
                  fontWeight: 600,
                  color: "#111827",
                }}
              >
                CSR & recurring support
              </h2>
              <p
                style={{
                  margin: "4px 0 10px",
                  fontSize: 12,
                  color: "#6b7280",
                }}
              >
                Donations from CSR partners and subscribers.
              </p>

              <div style={{ fontSize: 12, color: "#6b7280" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <span>CSR / corporate contributions</span>
                  <strong>{fmtINR(wallet.csrEarnings)}</strong>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <span>Subscriptions (supporters)</span>
                  <strong>{fmtINR(wallet.subscriptionsSpent * -1)}</strong>
                </div>
              </div>

              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <button
                  type="button"
                  onClick={() => navigate("/csr-dashboard")}
                  className="btn"
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: "none",
                    background:
                      "linear-gradient(90deg,#0ea5e9,#6366f1,#0ea5e9)",
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  🏢 Open CSR dashboard
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/subscriptions")}
                  className="btn"
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    color: "#111827",
                    fontSize: 12,
                  }}
                >
                  🔁 View subscriptions
                </button>
              </div>
            </div>
          </section>

          {/* Activity log */}
          <section
            style={{
              padding: 16,
              borderRadius: 14,
              background: "#ffffff",
              border: "1px solid #e5e7eb",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: 15,
                  fontWeight: 600,
                  color: "#111827",
                }}
              >
                Recent activity
              </h2>
              <button
                type="button"
                className="btn"
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid #e5e7eb",
                  background: "#f9fafb",
                  color: "#111827",
                  fontSize: 12,
                }}
                onClick={() => navigate("/marketplace")}
              >
                🛒 Explore marketplace
              </button>
            </div>

            {activity.length === 0 ? (
              <div
                style={{
                  padding: 12,
                  borderRadius: 10,
                  background: "#f9fafb",
                  fontSize: 13,
                  color: "#6b7280",
                }}
              >
                No wallet activity yet. Once you start receiving donations or
                using boosts/subscriptions, they will appear here.
              </div>
            ) : (
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  fontSize: 13,
                  color: "#374151",
                }}
              >
                {activity.slice(0, 15).map((item, idx) => {
                  const type = item.type || "other";
                  const isCredit = item.direction === "credit";
                  const label =
                    item.label ||
                    (type === "payout"
                      ? "Payout to bank"
                      : type === "donation-credit"
                      ? "Donation credit"
                      : type === "boost"
                      ? "Boost plan"
                      : type === "subscription"
                      ? "Subscription"
                      : "Wallet activity");
                  const ts = item.createdAt
                    ? new Date(item.createdAt)
                    : null;

                  return (
                    <li
                      key={item.id || idx}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "8px 0",
                        borderBottom:
                          idx === activity.length - 1
                            ? "none"
                            : "1px solid #f3f4f6",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 500 }}>{label}</div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "#9ca3af",
                            marginTop: 2,
                          }}
                        >
                          {ts
                            ? ts.toLocaleString()
                            : item.meta?.note || "—"}
                        </div>
                      </div>
                      <div
                        style={{
                          fontWeight: 600,
                          color: isCredit ? "#16a34a" : "#b91c1c",
                          fontSize: 13,
                        }}
                      >
                        {isCredit ? "+" : "-"}
                        {fmtINR(item.amount || 0)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
