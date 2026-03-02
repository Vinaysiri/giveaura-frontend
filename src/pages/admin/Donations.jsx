// src/pages/admin/Donations.jsx
import React, { useEffect, useState, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import Modal from "./admincomponents/Modal.jsx";
import LoadingSpinner from "./admincomponents/LoadingSpinner.jsx";
import {
  getRecentDonations,
  getDonationsByCampaign,
  getCampaigns,
} from "../../services/firestoreService";
import {
  collection,
  query,
  where,
  getDocs,
  collectionGroup,
} from "firebase/firestore";
import { db, auth } from "../../firebase";
import "./styles/modal.css";
import { getFunctions, httpsCallable } from "firebase/functions";

/* Admin Donations page - robust & defensive version */

const DEFAULT_FETCH_LIMIT = 50;
const FETCH_TIMEOUT_MS = 12_000; // 12s defensive timeout

function withTimeout(promiseFactory, ms = FETCH_TIMEOUT_MS) {
  const p =
    typeof promiseFactory === "function"
      ? promiseFactory()
      : promiseFactory;
  let id;
  const timeout = new Promise((_, reject) => {
    id = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
  });
  return Promise.race([
    p.then(
      (r) => {
        clearTimeout(id);
        return r;
      },
      (e) => {
        clearTimeout(id);
        throw e;
      }
    ),
    timeout,
  ]);
}

export default function Donations() {
  const mountedRef = useRef(true);
  const location = useLocation();

  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState([]);
  const [donations, setDonations] = useState([]);
  const [filterCampaign, setFilterCampaign] = useState("");
  const [search, setSearch] = useState("");
  const [selectedDonation, setSelectedDonation] = useState(null);
  const [doing, setDoing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // donor aggregate stats for modal
  const [donorStats, setDonorStats] = useState({
    loading: false,
    total: 0,
    count: 0,
  });

  // query-based filter (e.g. ?filter=pending)
  const [queryFilter, setQueryFilter] = useState("");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // watch location.search and update queryFilter reactively
  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search || "");
      const f = (params.get("filter") || "").trim().toLowerCase();
      setQueryFilter(f);
    } catch {
      setQueryFilter("");
    }
  }, [location.search]);

  // load campaigns once (defensive)
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (typeof getCampaigns !== "function")
          throw new Error("getCampaigns helper not available");
        const camps = await withTimeout(() => getCampaigns());
        if (!active || !mountedRef.current) return;
        setCampaigns(Array.isArray(camps) ? camps : []);
      } catch (err) {
        console.warn("[Donations] getCampaigns failed:", err);
        if (active && mountedRef.current) setCampaigns([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // fetch donations (depending on filterCampaign)
  const fetchDonations = async (opts = {}) => {
    const { limit = DEFAULT_FETCH_LIMIT } = opts;
    setLoading(true);
    setErrorMsg(null);
    try {
      let list = [];
      if (filterCampaign) {
        if (typeof getDonationsByCampaign !== "function")
          throw new Error("getDonationsByCampaign helper not available");
        list = await withTimeout(() =>
          getDonationsByCampaign(filterCampaign)
        );
      } else {
        if (typeof getRecentDonations !== "function")
          throw new Error("getRecentDonations helper not available");
        list = await withTimeout(() => getRecentDonations(limit));
      }
      if (!mountedRef.current) return;
      setDonations(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error("[Donations] fetchDonations failed:", err);
      if (mountedRef.current) {
        setDonations([]);
        setErrorMsg(err?.message || String(err));
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  // initial load and whenever filter changes
  useEffect(() => {
    fetchDonations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCampaign]);

  // derived visible list: apply queryFilter (pending) + search filter on client
  const visible = useMemo(() => {
    let base = donations || [];

    // if query filter asks for pending, keep only unsettled items
    if (queryFilter === "pending") {
  // OLD FLOW: all donations are pending until admin marks settled
  base = base.filter((d) => !d?.settlement?.status);
}


    if (!search) return base;
    const s = search.trim().toLowerCase();
    return base.filter((d) => {
      const donorName = (d?.donorName || "").toString().toLowerCase();
      const donorEmail = (d?.donorEmail || "").toString().toLowerCase();
      const paymentId = (d?.paymentId || d?.orderId || "")
        .toString()
        .toLowerCase();
      const campaignTitle = (d?.campaignTitle || "")
        .toString()
        .toLowerCase();
      const orderId = (d?.orderId || "").toString().toLowerCase();
      return (
        donorName.includes(s) ||
        donorEmail.includes(s) ||
        paymentId.includes(s) ||
        orderId.includes(s) ||
        campaignTitle.includes(s)
      );
    });
  }, [donations, search, queryFilter]);

  const fmtINR = (n) => {
    try {
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }).format(Math.round(Number(n || 0)));
    } catch {
      return `₹${Math.round(n || 0)}`;
    }
  };

  const formatDate = (v) => {
    try {
      if (!v) return "—";
      const d =
        v?.toDate && typeof v.toDate === "function"
          ? v.toDate()
          : new Date(v);
      return isNaN(d.getTime()) ? "—" : d.toLocaleString();
    } catch {
      return "—";
    }
  };

  const refresh = async () => {
    await fetchDonations();
  };

  // mark donation as settled — uses Cloud Function callable, with HTTP fallback.
  const settleDonation = async (donation) => {
    if (!donation?.id || !donation?.campaignId) return;
    if (!window.confirm("Mark this donation as SETTLED?")) return;
    setDoing(true);

    const payload = {
      donationId: donation.id,
      campaignId: donation.campaignId,
      note: `Manual settlement by ${auth?.currentUser?.uid || "admin-ui"}`,
    };

    try {
      // 1) Try callable function (preferred)
      try {
        // Target region explicitly in case your functions are deployed to asia-southeast1
        // If your firebase app export exposes `app`, you can pass that as first arg.
        const functions = getFunctions(undefined, "asia-southeast1");
        const fn = httpsCallable(functions, "settleDonationCallable");
        console.debug("[Donations] calling settleDonationCallable", payload);
        const res = await fn(payload);
        console.debug("[Donations] settleDonationCallable response:", res);

        // Expect res.data.ok / res.data.result
        if (res && res.data && res.data.ok) {
          const result = res.data.result || {};
          // update local UI
          setDonations((prev) =>
            prev.map((d) => {
              if (d?.id !== donation.id) return d;
              const copy = {
                ...d,
                settlement: {
                  ...(d.settlement || {}),
                  status: "settled",
                  settledBy: result.settledBy || payload.note,
                },
              };
              try {
                copy.settlement.settledAt = { toDate: () => new Date() };
              } catch {}
              return copy;
            })
          );
          alert("Donation marked as settled (server).");
          return;
        } else {
          console.warn("[Donations] callable returned unexpected shape:", res);
          // fall through to HTTP fallback
        }
      } catch (callErr) {
        console.warn("[Donations] settleDonationCallable failed:", callErr);
        // fall through to HTTP fallback
      }

      // 2) HTTP POST fallback to your express endpoint at /api/settleDonation (requires idToken)
      try {
        const token = await auth.currentUser.getIdToken();
        // Use relative path to your functions proxy if you deployed exports.api as `api`
        // If your hosted functions base URL is different, set full URL accordingly.
        const functionsUrl = "/api/settleDonation";
        console.debug("[Donations] trying HTTP fallback POST", functionsUrl, payload);
        const r = await fetch(functionsUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
        const j = await r.json().catch(() => null);
        console.debug("[Donations] HTTP fallback response:", r.status, j);
        if (r.ok) {
          // update local UI
          setDonations((prev) =>
            prev.map((d) => {
              if (d?.id !== donation.id) return d;
              const copy = {
                ...d,
                settlement: {
                  ...(d.settlement || {}),
                  status: "settled",
                  settledBy: auth?.currentUser?.uid || "admin-ui",
                },
              };
              try {
                copy.settlement.settledAt = { toDate: () => new Date() };
              } catch {}
              return copy;
            })
          );
          alert("Donation marked as settled (HTTP).");
          return;
        } else {
          console.error("[Donations] HTTP fallback failed:", r.status, j);
          throw new Error(j?.error || j?.details || `HTTP ${r.status}`);
        }
      } catch (httpErr) {
        console.error("[Donations] HTTP fallback error:", httpErr);
        throw httpErr;
      }
    } catch (err) {
      console.error("[Donations] settleDonation failed:", err);
      alert(
        "Failed to settle donation. Check console and Cloud Function logs for details."
      );
    } finally {
      if (mountedRef.current) setDoing(false);
    }
  };

  // fetch donor's aggregate stats (total + count) for popup
  const fetchDonorStats = async (donation) => {
    if (!donation) return;
    const donorId = donation.donorId || null;
    const donorEmail = donation.donorEmail || donation.email || null;

    if (!donorId && !donorEmail) {
      setDonorStats({ loading: false, total: 0, count: 0 });
      return;
    }

    setDonorStats({ loading: true, total: 0, count: 0 });

    try {
      let q;
      // donations are stored in campaigns/*/donations, so we must use collectionGroup
      if (donorId) {
        q = query(
          collectionGroup(db, "donations"),
          where("donorId", "==", donorId)
        );
      } else {
        q = query(
          collectionGroup(db, "donations"),
          where("donorEmail", "==", donorEmail)
        );
      }
      const snap = await getDocs(q);
      let total = 0;
      let count = 0;
      snap.docs.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const amt = Number(data.amount || 0);
        if (!isNaN(amt)) {
          total += amt;
          count += 1;
        }
      });
      if (mountedRef.current) setDonorStats({ loading: false, total, count });
    } catch (err) {
      console.error("[Donations] fetchDonorStats failed:", err);
      if (mountedRef.current)
        setDonorStats({ loading: false, total: 0, count: 0 });
    }
  };

  // export visible to CSV
  const exportCSV = () => {
    if (!visible || visible.length === 0) {
      alert("No rows to export.");
      return;
    }
    const fields = [
      { key: "id", label: "Donation ID" },
      { key: "donorName", label: "Donor Name" },
      { key: "donorEmail", label: "Donor Email" },
      { key: "campaignTitle", label: "Campaign Title" },
      { key: "campaignId", label: "Campaign ID" },
      { key: "amount", label: "Amount" },
      { key: "paymentId", label: "Payment ID" },
      { key: "createdAtMs", label: "Donated At" },
      { key: "settlementStatus", label: "Settlement Status" },
    ];

    const rows = visible.map((r) => ({
      id: r.id || "",
      donorName: r.donorName || "",
      donorEmail: r.donorEmail || "",
      campaignTitle: r.campaignTitle || "",
      campaignId: r.campaignId || "",
      amount: r.amount || 0,
      paymentId: r.paymentId || r.orderId || "",
      donatedAt: r.donatedAt
        ? r.donatedAt.toDate
          ? r.donatedAt.toDate().toISOString()
          : new Date(r.donatedAt).toISOString()
        : "",
      settlementStatus: r.settlement?.status || "",
    }));

    const header = fields
      .map((f) => `"${f.label.replace(/"/g, '""')}"`)
      .join(",");
    const body = rows
      .map((row) =>
        fields
          .map((f) => {
            const v = String(row[f.key] ?? "");
            return `"${v.replace(/"/g, '""')}"`;
          })
          .join(",")
      )
      .join("\n");

    const csv = `${header}\n${body}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const now = new Date().toISOString().replace(/[:.]/g, "-");
    a.download = `donations_export_${now}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // when opening modal, fetch donor stats
  useEffect(() => {
    if (!selectedDonation) {
      setDonorStats({ loading: false, total: 0, count: 0 });
      return;
    }
    fetchDonorStats(selectedDonation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDonation?.id]);

  // render
  return (
    <div>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Donations</h2>
          <p style={{ margin: 0, color: "#6b7280" }}>
            Recent donations — review, export, or settle.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <select
            value={filterCampaign}
            onChange={(e) => setFilterCampaign(e.target.value)}
            className="admin-input"
          >
            <option value="">— All campaigns —</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title || c.id}
              </option>
            ))}
          </select>

          <input
            placeholder="Search donor / email / payment id..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="admin-input"
            style={{ minWidth: 260 }}
          />

          <button className="btn-outline" onClick={refresh}>
            Refresh
          </button>
          <button className="btn" onClick={exportCSV}>
            Export CSV
          </button>
        </div>
      </header>

      {loading ? (
        <div
          style={{
            padding: 24,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <LoadingSpinner size={36} />
        </div>
      ) : errorMsg ? (
        <div style={{ color: "#b91c1c", padding: 12 }}>
          <strong>Error:</strong> {errorMsg}. Check console for details.
        </div>
      ) : visible.length === 0 ? (
        <div style={{ color: "#6b7280" }}>No donations found.</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {visible.map((d) => (
            <div
              key={
                d.id ||
                `${d.campaignId}_${d.paymentId || Math.random()}`
              }
              className="card"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: 12,
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>
                  {d.donorName || d.donorEmail || "Anonymous"}
                </div>
                <div
                  style={{
                    color: "#6b7280",
                    fontSize: 13,
                    marginTop: 4,
                  }}
                >
                  {d.donorEmail ? `${d.donorEmail} • ` : ""}
                  {d.campaignTitle
                    ? `${d.campaignTitle} (${d.campaignId})`
                    : d.campaignId}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 13,
                    color: "#374151",
                  }}
                >
                  {d.paymentId
                    ? `Payment: ${d.paymentId}`
                    : d.orderId
                    ? `Order: ${d.orderId}`
                    : ""}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  minWidth: 220,
                  justifyContent: "flex-end",
                }}
              >
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 700 }}>
                    {fmtINR(d.amount || 0)}
                  </div>
                  <div
                    style={{
                      color: "#6b7280",
                      fontSize: 12,
                    }}
                  >
                    {formatDate(d.createdAt || d.createdAtMs)}
                  </div>
                </div>

                <div style={{ textAlign: "right", minWidth: 110 }}>
                  <div
                    style={{
                      fontSize: 12,
                      color:
                        d.settlement?.status === "settled"
                          ? "#065f46"
                          : "#9ca3af",
                      fontWeight: 700,
                    }}
                  >
                    {d.settlement?.status
                      ? d.settlement.status.toUpperCase()
                      : "UNSETTLED"}
                  </div>
                  {d.settlement?.settledAt ? (
                    <div
                      style={{
                        fontSize: 11,
                        color: "#6b7280",
                      }}
                    >
                      {formatDate(d.settlement.settledAt)}
                    </div>
                  ) : null}
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <button
                    className="btn small-btn"
                    onClick={() => setSelectedDonation(d)}
                  >
                    View
                  </button>
                  <button
                    className="btn-outline small-btn"
                    disabled={doing || d.settlement?.status === "settled"}
                    onClick={() => settleDonation(d)}
                  >
                    {doing ? "Working…" : "Settle"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!selectedDonation}
        title={
          selectedDonation ? `Donation: ${selectedDonation.id}` : ""
        }
        onClose={() => setSelectedDonation(null)}
      >
        {selectedDonation && (
          <div style={{ display: "grid", gap: 8 }}>
            <div>
              <strong>Donor:</strong>{" "}
              {selectedDonation.donorName || "—"}
            </div>
            <div>
              <strong>Email:</strong>{" "}
              {selectedDonation.donorEmail || "—"}
            </div>
            <div>
              <strong>Campaign:</strong>{" "}
              {selectedDonation.campaignTitle ||
                selectedDonation.campaignId ||
                "—"}
            </div>
            <div>
              <strong>Amount:</strong>{" "}
              {fmtINR(selectedDonation.amount || 0)}
            </div>
            <div>
              <strong>Payment / Order ID:</strong>{" "}
              {selectedDonation.paymentId ||
                selectedDonation.orderId ||
                "—"}
            </div>
            <div>
              <strong>Donated at:</strong>{" "}
              {formatDate(
                selectedDonation.createdAt || selectedDonation.createdAtMs
              )}

            </div>
            <div>
              <strong>Settlement status:</strong>{" "}
              {selectedDonation.settlement?.status || "—"}
            </div>
            {selectedDonation.settlement?.settledAt && (
              <div>
                <strong>Settled at:</strong>{" "}
                {formatDate(selectedDonation.settlement.settledAt)}
              </div>
            )}
            {selectedDonation.note && (
              <div>
                <strong>Note:</strong>
                <div style={{ whiteSpace: "pre-line" }}>
                  {selectedDonation.note}
                </div>
              </div>
            )}

            <hr />

            <div>
              <strong>Donor totals</strong>
              {donorStats.loading ? (
                <div style={{ marginTop: 8 }}>
                  <LoadingSpinner size={18} /> Loading donor totals…
                </div>
              ) : (
                <div style={{ marginTop: 8 }}>
                  <div>
                    <strong>Total donated:</strong>{" "}
                    {fmtINR(donorStats.total || 0)}
                  </div>
                  <div>
                    <strong>Number of donations:</strong>{" "}
                    {donorStats.count ?? 0}
                  </div>
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 8,
              }}
            >
              <button
                className="btn-outline"
                onClick={() => setSelectedDonation(null)}
              >
                Close
              </button>
              <button
                className="btn"
                onClick={() => {
                  settleDonation(selectedDonation);
                  setSelectedDonation(null);
                }}
              >
                Settle
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
