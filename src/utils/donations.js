export const normalizeAmount = (d = {}) => {
  if (typeof d.grossAmount === "number") return d.grossAmount;
  if (typeof d.amount === "number") return d.amount;
  return 0;
};

export const sumDonations = (donations = []) =>
  donations.reduce((s, d) => s + normalizeAmount(d), 0);
