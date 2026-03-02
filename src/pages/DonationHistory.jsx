// src/pages/DonationHistory.jsx
import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { listenToUserDonations } from "../services/firestoreService";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { useNavigate } from "react-router-dom";

/**
 * DonationHistory
 * - Uses listenToUserDonations helper to subscribe to the current user's donations
 *   (this should already be wired to the correct collection/collectionGroup).
 * - Fetches campaign titles once from /campaigns for nicer display.
 * - Computes total donated and renders a simple table.
 */

export default function DonationHistory() {
  const { currentUser } = useAuth();
  const [donations, setDonations] = useState([]);
  const [campaignMap, setCampaignMap] = useState({});
  const [totalDonated, setTotalDonated] = useState(0);
  const navigate = useNavigate();

  // Subscribe to this user's donations via helper
  useEffect(() => {
    if (!currentUser?.uid) {
      setDonations([]);
      setTotalDonated(0);
      return;
    }

    // listenToUserDonations is expected to handle
    // correct Firestore paths & filters internally
    const unsub = listenToUserDonations(currentUser.uid, (list) => {
      const safeList = Array.isArray(list) ? list : [];
      setDonations(safeList);
      const total = safeList.reduce(
        (sum, d) => sum + (Number(d.amount) || 0),
        0
      );
      setTotalDonated(total);
    });

    return () => {
      try {
        typeof unsub === "function" && unsub();
      } catch {
        // ignore
      }
    };
  }, [currentUser?.uid]);

  // Fetch campaigns map once for title lookup
  useEffect(() => {
    let mounted = true;

    const fetchCampaigns = async () => {
      try {
        const snap = await getDocs(collection(db, "campaigns"));
        const map = {};
        snap.docs.forEach((docSnap) => {
          const data = docSnap.data() || {};
          map[docSnap.id] =
            data.title || `Campaign (${docSnap.id.slice(0, 6)})`;
        });
        if (mounted) setCampaignMap(map);
      } catch (err) {
        console.error("Failed to fetch campaigns:", err);
      }
    };

    fetchCampaigns();
    return () => {
      mounted = false;
    };
  }, []);

  const toMs = (ts) => {
    if (!ts) return 0;
    if (typeof ts === "number") return ts;
    if (ts?.toDate && typeof ts.toDate === "function") {
      const d = ts.toDate();
      return isNaN(d.getTime()) ? 0 : d.getTime();
    }
    if (ts?.seconds) {
      return (
        ts.seconds * 1000 +
        (ts.nanoseconds ? Math.round(ts.nanoseconds / 1e6) : 0)
      );
    }
    const d = new Date(ts);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  };

  const formatDate = (ts) => {
    const ms = toMs(ts);
    if (!ms) return "Unknown";
    return new Date(ms).toLocaleString();
  };

  if (!currentUser) {
    return (
      <p style={{ padding: 20 }}>
        Please log in to view your donation history.
      </p>
    );
  }

  // Sort donations newest → oldest for display
  const sortedDonations = [...donations].sort(
    (a, b) =>
      toMs(b.donatedAt || b.createdAt || b.timestamp) -
      toMs(a.donatedAt || a.createdAt || a.timestamp)
  );

  return (
    <div
      style={{
        padding: "20px",
        fontFamily:
          "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Arial",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>
            {currentUser.email}&apos;s Donation History
          </h2>
          <div style={{ color: "#6b7280", fontSize: 13 }}>
            {sortedDonations.length} donation(s) • Total donated:{" "}
            <strong>
              ₹{totalDonated.toLocaleString("en-IN")}
            </strong>
          </div>
        </div>

        <div>
          <button
            onClick={() => navigate("/")}
            style={{
              background: "#2563eb",
              color: "white",
              padding: "8px 14px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
            }}
            onMouseOver={(e) =>
              (e.currentTarget.style.background = "#1d4ed8")
            }
            onMouseOut={(e) =>
              (e.currentTarget.style.background = "#2563eb")
            }
          >
            ← Back
          </button>
        </div>
      </div>

      {sortedDonations.length === 0 ? (
        <p>
          You haven&apos;t donated yet (or no matching donation
          documents were found for this account).
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              marginTop: 8,
            }}
          >
            <thead>
              <tr>
                <th style={thStyle}>Campaign</th>
                <th style={thStyle}>Amount</th>
                <th style={thStyle}>Donor</th>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Payment / Note</th>
              </tr>
            </thead>
            <tbody>
              {sortedDonations.map((d) => (
                <tr key={d.id}>
                  <td style={tdStyle}>
                    {campaignMap[d.campaignId] ||
                      d.campaignTitle ||
                      d.campaignId ||
                      "—"}
                  </td>
                  <td style={tdStyle}>
                    ₹
                    {Number(d.amount || 0).toLocaleString("en-IN")}
                  </td>
                  <td style={tdStyle}>
                    {d.donorName ||
                      d.donorEmail ||
                      d.email ||
                      "Anonymous"}
                  </td>
                  <td style={tdStyle}>
                    {formatDate(
                      d.createdAt
                    )}
                  </td>
                  <td style={tdStyle}>
                    {d.paymentId ||
                      d.orderId ||
                      d.signature ||
                      d.note ||
                      "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// small helpers/styles
const thStyle = {
  border: "1px solid #e6e6e6",
  padding: "10px",
  textAlign: "left",
  background: "#fafafa",
};
const tdStyle = {
  border: "1px solid #eee",
  padding: "10px",
  verticalAlign: "top",
};
