// src/services/paymentService.js

const API_BASE = (() => {
  let base = "";

  try {
    if (import.meta?.env?.VITE_PAYMENT_API_BASE_URL) {
      base = String(import.meta.env.VITE_PAYMENT_API_BASE_URL).trim();
    }
  } catch {}

  // Local fallback
  if (!base) {
    if (
      typeof window !== "undefined" &&
      window.location.hostname === "localhost"
    ) {
      console.info("[paymentService] Using local payment server");
      return "http://localhost:5000";
    }

    throw new Error(
      "[paymentService] VITE_PAYMENT_API_BASE_URL is required"
    );
  }

  if (!/^https?:\/\//i.test(base)) {
    base = "https://" + base;
  }

  return base.replace(/\/$/, "");
})();

console.info("[paymentService] API_BASE =", API_BASE);

/* ======================================================
   SAFE JSON PARSER
====================================================== */
async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/* ======================================================
   CREATE ORDER (DONATION / BOOST / SUBSCRIPTION)
====================================================== */
export async function createOrder({
  amount,
  campaignId = null,
  purpose = "donation",
  meta = {},
}) {
  const numericAmount = Number(amount);

  if (!numericAmount || numericAmount <= 0) {
    throw new Error("Amount must be a positive number");
  }

  if (purpose === "donation" && !campaignId) {
    throw new Error("campaignId is required for donations");
  }

  let res;
  try {
    console.log("[paymentService] createOrder payload", {
      amount: numericAmount,
      campaignId,
      purpose,
      meta,
    });

    res = await fetch(`${API_BASE}/api/payment/create-order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: numericAmount,
        campaignId,
        purpose,
        meta,
      }),
    });
  } catch (err) {
    console.error("[paymentService] Network error (createOrder):", err);
    throw new Error("Unable to reach payment server");
  }

  const data = await safeJson(res);

  if (!res.ok || !data?.success) {
    console.error("[paymentService] createOrder failed:", data);
    throw new Error(
      data?.message || `Payment server error (${res.status})`
    );
  }

  return {
    key: data.key,
    orderId: data.orderId,
    amount: data.amount, // paise
    currency: data.currency || "INR",
    _mock: data._mock || false,
  };
}


/* ======================================================
   BOOST ORDER HELPER (NO SIDE EFFECTS)
====================================================== */
export async function createBoostOrder({
  amount,
  campaignId,
  boostPlan = "basic",
  userId,
  meta = {},
}) {
  if (!campaignId) {
    throw new Error("campaignId is required for boost payments");
  }

  return createOrder({
    amount,
    campaignId,
    purpose: "boost",
    meta: {
      ...meta,
      boostPlan,
      userId: userId || null,
    },
  });
}

/* ======================================================
   SUBSCRIPTION ORDER
====================================================== */
export async function createSubscriptionOrder({
  amount,
  planId,
  userId,
  meta = {},
}) {
  return createOrder({
    amount,
    campaignId: null,
    purpose: "subscription",
    meta: {
      ...meta,
      planId,
      userId: userId || null,
    },
  });
}

/* ======================================================
   LEGACY / SAFETY
====================================================== */
export async function confirmPayment() {
  throw new Error(
    "confirmPayment is disabled. Handle Razorpay success in UI."
  );
}

export { API_BASE };
