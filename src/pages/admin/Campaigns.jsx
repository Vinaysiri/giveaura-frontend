// src/pages/admin/Campaigns.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import Modal from "./admincomponents/Modal.jsx";
import "./styles/modal.css";
import {
  updateCampaign as svcUpdateCampaign,
  deleteCampaign as svcDeleteCampaign,
  getCampaigns,
  getUserProfile,
  approveCampaign,
  revokeApproval,
} from "../../services/firestoreService";
import { markCampaignAsPaid } from "../../services/firestoreService";
import "./styles/admin.css";

/* ---------- Small helpers for category / boost labels ---------- */

function getCampaignTypeMeta(type) {
  const key = (type || "personal").toLowerCase();
  switch (key) {
    case "emergency":
      return {
        key,
        label: "Emergency / Crisis",
        badge: "Emergency",
        color: "#fee2e2",
        text: "#b91c1c",
      };
    case "medical":
      return {
        key,
        label: "Medical & Health",
        badge: "Medical",
        color: "#e0f2fe",
        text: "#0369a1",
      };
    case "education":
      return {
        key,
        label: "Education / Student Support",
        badge: "Education",
        color: "#ecfdf5",
        text: "#0f766e",
      };
    case "ngo":
      return {
        key,
        label: "NGO / Social Impact",
        badge: "NGO / Social",
        color: "#f5f3ff",
        text: "#6d28d9",
      };
    case "csr":
      return {
        key,
        label: "CSR / Corporate",
        badge: "CSR",
        color: "#eff6ff",
        text: "#1d4ed8",
      };
    case "personal":
    default:
      return {
        key: "personal",
        label: "Personal / Family Need",
        badge: "Personal",
        color: "#f3f4f6",
        text: "#374151",
      };
  }
}

function getBoostPlanMeta(plan, paid) {
  const key = (plan || "none").toLowerCase();
  const base = {
    key,
    label: "No Boost",
    badge: "No Boost",
    bg: "#e5e7eb",
    text: "#374151",
  };

  if (key === "basic") {
    base.label = "Basic Boost";
    base.badge = paid ? "Basic Boost (Paid)" : "Basic Boost";
    base.bg = "#dcfce7";
    base.text = "#15803d";
  } else if (key === "premium") {
    base.label = "Premium Boost";
    base.badge = paid ? "Premium Boost (Paid)" : "Premium Boost";
    base.bg = "#f5f3ff";
    base.text = "#6d28d9";
  } else if (key === "super") {
    base.label = "Super Boost";
    base.badge = paid ? "Super Boost (Paid)" : "Super Boost";
    base.bg = "#fef3c7";
    base.text = "#b45309";
  }

  if (key === "none") {
    base.badge = "No Boost";
  }

  return base;
}

export default function Campaigns() {
  const mountedRef = useRef(true);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");
  const [refreshKey, setRefreshKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // approve/reject network state per campaign
  const [actionLoading, setActionLoading] = useState({});

  // bank state inside the details modal
  const [bankLoading, setBankLoading] = useState(false);
  const [bankError, setBankError] = useState("");
  const [bankData, setBankData] = useState(null);

  // dedicated bank modal
  const [bankOpen, setBankOpen] = useState(false);
  const [bankOwner, setBankOwner] = useState({ name: "", email: "" });

  // mask / copy states
  const [showAccount, setShowAccount] = useState(false);
  const [copiedAccount, setCopiedAccount] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setErrorMsg(null);

    (async () => {
      try {
        const list =
          typeof getCampaigns === "function" ? await getCampaigns() : [];
        if (!mounted) return;

        const docs = (list || []).map((d) => {
          let createdAt = null;
          try {
            if (d?.createdAt instanceof Date) createdAt = d.createdAt;
            else if (d?.createdAt?.toDate)
              createdAt = d.createdAt.toDate();
            else if (d?.createdAt?.seconds)
              createdAt = new Date(d.createdAt.seconds * 1000);
            else if (typeof d?.createdAt === "number")
              createdAt =
                d.createdAt > 1e12
                  ? new Date(d.createdAt)
                  : new Date(d.createdAt * 1000);
            else if (typeof d?.createdAt === "string") {
              const dt = new Date(d.createdAt);
              createdAt = isNaN(dt.getTime()) ? null : dt;
            }
          } catch {
            createdAt = null;
          }

          const isActive =
            typeof d.isActive === "boolean"
              ? d.isActive
              : typeof d.active === "boolean"
              ? d.active
              : true;

          return {
            ...d,
            createdAt,
            isActive,
          };
        });

        if (mountedRef.current) setCampaigns(docs);
      } catch (err) {
        console.error("fetch getCampaigns failed:", err);
        if (mountedRef.current) {
          setCampaigns([]);
          setErrorMsg(err?.message || String(err));
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [refreshKey]);

  const visible = useMemo(() => {
    const q = campaigns.filter((c) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        (c.title || "").toLowerCase().includes(s) ||
        (c.description || "").toLowerCase().includes(s) ||
        (
          (c.creatorName ||
            c.organizerName ||
            c.creatorEmail ||
            "") + ""
        )
          .toLowerCase()
          .includes(s)
      );
    });

    q.sort((a, b) => {
      const ta =
        a.createdAt instanceof Date
          ? a.createdAt.getTime()
          : new Date(a.createdAt || 0).getTime();
      const tb =
        b.createdAt instanceof Date
          ? b.createdAt.getTime()
          : new Date(b.createdAt || 0).getTime();
      return sortOrder === "newest" ? tb - ta : ta - tb;
    });

    return q;
  }, [campaigns, search, sortOrder]);

  const formatDate = (val) => {
    if (!val) return "—";
    try {
      const d =
        val instanceof Date ? val : val?.toDate ? val.toDate() : new Date(val);
      return isNaN(d.getTime()) ? "—" : d.toLocaleString();
    } catch {
      return "—";
    }
  };

  const statusLabel = (c) => {
    if (c.isApproved) return "✅ Approved";

    const status = (c.status || "").toLowerCase();
    if (status === "rejected") return "❌ Rejected";
    if (status === "pending" || status === "pending_verification")
      return "⏳ Pending Verification";
    return c.isActive ? "🟢 Active" : "🔴 Inactive";
  };

  const toggleActive = async (c) => {
    if (!c || !c.id) return;
    const willActivate = !Boolean(c.isActive);
    if (
      !window.confirm(
        `${willActivate ? "Activate" : "Deactivate"} this campaign?`
      )
    )
      return;
    setSaving(true);
    try {
      await svcUpdateCampaign(c.id, {
        isActive: willActivate,
        updatedAt: new Date(),
      });
      setCampaigns((s) =>
        s.map((x) => (x.id === c.id ? { ...x, isActive: willActivate } : x))
      );
      if (selected?.id === c.id)
        setSelected((p) => ({ ...p, isActive: willActivate }));
    } catch (err) {
      console.error("toggleActive (service) failed:", err);
      alert("Failed to update campaign status — see console.");
    } finally {
      setSaving(false);
    }
  };

  /* ---------- Approval flow ---------- */

  const toggleApprove = async (c, currentlyApproved) => {
    if (!c || !c.id) return;
    setActionLoading((s) => ({ ...s, [c.id]: true }));

    // optimistic update
    setCampaigns((prev) =>
      prev.map((x) =>
        x.id === c.id ? { ...x, isApproved: !currentlyApproved } : x
      )
    );
    if (selected?.id === c.id) {
      setSelected((prev) =>
        prev ? { ...prev, isApproved: !currentlyApproved } : prev
      );
    }

    try {
      const adminIdToUse = null;
      if (!currentlyApproved) {
        await approveCampaign(c.id, adminIdToUse);
      } else {
        await revokeApproval(c.id, adminIdToUse);
      }
    } catch (err) {
      console.error("toggleApprove failed:", err);
      // revert
      setCampaigns((prev) =>
        prev.map((x) =>
          x.id === c.id ? { ...x, isApproved: currentlyApproved } : x
        )
      );
      if (selected?.id === c.id) {
        setSelected((prev) =>
          prev ? { ...prev, isApproved: currentlyApproved } : prev
        );
      }
      alert("Failed to update approval — see console.");
    } finally {
      setActionLoading((s) => {
        const copy = { ...s };
        delete copy[c.id];
        return copy;
      });
    }
  };

  const handleApprove = async (c) => {
    if (!c) return;
    if (!window.confirm("Approve this campaign?")) return;
    await toggleApprove(c, !!c.isApproved);
  };

  const handleReject = async (c) => {
    if (!c) return;
    if (!c.isApproved) {
      alert("Campaign is not approved yet.");
      return;
    }
    if (
      !window.confirm(
        "Reject this campaign? It will be marked as unapproved."
      )
    )
      return;
    await toggleApprove(c, true);
  };

  const handleDelete = async (c) => {
    if (!c || !c.id) return;
    if (!window.confirm("Delete this campaign? This cannot be undone."))
      return;
    setSaving(true);
    try {
      await svcDeleteCampaign(c.id);
      setCampaigns((s) => s.filter((x) => x.id !== c.id));
      if (selected?.id === c.id) setSelected(null);
    } catch (err) {
      console.error("deleteCampaign (service) failed:", err);
      alert("Failed to delete campaign — see console.");
    } finally {
      setSaving(false);
    }
  };

  /* ---------- Bank helpers ---------- */

  const showFull = (val) => {
    if (val === null || typeof val === "undefined" || val === "") return "—";
    return String(val);
  };

  const loadBank = async (creatorId) => {
    setBankLoading(true);
    setBankError("");
    setBankData(null);
    try {
      const profile = await getUserProfile(creatorId);
      if (!mountedRef.current) return;
      const bank = profile?.bank || null;
      if (!bank) {
        setBankError("No bank details saved for this user.");
      } else {
        setBankData(bank);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setBankError(err?.message || "Failed to load bank details.");
    } finally {
      if (mountedRef.current) setBankLoading(false);
    }
  };

  const openBankForCreator = async (creatorId, name, email) => {
    setBankOpen(true);
    setBankLoading(true);
    setBankError("");
    setBankData(null);
    setBankOwner({ name: name || "", email: email || "" });
    setShowAccount(false);
    setCopiedAccount(false);
    setCopiedUpi(false);

    try {
      const profile = await getUserProfile(creatorId);
      if (!mountedRef.current) return;
      const bank = profile?.bank || null;
      if (!bank) {
        setBankError("No bank details saved for this user.");
        setBankData(null);
      } else {
        setBankData(bank);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setBankError(err?.message || "Failed to load bank details.");
      setBankData(null);
    } finally {
      if (mountedRef.current) setBankLoading(false);
    }
  };

  const copyToClipboard = async (text, which) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(String(text));
      if (which === "account") {
        setCopiedAccount(true);
        setTimeout(() => setCopiedAccount(false), 1500);
      } else if (which === "upi") {
        setCopiedUpi(true);
        setTimeout(() => setCopiedUpi(false), 1500);
      }
    } catch (err) {
      console.warn("copy failed", err);
      alert("Copy failed — please copy manually.");
    }
  };

  return (
    <div>
      <header className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold">Campaigns</h2>
          <p className="text-sm text-gray-500">
            Manage all fundraising campaigns — approve, activate, review,
            or delete.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn-outline"
            onClick={() => {
              setRefreshKey((k) => k + 1);
              setLoading(true);
            }}
          >
            Refresh
          </button>
        </div>
      </header>

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 12,
          alignItems: "center",
        }}
      >
        <input
          placeholder="Search campaigns..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="admin-input"
          style={{ minWidth: 240 }}
        />
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          className="admin-input"
          style={{ width: 150 }}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
        <div
          style={{
            marginLeft: "auto",
            fontSize: 13,
            color: "#6b7280",
          }}
        >
          {visible.length} campaigns
        </div>
      </div>

      {/* Main content */}
      {loading ? (
        <div>Loading campaigns…</div>
      ) : errorMsg ? (
        <div className="text-sm text-red-600">
          Error loading campaigns: {errorMsg}
        </div>
      ) : visible.length === 0 ? (
        <div className="text-gray-500">No campaigns found.</div>
      ) : (
        <div className="space-y-2">
          {visible.map((c) => {
            const typeMeta = getCampaignTypeMeta(c.campaignType);
            const boostMeta = getBoostPlanMeta(
              c.boostPlan,
              !!c.boostPaid || !!c.isBoosted
            );
            const approxFee =
              typeof c.platformFeeApproxPercent === "number"
                ? c.platformFeeApproxPercent
                : null;

            return (
              <div
                key={c.id}
                className="bg-white rounded p-3 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"
              >
                <div style={{ flex: 1 }}>
                  <div className="font-medium">
                    {c.title || "Untitled campaign"}
                  </div>
                  <div
                    className="text-sm text-gray-500"
                    style={{ marginTop: 4 }}
                  >
                    {c.creatorName
                      ? `By ${c.creatorName}`
                      : c.organizerName
                      ? `By ${c.organizerName}`
                      : ""}
                  </div>
                  <div
                    className="text-sm text-gray-400"
                    style={{ marginTop: 4 }}
                  >
                    Created: {formatDate(c.createdAt)}
                  </div>

                  {/* Category + Boost badges */}
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 6,
                      marginTop: 6,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        padding: "3px 8px",
                        borderRadius: 999,
                        background: typeMeta.color,
                        color: typeMeta.text,
                        fontWeight: 600,
                      }}
                    >
                      {typeMeta.badge}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        padding: "3px 8px",
                        borderRadius: 999,
                        background: boostMeta.bg,
                        color: boostMeta.text,
                        fontWeight: 600,
                      }}
                    >
                      {boostMeta.badge}
                    </span>
                    {approxFee != null && (
                      <span
                        style={{
                          fontSize: 11,
                          padding: "3px 8px",
                          borderRadius: 999,
                          background: "#f1f5f9",
                          color: "#0f172a",
                          fontWeight: 500,
                        }}
                      >
                        Fee ~ {approxFee}%
                      </span>
                    )}
                    {c.boostPaid && (
                      <span
                        style={{
                          fontSize: 11,
                          padding: "3px 8px",
                          borderRadius: 999,
                          background: "#dcfce7",
                          color: "#15803d",
                          fontWeight: 600,
                        }}
                      >
                        Boost payment received
                      </span>
                    )}
                  </div>

                  <div
                    className="text-xs text-gray-500"
                    style={{ marginTop: 6 }}
                  >
                    Status: {statusLabel(c)}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginTop: 6,
                    flexWrap: "wrap",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    className="btn small-btn"
                    onClick={() => setSelected(c)}
                  >
                    View
                  </button>
                  {c.creatorId && (
                    <button
                      className="btn small-btn"
                      onClick={() =>
                        openBankForCreator(
                          c.creatorId,
                          c.creatorName,
                          c.creatorEmail
                        )
                      }
                    >
                      Bank
                    </button>
                  )}
                  <button
                    className="btn small-btn"
                    onClick={() => handleApprove(c)}
                    disabled={saving || !!actionLoading[c.id] || c.isApproved}
                  >
                    Approve
                  </button>
                  <button
                    className="btn small-btn"
                    onClick={() => handleReject(c)}
                    disabled={
                      saving || !!actionLoading[c.id] || !c.isApproved
                    }
                  >
                    Reject
                  </button>
                  <button
                    className="btn small-btn"
                    onClick={() => toggleActive(c)}
                    disabled={saving}
                  >
                    {c.isActive ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    className="btn small-btn delete-btn"
                    onClick={() => handleDelete(c)}
                    disabled={saving}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: View campaign details */}
      <Modal
        open={!!selected}
        title={selected ? selected.title || "Campaign details" : ""}
        onClose={() => {
          setSelected(null);
          setBankData(null);
          setBankError("");
        }}
      >
        {selected && (
        <div
          style={{
            display: "grid",
            gap: 10,
            maxHeight: "75vh",
            overflowY: "auto",
            paddingRight: 6,
          }}
        >

            {(selected.imageUrl || selected.image) && (
              <img
                src={selected.imageUrl || selected.image}
                alt={selected.title}
                style={{
                  width: "100%",
                  height: 220,
                  objectFit: "cover",
                  borderRadius: 8,
                  marginBottom: 8,
                }}
              />
            )}

            <div>
              <strong>Title:</strong> {selected.title || "—"}
            </div>

            {selected.description && (
              <div>
                <strong>Description:</strong>
                <div style={{ whiteSpace: "pre-line" }}>
                  {selected.description}
                </div>
              </div>
            )}

            {/* Category / platform fee / boost info */}
            <div>
              <strong>Category:</strong>{" "}
              {getCampaignTypeMeta(selected.campaignType).label}
            </div>
            {typeof selected.platformFeeApproxPercent === "number" && (
              <div>
                <strong>Platform fee approx:</strong>{" "}
                {selected.platformFeeApproxPercent}%{" "}
                {selected.platformFeeNote
                  ? `– ${selected.platformFeeNote}`
                  : ""}
              </div>
            )}
            <div>
              <strong>Boost plan:</strong>{" "}
              {getBoostPlanMeta(
                selected.boostPlan,
                !!selected.boostPaid || !!selected.isBoosted
              ).label}
              {"  "}
              {selected.boostPaid ? (
                <span style={{ color: "#16a34a", fontWeight: 600 }}>
                  (payment received)
                </span>
              ) : selected.boostPlan &&
                selected.boostPlan !== "none" ? (
                <span style={{ color: "#b91c1c", fontWeight: 600 }}>
                  (payment pending)
                </span>
              ) : null}
            </div>
            {selected.fundUsagePlan && (
              <div>
                <strong>Funds usage / plan:</strong>
                <div style={{ whiteSpace: "pre-line" }}>
                  {selected.fundUsagePlan}
                </div>
              </div>
            )}

            {selected.creatorName && (
              <div>
                <strong>Organizer:</strong> {selected.creatorName}
              </div>
            )}

            {typeof selected.goalAmount !== "undefined" && (
              <div>
                <strong>Goal:</strong> ₹
                {Number(
                  selected.goalAmount || selected.goal || 0
                ).toLocaleString("en-IN")}
              </div>
            )}

            {typeof selected.fundsRaised !== "undefined" && (() => {
            const gross = Number(
              selected.fundsRaised || selected.raised || 0
            );

            // Category-based payout %
            const type = (selected.campaignType || "personal").toLowerCase();

            let platformPct = 0;

            switch (type) {
              case "emergency":
                platformPct = 0.02;
                break;
              case "medical":
                platformPct = 0.08;
                break;
              case "education":
                platformPct = 0.10;
                break;
              case "women":
              case "women_child":
                platformPct = 0.05;
                break;
              case "animal":
                platformPct = 0.03;
                break;
              case "ngo":
              case "csr":
                platformPct = 0.05;
                break;
              default:
                platformPct = 0.05;
            }

            const platformFee = gross * platformPct;
            const payout = gross - platformFee;

            return (
              <div style={{ display: "grid", gap: 4 }}>
                <div>
                  <strong>Gross Raised:</strong> ₹
                  {gross.toLocaleString("en-IN")}
                </div>

                <div style={{ color: "#b45309" }}>
                  <strong>Platform Fee ({Math.round(platformPct * 100)}%):</strong> ₹
                  {platformFee.toLocaleString("en-IN")}
                </div>

                <div style={{ color: "#15803d", fontWeight: 600 }}>
                  <strong>Net Payout:</strong> ₹
                  {payout.toLocaleString("en-IN")}
                </div>
              </div>
            );
          })()}

            <div>
              <strong>Status:</strong> {statusLabel(selected)}
            </div>
            {selected.reviewNotes && (
              <div>
                <strong>Review notes:</strong>{" "}
                {selected.reviewNotes || "—"}
              </div>
            )}
            <div>
              <strong>Created at:</strong>{" "}
              {formatDate(selected.createdAt)}
            </div>

            {/* Bank details inside campaign modal */}
            <div
              style={{
                marginTop: 8,
                paddingTop: 8,
                borderTop: "1px solid #eee",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <strong>Bank details</strong>
                {selected.creatorId && (
                  <button
                    className="btn-outline small-btn"
                    onClick={() => loadBank(selected.creatorId)}
                    disabled={bankLoading}
                    title="Load bank details"
                  >
                    {bankLoading ? "Loading…" : "Load"}
                  </button>
                )}
              </div>
              {bankError && (
                <div
                  className="text-sm text-red-600"
                  style={{ marginTop: 6 }}
                >
                  {bankError}
                </div>
              )}

              {!bankLoading && !bankError && bankData && (
                <div
                  className="modal-body-scroll"
                  style={{ marginTop: 6 }}
                >
                  <div style={{ display: "grid", gap: 6 }}>
                    <BankRow
                      label="Account holder"
                      value={showFull(bankData.accountHolder)}
                    />
                    <BankRow
                      label="Bank name"
                      value={showFull(bankData.bankName)}
                    />
                    <BankRow
                      label="Account number"
                      value={
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                          }}
                        >
                          <span>
                            {showFull(
                              showAccount
                                ? bankData.accountNumber
                                : maskAccount(bankData.accountNumber)
                            )}
                          </span>
                          <button
                            className="btn-outline small-btn"
                            onClick={() =>
                              setShowAccount((s) => !s)
                            }
                            type="button"
                            title={
                              showAccount
                                ? "Hide account number"
                                : "Show account number"
                            }
                          >
                            {showAccount ? "🙈" : "👁️"}
                          </button>
                          <button
                            className="btn small-btn"
                            onClick={() =>
                              copyToClipboard(
                                bankData.accountNumber,
                                "account"
                              )
                            }
                            type="button"
                            title="Copy account number"
                          >
                            {copiedAccount ? "Copied!" : "Copy"}
                          </button>
                        </div>
                      }
                    />
                    <BankRow
                      label="IFSC"
                      value={showFull(bankData.ifsc)}
                    />
                    <BankRow
                      label="Branch"
                      value={showFull(
                        bankData.branchName || bankData.branch
                      )}
                    />
                    <BankRow
                      label="UPI"
                      value={
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                          }}
                        >
                          <span>{showFull(bankData.upi)}</span>
                          <button
                            className="btn small-btn"
                            onClick={() =>
                              copyToClipboard(
                                bankData.upi,
                                "upi"
                              )
                            }
                            type="button"
                            title="Copy UPI"
                          >
                            {copiedUpi ? "Copied!" : "Copy"}
                          </button>
                        </div>
                      }
                    />
                    <BankRow
                      label="Notes"
                      value={showFull(bankData.notes)}
                    />
                  </div>
                </div>
              )}
              {!bankLoading && !bankError && !bankData && (
                <div
                  className="text-sm text-gray-500"
                  style={{ marginTop: 6 }}
                >
                  No bank details loaded.
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 10,
                flexWrap: "wrap",
              }}
            >
              <button
                className="btn-outline"
                onClick={() => {
                  setSelected(null);
                  setBankData(null);
                  setBankError("");
                }}
              >
                Close
              </button>
              <button
                className="btn"
                onClick={() => handleApprove(selected)}
                disabled={
                  saving ||
                  !!actionLoading[selected.id] ||
                  selected.isApproved
                }
              >
                Approve
              </button>
              <button
                className="btn"
                onClick={() => handleReject(selected)}
                disabled={
                  saving ||
                  !!actionLoading[selected.id] ||
                  !selected.isApproved
                }
              >
                Reject
              </button>
              <button
                className="btn"
                onClick={() => toggleActive(selected)}
                disabled={saving}
              >
                {saving
                  ? "Updating…"
                  : selected.isActive
                  ? "Deactivate"
                  : "Activate"}
              </button>
              <button
                className="btn delete-btn"
                onClick={() => handleDelete(selected)}
                disabled={saving}
              >
                Delete
              </button>
              {selected?.isApproved &&
 selected?.fundsRaised > 0 &&
 !selected?.transferred && (
  <button
    className="btn"
    style={{ background: "#16a34a", color: "#fff" }}
    disabled={saving}
    onClick={async () => {
      if (
        !window.confirm(
          "Have you already transferred the funds via Razorpay dashboard?"
        )
      )
        return;

      setSaving(true);
      try {
        await markCampaignAsPaid(selected.id, null);

        setSelected((prev) => ({
          ...prev,
          transferred: true,
          status: "completed",
        }));

        alert("Campaign marked as paid successfully.");
      } catch (err) {
        console.error("markCampaignAsPaid failed:", err);
        alert("Failed to mark campaign as paid.");
      } finally {
        setSaving(false);
      }
    }}
  >
    Mark as Paid
  </button>
)}

            </div>
          </div>
        )}
      </Modal>

      {/* Dedicated Bank modal */}
      <Modal
        open={bankOpen}
        title="Bank Details"
        onClose={() => {
          setBankOpen(false);
          setBankData(null);
          setBankError("");
          setBankOwner({ name: "", email: "" });
          setShowAccount(false);
          setCopiedAccount(false);
          setCopiedUpi(false);
        }}
      >
        {bankLoading ? (
          <div>Loading bank details…</div>
        ) : bankError ? (
          <div className="text-sm text-red-600">{bankError}</div>
        ) : (
          <div className="modal-body-scroll">
            <div style={{ display: "grid", gap: 8 }}>
              {(bankOwner.name || bankOwner.email) && (
                <div className="muted small">
                  For:{" "}
                  <strong>
                    {bankOwner.name || bankOwner.email}
                  </strong>
                </div>
              )}
              <BankRow
                label="Account holder"
                value={showFull(bankData?.accountHolder)}
              />
              <BankRow
                label="Bank name"
                value={showFull(bankData?.bankName)}
              />
              <BankRow
                label="Account number"
                value={
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <span>
                      {showFull(
                        showAccount
                          ? bankData?.accountNumber
                          : maskAccount(bankData?.accountNumber)
                      )}
                    </span>
                    <button
                      className="btn-outline small-btn"
                      onClick={() =>
                        setShowAccount((s) => !s)
                      }
                      type="button"
                      title={
                        showAccount
                          ? "Hide account number"
                          : "Show account number"
                      }
                    >
                      {showAccount ? "🙈" : "👁️"}
                    </button>
                    <button
                      className="btn small-btn"
                      onClick={() =>
                        copyToClipboard(
                          bankData?.accountNumber,
                          "account"
                        )
                      }
                      type="button"
                      title="Copy account number"
                    >
                      {copiedAccount ? "Copied!" : "Copy"}
                    </button>
                  </div>
                }
              />
              <BankRow
                label="IFSC"
                value={showFull(bankData?.ifsc)}
              />
              <BankRow
                label="Branch"
                value={showFull(
                  bankData?.branchName || bankData?.branch
                )}
              />
              <BankRow
                label="UPI"
                value={
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <span>{showFull(bankData?.upi)}</span>
                    <button
                      className="btn small-btn"
                      onClick={() =>
                        copyToClipboard(
                          bankData?.upi,
                          "upi"
                        )
                      }
                      type="button"
                      title="Copy UPI"
                    >
                      {copiedUpi ? "Copied!" : "Copy"}
                    </button>
                  </div>
                }
              />
              <BankRow
                label="Notes"
                value={showFull(bankData?.notes)}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ---------- Shared components/helpers ---------- */

function BankRow({ label, value }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <div style={{ width: 140, color: "#6b7280" }}>{label}</div>
      <div style={{ fontWeight: 600 }}>
        {value ? (typeof value === "string" ? value : value) : "—"}
      </div>
    </div>
  );
}

function maskAccount(val) {
  const s = String(val || "");
  if (!s || s === "undefined") return "—";
  if (s.length <= 4) return "••••";
  return "•••• " + s.slice(-4);
}
