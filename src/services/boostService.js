// src/services/boostService.js

import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";

/* =====================================================
   CATEGORY FEE CONFIG (UNCHANGED)
===================================================== */

export const CATEGORY_FEE_CONFIG = {
  emergency: { key: "emergency", label: "Emergency / Disaster Relief", platformPct: 0.02 },
  medical: { key: "medical", label: "Medical & Health", platformPct: 0.08 },
  ngo: { key: "ngo", label: "NGO / Social Impact", platformPct: 0.05 },
  education: { key: "education", label: "Education & Students", platformPct: 0.10 },
  personal: { key: "personal", label: "Personal / Family Support", platformPct: 0.02 },
  global: { key: "global", label: "Global / International Causes", platformPct: 0.10 },
  csr: { key: "csr", label: "CSR / Corporate Giving", platformPct: 0.08 },
  other: { key: "other", label: "Other", platformPct: 0.04 },
};

/* =====================================================
   BOOST PLAN MASTER CONFIG (NEW – SOURCE OF TRUTH)
===================================================== */

export const BOOST_PLAN_CONFIG = {
  none: {
    id: "none",
    label: "No Boost",
    price: 0,
    days: 0,
    visibility: [],
    extraPct: 0,
  },
  basic: {
    id: "basic",
    label: "Basic Boost",
    price: 399,
    days: 7,
    visibility: ["Category Listing"],
    extraPct: 0,
  },
  premium: {
    id: "premium",
    label: "Premium Boost",
    price: 999,
    days: 14,
    visibility: ["Hero Banner", "Category Listing"],
    extraPct: 0,
  },
  super: {
    id: "super",
    label: "Super Boost",
    price: 4999,
    days: 30,
    visibility: ["Hero Banner", "Poster Banner", "Top Priority"],
    extraPct: 0,
  },
};

/* =====================================================
   NORMALIZATION HELPERS
===================================================== */

export function normalizeCampaignType(rawType) {
  if (!rawType) return "other";
  const t = String(rawType).toLowerCase();
  if (["emergency", "disaster", "urgent"].includes(t)) return "emergency";
  if (["medical", "health", "treatment"].includes(t)) return "medical";
  if (["ngo", "charity", "nonprofit"].includes(t)) return "ngo";
  if (["education", "student", "school"].includes(t)) return "education";
  if (["personal", "family"].includes(t)) return "personal";
  if (["global", "international"].includes(t)) return "global";
  if (["csr", "corporate"].includes(t)) return "csr";
  return "other";
}

export function getCategoryFeeConfig(campaignType) {
  return CATEGORY_FEE_CONFIG[normalizeCampaignType(campaignType)] || CATEGORY_FEE_CONFIG.other;
}

export function getBoostPlanConfig(boostPlan) {
  return BOOST_PLAN_CONFIG[boostPlan] || BOOST_PLAN_CONFIG.none;
}

/* =====================================================
   DONATION SPLIT (UNCHANGED CORE LOGIC)
===================================================== */

export function computeDonationSplit({ amount, campaignType, boostPlan }) {
  const gross = Number(amount || 0);
  if (!gross) return { gross: 0, fundraiserShare: 0 };

  const cat = getCategoryFeeConfig(campaignType);
  const boost = getBoostPlanConfig(boostPlan);

  const categoryFee = +(gross * cat.platformPct).toFixed(2);
  const platformFee = +(gross * boost.extraPct).toFixed(2);
  const totalFee = +(categoryFee + platformFee).toFixed(2);

  return {
    gross,
    fundraiserShare: +(gross - totalFee).toFixed(2),
    categoryFee,
    platformFee,
    totalFee,
    categoryLabel: cat.label,
    categoryFeePct: cat.platformPct,
    platformFeePct: boost.extraPct,
    totalFeePct: cat.platformPct + boost.extraPct,
  };
}

/* =====================================================
   BOOSTER BACKEND – CORE FUNCTIONS
===================================================== */
export async function createCampaignBoost({
  campaignId,
  campaignTitle,
  ownerId,
  plan,
  paymentId,
  orderId,
}) {
  const cfg = getBoostPlanConfig(plan);
  if (!cfg || cfg.price <= 0) {
    throw new Error("Invalid boost plan");
  }

  // Expire any existing active boosts
  const activeQuery = query(
    collection(db, "campaignBoosts"),
    where("campaignId", "==", campaignId),
    where("status", "==", "active")
  );

  const activeSnap = await getDocs(activeQuery);

  await Promise.all(
    activeSnap.docs.map((d) =>
      updateDoc(doc(db, "campaignBoosts", d.id), {
        status: "expired",
      })
    )
  );

  const expiresAt = Timestamp.fromDate(
    new Date(Date.now() + cfg.days * 24 * 60 * 60 * 1000)
  );

  await addDoc(collection(db, "campaignBoosts"), {
    campaignId,
    campaignTitle,
    ownerId,
    plan,
    amount: cfg.price,
    visibility: cfg.visibility,
    status: "active",
    paymentId,
    orderId,
    createdAt: serverTimestamp(),
    expiresAt,
  });
}


export async function expireBoostersIfNeeded() {
  const now = Timestamp.now();

  const q = query(
    collection(db, "campaignBoosts"),
    where("status", "==", "active"),
    where("expiresAt", "<=", now)
  );

  const snap = await getDocs(q);

  await Promise.all(
    snap.docs.map(async (d) => {
      const data = d.data();

      await updateDoc(doc(db, "campaignBoosts", d.id), {
        status: "expired",
      });

      await updateDoc(doc(db, "campaigns", data.campaignId), {
        isBoosted: false,
        boostPlan: "none",
      });
    })
  );
}


export async function getActiveBoostersByVisibility(type) {
  const q = query(
    collection(db, "campaignBoosts"),
    where("status", "==", "active"),
    where("visibility", "array-contains", type)
  );

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}


export async function getBoosterKPIs() {
  const snap = await getDocs(collection(db, "campaignBoosts"));
  const boosts = snap.docs.map((d) => d.data());

  return {
    totalBoosts: boosts.length,
    activeBoosts: boosts.filter((b) => b.status === "active").length,
    revenue: boosts.reduce((s, b) => s + Number(b.amount || 0), 0),
    heroAds: boosts.filter(
      (b) => b.visibility?.includes("Hero Banner") && b.status === "active"
    ).length,
    posterAds: boosts.filter(
      (b) => b.visibility?.includes("Poster Banner") && b.status === "active"
    ).length,
  };
}
