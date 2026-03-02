// src/pages/Home.jsx
import React, { useEffect, useRef, useState, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import "../components/CampaignCards.css";
import Footer from "../components/Footer"
import SessionAdPopup from "../components/SessionAdPopup";
import {
getDonationsByCampaign,
deleteCampaign,
getCampaignById,
getRecentDonations,
getUserProfile,
getUserByEmail,
} from "../services/firestoreService";
import Modal from "react-modal";
import { db } from "../firebase";
import {
collection,
onSnapshot,
query,
where,
orderBy,
doc,
limit,
getDocs,
getDoc,
addDoc,
} from "firebase/firestore";
import { computeSplits} from "../utils/money";
import { sumDonations } from "../utils/donations";


Modal.setAppElement("#root");

// ---------------- Money helpers ----------------
const inferGross = (d = {}) => {
if (!d || typeof d !== "object") return 0;

// Candidate explicit gross keys
const grossCandidates = [
  d.grossAmount,
  d.gross,
  d.amountGross,
  d.amount_raw,
  d.amountRaw,
  d.total,
  d.donatedAmount,
  d.originalAmount,
  d.amountCollected,
  d.rawAmount,
];
for (const c of grossCandidates) {
  if (typeof c === "number" && !Number.isNaN(c) && c > 0) return Number(c);
  if (typeof c === "string" && c.trim() !== "" && !Number.isNaN(Number(c))) return Number(c);
}

const hasSplitFields =
  d.creatorShare !== undefined ||
  d.platformTaxes !== undefined ||
  d.platformEventsFund !== undefined ||
  d.platform !== undefined ||
  (d.settlement && typeof d.settlement === "object") ||
  (d.split && typeof d.split === "object");

if (hasSplitFields && (typeof d.amount === "number" || (typeof d.amount === "string" && d.amount.trim() !== "" && !Number.isNaN(Number(d.amount))))) {
  return Number(d.amount);
}

if (typeof d.amount === "string" && d.amount.trim() !== "" && !Number.isNaN(Number(d.amount))) {
  return Number((Number(d.amount)).toFixed(2));
}

return 0;
};

const fundraiserFromGross = (gross) => {
if (!gross || gross <= 0) return 0;
const s = computeSplits(Number(gross));
return Number(s.fundraiser || 0);
};

const computeTickerSplits = (gross) => {
if (!gross || Number(gross) <= 0) return { gross: 0, gst: 0, platform: 0, fundraiser: 0, netAfterGst: 0 };
const s = computeSplits(Number(gross));
return {
  gross: Number(s.gross || gross),
  gst: Number(s.gst || 0),
  platform: Number(s.platform || 0),
  fundraiser: Number(s.fundraiser || 0),
  netAfterGst: Number(s.netAfterGst || (Number(s.gross || gross) - Number(s.gst || 0))),
};
};

const getCampaignTypeMeta = (rawType) => {
const v = (rawType || "").toString().toLowerCase().trim();

if (["emergency", "urgent", "critical"].includes(v)) {
  return {
    key: "emergency",
    label: "🚨 Emergency",
    bg: "#fee2e2",
    text: "#b91c1c",
  };
}

if (["medical", "health", "hospital", "treatment"].includes(v)) {
  return {
    key: "medical",
    label: "🩺 Medical",
    bg: "#e0f2fe",
    text: "#0369a1",
  };
}

if (["education", "school", "college", "fees"].includes(v)) {
  return {
    key: "education",
    label: "📚 Education",
    bg: "#eef2ff",
    text: "#4f46e5",
  };
}

if (["ngo", "social", "social_impact", "charity", "nonprofit"].includes(v)) {
  return {
    key: "ngo",
    label: "🤝 NGO / Social Impact",
    bg: "#ecfdf5",
    text: "#047857",
  };
}

if (["csr", "corporate", "company", "brand"].includes(v)) {
  return {
    key: "csr",
    label: "🏢 CSR / Corporate",
    bg: "#fef3c7",
    text: "#92400e",
  };
}

if (["personal", "family", "individual"].includes(v)) {
  return {
    key: "personal",
    label: "👤 Personal Cause",
    bg: "#eff6ff",
    text: "#1d4ed8",
  };
}

return {
  key: "other",
  label: "🎗 Other",
  bg: "#f3f4f6",
  text: "#374151",
};
};

const getDonorAvatarUrl = (d) => {
if (!d || typeof d !== "object") {
  return "https://ui-avatars.com/api/?name=Anonymous&background=random";
}

const name =
  d.donorDisplayName ||
  d.donorName ||
  (typeof d.donorEmail === "string"
    ? d.donorEmail.split("@")[0]
    : "Someone");

const candidate =
  d.photoURL ||
  d.donorPhotoURL ||
  d.avatarUrl ||
  d.profilePhoto ||
  d.imageURL ||
  d.imageUrl ||
  d.photo ||
  null;

if (candidate) return candidate;

return `https://ui-avatars.com/api/?name=${encodeURIComponent(
  name
)}&background=random`;
};


export default function Home({
  selectedCategories = [],
  urgencyFilter = "all",
  sortType = "newest",
  searchQuery = "",
  showMyCampaigns = false,
}) {

const { currentUser: user, logout, loading } = useAuth();
const navigate = useNavigate();
// --- Notification counters ---
const [unreadCount, setUnreadCount] = useState(0);
const [adminUnreadCount, setAdminUnreadCount] = useState(0);

const [campaigns, setCampaigns] = useState([]);
const [visibleCampaigns, setVisibleCampaigns] = useState([]);
const [filteredCampaigns, setFilteredCampaigns] = useState([]);
const handleCreate = () => {
navigate("/create");
};

const [donorsMap, setDonorsMap] = useState({});

const [modalIsOpen, setModalIsOpen] = useState(false);
const [selectedCampaign, setSelectedCampaign] = useState(null);
const [selectedDonors, setSelectedDonors] = useState([]);
const [loadingCampaigns, setLoadingCampaigns] = useState(true);
const [donorProfiles, setDonorProfiles] = useState({});
const donorProfileUnsubsRef = useRef({});


const lastSeenDonationIdRef = useRef(null);

const [profile, setProfile] = useState(null);

const [topDonor, setTopDonor] = useState(null);
const [showTopDonorPopup, setShowTopDonorPopup] = useState(false);

const [adminPopup, setAdminPopup] = useState(null);
const [showAdminPopup, setShowAdminPopup] = useState(false);

const [siteSettings, setSiteSettings] = useState({ showPopup: true, popupMessage: "" });
const [siteSettingsLoaded, setSiteSettingsLoaded] = useState(false);
const [events, setEvents] = useState([]);
const [eventsLoaded, setEventsLoaded] = useState(false);

const liveEvent = events.find((e) => e.isLive) || null;

const [memberModalOpen, setMemberModalOpen] = useState(false);
const [memberForm, setMemberForm] = useState({ name: "", email: "", phone: "", message: "" });
const [memberSubmitting, setMemberSubmitting] = useState(false);

const [supportModalOpen, setSupportModalOpen] = useState(false);
const [supportForm, setSupportForm] = useState({ name: "", email: "", subject: "general", message: "" });
const [supportSubmitting, setSupportSubmitting] = useState(false);
const topDonorPhoto = topDonor ? getDonorAvatarUrl(topDonor) : null;



const openSupportModal = () => {
  setSupportForm((p) => ({
    name: (profile && profile.displayName) || user?.displayName || p.name || "",
    email: (profile && profile.email) || user?.email || p.email || "",
    subject: "general",
    message: "",
  }));
  setSupportModalOpen(true);
};

const closeSupportModal = () => {
  setSupportModalOpen(false);
  setSupportForm({ name: "", email: "", subject: "general", message: "" });
};

const submitSupportRequest = async (e) => {
  e && e.preventDefault();
  if (!supportForm.name.trim() || !supportForm.email.trim() || !supportForm.message.trim()) {
    alert("Please fill name, email and message.");
    return;
  }
  setSupportSubmitting(true);
  try {
    await addDoc(collection(db, "support_requests"), {
      name: supportForm.name.trim(),
      email: supportForm.email.trim(),
      subject: supportForm.subject,
      message: supportForm.message.trim(),
      userId: user?.uid || null,
      createdAt: new Date(),
      status: "open",
      source: "home_support_center",
    });
    alert("Thanks — your request was submitted. We'll get back soon.");
    closeSupportModal();
  } catch (err) {
    console.error("submitSupportRequest failed:", err);
    alert("Failed to submit. Please try again later.");
  } finally {
    setSupportSubmitting(false);
  }
};

const normalize = (docSnap) => {
  const d = docSnap.data();
  return {
    id: docSnap.id,
    ...d,
    createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : new Date(d.createdAt || Date.now()),
    endDate: d.endDate?.toDate ? d.endDate.toDate() : d.endDate ? new Date(d.endDate) : null,
  };
};

// ---------------- Profile subscription ----------------
useEffect(() => {
  if (!user || !user.uid) {
    setProfile(null);
    return;
  }
  let mounted = true;
  const userRef = doc(db, "users", user.uid);
  const unsub = onSnapshot(
    userRef,
    (snap) => {
      if (!mounted) return;
      if (snap.exists()) {
        const data = snap.data();
        setProfile({
          displayName: data.displayName || user.displayName || "",
          email: data.email || user.email,
          photoURL: data.photoURL || user.photoURL || "",
          bio: data.bio || "",
        });
      } else {
        setProfile({
          displayName: user.displayName || "",
          email: user.email,
          photoURL: user.photoURL || "",
          bio: "",
        });
      }
    },
    (err) => {
      console.warn("Realtime profile snapshot error:", err);
      if (mounted) {
        setProfile({
          displayName: user.displayName || "",
          email: user.email,
          photoURL: user.photoURL || "",
          bio: "",
        });
      }
    }
  );

  return () => {
    mounted = false;
    try {
      unsub();
    } catch {}
  };
}, [user]);


// ---------------- Notifications subscriptions ----------------
useEffect(() => {
if (!user) {
  // ensure counts cleared when no user
  setUnreadCount(0);
  setAdminUnreadCount(0);
  return;
}

let mounted = true;

let unsubRecipient = null;
let unsubUserId = null;
let unsubAdminRole = null;
let unsubAdminIsAdmin = null;

// hold ids from user-notification listeners (for de-duplication)
const userNotifIdsRef = {
  current: {
    recipient: new Set(), 
    userId: new Set(),   
  },
};

// hold ids from admin-notification listeners (for de-duplication)
const adminNotifIdsRef = {
  current: {
    recipientRole: new Set(), 
    isAdmin: new Set(),       
  },
};

const updateUserUnread = () => {
  const merged = new Set();
  for (const id of userNotifIdsRef.current.recipient) merged.add(id);
  for (const id of userNotifIdsRef.current.userId) merged.add(id);
  setUnreadCount(merged.size);
};

const updateAdminUnread = () => {
  const merged = new Set();
  for (const id of adminNotifIdsRef.current.recipientRole) merged.add(id);
  for (const id of adminNotifIdsRef.current.isAdmin) merged.add(id);
  setAdminUnreadCount(merged.size);
};


const detectAdmin = async () => {
  
  const fbUser = user && typeof user.getIdToken === "function"
    ? user
    : (typeof auth !== "undefined" && auth?.currentUser) || null;

  try {
    if (fbUser) {
      const tokenRes = await getIdTokenResult(fbUser);
      const claims = tokenRes?.claims || {};

      if (
        claims.admin === true ||
        claims.isAdmin === true ||
        claims.role === "admin"
      ) {
        return true;
      }
    }
  } catch (err) {
    console.warn("getIdTokenResult failed (admin detect):", err);
  }

  
  return (
    user?.email === (import.meta.env?.VITE_ADMIN_EMAIL || "admin@giveaura.com")
  );
};

// create snapshot listeners that collect unique doc ids from multiple queries
const makeUserListeners = () => {
  try {
    // Query A: notifications specifically addressed via recipientId
    const qRec = query(
      collection(db, "notifications"),
      where("recipientId", "==", user.uid),
      where("read", "==", false),
      orderBy("createdAt", "desc"),
      limit(500)
    );

    // Query B: notifications that use userId field instead
    const qUserId = query(
      collection(db, "notifications"),
      where("userId", "==", user.uid),
      where("read", "==", false),
      orderBy("createdAt", "desc"),
      limit(500)
    );

    unsubRecipient = onSnapshot(
      qRec,
      (snap) => {
        if (!mounted) return;
        userNotifIdsRef.current.recipient = new Set(
          snap.docs.map((d) => d.id)
        );
        updateUserUnread();
      },
      (err) => {
        console.warn("user recipient notifications listener err:", err);
      }
    );

    unsubUserId = onSnapshot(
      qUserId,
      (snap) => {
        if (!mounted) return;
        userNotifIdsRef.current.userId = new Set(
          snap.docs.map((d) => d.id)
        );
        updateUserUnread();
      },
      (err) => {
        console.warn("userId notifications listener err:", err);
      }
    );
  } catch (err) {
    console.warn("subscribe user notifications failed:", err);
  }
};

const makeAdminListeners = () => {
  try {
    const qAdminRole = query(
      collection(db, "notifications"),
      where("recipientRole", "==", "admin"),
      where("read", "==", false),
      orderBy("createdAt", "desc"),
      limit(500)
    );

    unsubAdminRole = onSnapshot(
      qAdminRole,
      (snap) => {
        if (!mounted) return;
        adminNotifIdsRef.current.recipientRole = new Set(
          snap.docs.map((d) => d.id)
        );
        updateAdminUnread();
      },
      (err) => {
        console.warn("admin recipientRole listener err:", err);
      }
    );
  } catch (err) {
    console.warn("subscribe admin.recipientRole failed:", err);
  }

  try {
    const qAdminIsAdmin = query(
      collection(db, "notifications"),
      where("isAdmin", "==", true),
      where("read", "==", false),
      orderBy("createdAt", "desc"),
      limit(500)
    );

    unsubAdminIsAdmin = onSnapshot(
      qAdminIsAdmin,
      (snap) => {
        if (!mounted) return;
        adminNotifIdsRef.current.isAdmin = new Set(
          snap.docs.map((d) => d.id)
        );
        updateAdminUnread();
      },
      (err) => {
        console.warn("admin isAdmin listener err:", err);
      }
    );
  } catch (err) {
    console.warn("subscribe admin.isAdmin failed:", err);
  }
};

// run setup
(async () => {
  const isAdmin = await detectAdmin();

  makeUserListeners();

  if (isAdmin) {
    makeAdminListeners();
  } else {
    setAdminUnreadCount(0);
  }
})();

// cleanup
return () => {
  mounted = false;
  try {
    unsubRecipient && unsubRecipient();
  } catch {}
  try {
    unsubUserId && unsubUserId();
  } catch {}
  try {
    unsubAdminRole && unsubAdminRole();
  } catch {}
  try {
    unsubAdminIsAdmin && unsubAdminIsAdmin();
  } catch {}
};
}, [user]);

const subscribeToDonorProfiles = (donorIds = []) => {
  donorIds.forEach((uid) => {
    if (!uid) return;

    if (donorProfileUnsubsRef.current[uid]) return;

    const userRef = doc(db, "users", uid);

    const unsub = onSnapshot(
      userRef,
      (snap) => {
        if (snap.exists()) {
          setDonorProfiles((prev) => ({
            ...prev,
            [uid]: snap.data(),
          }));
        }
      },
      (err) => {
        console.warn("Donor profile realtime error:", err);
      }
    );

    donorProfileUnsubsRef.current[uid] = unsub;
  });
};

useEffect(() => {
  return () => {
    Object.values(donorProfileUnsubsRef.current).forEach((unsub) => {
      try {
        unsub();
      } catch {}
    });
    donorProfileUnsubsRef.current = {};
  };
}, []);


// ---------------- site settings loader ----------------
useEffect(() => {
  let mounted = true;
  const fetchSiteSettings = async () => {
    try {
      const sdoc = doc(db, "settings", "site");
      const snap = await getDoc(sdoc);
      if (snap.exists()) {
        if (!mounted) return;
        setSiteSettings(snap.data() || { showPopup: true, popupMessage: "" });
      } else {

        setSiteSettings({ showPopup: true, popupMessage: "" });
      }
    } catch (err) {
      console.warn("Failed to fetch site settings:", err);
      setSiteSettings({ showPopup: true, popupMessage: "" });
    } finally {
      if (mounted) setSiteSettingsLoaded(true);
    }
  };
  fetchSiteSettings();
  return () => {
    mounted = false;
  };
}, []);

// ---------------- Admin-created popups loader ----------------
useEffect(() => {
  if (!siteSettingsLoaded) return;

  let mounted = true;
      const fetchPopups = async () => {
    if (!siteSettings || siteSettings.showPopup === false) {

      if (mounted) {
        setAdminPopup(null);
        setShowAdminPopup(false);
      }
      return;
    }

    try {

      let snap;
      try {
        const q = query(collection(db, "popups"), orderBy("createdAt", "desc"));
        snap = await getDocs(q);
      } catch (err) {
        // if ordering fails (missing index / mixed types), fallback
        snap = await getDocs(collection(db, "popups"));
      }

      if (!mounted) return;

      const docs = snap.docs.map((d) => {
        const data = d.data() || {};
        // normalize createdAt to JS Date
        let createdAt = null;
        if (data.createdAt?.toDate) createdAt = data.createdAt.toDate();
        else if (data.createdAt?.seconds) createdAt = new Date(data.createdAt.seconds * 1000);
        else if (typeof data.createdAt === "number")
          createdAt = data.createdAt > 1e12 ? new Date(data.createdAt) : new Date(data.createdAt * 1000);
        else if (typeof data.createdAt === "string") createdAt = new Date(data.createdAt);
        else createdAt = new Date();

        return {
          id: d.id,
          ...data,
          createdAt,
        };
      });

      // Only active popups
      const active = docs.filter((p) => p.active !== false);

      // Prefer newest admin-created popup (assuming admin creates one)
      const candidate = active.length > 0 ? active[0] : null;
      if (!mounted) return;

      // Show at most once per session, regardless of candidate.showOnce
      if (!candidate) {
        setAdminPopup(null);
        setShowAdminPopup(false);
        return;
      }

      const shownKey = `giveaura_popup_shown_${candidate.id}`;
      let alreadyShown = false;
      try {
        alreadyShown = !!sessionStorage.getItem(shownKey);
      } catch {
        alreadyShown = false;
      }

      if (alreadyShown) {
        // already shown in this session  keep closed
        setAdminPopup(null);
        setShowAdminPopup(false);
        return;
      }

      // first time this session  show and mark as shown
      setAdminPopup(candidate);
      setShowAdminPopup(true);
      try {
        sessionStorage.setItem(shownKey, "1");
      } catch {}
    } catch (err) {
      console.warn("Failed to fetch popups:", err);
      setAdminPopup(null);
      setShowAdminPopup(false);
    }
  };

  // initial fetch
  fetchPopups();

  // poll occasionally so new popups appear without a full reload
  const iv = setInterval(fetchPopups, 20_000);

  return () => {
    mounted = false;
    clearInterval(iv);
  };

}, [siteSettingsLoaded, siteSettings?.showPopup, adminPopup, donorProfiles]);

// ---------------- events loader ----------------
useEffect(() => {
  let mounted = true;
  const fetchEvents = async () => {
    setEventsLoaded(false);
    try {
      const q = query(collection(db, "events"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      const items = snap.docs.map((d) => {
        const data = d.data();
        return { id: d.id, ...data };
      });
      if (!mounted) return;
      setEvents(items);
    } catch (err) {
      console.warn("Failed to fetch events:", err);
      if (mounted) setEvents([]);
    } finally {
      if (mounted) setEventsLoaded(true);
    }
  };
  fetchEvents();
  // poll for event updates periodically so live toggles appear without full refresh
  const iv = setInterval(fetchEvents, 15000);
  return () => {
    mounted = false;
    clearInterval(iv);
  };
}, []);

// ---------------- Top Donor popup (one-time) ----------------
useEffect(() => {
  if (!siteSettingsLoaded) return;
  if (!siteSettings || !siteSettings.showPopup) return;
  if (adminPopup) return;

  const shown = sessionStorage.getItem("shownTopDonorPopup");
  if (shown) return;

  let mounted = true;

  const findTopDonor = async () => {
    try {
      const donations = await getRecentDonations(1000);
      if (!mounted || !Array.isArray(donations) || donations.length === 0) return;


      const totals = new Map();
      for (const d of donations) {
        const key = d.donorId || d.donorEmail;
        if (!key) continue;
        const prev = totals.get(key) || { donorId: d.donorId || null, donorEmail: d.donorEmail || null, fundraiserCollected: 0, sample: d, latest: null };

        const gross = inferGross(d);
        const fundraiserAmt = gross > 0 ? fundraiserFromGross(gross) : (typeof d.amount === "number" ? Number(d.amount) : 0);
        prev.fundraiserCollected = (prev.fundraiserCollected || 0) + (fundraiserAmt || 0);
        if (d.donatedAt) {
          const da = d.donatedAt.toDate ? d.donatedAt.toDate() : new Date(d.donatedAt);
          if (!prev.latest || da > prev.latest) prev.latest = da;
        }
        prev.sample = d;
        totals.set(key, prev);
      }

      if (totals.size === 0) return;
      const arr = Array.from(totals.values()).sort((a, b) => b.fundraiserCollected - a.fundraiserCollected);
      const top = arr[0];
      if (!top) return;

      subscribeToDonorProfiles([top.donorId]);

const profile = donorProfiles[top.donorId] || {};

if (!mounted) return;

setTopDonor({
  donorId: top.donorId || null,

  name:
    profile.displayName ||
    top.sample?.donorName ||
    top.sample?.donorEmail?.split?.("@")?.[0] ||
    "Someone",

  photo:
    profile.photoURL ||
    top.sample?.photoURL ||
    null,

  total: Number(top.fundraiserCollected || 0),
});

      setShowTopDonorPopup(true);
      sessionStorage.setItem("shownTopDonorPopup", "true");
    } catch (err) {
      console.warn("Top donor fetch failed:", err);
    }
  };

  findTopDonor();

  return () => {
    mounted = false;
  };

}, [siteSettingsLoaded, siteSettings?.showPopup, adminPopup]);

// ---------------- Campaigns realtime + donors map ----------------
useEffect(() => {
  let mounted = true;
  setLoadingCampaigns(true);

  const publicQ = query(collection(db, "campaigns"), orderBy("createdAt", "desc"));
  let publicCampaigns = [];
  let userCampaigns = [];

  const updateMerged = async () => {
    try {
      const map = new Map();
      for (const c of publicCampaigns) map.set(c.id, c);
      for (const c of userCampaigns) map.set(c.id, c);
      const merged = Array.from(map.values());
      merged.sort((a, b) => b.createdAt - a.createdAt);

      if (!mounted) return;
      setCampaigns(merged);

      // For each campaign, build top donors list where amount is visible
      const donorsPromises = merged.map(async (c) => {
  try {
    const rawDonors = await getDonationsByCampaign(c.id);

    // Aggregate by STABLE donor identity
    const agg = new Map();

    for (const d of rawDonors) {
      const donorKey =
        d.donorId ||
        (typeof d.donorEmail === "string" && d.donorEmail.toLowerCase()) ||
        `anon_${d.paymentId || d.id}`;

      if (!donorKey) continue;

      const existing = agg.get(donorKey) || {
        donorId: d.donorId || null,
        donorEmail: d.donorEmail || null,
        fundraiserCollected: 0,
        latest: null,
        sample: d,
      };

      //  fundraiser-visible amount
      const gross = inferGross(d);
      const fundraiserAmt =
        gross > 0
          ? fundraiserFromGross(gross)
          : typeof d.amount === "number"
            ? Number(d.amount)
            : 0;

      existing.fundraiserCollected += fundraiserAmt;

      if (d.donatedAt) {
        const dt = d.donatedAt?.toDate
          ? d.donatedAt.toDate()
          : new Date(d.donatedAt);
        if (!existing.latest || dt > existing.latest) {
          existing.latest = dt;
        }
      }

      existing.sample = d;
      agg.set(donorKey, existing);
    }

    // Top donors by fundraiser-visible amount
    const topAgg = Array.from(agg.values())
      .sort((a, b) => b.fundraiserCollected - a.fundraiserCollected)
      .slice(0, 3);

    // Resolve profiles (cached via resolveDonorProfile)
    // collect donorIds
const donorIds = topAgg
  .map((t) => t.donorId)
  .filter(Boolean);

// subscribe realtime
subscribeToDonorProfiles(donorIds);

// build enriched without fetching
const enriched = topAgg.map((t) => {
  const profile = donorProfiles[t.donorId] || {};

  return {
    donorId: t.donorId,
    donorEmail: t.donorEmail,
    donorName:
      profile.displayName ||
      t.sample?.donorName ||
      t.sample?.donorEmail?.split("@")[0] ||
      "Anonymous",
    photoURL:
      profile.photoURL ||
      t.sample?.photoURL ||
      null,
    amount: Number(t.fundraiserCollected || 0),
    latestDonatedAt: t.latest,
  };
});

    return { id: c.id, donors: enriched };
  } catch (err) {
    console.warn("donorsPromises failed:", err);
    return { id: c.id, donors: [] };
  }
});

      const donorsResults = await Promise.all(donorsPromises);
      if (!mounted) return;

      const donorsObj = donorsResults.reduce((acc, r) => {
        acc[r.id] = r.donors;
        return acc;
      }, {});
      setDonorsMap(donorsObj);
    } catch (err) {
      console.error("updateMerged error:", err);
    } finally {
      if (mounted) setLoadingCampaigns(false);
    }
  };

  const unsubPublic = onSnapshot(
    publicQ,
    (snap) => {
      publicCampaigns = snap.docs.map(normalize);
      updateMerged();
    },
    (err) => {
      console.error("Public campaigns snapshot error:", err);
      if (mounted) setLoadingCampaigns(false);
    }
  );

  let unsubUser = null;
  if (user && user.uid) {
    const userQ = query(
      collection(db, "campaigns"),
      where("creatorId", "==", user.uid),
      orderBy("createdAt", "desc")
    );
    unsubUser = onSnapshot(
      userQ,
      (snap) => {
        userCampaigns = snap.docs.map(normalize);
        updateMerged();
      },
      (err) => console.error("User campaigns snapshot error:", err)
    );
  }

  return () => {
    mounted = false;
    try {
      unsubPublic && unsubPublic();
    } catch {}
    try {
      unsubUser && unsubUser();
    } catch {}
  };
}, [user, donorProfiles]);

// ---------------- Completed alerts & hide ended campaigns ----------------
useEffect(() => {
  const visible = [];
  let shownIds = [];
  try {
    const raw = localStorage.getItem("shownCompletedCampaigns");
    shownIds = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(shownIds)) shownIds = [];
  } catch (err) {
    shownIds = [];
  }

  let changed = false;

  for (const c of campaigns) {
    const goal = Number(c.goalAmount || 0);

    // c.fundsRaised is assumed to already be fundraiser-visible (95%) in this codebase
    const displayedRaised = Number(c.fundsRaised || 0);

    // completed check compares fundraiser-visible value to goal
    const completed = goal > 0 && displayedRaised >= goal;

    const isCreator = user && user.email === c.creatorEmail;
    const isAdmin = user && user.email === (import.meta.env?.VITE_ADMIN_EMAIL || "admin@giveaura.com");

    if (completed) {
      if ((isCreator || isAdmin) && !shownIds.includes(c.id)) {
        try {
          // format with 2 decimal places (Indian locale)
          const formatted = displayedRaised.toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          alert(`🎉 Campaign "${c.title}" has reached 100% funding for the fundraiser! (₹${formatted})`);
        } catch (err) {
          // ignore alert errors (e.g. blocked)
        }
        shownIds.push(c.id);
        changed = true;
      }
    }

    const ended = c.endDate ? new Date(c.endDate) <= new Date() : false;

visible.push(c);

  }

  if (changed) {
    try {
      localStorage.setItem("shownCompletedCampaigns", JSON.stringify(shownIds));
    } catch (err) {}
  }

  setVisibleCampaigns(visible);
}, [campaigns, user]);

const parsedSearch = useMemo(() => {
  const words = searchQuery.toLowerCase().split(/\s+/);

  const tags = words
    .filter((w) => w.startsWith("#"))
    .map((w) => w.replace("#", ""));

  const text = words
    .filter((w) => !w.startsWith("#"))
    .join(" ");

  const tagMatch =
  tags.length === 0 ||
  tags.every((tg) => campaignTags.includes(tg));


  return { tags, text };
}, [searchQuery]);


// ---------------- filtering + sorting ----------------
useEffect(() => {
  let filtered = [...visibleCampaigns];

  /* Search (title + description + tags) */
  if (searchQuery?.trim()) {
    const { text, tags } = parsedSearch;

    filtered = filtered.filter((c) => {
      const title = (c.title || "").toLowerCase();
      const desc = (c.description || "").toLowerCase();
      const campaignTags = Array.isArray(c.tags)
        ? c.tags.map((t) => t.toLowerCase())
        : [];

      const textMatch =
        !text ||
        title.includes(text) ||
        desc.includes(text);

      const tagMatch =
        tags.length === 0 ||
        tags.every((tg) => campaignTags.includes(tg));

      return textMatch && tagMatch;
    });
  }

  /* 👤 Ownership */
  if (showMyCampaigns && user?.email) {
    filtered = filtered.filter(
      (c) => c.creatorEmail === user.email
    );
  }

  /* 🚦 Urgency */
  if (urgencyFilter && urgencyFilter !== "all") {
    filtered = filtered.filter((c) => {
      const status = computeTimeStatus(c);
      return status.colorKey === urgencyFilter;
    });
  }

  /* Categories (FIXED) */
  if (Array.isArray(selectedCategories) && selectedCategories.length > 0) {
    filtered = filtered.filter((c) => {
      const type = (c.campaignType || "").toLowerCase();

      return selectedCategories.some((cat) =>
        type.includes(cat)
      );
    });
  }


  /* Sorting */
  if (sortType === "mostFunded") {
    filtered.sort((a, b) => {
      const boostDiff = getBoostRank(b) - getBoostRank(a);
      if (boostDiff !== 0) return boostDiff;
      return Number(b.fundsRaised || 0) - Number(a.fundsRaised || 0);
    });
  } else {
    filtered.sort((a, b) => {
      const boostDiff = getBoostRank(b) - getBoostRank(a);
      if (boostDiff !== 0) return boostDiff;
      return b.createdAt - a.createdAt;
    });
  }

  setFilteredCampaigns(filtered);
  window.scrollTo({ top: 0, behavior: "smooth" });

}, [
  visibleCampaigns,
  searchQuery,
  sortType,
  urgencyFilter,
  showMyCampaigns,
  selectedCategories,
  user?.email,
]);

// ---------------- Donor modal ----------------
const openModal = async (campaign) => {
try {
  const donors = await getDonationsByCampaign(campaign.id);
  const enrichedFull = await Promise.all(
    donors
      .slice() // copy, so we don't mutate original
      .reverse()
      .map(async (d) => {
        const profile = donorProfiles[d.donorId] || {};

        const gross = inferGross(d);
        const fundraiserAmt =
          typeof d.amount === "number" && d.amount > 0 && gross === 0
            ? Number(d.amount)
            : gross > 0
            ? fundraiserFromGross(gross)
            : typeof d.amount === "number"
            ? Number(d.amount)
            : 0;

        return {
          ...d,
          donorName:
            profile.displayName ||
            d.donorName ||
            (d.donorEmail ? d.donorEmail.split("@")[0] : "Someone"),

          photoURL:
            profile.photoURL ||
            d.photoURL ||
            null,

          displayedAmount: fundraiserAmt,
        };
      })
  );
  setSelectedCampaign(campaign);
  setSelectedDonors(enrichedFull);
  setModalIsOpen(true);
} catch (err) {
  console.error("Failed to fetch donors for modal:", err);
  setSelectedCampaign(campaign);
  setSelectedDonors([]);
  setModalIsOpen(true);
}
};

const closeModal = () => {
  setModalIsOpen(false);
  setSelectedCampaign(null);
  setSelectedDonors([]);
};

// ---------------- Auth actions ----------------
const handleLogout = async () => {
  try {
    await logout();
    navigate("/login");
  } catch (error) {
    console.error("Logout failed:", error);
  }
};

const handleDelete = async (id) => {
  if (window.confirm("Are you sure you want to delete this campaign?")) {
    try {
      await deleteCampaign(id);
    } catch (err) {
      console.error("Delete campaign failed:", err);
    }
  }
};

if (loading) {
  return <div style={{ textAlign: "center", marginTop: "100px" }}>Checking session...</div>;
}

const avatarSrc = (profile && profile.photoURL) || (user && user.photoURL) || "/default-avatar.png";
const displayName = (profile && profile.displayName) || user?.displayName || (user?.email?.split("@")[0] ?? "Profile");

// Helper used elsewhere in the component
const donorAvatar = (url) => url || "/default-avatar.png";

// Higher number = higher priority in the feed
const getBoostRank = (campaign) => {
const plan = campaign?.boostPlan || (campaign?.isBoosted ? "basic" : "none");

switch (plan) {
  case "super":
    return 3;
  case "premium":
    return 2;
  case "basic":
    return 1;
  default:
    return 0;
}
};


// ---------- Helper: compute urgency / label / CSS ----------
const computeTimeStatus = (campaign) => {
  const now = new Date();
  if (!campaign?.endDate) {
    return { label: "No end date", daysRemaining: null, colorKey: "gray" };
  }
  const end = campaign.endDate instanceof Date ? campaign.endDate : new Date(campaign.endDate);
  const msPerDay = 1000 * 60 * 60 * 24;
  const diffMs = end.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffMs / msPerDay);
  const goal = Number(campaign.goalAmount || 0);
  // c.fundsRaised is assumed to be fundraiser-visible
  const displayedRaised = Number(campaign.fundsRaised || 0);
  const percent = goal > 0 ? displayedRaised / goal : 0;

  if (diffMs <= 0) {
    return { label: "⛔ Ended", daysRemaining: 0, colorKey: "gray" };
  }

  let colorKey = "green";
  if (daysRemaining >= 30) colorKey = "green";
  else if (daysRemaining >= 15) colorKey = "yellow";
  else colorKey = "red";

  if (daysRemaining < 15 && percent < 0.5) {
    colorKey = "red";
  }

  const label = daysRemaining === 1 ? "Ends in 1 day" : `Ends in ${daysRemaining}d`;
  return { label, daysRemaining, colorKey };
};

// ---------------- Admin popup UI helpers ----------------
const closeAdminPopup = (popup) => {
  try {
    if (!popup) return;
    const key = `giveaura_popup_shown_${popup.id}`;
    try {
      sessionStorage.setItem(key, Date.now().toString());
    } catch {}
  } catch {}
  setShowAdminPopup(false);
  setAdminPopup(null);
};

const onAdminPopupPrimary = (popup) => {
  if (!popup) return;
  if (popup.campaignId) {
    closeAdminPopup(popup);
    navigate(`/campaign/${popup.campaignId}`);
    return;
  }
  if (popup.url) {
    window.open(popup.url, "_blank", "noopener");
    closeAdminPopup(popup);
    return;
  }
  closeAdminPopup(popup);
};

// ---------------- Membership functions ----------------
const openMemberModal = () => setMemberModalOpen(true);
const closeMemberModal = () => {
  setMemberModalOpen(false);
  setMemberForm({ name: "", email: "", phone: "", message: "" });
};

const validatePhone = (phone) => {
  if (!phone) return false;
  // simple validation: 10-15 digits, allow + and spaces/dashes
  const cleaned = phone.replace(/[\s\-()]/g, "");
  const match = cleaned.match(/^\+?\d{10,15}$/);
  return !!match;
};

const submitMembership = async (e) => {
  e && e.preventDefault();
  if (!memberForm.name.trim() || !memberForm.email.trim() || !memberForm.phone.trim()) {
    alert("Name, email and mobile number are required");
    return;
  }
  if (!validatePhone(memberForm.phone.trim())) {
    alert("Please enter a valid mobile number (10-15 digits, can include +).");
    return;
  }
  setMemberSubmitting(true);
  try {
    const payload = {
      name: memberForm.name.trim(),
      email: memberForm.email.trim(),
      phone: memberForm.phone.trim(),
      message: memberForm.message?.trim() || "",
      createdAt: new Date(),
      source: "home_become_member",
    };
    await addDoc(collection(db, "members"), payload);
    alert("Thanks — membership request submitted!");
    closeMemberModal();
  } catch (err) {
    console.error("submitMembership failed:", err);
    alert("Failed to submit membership request.");
  } finally {
    setMemberSubmitting(false);
  }
};

return (
  <div style={{ fontFamily: "'Poppins', sans-serif", background: "#f0f2f5", minHeight: "100vh" }}>
<>
</>  

    {/* 🎉 Admin-created Popup (highest priority) */}
    {showAdminPopup && adminPopup && siteSettings?.showPopup && (
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "rgba(15, 23, 42, 0.78)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 4000,
          padding: 16,
        }}
        onClick={() => closeAdminPopup(adminPopup)}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "white",
            borderRadius: 20,
            boxShadow: "0 16px 50px rgba(0,0,0,0.35)",
            padding: 28,
            maxWidth: 740,
            width: "100%",
            textAlign: "center",
            transform: "translateY(0)",
            animation: "popIn 420ms cubic-bezier(.22,.9,.32,1)",
          }}
        >
          {adminPopup.imageUrl && (
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
              <img
                src={adminPopup.imageUrl}
                alt={adminPopup.title || "Popup image"}
                style={{ width: 220, height: 140, borderRadius: 12, objectFit: "cover", boxShadow: "0 8px 36px rgba(0,0,0,0.12)" }}
                onError={(e)=>{ e.currentTarget.onerror = null; e.currentTarget.style.display="none"; }}
              />
            </div>
          )}

          {adminPopup.videoUrl && !adminPopup.imageUrl && (
            <div style={{ marginBottom: 12 }}>
              <video src={adminPopup.videoUrl} controls style={{ width: "100%", maxHeight: 360, borderRadius: 12 }} />
            </div>
          )}

          <h2 style={{ margin: "6px 0 2px", color: "#111827" }}>{adminPopup.title || "Announcement"}</h2>
          <p style={{ color: "#374151", fontWeight: 600, marginTop: 8 }}>{adminPopup.message}</p>

          <div style={{ marginTop: 18, display: "flex", justifyContent: "center", gap: 12 }}>
            <button
              onClick={() => onAdminPopupPrimary(adminPopup)}
              className="btn"
              style={{ padding: "10px 18px", borderRadius: 10 }}
            >
              {adminPopup.primaryLabel || (adminPopup.campaignId ? "Open Campaign" : "OK")}
            </button>
            <button
              onClick={() => closeAdminPopup(adminPopup)}
              className="btn"
              style={{ padding: "10px 18px", borderRadius: 10, background: "#ccc", color: "#111" }}
            >
              Close
            </button>
          </div>
        </div>

        <style>{`
          @keyframes popIn {
            0% { transform: translateY(18px) scale(0.96); opacity: 0; }
            100% { transform: translateY(0) scale(1); opacity: 1; }
          }
        `}</style>
      </div>
    )}

{/* 🎉 Top Donor Celebration Popup (one-time per session) */}
{!showAdminPopup &&
  showTopDonorPopup &&
  topDonor &&
  siteSettings?.showPopup && (() => {

    //  Realtime profile override (if updated)
    const realtimeProfile =
      topDonor?.donorId && donorProfiles?.[topDonor.donorId]
        ? donorProfiles[topDonor.donorId]
        : null;

    const donorName =
      realtimeProfile?.displayName ||
      topDonor.name ||
      "Top Donor";

    const donorPhoto =
      realtimeProfile?.photoURL ||
      topDonor.photo ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(
        donorName
      )}&background=random`;

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="top-donor-title"
        className="top-donor-overlay"
        onClick={() => setShowTopDonorPopup(false)}
      >
        <div
          className="top-donor-card"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Avatar */}
          <div className="top-donor-avatar-wrap">
            <div className="top-donor-avatar-ring">
              <img
                src={donorPhoto}
                alt={donorName}
                className="top-donor-avatar"
              />
            </div>
          </div>

          {/* Title */}
          <h2 id="top-donor-title" className="top-donor-title">
            🏆 Top Donor of GiveAura
          </h2>

          {/* Name */}
          <h3 className="top-donor-name">{donorName}</h3>

          {/* Amount */}
          <p className="top-donor-amount">
            Donated a total of{" "}
            <strong>
              ₹{Number(topDonor.total || 0).toLocaleString("en-IN")}
            </strong>
          </p>

          {/* Optional Admin Message */}
          {siteSettings?.popupMessage && (
            <p className="top-donor-message">
              {siteSettings.popupMessage}
            </p>
          )}

          {/* Actions */}
          <div className="top-donor-actions">
            <button
              className="btn top-donor-primary-btn"
              onClick={() => setShowTopDonorPopup(false)}
            >
              Awesome! 🎉
            </button>

            {liveEvent && (
              <button
                className="btn top-donor-live-btn"
                onClick={() => {
                  setShowTopDonorPopup(false);
                  navigate("/events");
                }}
              >
                See LIVE Event 🔴
              </button>
            )}
          </div>
        </div>
      </div>
    );
  })()}

{/* Campaign Cards — Premium UI (100% GROSS DONATIONS) */}
<div className="campaign-page">
<main className="campaign-container grid-v2" aria-live="polite">
{loadingCampaigns ? (
  <div className="skeleton-row">
    {Array.from({ length: 6 }).map((_, i) => (
      <div className="campaign-card skeleton" key={i} aria-hidden="true">
        <div className="media-skeleton" />
        <div className="meta-skeleton" />
        <div className="text-skeleton short" />
        <div className="text-skeleton long" />
        <div className="progress-skeleton" />
      </div>
    ))}
  </div>
) : filteredCampaigns.length === 0 ? (
  <p className="no-campaigns">No campaigns found.</p>
) : (
  filteredCampaigns
    .filter((c) => {

      if (user?.token?.admin) return true;

      if (user && (user.uid === c.creatorId || user.email === c.creatorEmail)) {
        return true;
      }

      return c.isApproved === true;
    })
    .map((c) => {
    /* ===============================
        GOAL (SOURCE OF TRUTH)
    =============================== */
    const goal = Number(c.goalAmount || 0);

    const campaignTags = Array.isArray(c.tags)
  ? c.tags.filter((t) => typeof t === "string" && t.trim())
  : [];

    /* ===============================
        DONORS (SAFE + NO SPLIT)
    =============================== */
    const donors = Array.isArray(donorsMap?.[c.id])
      ? donorsMap[c.id]
          .filter((d) => d && typeof d === "object")
          .map((d) => {
          const donorEmail =
            typeof d.donorEmail === "string" ? d.donorEmail : null;

          const donorName =
            typeof d.donorDisplayName === "string"
              ? d.donorDisplayName
              : typeof d.donorName === "string"
              ? d.donorName
              : donorEmail
              ? donorEmail.split("@")[0]
              : "Anonymous";

          return {
            donorId: d.donorId || null, 
            donorName,
            donorEmail,
            photoURL:
              typeof d.photoURL === "string"
                ? d.photoURL
                : typeof d.donorPhoto === "string"
                ? d.donorPhoto
                : null,
            amount: Number(d.amount) || 0,
          };
        })

          .filter((d) => d.amount > 0)
          .sort((a, b) => b.amount - a.amount)
      : [];

      /* ===============================
        GROUP DONATIONS BY DONOR
      =============================== */
      const donorTotalsMap = {};

      donors.forEach((d) => {
        const key = d.donorEmail || d.donorName;
        if (!key) return;

        donorTotalsMap[key] = {
          donorName: d.donorName,
          donorEmail: d.donorEmail,
          photoURL: getDonorAvatarUrl(d),
          amount: (donorTotalsMap[key]?.amount || 0) + d.amount,
        };
      });



      /* ===============================
        TOP DONOR (HIGHEST TOTAL)
      =============================== */
      const campaignTopDonorRaw = Object.values(donorTotalsMap)
        .sort((a, b) => b.amount - a.amount)[0] || null;

      const campaignTopDonor = campaignTopDonorRaw
    ? {
        donorName: campaignTopDonorRaw.donorName,
        photoURL: getDonorAvatarUrl(campaignTopDonorRaw),
        amount: campaignTopDonorRaw.amount,
      }
    : null;

      const campaignTopDonorPhoto = campaignTopDonorRaw
        ? getDonorAvatarUrl(campaignTopDonorRaw)
        : null;



    /* ===============================
        TOTAL DONATED (100% GROSS)
    =============================== */
    const totalDonated = sumDonations(donors);

    const percentage = goal
      ? Math.min((totalDonated / goal) * 100, 100)
      : 0;

      const now = Date.now();

      const endDateMs =
        c.endDate?.seconds
          ? c.endDate.seconds * 1000
          : c.endDate
          ? new Date(c.endDate).getTime()
          : null;

      const isEndedByDate = endDateMs ? now > endDateMs : false;

      const isCompleted = goal > 0 && totalDonated >= goal;

      const isEnded = isEndedByDate || isCompleted;


    /* ===============================
        MEDIA
    =============================== */
    const videoSrc = c.videoUrl || c.videoURL || null;
    const imageSrc =
      c.imageUrl ||
      c.image ||
      c.creatorPhoto ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(
        c.title || "Campaign"
      )}&background=ddd&color=555`;

    const timeStatus = computeTimeStatus(c);

    const colorMap = {
      green: { border: "#16a34a", bg: "#ecfdf5", pill: "#10b981" },
      yellow: { border: "#d97706", bg: "#fffbeb", pill: "#f59e0b" },
      red: { border: "#dc2626", bg: "#fff1f2", pill: "#ef4444" },
      gray: { border: "#6b7280", bg: "#f3f4f6", pill: "#6b7280" },
    };
    const colors = colorMap[timeStatus.colorKey] || colorMap.gray;

    const fmt = (n) =>
      new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }).format(Number(n || 0));

    const typeMeta = c.campaignType
      ? getCampaignTypeMeta(c.campaignType)
      : null;

    const isCreator =
      user && (user.uid === c.creatorId || user.email === c.creatorEmail);

    const hasBoost =
      isCreator && c.isBoosted && c.boostPlan && c.boostPlan !== "none";

    const boostLabel =
      c.boostPlan === "super"
        ? "Super Boost"
        : c.boostPlan === "premium"
        ? "Premium Boost"
        : "Boosted";

    const donorAvatars = donors.slice(0, 5);

    return (
      <article
        key={c.id}
        className="campaign-card enhanced"
        style={{ borderLeft: `4px solid ${colors.border}` }}
      >
        {/* MEDIA */}
        <div
          className="media-block"
          onMouseEnter={(e) => {
            const video = e.currentTarget.querySelector("video");
            if (video) {
              video.currentTime = 0;
              video.play().catch(() => {});
            }
          }}
          onMouseLeave={(e) => {
            const video = e.currentTarget.querySelector("video");
            if (video) {
              video.pause();
              video.currentTime = 0;
            }
          }}
          onClick={() =>
            window.open(`/campaign/${c.id}`, "_blank", "noopener,noreferrer")
          }
        >

          <div className="media-badges">
            
            {hasBoost && (
              <span className="badge boost">🔥 {boostLabel}</span>
            )}
            {typeMeta && (
              <span className="badge type">
                {typeMeta.icon} {typeMeta.label}
              </span>
            )}
          </div>

          {/*  COMPLETION SEAL */}
          {isEnded && (
            <div className="completion-seal">
              {isCompleted ? "CONTRIBUTION COMPLETED" : "CAMPAIGN ENDED"}
            </div>
          )}



          {videoSrc ? (
            <video
              src={videoSrc}
              className="media-el media-video"
              muted
              playsInline
              preload="metadata"
            />
          ) : (
            <img
              src={imageSrc}
              alt={c.title}
              className="media-el"
            />
          )}
          


        </div>

        {/* TOP DONOR STRIP (SAFE ZONE) */}
          {campaignTopDonorRaw && (
            <div className="top-donor-strip">
              <img
                src={campaignTopDonorRaw.photoURL}
                alt={campaignTopDonorRaw.donorName}
              />
              <div>
                <strong>Top Donor</strong>
                <span>{fmt(campaignTopDonorRaw.amount)}</span>
              </div>
            </div>
          )}

        <h3 className="card-title">{c.title}</h3>
        {campaignTags.length > 0 && (
        <div className="tag-row">
          {campaignTags.slice(0, 4).map((tag, i) => (
            <span key={i} className="campaign-tag">
              #{tag}
            </span>
          ))}
        </div>
        )}

        <p className="card-desc">{c.description}</p>

        <div className="stats-row">
          <div className="stat">
            <div className="stat-label">Goal</div>
            <div className="stat-val">{fmt(goal)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Raised</div>
            <div className="stat-val">{fmt(totalDonated)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Progress</div>
            <div className="stat-val">{percentage.toFixed(1)}%</div>
          </div>
        </div>

        <div className="progress-wrap">
          <div className="progress-bg" style={{ background: colors.bg }}>
            <div
              className="progress-fill"
              style={{
                width: `${percentage}%`,
                background: colors.pill,
              }}
            />
          </div>
        </div>

        <div className="donor-row">
          <div className="donor-stack">
            {donorAvatars.length ? (
              donorAvatars.map((d, i) => (
                <img
                  key={i}
                  src={getDonorAvatarUrl(d)}
                  title={`${d.donorName} — ${fmt(d.amount)}`}
                  className="donor-avatar"
                />
              ))
            ) : (
              <span className="no-donors">Be the first donor</span>
            )}
          </div>

          <span
            className="urgency-pill"
            style={{ background: colors.pill }}
          >
            {timeStatus.label}
          </span>
        </div>

        <div className="action-row">
          <button
            className="btn view"
            onClick={() =>
              window.open(`/campaign/${c.id}`, "_blank", "noopener,noreferrer")
            }
          >
            View
          </button>

          {!isCompleted && (
          <button
            className="btn donate"
            disabled={!c.isVerified}
            onClick={() => c.isVerified && navigate(`/donate/${c.id}`)}
          >
            {c.isVerified ? "Donate" : "Awaiting Approval"}
          </button>
        )}

        </div>

        {isCreator && (
          <div className="creator-action-row">
            <span
              className="creator-link edit"
              onClick={() => navigate(`/edit/${c.id}`)}
            >
              Edit
            </span>
            <span
              className="creator-link delete"
              onClick={() => {
                if (
                  window.confirm(
                    "Are you sure you want to delete this campaign? This cannot be undone."
                  )
                ) {
                  handleDelete(c.id);
                }
              }}
            >
              Delete
            </span>
          </div>
        )}
        {/* Bottom Right Corner — Donor Count + Share */}
<div className="corner-actions">
  {donors.length > 0 && (
    <span className="corner-donor-count">
      {donors.length}
    </span>
  )}

  <button
    className="corner-share-btn"
    title="Share"
    onClick={() => {
      const url = `${window.location.origin}/campaign/${c.id}`;
      if (navigator.share) {
        navigator.share({ title: c.title, url });
      } else {
        navigator.clipboard.writeText(url);
      }
    }}
  >
    {/* Share SVG */}
    <svg
  viewBox="0 0 24 24"
  width="16"
  height="16"
  fill="none"
  stroke="currentColor"
  strokeWidth="2"
  strokeLinecap="round"
  strokeLinejoin="round"
>
  <circle cx="18" cy="5" r="3" />
  <circle cx="6" cy="12" r="3" />
  <circle cx="18" cy="19" r="3" />
  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
</svg>

  </button>

  <button
    className="corner-share-btn"
    title="WhatsApp"
    onClick={() =>
      window.open(
        `https://wa.me/?text=${encodeURIComponent(
          `${c.title} ${window.location.origin}/campaign/${c.id}`
        )}`,
        "_blank"
      )
    }
  >
<svg
  viewBox="0 0 32 32"
  width="16"
  height="16"
  fill="currentColor"
>
  <path d="M16 .4C7.5.4.6 7.3.6 15.8c0 2.8.7 5.5 2.1 7.8L.4 31.6l8.3-2.2c2.2 1.2 4.7 1.9 7.3 1.9 8.5 0 15.4-6.9 15.4-15.4S24.5.4 16 .4zm0 28.2c-2.3 0-4.5-.6-6.4-1.8l-.5-.3-4.9 1.3 1.3-4.8-.3-.5C3.9 20.5 3.3 18.2 3.3 16 3.3 9 9 3.3 16 3.3S28.7 9 28.7 16 23 28.6 16 28.6zm7.3-9.6c-.4-.2-2.2-1.1-2.6-1.2-.3-.1-.6-.2-.9.2-.3.4-1 1.2-1.2 1.4-.2.2-.4.3-.8.1-.4-.2-1.6-.6-3-1.9-1.1-1-1.9-2.3-2.1-2.7-.2-.4 0-.6.1-.8.1-.1.3-.4.4-.6.1-.2.2-.4.3-.6.1-.2 0-.5 0-.7 0-.2-.9-2.3-1.2-3.1-.3-.8-.6-.7-.9-.7h-.8c-.3 0-.7.1-1 .4-.3.3-1.3 1.3-1.3 3.1s1.3 3.6 1.5 3.9c.2.3 2.6 4 6.4 5.4.9.3 1.6.5 2.1.6.9.3 1.7.2 2.3.1.7-.1 2.2-.9 2.5-1.8.3-.9.3-1.7.2-1.8-.1-.1-.3-.2-.7-.4z"/>
</svg>

  </button>

  <button
    className="corner-share-btn"
    title="Facebook"
    onClick={() =>
      window.open(
        `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
          `${window.location.origin}/campaign/${c.id}`
        )}`,
        "_blank"
      )
    }
  >
<svg
  viewBox="0 0 24 24"
  width="16"
  height="16"
  fill="currentColor"
>
  <path d="M22 12a10 10 0 10-11.63 9.87v-6.99H7.9V12h2.47V9.8c0-2.44 1.45-3.79 3.67-3.79 1.06 0 2.17.19 2.17.19v2.39h-1.22c-1.2 0-1.57.75-1.57 1.52V12h2.67l-.43 2.88h-2.24v6.99A10 10 0 0022 12z"/>
</svg>

  </button>
</div>

      </article>
    );
  })
)}
</main>
</div>

{/* ---- Advertisement Popup (Session Only) ---- */}
{!showAdminPopup && !showTopDonorPopup && (
<SessionAdPopup side="right" />
)}


    {/* --- Become a Member CTA (visible after the campaign cards) --- */}
    <section className="become-member-section" aria-label="Become a member" style={{ width: "100%", display: "flex", justifyContent: "center", padding: "12px 16px" }}>
      <div className="become-card" style={{ width: "min(1100px, 96%)", display: "flex", gap: 20, alignItems: "center", background: "linear-gradient(90deg,#0ea5a2 0%, #60a5fa 100%)", color: "#fff", padding: 18, borderRadius: 12 }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0 }}>Become a Member</h3>
          <p style={{ marginTop: 8, opacity: 0.95 }}>Join GiveAura as a member to receive updates, priority invites to events, and help shape our community programs.</p>
          <ul style={{ marginTop: 8, paddingLeft: 18 }}>
            <li>Exclusive newsletter & impact reports</li>
            <li>Early access to special campaigns</li>
            <li>Invites to member-only events</li>
          </ul>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <button className="btn primary large" onClick={() => setMemberModalOpen(true)} style={{ background: "#fff", color: "#0f172a", fontWeight: 700, padding: "10px 16px", borderRadius: 10 }}>
            Join as Member
          </button>
          <button className="btn" onClick={() => navigate("/membership")} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.18)", color: "#fff" }}>Learn more about membership</button>
        </div>
      </div>
    </section>

    {/* Membership modal (re-uses react-modal) */}
    <Modal isOpen={memberModalOpen} onRequestClose={closeMemberModal} contentLabel="Become a Member" className="modal" overlayClassName="overlay">
      <h2>Become a Member</h2>
      <p style={{ color: "#444" }}>Enter your details and we'll get in touch with next steps.</p>
      <form onSubmit={submitMembership}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ fontSize: 13, color: "#333" }}>Full name</label>
          <input value={memberForm.name} onChange={(e) => setMemberForm((p) => ({ ...p, name: e.target.value }))} required style={{ padding: 8, borderRadius: 8, border: "1px solid #e6e6e6" }} />

          <label style={{ fontSize: 13, color: "#333" }}>Email</label>
          <input type="email" value={memberForm.email} onChange={(e) => setMemberForm((p) => ({ ...p, email: e.target.value }))} required style={{ padding: 8, borderRadius: 8, border: "1px solid #e6e6e6" }} />

          <label style={{ fontSize: 13, color: "#333" }}>Mobile number</label>
          <input type="tel" value={memberForm.phone} onChange={(e) => setMemberForm((p) => ({ ...p, phone: e.target.value }))} required placeholder="+9198xxxxxxxx" style={{ padding: 8, borderRadius: 8, border: "1px solid #e6e6e6" }} />

          <label style={{ fontSize: 13, color: "#333" }}>Message (optional)</label>
          <textarea value={memberForm.message} onChange={(e) => setMemberForm((p) => ({ ...p, message: e.target.value }))} style={{ padding: 8, borderRadius: 8, border: "1px solid #e6e6e6" }} />

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn primary" type="submit" disabled={memberSubmitting} style={{ background: "#0ea5a2", color: "#fff" }}>
              {memberSubmitting ? "Submitting…" : "Submit request"}
            </button>
            <button type="button" className="btn" onClick={closeMemberModal} style={{ background: "#ccc", color: "#111" }}>Cancel</button>
          </div>
        </div>
      </form>
    </Modal>

    {/* Support Center Modal */}
    <Modal isOpen={supportModalOpen} onRequestClose={closeSupportModal} contentLabel="Help & Support" className="modal" overlayClassName="overlay">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Help & Support</h2>
        <button onClick={closeSupportModal} className="btn small-btn close-btn">Close</button>
      </div>

      <div style={{ marginTop: 12 }}>
        <section style={{ marginBottom: 14 }}>
          <h3>Quick Answers</h3>
          <ul>
            <li><strong>How do I create a campaign?</strong> — Click <em>Create</em> in the header and follow the form.</li>
            <li><strong>Where is my donation receipt?</strong> — Visit <em>My Donations</em> to view receipts and donation history.</li>
            <li>
<strong>How does GiveAura's fee work?</strong> — GiveAura uses a tier-based fee:
emergencies ~0–2%, medical & education ~3–6%, NGOs & social impact ~6–8%,
CSR/corporate campaigns ~10–12%, plus taxes where required. Typically
85–95% of the donation reaches the fundraiser.
</li>

          </ul>
        </section>

        <section style={{ marginBottom: 12 }}>
          <h3>Contact Support</h3>
          <form onSubmit={submitSupportRequest}>
            <label style={{ fontSize: 13 }}>Name</label>
            <input value={supportForm.name} onChange={(e)=>setSupportForm((p)=>({...p, name: e.target.value}))} required style={{ width: "100%", padding: 8, marginBottom: 8, borderRadius: 8, border: "1px solid #e6e6e6" }} />

            <label style={{ fontSize: 13 }}>Email</label>
            <input type="email" value={supportForm.email} onChange={(e)=>setSupportForm((p)=>({...p, email: e.target.value}))} required style={{ width: "100%", padding: 8, marginBottom: 8, borderRadius: 8, border: "1px solid #e6e6e6" }} />

            <label style={{ fontSize: 13 }}>Subject</label>
            <select value={supportForm.subject} onChange={(e)=>setSupportForm((p)=>({...p, subject: e.target.value}))} style={{ width: "100%", padding: 8, marginBottom: 8, borderRadius: 8 }}>
              <option value="general">General question</option>
              <option value="donation">Donation / Receipt</option>
              <option value="campaign">Campaign help</option>
              <option value="bug">Report a bug</option>
            </select>

            <label style={{ fontSize: 13 }}>Message</label>
            <textarea value={supportForm.message} onChange={(e)=>setSupportForm((p)=>({...p, message: e.target.value}))} required style={{ width: "100%", padding: 8, minHeight: 120, borderRadius: 8, border: "1px solid #e6e6e6" }} />

            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button className="btn primary" type="submit" disabled={supportSubmitting} style={{ background: "#0ea5a2", color: "#fff" }}>
                {supportSubmitting ? "Sending..." : "Send request"}
              </button>
              <button type="button" className="btn" onClick={closeSupportModal} style={{ background: "#ccc", color: "#111" }}>Cancel</button>
            </div>
          </form>
        </section>

        <section style={{ marginTop: 8, fontSize: 13, color: "#666" }}>
          <strong>Support hours:</strong> Mon–Fri, 09:00–18:00 IST • Or email <a href="mailto:support@giveaura.com">support@giveaura.com</a>.
        </section>
      </div>
    </Modal>

    {/* Modal: donors list */}
    <Modal isOpen={modalIsOpen} onRequestClose={closeModal} contentLabel="Donors List" className="modal" overlayClassName="overlay">
      <h2>All Donors for {selectedCampaign?.title}</h2>
      <button onClick={closeModal} className="btn small-btn close-btn" style={{ float: "right", marginTop: -36 }}>Close</button>
      <div style={{ clear: "both" }} />
      <ul>
        {selectedDonors.length === 0 ? <p>No donations yet.</p> : selectedDonors.map((d) => (
          <li key={d.id} style={{ padding: 8, borderBottom: "1px solid #eee" }}>
            <strong>{d.donorName || d.donorEmail}</strong>: {fmt(Number(d.displayedAmount || d.amount || 0))} <span style={{ color: "#666" }}>on {d.donatedAt?.toDate ? d.donatedAt.toDate().toLocaleString() : d.donatedAt}</span>
          </li>
        ))}
      </ul>
    </Modal>


<style>{`
/* ===============================
   GLOBAL BASE
=============================== */
html, body {
  margin: 0;
  padding: 0;
  font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  background-color: #f8fafc;
  color: #0f172a;
}

/* ===============================
   HEADER (BLUE – KEEP THIS)
=============================== */
.header {
  position: sticky;
  top: 0;
  z-index: 1000;
  background: linear-gradient(90deg, #6a11cb 0%, #2575fc 100%);
  color: #ffffff;
  padding: 12px 16px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
}

/* Header rows */
.header-top,
.header-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.header-bottom {
  margin-top: 8px;
}

/* Logo */
.logo-title {
  margin: 0;
  font-weight: 800;
  font-size: 22px;
  color: #ffffff;
}

/* ===============================
   HEADER SEARCH (ON BLUE)
=============================== */
.header-search {
  display: flex;
  gap: 8px;
  flex: 1;
  justify-content: flex-end;
}

.header-search input,
.header-search select {
  padding: 8px 12px;
  border-radius: 10px;
  border: none;
  font-size: 14px;
  background: rgba(255, 255, 255, 0.95);
  color: #0f172a;
}

.header-search input:focus,
.header-search select:focus {
  outline: none;
  box-shadow: 0 0 0 2px rgba(255,255,255,0.6);
}

/* ===============================
   BUTTONS
=============================== */
.btn {
  padding: 8px 14px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
  backdrop-filter: blur(6px);
  transition: transform 0.12s ease, box-shadow 0.12s ease, background 0.12s ease;
}

.btn:hover {
  background: rgba(255, 255, 255, 0.25);
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(0,0,0,0.25);
}

.btn.small-btn {
  padding: 6px 12px;
  font-size: 13px;
}

/* Logout */
.logout-btn {
  background: linear-gradient(135deg, #ef4444, #dc2626);
}

/* ===============================
   PROFILE BUTTON
=============================== */
.profile-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(255,255,255,0.95);
  color: #0f172a;
  border: none;
  box-shadow: 0 4px 12px rgba(0,0,0,0.25);
}

.profile-name {
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
}

/* ===============================
   NOTIFICATION BELL
=============================== */
.bell-button {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(255,255,255,0.15);
  border: none;
  font-size: 18px;
  color: #ffffff;
}

.bell-button:hover {
  background: rgba(255,255,255,0.25);
}

/* Red dot */
.bell-dot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 8px;
  height: 8px;
  background: #ff2d55;
  border-radius: 50%;
}

/* Badge numbers */
.notif-badge-user,
.notif-badge-admin {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 18px;
  height: 18px;
  line-height: 18px;
  font-size: 11px;
  font-weight: 700;
  border-radius: 999px;
  text-align: center;
  color: #ffffff;
}

.notif-badge-user {
  background: #ef4444;
}

.notif-badge-admin {
  background: #111827;
}

/* ===============================
   PROGRESS BAR
=============================== */
.progress-bar {
  height: 10px;
  background: #e5e7eb;
  border-radius: 999px;
  overflow: hidden;
  margin: 10px 0;
}

.progress {
  height: 100%;
  background: #22c55e;
  transition: width 0.4s ease;
}

/* ===============================
   NO CAMPAIGNS
=============================== */
.no-campaigns {
  font-size: 16px;
  font-weight: 600;
  color: #64748b;
  text-align: center;
  margin-top: 48px;
}

/* ===============================
   MODAL
=============================== */
.modal {
  max-width: 800px;
  margin: 40px auto;
  background: #ffffff;
  padding: 20px;
  border-radius: 16px;
}

.overlay {
  background: rgba(15, 23, 42, 0.55);
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ===============================
   RESPONSIVE
=============================== */
@media (max-width: 900px) {
  .header-bottom {
    flex-direction: column;
    align-items: stretch;
  }

  .header-search {
    justify-content: stretch;
  }
}

@media (max-width: 520px) {
  .header {
    padding: 10px 12px;
  }

  .logo-title {
    font-size: 18px;
  }

  .campaign-container {
    padding: 14px;
    gap: 14px;
  }

  .campaign-card {
    padding: 14px;
  }
}
  .top-donor-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.78);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
  padding: 16px;
}

.top-donor-card {
  background: linear-gradient(180deg, #ffffff 0%, #f3f6fb 100%);
  border-radius: 22px;
  box-shadow: 0 25px 70px rgba(0,0,0,0.35);
  padding: 28px 26px 30px;
  max-width: 520px;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  animation: giveauraPopIn 520ms cubic-bezier(.22,.9,.32,1);
}

.top-donor-avatar-wrap {
  margin-bottom: 14px;
}

.top-donor-avatar-ring {
  padding: 6px;
  border-radius: 50%;
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  animation: goldPulse 2.4s ease-in-out infinite;
}

.top-donor-avatar {
  width: 112px;
  height: 112px;
  border-radius: 50%;
  object-fit: cover;
  background: #fff;
}

.top-donor-title {
  margin: 6px 0 4px;
  font-size: 22px;
  font-weight: 800;
  color: #1e3a8a;
}

.top-donor-name {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #0b1f44;
}

.top-donor-amount {
  margin-top: 10px;
  font-size: 15px;
  font-weight: 600;
  color: #334155;
  max-width: 420px;
}

.top-donor-message {
  margin-top: 6px;
  font-size: 14px;
  color: #475569;
  max-width: 420px;
}

.top-donor-actions {
  margin-top: 22px;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
}

.top-donor-live-btn {
  background: linear-gradient(135deg,#ff7a00,#ff9800);
  color: #fff;
}

/* Animations */
@keyframes giveauraPopIn {
  0% { opacity: 0; transform: translateY(24px) scale(0.94); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes goldPulse {
  0% { box-shadow: 0 0 0 rgba(250,204,21,0.35); }
  50% { box-shadow: 0 0 26px rgba(250,204,21,0.55); }
  100% { box-shadow: 0 0 0 rgba(250,204,21,0.35); }
}

`}</style>

{Footer}
<Footer />

  </div>
);
}
