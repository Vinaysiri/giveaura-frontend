// src/utils/money.js
// 100% Donation Model — No GST, No Platform Fee

export const PAISA = 100;

// Percentages retained for compatibility (NOT USED)
export const GST_PCT = 0;
export const PLATFORM_PCT = 0;
export const FUNDRAISER_PCT = 1; // 100%

export const toPaise = (rupees) =>
  Math.round(Number(rupees || 0) * PAISA);

export const fromPaise = (paise) =>
  Math.round(Number(paise || 0)) / PAISA;

/**
 * Given gross rupees, returns split
 * FULL amount goes to campaign (no deductions)
 */
export function computeSplits(grossRupees) {
  const p = toPaise(grossRupees);

  return {
    gross: fromPaise(p),
    gst: 0,
    platform: 0,
    fundraiser: fromPaise(p), // 100% to campaign
  };
}

/**
 * Friendly INR formatter (no decimals)
 */
export const fmtRupee = (n) => {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(Math.round(Number(n || 0)));
  } catch {
    return `₹${Math.round(Number(n || 0))}`;
  }
};
