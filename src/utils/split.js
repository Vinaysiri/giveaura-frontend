// src/utils/split.js
// 100% Donation Model — No platform fee, no GST

export function calcSplits(amount = 0, config = {}) {
  const grossAmount = Math.round(Number(amount || 0) * 100) / 100;

  return {
    platformAmount: 0,      // No platform fee
    gstAmount: 0,           // No GST
    totalFee: 0,            // No deductions
    netToCampaign: grossAmount, // 100% goes to campaign
  };
}
