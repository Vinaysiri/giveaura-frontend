// src/services/donationService.js


import { createOrder } from "./paymentService";
import { computeDonationSplit } from "./boostService";
import {
  donateToCampaign,
  getCampaignById,
} from "./firestoreService";
import { getDoc, doc, collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "../firebase";
/* ---------------------------------------------------
 * PREVIEW SPLIT (UI ONLY)
 * --------------------------------------------------- */
export function previewDonationSplit(
  amount,
  campaignType = "other",
  boostPlan = "none"
) {
  const numericAmount = Number(amount || 0);

  if (!numericAmount || numericAmount <= 0) {
    return {
      gross: 0,
      fundraiserShare: 0,
      categoryFee: 0,
      platformFee: 0,
      totalFee: 0,
      categoryLabel: "Campaign",
      categoryFeePct: 0,
      platformFeePct: 0,
      totalFeePct: 0,
    };
  }

  return computeDonationSplit({
    amount: numericAmount,
    campaignType,
    boostPlan,
  });
}

/* ---------------------------------------------------
 * CREATE RAZORPAY ORDER
 * --------------------------------------------------- */
export async function createDonationOrder({ amount, campaignId }) {
  const numericAmount = Number(amount || 0);

  if (!numericAmount || numericAmount <= 0) {
    throw new Error("Invalid donation amount");
  }
  if (!campaignId) {
    throw new Error("Missing campaignId");
  }

  return createOrder({
    amount: numericAmount,
    campaignId,
  });
}

/* ---------------------------------------------------
 * RECORD DONATION (LEGACY / ADMIN-CONFIRMED FLOW)
 * --------------------------------------------------- */
/**
 * Record donation after Razorpay success
 * Campaign title is resolved internally to avoid UI dependency
 */
export async function recordSuccessfulDonation({
  campaignId,
  amount,
  user,
  paymentId,
  donorName = null,
  donorPhotoURL = null,
}) {  if (!campaignId) throw new Error("campaignId required");
  if (!amount) throw new Error("amount required");

  let campaignTitle = null;

  try {
    const campaign = await getCampaignById(campaignId);
    campaignTitle = campaign?.title || null;
  } catch (err) {
    console.warn(
      "[donationService] Failed to resolve campaign title",
      err
    );
  }

  return donateToCampaign({
  campaignId,
  campaignTitle,
  amount,

  donorId: user?.uid || null,
  donorEmail: user?.email || null,

  donorName:
    user?.displayName ||
    donorName ||
    user?.email?.split("@")[0] ||
    "Well-Wisher",

  donorPhotoURL:
    user?.photoURL ||
    donorPhotoURL ||
    null,

  paymentId: paymentId || null,
});
}

/* ---------------------------------------------------
 * SAFE STUB (LEGACY CALLS)
 * --------------------------------------------------- */
export async function settleDonation() {
  console.warn(
    "[donationService] settleDonation skipped — handled by admin payout"
  );
  return { status: "skipped" };
}
