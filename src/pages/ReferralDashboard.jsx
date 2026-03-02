import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getMyReferrals } from "../services/referralService";
import { getUserProfile } from "../services/firestoreService";

export default function ReferralDashboard() {
  const { currentUser } = useAuth();
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [earnings, setEarnings] = useState(0);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!currentUser) return;

    (async () => {
      try {
        const list = await getMyReferrals(currentUser.uid);
        setReferrals(list);
        setCount(list.length);

        const profile = await getUserProfile(currentUser.uid);
        setEarnings(Number(profile?.referralEarnings || 0));
      } catch (err) {
        console.error("Referral dashboard load failed", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [currentUser]);

  if (loading) return <div style={{ padding: 20 }}>Loading referrals…</div>;

  return (
    <div style={{ maxWidth: 900, margin: "30px auto", padding: 20 }}>
      <h2>Referral Dashboard</h2>

      {/* SUMMARY */}
      <div style={{ display: "flex", gap: 20, marginBottom: 20 }}>
        <SummaryBox label="Total Referrals" value={count} />
        <SummaryBox label="Total Earnings" value={`₹${earnings}`} />
      </div>

      {/* TABLE */}
      <div style={{ background: "#fff", borderRadius: 8, padding: 15 }}>
        <h4>Your Referrals</h4>

        {referrals.length === 0 ? (
          <p>No referrals yet.</p>
        ) : (
          <table width="100%" cellPadding="10">
            <thead>
              <tr>
                <th align="left">Referred User</th>
                <th>Status</th>
                <th>Campaign</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {referrals.map((r) => (
                <tr key={r.id}>
                  <td>{r.refereeId}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td>{r.campaignId || "-"}</td>
                  <td>
                    {r.createdAt?.toDate
                      ? r.createdAt.toDate().toLocaleDateString()
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ---------------- UI helpers ---------------- */

function SummaryBox({ label, value }) {
  return (
    <div
      style={{
        flex: 1,
        background: "#f8fafc",
        padding: 20,
        borderRadius: 8,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 13, color: "#555" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }) {
  const color =
    status === "rewarded"
      ? "green"
      : status === "campaign_created"
      ? "blue"
      : "gray";

  return (
    <span
      style={{
        padding: "4px 8px",
        borderRadius: 6,
        background: color,
        color: "#fff",
        fontSize: 12,
        textTransform: "capitalize",
      }}
    >
      {status.replace("_", " ")}
    </span>
  );
}
