// src/pages/admin/BoosterUtils.js

export function normalizeBoost(b) {
  return {
    id: b.id,
    campaignId: b.campaignId,
    campaignTitle: b.campaignTitle,
    ownerId: b.ownerId,
    plan: b.plan,
    amount: Number(b.amount || 0),
    visibility: b.visibility || [],
    status: b.status || "active",
    createdAt: b.createdAt?.toDate
      ? b.createdAt.toDate()
      : b.createdAt
      ? new Date(b.createdAt)
      : null,
    expiresAt: b.expiresAt?.toDate
      ? b.expiresAt.toDate()
      : b.expiresAt
      ? new Date(b.expiresAt)
      : null,
  };
}

export function monthKey(date) {
  if (!date) return "unknown";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function exportToCSV(rows, filename) {
  if (!rows.length) return;

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((r) =>
      headers.map((h) => `"${String(r[h] ?? "")}"`).join(",")
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}
