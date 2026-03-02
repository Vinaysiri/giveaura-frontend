// src/pages/admin/Dashboard.jsx
import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useNavigate } from "react-router-dom";
import ChartCard from "./admincomponents/ChartCard.jsx";
import StatCard from "./admincomponents/StatCard.jsx";
import LoadingSpinner from "./admincomponents/LoadingSpinner.jsx";
import Toast from "./admincomponents/Toast.jsx";
import Modal from "./admincomponents/Modal.jsx";
import "./styles/admin.css";

import {
  collection,
  collectionGroup,
  query,
  orderBy,
  getDocs,
  where,
  limit,
  onSnapshot,
} from "firebase/firestore";
import { db, auth } from "../../firebase";

import {
  getRecentDonations,
  getCampaigns,
  approveCampaign,
  revokeApproval,
  getPlatformStats,
  subscribePlatformStats,
  deleteCampaign,
  getUserProfile,
} from "../../services/firestoreService";

import {
  getCategoryFeeConfig,
  getBoostPlanConfig,
} from "../../services/boostService";

export default function Dashboard() {
  const navigate = useNavigate();
  const mountedRef = useRef(true);

  // scoped loading states (less blocking UX)
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [donationsLoading, setDonationsLoading] = useState(false);
  const [donorsLoading, setDonorsLoading] = useState(false);

  const [campaigns, setCampaigns] = useState([]);
  const [recentDonations, setRecentDonations] = useState([]);
  const [donorsMap, setDonorsMap] = useState({});
  const [activeTab, setActiveTab] = useState("overview"); // overview | campaigns | donors
  const [actionLoading, setActionLoading] = useState({}); // { [campaignId]: true }

  // platform stats including eventsFunded
  const [platformStats, setPlatformStats] = useState({
    campaignsRun: 0,
    donorsSupported: 0,
    eventsFunded: 0,
    totalDonationsAmount: 0,
    totalDonationsCount: 0,
    avgDonorGift: 0,
  });

  const [revenueAgg, setRevenueAgg] = useState({
  gross: 0,
  fundraiser: 0,
  categoryFee: 0,
  eventsFee: 0,
  platform: 0,
});


  // NEW: pending donations count (derived from donations collectionGroup)
  const [pendingDonationsCount, setPendingDonationsCount] = useState(undefined);
  const [pendingDonationsLoading, setPendingDonationsLoading] = useState(false);

  // Event funds summary (client-side aggregation from event_allocations)
  const [eventFundsLoading, setEventFundsLoading] = useState(false);
  const [eventFundsSummary, setEventFundsSummary] = useState({
    totalAllocated: 0, // rupees
    eventsCount: 0,
  });

  // Admins
  const [admins, setAdmins] = useState([]); // list of admin user objects { id, ... }
  const [currentAdminId, setCurrentAdminId] = useState(null);

  // Bank modal state
  const [bankOpen, setBankOpen] = useState(false);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankError, setBankError] = useState("");
  const [bankData, setBankData] = useState(null);
  const [bankOwner, setBankOwner] = useState({ name: "", email: "" });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // fetch admins list and set currentAdminId (tries auth.currentUser first)
  const fetchAdmins = useCallback(async () => {
    try {
      // Try query for role == 'admin' first
      let qRef = query(collection(db, "users"), where("role", "==", "admin"));
      let snap = await getDocs(qRef);
      if (snap.empty) {
        // fallback: isAdmin boolean
        qRef = query(collection(db, "users"), where("isAdmin", "==", true));
        snap = await getDocs(qRef);
      }

      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (!mountedRef.current) return;

      setAdmins(list);

      // prefer auth.currentUser if available
      try {
        const cur = auth?.currentUser;
        if (cur && cur.uid) {
          setCurrentAdminId(cur.uid);
          return;
        }
      } catch {
        // ignore
      }

      // otherwise use the first admin found (if any)
      if (list.length > 0) {
        setCurrentAdminId(list[0].id);
      } else {
        setCurrentAdminId(null);
      }
    } catch (err) {
      console.warn("fetchAdmins failed:", err);
      if (mountedRef.current) {
        setAdmins([]);
        // still attempt to set currentAdminId from auth.currentUser if present
        try {
          const cur = auth?.currentUser;
          if (cur && cur.uid) setCurrentAdminId(cur.uid);
        } catch {}
      }
    }
  }, []);

  useEffect(() => {
    fetchAdmins();
  }, [fetchAdmins]);

  // subscribe to platform stats (live)
  useEffect(() => {
    let unsub;
    try {
      unsub = subscribePlatformStats(
        (s) => {
          const safe = s || {};
          if (!mountedRef.current) return;
          setPlatformStats({
            campaignsRun: Number(safe.campaignsRun || 0),
            donorsSupported: Number(safe.donorsSupported || 0),
            eventsFunded: Number(safe.eventsFunded || 0),
            totalDonationsAmount: Number(safe.totalDonationsAmount || 0),
            totalDonationsCount: Number(safe.totalDonationsCount || 0),
            avgDonorGift: Number(safe.avgDonorGift || 0),
            pendingSettlements:
              typeof safe.pendingSettlements !== "undefined"
                ? Number(safe.pendingSettlements)
                : undefined,
            settlementsPending:
              typeof safe.settlementsPending !== "undefined"
                ? Number(safe.settlementsPending)
                : undefined,
            pending:
              typeof safe.pending !== "undefined"
                ? Number(safe.pending)
                : undefined,
          });
        },
        (err) => {
          console.warn("subscribePlatformStats error:", err);
          getPlatformStats()
            .then((s) => {
              if (!mountedRef.current) return;
              const safe = s || {};
              setPlatformStats({
                campaignsRun: Number(safe.campaignsRun || 0),
                donorsSupported: Number(safe.donorsSupported || 0),
                eventsFunded: Number(safe.eventsFunded || 0),
                totalDonationsAmount: Number(safe.totalDonationsAmount || 0),
                totalDonationsCount: Number(safe.totalDonationsCount || 0),
                avgDonorGift: Number(safe.avgDonorGift || 0),
                pendingSettlements:
                  typeof safe.pendingSettlements !== "undefined"
                    ? Number(safe.pendingSettlements)
                    : undefined,
                settlementsPending:
                  typeof safe.settlementsPending !== "undefined"
                    ? Number(safe.settlementsPending)
                    : undefined,
                pending:
                  typeof safe.pending !== "undefined"
                    ? Number(safe.pending)
                    : undefined,
              });
            })
            .catch(() => {});
        }
      );
    } catch (err) {
      getPlatformStats()
        .then((s) => {
          if (!mountedRef.current) return;
          const safe = s || {};
          setPlatformStats({
            campaignsRun: Number(safe.campaignsRun || 0),
            donorsSupported: Number(safe.donorsSupported || 0),
            eventsFunded: Number(safe.eventsFunded || 0),
            totalDonationsAmount: Number(safe.totalDonationsAmount || 0),
            totalDonationsCount: Number(safe.totalDonationsCount || 0),
            avgDonorGift: Number(safe.avgDonorGift || 0),
            pendingSettlements:
              typeof safe.pendingSettlements !== "undefined"
                ? Number(safe.pendingSettlements)
                : undefined,
            settlementsPending:
              typeof safe.settlementsPending !== "undefined"
                ? Number(safe.settlementsPending)
                : undefined,
            pending:
              typeof safe.pending !== "undefined"
                ? Number(safe.pending)
                : undefined,
          });
        })
        .catch(() => {});
    }
    return () => {
      if (typeof unsub === "function") unsub();
    };
    
  }, []);

  const PENDING_SCAN_LIMIT = 1200; 

  const fetchPendingSettlements = useCallback(
    async (opts = {}) => {
      const { limitScan = PENDING_SCAN_LIMIT } = opts;
      setPendingDonationsLoading(true);
      try {
        const q = query(
          collectionGroup(db, "donations"),
          orderBy("createdAtMs", "desc"),
          limit(limitScan)
        );
        const snap = await getDocs(q);
        if (!mountedRef.current) return;
        let pending = 0;
        snap.docs.forEach((d) => {
          try {
            const data = d.data() || {};

            const status = data?.settlement?.status
              ? String(data.settlement.status).toLowerCase()
              : null;

            if (!status || status !== "settled") {
              pending += 1;
            }

          } catch {
            pending += 1;
          }
        });


        setPendingDonationsCount(pending);
      } catch (err) {
        console.warn("fetchPendingSettlements failed:", err);
        // on failure, keep undefined so UI falls back to platformStats keys
        setPendingDonationsCount(undefined);
      } finally {
        if (mountedRef.current) setPendingDonationsLoading(false);
      }
    },
    []
  );

  // initial fetch of pending settlements + poll periodically
  useEffect(() => {
    let mounted = true;
    (async () => {
      await fetchPendingSettlements();
    })();

    // poll every 60 seconds while the page is open
    const iv = setInterval(() => {
      if (!mounted) return;
      fetchPendingSettlements();
    }, 60_000);

    return () => {
      mounted = false;
      clearInterval(iv);
    };
  }, [fetchPendingSettlements]);

  // ---------------- fetch campaigns ----------------
  const fetchCampaigns = useCallback(async () => {
    setCampaignsLoading(true);
    try {
      const list = await getCampaigns();
      if (!mountedRef.current) return;
      setCampaigns(list || []);
    } catch (err) {
      console.warn("getCampaigns failed:", err);
      if (mountedRef.current) setCampaigns([]);
    } finally {
      if (mountedRef.current) setCampaignsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  // recent donations (with fallback collectionGroup query)
  const fetchRecentDonations = useCallback(async () => {
    setDonationsLoading(true);
    try {
      let list = [];
      // 1) Try the shared service first
      try {
        if (typeof getRecentDonations === "function") {
          list = (await getRecentDonations(10)) || [];
        }
      } catch (serviceErr) {
        console.warn(
          "[Dashboard] getRecentDonations service failed, will try direct query:",
          serviceErr
        );
        list = [];
      }

      // 2) If still empty, do a direct collectionGroup query here
      if (!list || list.length === 0) {
        try {
          const qRef = query(
            collectionGroup(db, "donations"),
            orderBy("createdAtMs", "desc"),
            limit(10)
          );
          const snap = await getDocs(qRef);
          list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        } catch (fallbackErr) {
          console.warn(
            "[Dashboard] fallback collectionGroup(donations) query failed:",
            fallbackErr
          );
        }
      }

      if (!mountedRef.current) return;
      setRecentDonations(list || []);
    } catch (err) {
      console.warn("fetchRecentDonations failed:", err);
      if (mountedRef.current) setRecentDonations([]);
    } finally {
      if (mountedRef.current) setDonationsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecentDonations();
  }, [fetchRecentDonations]);

  useEffect(() => {
  let unsub;

  try {
    const qRef = query(collectionGroup(db, "donations"));

    unsub = onSnapshot(qRef, (snap) => {
      let gross = 0;
      let fundraiser = 0;
      let categoryFee = 0;
      let eventsFee = 0;
      let platform = 0;

      snap.forEach((doc) => {
        const d = doc.data() || {};

        const g = Number(d.amount || 0);
        const f = Number(d.fundraiserShare || d.creatorShare || 0);
        const cat = Number(d.platformTaxes || 0);
        const ev = Number(d.platformEventsFund || 0);

        const p =
          d.platformShare != null
            ? Number(d.platformShare)
            : cat + ev;

        gross += g;
        fundraiser += f;
        categoryFee += cat;
        eventsFee += ev;
        platform += p;
      });

      if (mountedRef.current) {
        setRevenueAgg({
          gross,
          fundraiser,
          categoryFee,
          eventsFee,
          platform,
        });
      }
    });
  } catch (err) {
    console.warn("Revenue listener failed:", err);
  }

  return () => {
    if (typeof unsub === "function") unsub();
  };
}, []);

  // donors map (batched, now using collectionGroup("donations"))
  const buildDonorsMap = useCallback(
    async (campaignList = campaigns) => {
      setDonorsLoading(true);
      try {
        const ids = (campaignList || []).map((c) => c.id).filter(Boolean);
        if (ids.length === 0) {
          if (mountedRef.current) setDonorsMap({});
          return;
        }

        const chunk = (arr, size = 8) => {
          const out = [];
          for (let i = 0; i < arr.length; i += size)
            out.push(arr.slice(i, i + size));
          return out;
        };

        const idChunks = chunk(ids, 8);
        const aggMap = {};

        const concurrency = 3;
        for (let i = 0; i < idChunks.length; i += concurrency) {
          const batch = idChunks.slice(i, i + concurrency);
          await Promise.all(
            batch.map(async (chunkIds) => {
              try {
                // Primary: read from subcollection donations via collectionGroup
                let snap;
                try {
                  const donationsQ = query(
                    collectionGroup(db, "donations"),
                    where("campaignId", "in", chunkIds)
                  );
                  snap = await getDocs(donationsQ);
                } catch (cgErr) {
                  console.warn(
                    "[Dashboard] collectionGroup donors chunk failed, trying top-level /donations:",
                    cgErr
                  );
                  // Fallback: old top-level /donations collection (if server writes there)
                  const fallbackQ = query(
                    collection(db, "donations"),
                    where("campaignId", "in", chunkIds)
                  );
                  snap = await getDocs(fallbackQ);
                }

                snap.forEach((d) => {
                  const data = d.data() || {};
                  const cid = data.campaignId;
                  if (!cid) return;
                  if (!aggMap[cid]) aggMap[cid] = new Map();
                  const key =
                    data.donorId ||
                    data.donorEmail ||
                    data.donorName ||
                    `anon_${d.id || Math.random()}`;
                  const prev =
                    aggMap[cid].get(key) || {
                      donorName:
                        data.donorName || data.donorEmail || "Anonymous",
                      sum: 0,
                    };
                  // aggregate on gross amount (amount), fallback to creatorShare
                  const addAmount =
                    Number(data.amount ?? data.creatorShare ?? 0) || 0;
                  prev.sum += addAmount;
                  aggMap[cid].set(key, prev);
                });
              } catch (err) {
                console.warn("donations chunk fetch failed:", err);
              }
            })
          );
        }

        const out = {};
        for (const cid of ids) {
          const m = aggMap[cid];
          if (!m) {
            out[cid] = [];
            continue;
          }
          const arr = Array.from(m.values())
            .sort((a, b) => b.sum - a.sum)
            .slice(0, 3);
          out[cid] = arr;
        }

        if (mountedRef.current) setDonorsMap(out);
      } catch (err) {
        console.warn("buildDonorsMap failed:", err);
        if (mountedRef.current) setDonorsMap({});
      } finally {
        if (mountedRef.current) setDonorsLoading(false);
      }
    },
    [campaigns]
  );

  useEffect(() => {
    if (!campaigns || campaigns.length === 0) {
      setDonorsMap({});
      return;
    }
    buildDonorsMap(campaigns);
  }, [campaigns, buildDonorsMap]);

  // NEW: robust fetch event funds summary (from event_allocations, fallback to events.platformFundsUsed)
  const fetchEventFundsSummary = useCallback(async () => {
    setEventFundsLoading(true);
    try {
      // First attempt: aggregate client-side from event_allocations
      const allocQ = query(collection(db, "event_allocations"));
      const allocSnap = await getDocs(allocQ);

      let total = 0;
      let allocCount = 0;
      const eventsSet = new Set();

      allocSnap.forEach((d) => {
        allocCount++;
        const data = d.data() || {};
        let a = data.amount;
        // tolerate strings like "1000" or "₹1,000"
        if (typeof a === "string") {
          const parsed = Number(a.replace(/[^0-9.-]/g, ""));
          a = Number.isFinite(parsed) ? parsed : 0;
        } else {
          a = Number(a || 0);
        }
        if (!Number.isFinite(a)) a = 0;
        total += a;
        if (data.eventId) eventsSet.add(data.eventId);
      });

      console.debug("[Dashboard] event_allocations aggregate", {
        allocCount,
        total,
        eventsCount: eventsSet.size,
      });

      // Heuristic: treat very large totals as paise
      let totalRupees = Number(total || 0);
      if (allocCount > 0 && totalRupees > 10_000_000) {
        console.debug(
          "[Dashboard] assuming event_allocations amounts are paise; converting to rupees"
        );
        totalRupees = totalRupees / 100;
      }

      if (allocCount > 0) {
        if (!mountedRef.current) return;
        setEventFundsSummary({
          totalAllocated: totalRupees,
          eventsCount: eventsSet.size,
        });
        setEventFundsLoading(false);
        return;
      }

      // Fallback: sum platformFundsUsed on events collection
      const eventsQ = query(collection(db, "events"));
      const eventsSnap = await getDocs(eventsQ);
      let evTotal = 0;
      let evCount = 0;
      eventsSnap.forEach((d) => {
        const data = d.data() || {};
        let pf = data.platformFundsUsed ?? data.platformFundsAllocated ?? 0;
        if (typeof pf === "string") {
          const parsed = Number(pf.replace(/[^0-9.-]/g, ""));
          pf = Number.isFinite(parsed) ? parsed : 0;
        } else {
          pf = Number(pf || 0);
        }
        if (!Number.isFinite(pf)) pf = 0;
        if (pf > 0) {
          evTotal += pf;
          evCount++;
        }
      });

      console.debug("[Dashboard] events.platformFundsUsed fallback", {
        evCount,
        evTotal,
      });

      let evTotalRupees = Number(evTotal || 0);
      if (evTotalRupees > 10_000_000) {
        console.debug(
          "[Dashboard] assuming events.platformFundsUsed stored in paise; converting to rupees"
        );
        evTotalRupees = evTotalRupees / 100;
      }

      if (!mountedRef.current) return;
      setEventFundsSummary({
        totalAllocated: evTotalRupees,
        eventsCount: evCount,
      });
    } catch (err) {
      console.warn("fetchEventFundsSummary failed:", err);
      if (!mountedRef.current) return;
      setEventFundsSummary({ totalAllocated: 0, eventsCount: 0 });
    } finally {
      if (mountedRef.current) setEventFundsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEventFundsSummary();
  }, [fetchEventFundsSummary]);

  const refreshAll = async () => {
    await Promise.allSettled([fetchCampaigns(), fetchRecentDonations()]);
    await buildDonorsMap();
    await fetchEventFundsSummary();
    await fetchAdmins();
    // refresh pending settlements when manually triggered
    await fetchPendingSettlements();
  };

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

  // Aggregate recent donations with new split model awareness
  const donationAgg = useMemo(() => {
    let gross = 0;
    let fundraiser = 0;
    let categoryFee = 0;
    let eventsFee = 0;
    let platform = 0;

    for (const d of recentDonations) {
      const g =
        Number(
          d.amount ??
            d.grossAmount ??
            d.donatedAmount ??
            d.total ??
            d.rawAmount ??
            0
        ) || 0;
      const f = Number(d.fundraiserShare ?? d.creatorShare ?? 0) || 0;

      const cat = Number(d.platformTaxes ?? 0) || 0;
      const ev = Number(d.platformEventsFund ?? 0) || 0;

      const p =
        Number(
          d.platformShare != null
            ? d.platformShare
            : cat + ev
        ) || 0;

      gross += g;
      fundraiser += f;
      categoryFee += cat;
      eventsFee += ev;
      platform += p;
    }

    return {
      gross,
      fundraiser,
      categoryFee,
      eventsFee,
      platform,
      avgGift: recentDonations.length ? gross / recentDonations.length : 0,
    };
  }, [recentDonations]);

  const stats = {
    campaigns: campaigns.length,
    recentDonations: recentDonations.length,
    avgGift: donationAgg.avgGift,
    eventsFunded:
      typeof eventFundsSummary.eventsCount === "number" &&
      eventFundsSummary.eventsCount > 0
        ? eventFundsSummary.eventsCount
        : platformStats.eventsFunded || 0,
  };

  // Determine pending settlements count (supports multiple platformStats keys)
  // Prefer collectionGroup-derived pendingDonationsCount when available
  const derivedPendingCount = typeof pendingDonationsCount === "number"
    ? pendingDonationsCount
    : typeof platformStats.pendingSettlements === "number"
    ? platformStats.pendingSettlements
    : typeof platformStats.settlementsPending === "number"
    ? platformStats.settlementsPending
    : typeof platformStats.pending === "number"
    ? platformStats.pending
    : 0;

  // severity: 0 -> green, 1-4 -> amber/skin, >=5 -> red
  const getRiskAppearance = (count) => {
    if (count <= 0)
      return {
        label: "Low",
        color: "#10b981",
        text: "No pending settlements",
      };
    if (count <= 4)
      return {
        label: "Medium",
        color: "#f59e0b",
        text: `${count} settlement(s) pending`,
      };
    return {
      label: "High",
      color: "#ef4444",
      text: `${count} settlement(s) pending`,
    };
  };

  const risk = getRiskAppearance(derivedPendingCount);

  // Approve / Revoke - now pass currentAdminId so actions are recorded
  const toggleApprove = async (campaignId, currentlyApproved) => {
    setActionLoading((s) => ({ ...s, [campaignId]: true }));
    setCampaigns((prev) =>
      prev.map((c) =>
        c.id === campaignId ? { ...c, isApproved: !currentlyApproved } : c
      )
    );

    try {
      const adminIdToUse = currentAdminId || null;
      if (!currentlyApproved) {
        await approveCampaign(campaignId, adminIdToUse);
      } else {
        await revokeApproval(campaignId, adminIdToUse);
      }
    } catch (err) {
      console.error("toggleApprove failed:", err);
      setCampaigns((prev) =>
        prev.map((c) =>
          c.id === campaignId ? { ...c, isApproved: currentlyApproved } : c
        )
      );
      window.alert("Action failed — check console for details.");
    } finally {
      setActionLoading((s) => {
        const copy = { ...s };
        delete copy[campaignId];
        return copy;
      });
    }
  };

  const handleRevokeConfirm = async (campaignId, currentlyApproved) => {
    if (currentlyApproved) {
      const ok = window.confirm(
        "Revoke approval for this campaign? This will mark it as unapproved."
      );
      if (!ok) return;
    }
    await toggleApprove(campaignId, currentlyApproved);
  };

  // Delete
  const handleDeleteCampaign = async (campaignId) => {
    if (!campaignId) return;
    const ok = window.confirm(
      "Delete this campaign? This action is permanent and will remove campaign doc. Donations remain as records."
    );
    if (!ok) return;

    const prev = campaigns;
    setActionLoading((s) => ({ ...s, [campaignId]: true }));
    setCampaigns((prevList) => prevList.filter((c) => c.id !== campaignId));

    try {
      await deleteCampaign(campaignId);
    } catch (err) {
      console.error("deleteCampaign failed:", err);
      setCampaigns(prev);
      window.alert("Failed to delete campaign — check console for details.");
    } finally {
      setActionLoading((s) => {
        const copy = { ...s };
        delete copy[campaignId];
        return copy;
      });
    }
  };

  // Bank helpers — show full details (no masking)
  const showFull = (val) => {
    if (val === null || typeof val === "undefined" || val === "") return "—";
    return String(val);
  };

  const openBankForCreator = async (creatorId, name, email) => {
    setBankOpen(true);
    setBankLoading(true);
    setBankError("");
    setBankData(null);
    setBankOwner({ name: name || "", email: email || "" });

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

  if (campaignsLoading && campaigns.length === 0) {
    return (
      <div style={{ padding: 30 }}>
        <LoadingSpinner size={48} />
      </div>
    );
  }

  // Small helper: campaign category + boost badges
  const renderCampaignBadges = (campaign) => {
    const catCfg = getCategoryFeeConfig(campaign.campaignType || "other");
    const boostCfg = getBoostPlanConfig(campaign.boostPlan || "none");

    return (
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          marginTop: 4,
        }}
      >
        <span
          style={{
            fontSize: 11,
            padding: "2px 8px",
            borderRadius: 999,
            background: "#eff6ff",
            color: "#1d4ed8",
          }}
        >
          {catCfg.label} • ~{Math.round((catCfg.platformPct || 0) * 100)}% fee
        </span>
        {boostCfg.id !== "none" && (
          <span
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 999,
              background:
                boostCfg.id === "super"
                  ? "#f97316"
                  : boostCfg.id === "premium"
                  ? "#a855f7"
                  : "#22c55e",
              color: "#fff",
            }}
          >
            {boostCfg.label}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="admin-content">
      {/* Top bar: Tabs + Refresh */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
          gap: 12,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            gap: 6,
            padding: 2,
            background: "#f3f4f6",
            borderRadius: 999,
          }}
        >
          {[
            { id: "overview", label: "Overview" },
            { id: "campaigns", label: "Campaigns" },
            { id: "donors", label: "Donors" },
          ].map((tab) => (
            <button
              key={tab.id}
              className="btn small-btn"
              onClick={() => setActiveTab(tab.id)}
              style={{
                borderRadius: 999,
                padding: "6px 12px",
                background:
                  activeTab === tab.id ? "#111827" : "transparent",
                color: activeTab === tab.id ? "#fff" : "#111827",
                border: "none",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button className="btn" onClick={refreshAll} title="Refresh data">
          🔄 Refresh
        </button>
      </div>

      {/* KPI row using StatCard */}
      <section className="kpi-row" style={{ marginBottom: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        {/* StatCard usage:
            If your StatCard has different prop names, adjust below.
            I pass: title, value, sub (subtitle), meta (small description)
        */}
        <StatCard
          title="Campaigns"
          value={stats.campaigns}
          sub="Active / total"
          meta={`${campaigns.length} campaigns`}
        />
        <StatCard
          title="Recent donations"
          value={stats.recentDonations}
          sub="Last 10"
          meta={`${recentDonations.length} entries`}
        />
        <StatCard
          title="Avg donor gift"
          value={fmtINR(stats.avgGift)}
          sub="Recent list"
          meta={`Avg of ${recentDonations.length}`}
        />
        <StatCard
          title="Events funded"
          value={stats.eventsFunded}
          sub="Platform-funded"
          meta={`Allocated: ${fmtINR(eventFundsSummary.totalAllocated ?? 0)}`}
        />
      </section>

      <section className="content-grid">
        <div className="content-left">
          {/* Overview tab */}
          {activeTab === "overview" && (
            <>
              <div className="card chart-card">
                <div
                  className="card-h"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <h3>Donations overview</h3>
                </div>
                <ChartCard title="Donations">
                  <svg
                    viewBox="0 0 600 160"
                    className="sparkline"
                    aria-hidden
                  >
                    <polyline
                      fill="none"
                      stroke="#4f46e5"
                      strokeWidth="3"
                      points="0,100 80,78 160,95 240,60 320,68 400,40 480,80 560,60 600,55"
                    />
                  </svg>
                </ChartCard>
              </div>

              {/* Revenue snapshot based on new split */}
              <div
                className="card"
                style={{ marginTop: 12, paddingBottom: 12 }}
              >
                <h3 style={{ marginTop: 0 }}>Revenue snapshot (platform-wide, live)</h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit,minmax(180px,1fr))",
                    gap: 10,
                    fontSize: 13,
                  }}
                >
                  <div
                    style={{
                      padding: 10,
                      borderRadius: 10,
                      background: "#eff6ff",
                      border: "1px solid #bfdbfe",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: "#1d4ed8",
                        marginBottom: 2,
                      }}
                    >
                      Gross volume
                    </div>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: "#1d4ed8",
                      }}
                    >
                      {fmtINR(revenueAgg.gross)}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "#6b7280",
                        marginTop: 4,
                      }}
                    >
                      Sum of donor-paid amounts (recent list)
                    </div>
                  </div>

                  <div
                    style={{
                      padding: 10,
                      borderRadius: 10,
                      background: "#ecfdf3",
                      border: "1px solid #bbf7d0",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: "#15803d",
                        marginBottom: 2,
                      }}
                    >
                      To fundraisers
                    </div>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: "#15803d",
                      }}
                    >
                      {fmtINR(revenueAgg.fundraiser)}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "#6b7280",
                        marginTop: 4,
                      }}
                    >
                      Net after all platform/category splits
                    </div>
                  </div>

                  <div
                    style={{
                      padding: 10,
                      borderRadius: 10,
                      background: "#fef3c7",
                      border: "1px solid #fde68a",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: "#b45309",
                        marginBottom: 2,
                      }}
                    >
                      Category fees
                    </div>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: "#b45309",
                      }}
                    >
                      {fmtINR(revenueAgg.categoryFee)}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "#6b7280",
                        marginTop: 4,
                      }}
                    >
                      From category-based percentages (emergency, medical,
                      NGO…)
                    </div>
                  </div>

                  <div
                    style={{
                      padding: 10,
                      borderRadius: 10,
                      background: "#f9fafb",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: "#111827",
                        marginBottom: 2,
                      }}
                    >
                      Events / platform fund
                    </div>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: "#111827",
                      }}
                    >
                      {fmtINR(revenueAgg.eventsFee)}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "#6b7280",
                        marginTop: 4,
                      }}
                    >
                      Reserved for GiveAura drives & operations
                    </div>
                  </div>
                </div>
              </div>

              <div className="card table-card">
                <h3>Campaigns</h3>

                {campaignsLoading ? (
                  <div
                    style={{
                      padding: 24,
                      display: "flex",
                      justifyContent: "center",
                    }}
                  >
                    <LoadingSpinner size={32} />
                  </div>
                ) : (
                  <div className="table-wrap">
                    <div className="campaign-list">
                      {campaigns.length === 0 ? (
                        <div className="no-campaigns">No campaigns</div>
                      ) : (
                        campaigns.map((c) => {
                        const grossRaised = Number(c.fundsRaised || 0);
                        const catCfg = getCategoryFeeConfig(
                          c.campaignType || "other"
                        );
                        const platformPct = Number(catCfg.platformPct || 0);
                        const platformFeeAmount = grossRaised * platformPct;
                        const payoutAmount = grossRaised - platformFeeAmount;
                        const goal = Number(c.goalAmount || 0);
                        const pct = goal
                          ? Math.min((grossRaised / goal) * 100, 100).toFixed(1)
                          : "—";

                        const isApproved = !!c.isApproved;

                        const boostCfg = getBoostPlanConfig(
                          c.boostPlan || "none"
                        );


                          return (
                            <div
                              key={c.id}
                              className="campaign-item card"
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  gap: 12,
                                  alignItems: "center",
                                }}
                              >
                                <div
                                  style={{
                                    width: 64,
                                    height: 48,
                                    background: "#f3f4f6",
                                    borderRadius: 8,
                                    overflow: "hidden",
                                  }}
                                >
                                  {c.imageUrl ? (
                                    <img
                                      src={c.imageUrl}
                                      alt={c.title}
                                      style={{
                                        width: "100%",
                                        height: "100%",
                                        objectFit: "cover",
                                      }}
                                    />
                                  ) : (
                                    <div
                                      style={{
                                        padding: 8,
                                        fontWeight: 700,
                                        fontSize: 18,
                                      }}
                                    >
                                      {(c.title || "C").slice(0, 2)}
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 700 }}>
                                    {c.title}
                                  </div>
                                  <div className="muted small">
                                    {c.creatorName || c.creatorEmail}
                                  </div>
                                  <div
                                    style={{
                                      display: "flex",
                                      gap: 6,
                                      flexWrap: "wrap",
                                      marginTop: 4,
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: 11,
                                        padding: "2px 8px",
                                        borderRadius: 999,
                                        background: "#eff6ff",
                                        color: "#1d4ed8",
                                      }}
                                    >
                                      {catCfg.label}
                                    </span>
                                    {boostCfg.id !== "none" && (
                                      <span
                                        style={{
                                          fontSize: 11,
                                          padding: "2px 8px",
                                          borderRadius: 999,
                                          background:
                                            boostCfg.id === "super"
                                              ? "#f97316"
                                              : boostCfg.id === "premium"
                                              ? "#a855f7"
                                              : "#22c55e",
                                          color: "#fff",
                                        }}
                                      >
                                        {boostCfg.label}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  alignItems: "center",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "flex-end",
                                    marginRight: 8,
                                  }}
                                >
                                  <div className="muted small">
                                    Raised {fmtINR(grossRaised)}
                                  </div>
                                  <div className="muted small">{pct}%</div>
                                </div>

                                {/* approval badge */}
                                <div>
                                  {isApproved ? (
                                    <div
                                      style={{
                                        background:
                                          "linear-gradient(90deg,#10b981,#34d399)",
                                        color: "#fff",
                                        padding: "6px 8px",
                                        borderRadius: 8,
                                        fontWeight: 700,
                                        fontSize: 12,
                                      }}
                                    >
                                      Approved
                                    </div>
                                  ) : (
                                    <div
                                      style={{
                                        background: "#f1f5f9",
                                        color: "#475569",
                                        padding: "6px 8px",
                                        borderRadius: 8,
                                        fontWeight: 600,
                                        fontSize: 12,
                                      }}
                                    >
                                      Unapproved
                                    </div>
                                  )}
                                </div>

                                <div style={{ display: "flex", gap: 6 }}>
                                  <button
                                    className="btn small-btn"
                                    onClick={() =>
                                      navigate(`/campaign/${c.id}`)
                                    }
                                  >
                                    View
                                  </button>
                                  <button
                                    className="btn small-btn"
                                    onClick={() =>
                                      navigate(
                                        `/admin/campaigns/edit/${c.id}`
                                      )
                                    }
                                  >
                                    Edit
                                  </button>

                                  {/* Bank Details */}
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
                                      title="View bank details"
                                    >
                                      Bank
                                    </button>
                                  )}

                                  {/* Approve / Revoke */}
                                  {!isApproved ? (
                                    <button
                                      className="btn-primary small-btn"
                                      disabled={!!actionLoading[c.id]}
                                      onClick={() =>
                                        toggleApprove(c.id, false)
                                      }
                                    >
                                      {actionLoading[c.id]
                                        ? "Working…"
                                        : "Approve"}
                                    </button>
                                  ) : (
                                    <button
                                      className="btn-outline small-btn"
                                      disabled={!!actionLoading[c.id]}
                                      onClick={() =>
                                        handleRevokeConfirm(c.id, true)
                                      }
                                    >
                                      {actionLoading[c.id]
                                        ? "Working…"
                                        : "Revoke"}
                                    </button>
                                  )}

                                  {/* Delete */}
                                  <button
                                    className="btn-danger small-btn"
                                    disabled={!!actionLoading[c.id]}
                                    onClick={() =>
                                      handleDeleteCampaign(c.id)
                                    }
                                  >
                                    {actionLoading[c.id]
                                      ? "Working…"
                                      : "Delete"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Campaigns tab */}
          {activeTab === "campaigns" && (
            <div className="card">
              <h3>All campaigns</h3>
              <div className="table-wrap">
                {campaignsLoading ? (
                  <div
                    style={{
                      padding: 24,
                      display: "flex",
                      justifyContent: "center",
                    }}
                  >
                    <LoadingSpinner size={28} />
                  </div>
                ) : campaigns.length === 0 ? (
                  <div className="muted">No campaigns</div>
                ) : (
                  campaigns.map((c) => {
                    const catCfg = getCategoryFeeConfig(
                      c.campaignType || "other"
                    );
                    const boostCfg = getBoostPlanConfig(
                      c.boostPlan || "none"
                    );

                    return (
                      <div key={c.id} className="campaign-item card">
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 700 }}>{c.title}</div>
                            <div className="muted small">
                              {c.creatorName || c.creatorEmail}
                            </div>
                            {renderCampaignBadges(c)}
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              className="btn"
                              onClick={() =>
                                navigate(`/admin/campaigns/edit/${c.id}`)
                              }
                            >
                              Manage
                            </button>
                            {c.creatorId && (
                              <button
                                className="btn"
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
                            {c.isApproved ? (
                              <button
                                className="btn-outline small-btn"
                                onClick={() =>
                                  handleRevokeConfirm(c.id, true)
                                }
                              >
                                Revoke
                              </button>
                            ) : (
                              <button
                                className="btn-primary small-btn"
                                onClick={() =>
                                  toggleApprove(c.id, false)
                                }
                              >
                                Approve
                              </button>
                            )}
                            <button
                              className="btn-danger small-btn"
                              disabled={!!actionLoading[c.id]}
                              onClick={() =>
                                handleDeleteCampaign(c.id)
                              }
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Donors tab */}
          {activeTab === "donors" && (
            <div className="card">
              <h3>Recent donors</h3>
              <div className="table-wrap">
                {donationsLoading ? (
                  <div
                    style={{
                      padding: 24,
                      display: "flex",
                      justifyContent: "center",
                    }}
                  >
                    <LoadingSpinner size={28} />
                  </div>
                ) : (
                  <ul className="activity-list">
                    {recentDonations.length === 0 ? (
                      <li className="muted">No recent donations</li>
                    ) : (
                      recentDonations.map((d) => {
                        const displayName =
                          d.donorName || d.donorEmail || "Anonymous";
                        const amountForDisplay =
                          Number(
                            d.amount ??
                              d.grossAmount ??
                              d.donatedAmount ??
                              d.creatorShare ??
                              0
                          ) || 0;
                        return (
                          <li key={d.id} className="activity-item">
                            <div
                              style={{
                                display: "flex",
                                gap: 8,
                                alignItems: "center",
                              }}
                            >
                              <div className="avatar">
                                {String(displayName)[0]}
                              </div>
                              <div>
                                <div style={{ fontWeight: 700 }}>
                                  {displayName}
                                </div>
                                <div className="muted small">
                                  {d.campaignTitle || d.campaignId}
                                </div>
                              </div>
                            </div>
                            <div style={{ fontWeight: 700 }}>
                              {fmtINR(amountForDisplay)}
                            </div>
                          </li>
                        );
                      })
                    )}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        <aside className="content-right">
          {/* Risk card: pending-settlement severity */}
          <div
            className="card risk-card"
            style={{ display: "flex", gap: 12, alignItems: "center" }}
          >
            <div
              className="risk-circle"
              aria-hidden
              style={{
                width: 56,
                height: 56,
                borderRadius: 999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                color: "#fff",
                background: risk.color,
                boxShadow: "0 6px 16px rgba(0,0,0,0.08)",
              }}
            >
              {risk.label === "Low" ? "✓" : risk.label === "Medium" ? "!" : "!"}
            </div>

            <div style={{ flex: "1 1 auto" }}>
              <div className="muted">Settlement status</div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>
                {risk.label} — {risk.text}
              </div>
              <div className="muted small" style={{ marginTop: 6 }}>
                {typeof pendingDonationsCount === "number" ? (
                  pendingDonationsCount > 0
                    ? `There ${pendingDonationsCount === 1 ? "is" : "are"} ${pendingDonationsCount} pending settlement${pendingDonationsCount === 1 ? "" : "s"}.`
                    : "All settlements processed."
                ) : pendingDonationsLoading ? (
                  "Calculating pending settlements…"
                ) : (
                  // fallback to platformStats if we couldn't calculate
                  (platformStats.pendingSettlements || platformStats.pending || platformStats.settlementsPending) > 0
                    ? `There ${(platformStats.pendingSettlements || platformStats.pending || platformStats.settlementsPending)} pending settlement(s).`
                    : "All settlements processed."
                )}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <button
                className="btn-outline small"
                onClick={() =>
                  navigate("/admin/donations?filter=pending")
                }
                title="Review settlements"
              >
                Review
              </button>
              <button
                className="btn small"
                onClick={refreshAll}
                title="Refresh settlement status"
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="card activity-card">
            <h4>Recent Donations</h4>
            {donationsLoading ? (
              <div
                style={{
                  padding: 18,
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <LoadingSpinner size={20} />
              </div>
            ) : (
              <ul className="activity-list">
                {recentDonations.length === 0 ? (
                  <li className="muted">No recent donations</li>
                ) : (
                  recentDonations.map((d) => {
                    const displayName =
                      d.donorName || d.donorEmail || "Anonymous";
                    const amountForDisplay =
                      Number(
                        d.amount ??
                          d.grossAmount ??
                          d.donatedAmount ??
                          d.creatorShare ??
                          0
                      ) || 0;
                    return (
                      <li key={d.id} className="activity-item">
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                          }}
                        >
                          <div className="avatar">
                            {String(displayName)[0]}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700 }}>
                              {displayName}
                            </div>
                            <div className="muted small">
                              {d.campaignTitle || d.campaignId}
                            </div>
                          </div>
                        </div>
                        <div style={{ fontWeight: 700 }}>
                          {fmtINR(amountForDisplay)}
                        </div>
                      </li>
                    );
                  })
                )}
              </ul>
            )}
          </div>

          <div className="card">
            <h5 style={{ marginTop: 0 }}>Events funded</h5>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontSize: 26, fontWeight: 800 }}>
                  {eventFundsLoading ? (
                    <LoadingSpinner size={20} />
                  ) : (
                    eventFundsSummary.eventsCount ?? platformStats.eventsFunded ?? 0
                  )}
                </div>
                <div className="muted small">
                  Events funded by platform allocations
                </div>

                <div style={{ marginTop: 8, fontWeight: 700 }}>
                  {eventFundsLoading
                    ? null
                    : `Total allocated: ${fmtINR(eventFundsSummary.totalAllocated ?? 0)}`}
                </div>
                {eventFundsLoading && (
                  <div className="muted small">
                    Calculating allocations…
                  </div>
                )}
              </div>
              <div>
                <button
                  className="btn-outline small"
                  onClick={() => navigate("/admin/events")}
                >
                  Manage events
                </button>
              </div>
            </div>
          </div>

          <div className="card support">
            <h5>Quick Actions</h5>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <button
                className="btn"
                onClick={() => navigate("/admin/campaigns")}
              >
                Manage Campaigns
              </button>
              <button
                className="btn"
                onClick={() => navigate("/admin/donations")}
              >
                Manage Donations
              </button>
              <button
                className="btn"
                onClick={() => navigate("/admin/users")}
              >
                Manage Users
              </button>
            </div>
          </div>
        </aside>
      </section>

      <footer className="text-xs muted" style={{ marginTop: 14 }}>
        GiveAura — admin console
      </footer>

      {/* Bank modal */}
      <Modal
        open={bankOpen}
        title="Bank Details"
        onClose={() => {
          setBankOpen(false);
          setBankData(null);
          setBankError("");
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
                  For: <strong>{bankOwner.name || bankOwner.email}</strong>
                </div>
              )}
              <Row
                label="Account holder"
                value={showFull(bankData?.accountHolder)}
              />
              <Row
                label="Bank name"
                value={showFull(bankData?.bankName)}
              />
              <Row
                label="Account number"
                value={showFull(bankData?.accountNumber)}
              />
              <Row label="IFSC" value={showFull(bankData?.ifsc)} />
              <Row
                label="Branch"
                value={showFull(
                  bankData?.branchName || bankData?.branch
                )}
              />
              <Row label="UPI" value={showFull(bankData?.upi)} />
              <Row label="Notes" value={showFull(bankData?.notes)} />
            </div>
          </div>
        )}
      </Modal>

      <Toast />
    </div>
  );
}

// small row component
function Row({ label, value }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <div style={{ width: 140, color: "#6b7280" }}>{label}</div>
      <div style={{ fontWeight: 600 }}>
        {value ? String(value) : "—"}
      </div>
    </div>
  );
}
