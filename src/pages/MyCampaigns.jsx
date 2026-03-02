import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";

/**
 * MyCampaigns
 * - Shows campaigns created by the logged-in user
 * - Read-only viewer page (edit handled elsewhere)
 */
export default function MyCampaigns() {
  const navigate = useNavigate();
  const { currentUser, loading: authLoading } = useAuth();

  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

  /* ================= FETCH MY CAMPAIGNS ================= */
  useEffect(() => {
    if (!currentUser) return;

    setLoading(true);

    const q = query(
      collection(db, "campaigns"),
      where("creatorId", "==", currentUser.uid),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setCampaigns(list);
        setLoading(false);
      },
      (err) => {
        console.error("MyCampaigns fetch error:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [currentUser]);

  /* ================= DERIVED ================= */
  const hasCampaigns = useMemo(
    () => Array.isArray(campaigns) && campaigns.length > 0,
    [campaigns]
  );

  /* ================= GUARDS ================= */
  if (authLoading) return <div className="p-6">Loading…</div>;

  if (!currentUser) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-xl font-semibold mb-2">Login required</h2>
        <p className="text-gray-500 mb-4">
          Please login to view your campaigns.
        </p>
        <button className="btn" onClick={() => navigate("/login")}>
          Login
        </button>
      </div>
    );
  }

  /* ================= UI ================= */
  return (
    <div className="max-w-6xl mx-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">My Campaigns</h1>
          <p className="text-sm text-gray-500">
            Campaigns you have created on GiveAura
          </p>
        </div>

        <button
          className="btn"
          onClick={() => navigate("/create")}
        >
          ✨ Create New Campaign
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-gray-500">Loading your campaigns…</div>
      ) : !hasCampaigns ? (
        <div className="bg-white rounded p-6 text-center shadow-sm">
          <h3 className="text-lg font-semibold mb-2">
            You haven’t created any campaigns yet
          </h3>
          <p className="text-gray-500 mb-4">
            Start a campaign to raise funds or support a cause.
          </p>
          <button
            className="btn"
            onClick={() => navigate("/create")}
          >
            Create Campaign
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((c) => (
            <div
              key={c.id}
              className="bg-white rounded shadow-sm overflow-hidden hover:shadow-md transition"
            >
              {/* Cover */}
              <div
                style={{
                  height: 160,
                  backgroundImage: `url(${c.coverImage || "/placeholder.jpg"})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              />

              {/* Body */}
              <div className="p-3">
                <h3 className="font-semibold text-lg line-clamp-2">
                  {c.title || "Untitled campaign"}
                </h3>

                <div className="text-sm text-gray-500 mt-1">
                  Category: {c.category || "General"}
                </div>

                <div className="mt-2 text-sm">
                  ₹{Number(c.raisedAmount || 0).toLocaleString()} raised
                  {c.targetAmount && (
                    <>
                      {" "}
                      of ₹{Number(c.targetAmount).toLocaleString()}
                    </>
                  )}
                </div>

                {c.endDate && (
                  <div className="text-xs text-gray-500 mt-1">
                    Ends on{" "}
                    {new Date(
                      c.endDate.seconds
                        ? c.endDate.seconds * 1000
                        : c.endDate
                    ).toLocaleDateString()}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 mt-3">
                  <button
                    className="btn-outline flex-1"
                    onClick={() => navigate(`/campaign/${c.id}`)}
                  >
                    View
                  </button>

                  <button
                    className="btn flex-1"
                    onClick={() => navigate(`/campaign/${c.id}/edit`)}
                  >
                    Edit
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
