// src/pages/admin/Users.jsx
import React, { useEffect, useMemo, useState } from "react";
import { doc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import Modal from "./admincomponents/Modal.jsx";
import { getAllUsers } from "../../services/firestoreService";
import { useAuth } from "../../context/AuthContext";

function normalizeDate(raw) {
  if (!raw) return null;
  try {
    if (raw?.toDate && typeof raw.toDate === "function") return raw.toDate();
    if (typeof raw === "object" && typeof raw.seconds === "number") {
      return new Date(raw.seconds * 1000);
    }
    if (raw instanceof Date) return raw;
    if (typeof raw === "number") {
      return raw > 1e12 ? new Date(raw) : new Date(raw * 1000);
    }
    if (typeof raw === "string") {
      const d = new Date(raw);
      return isNaN(d.getTime()) ? null : d;
    }
  } catch {}
  return null;
}

export default function Users() {
  const { currentUser, loading: authLoading } = useAuth();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest");
  const [selected, setSelected] = useState(null);
  const [actionLoading, setActionLoading] = useState({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [showAccount, setShowAccount] = useState(false);


  // Determine if current user is admin
  const isAdmin = useMemo(() => {
    if (!currentUser) return false;
    if (currentUser.isAdmin) return true;
    if (currentUser.email === "kotipallynagavinay12323@gmail.com") return true;
    return false;
  }, [currentUser]);


  const fetchUsers = async () => {
    setLoading(true);
    try {
      const list = await getAllUsers();

      const normalized = (list || []).map((d) => {
        const created = normalizeDate(d.createdAt);

        // BANK NORMALIZATION
        const bank = d.bank || {};

        return {
          ...d,
          id: d.id,
          displayName: d.displayName || d.name || "",
          email: d.email || d.userEmail || d.authEmail || d.creatorEmail ||  d.donorEmail || "",
          phone: d.phoneNumber || d.phone || d.mobile || "",
          photoURL: d.photoURL || d.photo || "",
          role: d.role || "user",
          disabled: !!d.disabled,
          createdAt: created,

          accountHolderName:
            (d.bank && d.bank.accountHolder) ||
            d.accountHolder ||
            "",

          bankName:
            (d.bank && d.bank.bankName) ||
            d.bankName ||
            "",

          accountNumber:
            (d.bank && d.bank.accountNumber) ||
            d.accountNumber ||
            "",

          ifscCode:
            (d.bank && d.bank.ifsc) ||
            d.ifsc ||
            "",

          upiId:
            (d.bank && d.bank.upiId) ||
            d.upiId ||
            "",


          bio: d.bio || d.description || "",
        };
      });

      setUsers(normalized);
    } catch (err) {
      console.error("fetchUsers failed:", err);
      alert("Could not fetch users — see console for details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && isAdmin) fetchUsers();
  }, [authLoading, isAdmin, refreshKey]);


  const visible = useMemo(() => {
    const filtered = (users || []).filter((u) => {
      if (roleFilter !== "all" && (u.role || "user") !== roleFilter)
        return false;
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        (u.displayName || "").toLowerCase().includes(s) ||
        (u.email || "").toLowerCase().includes(s) ||
        String(u.phone || "").toLowerCase().includes(s)
      );
    });

    filtered.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return sortOrder === "newest" ? tb - ta : ta - tb;
    });

    return filtered;
  }, [users, search, roleFilter, sortOrder]);

  /* ================= ACTIONS (UNCHANGED) ================= */

  const toggleAdmin = async (u) => {
    if (!u || !u.id) return;
    const makeAdmin = u.role !== "admin";
    if (!window.confirm(`${makeAdmin ? "Promote" : "Demote"} ${u.email}?`))
      return;

    setActionLoading((s) => ({ ...s, [u.id]: true }));
    try {
      await updateDoc(doc(db, "users", u.id), {
        role: makeAdmin ? "admin" : "user",
        updatedAt: serverTimestamp(),
      });
      setUsers((s) =>
        s.map((x) =>
          x.id === u.id ? { ...x, role: makeAdmin ? "admin" : "user" } : x
        )
      );
    } finally {
      setActionLoading((s) => {
        const c = { ...s };
        delete c[u.id];
        return c;
      });
    }
  };

  const toggleDisabled = async (u) => {
    if (!u || !u.id) return;
    const willDisable = !u.disabled;
    if (!window.confirm(`${willDisable ? "Disable" : "Enable"} ${u.email}?`))
      return;

    setActionLoading((s) => ({ ...s, [u.id]: true }));
    try {
      await updateDoc(doc(db, "users", u.id), {
        disabled: willDisable,
        updatedAt: serverTimestamp(),
      });
      setUsers((s) =>
        s.map((x) =>
          x.id === u.id ? { ...x, disabled: willDisable } : x
        )
      );
    } finally {
      setActionLoading((s) => {
        const c = { ...s };
        delete c[u.id];
        return c;
      });
    }
  };

  const removeUser = async (u) => {
    if (!u || !u.id) return;
    if (!window.confirm(`Delete user ${u.email}? This is irreversible.`))
      return;
    await deleteDoc(doc(db, "users", u.id));
    setUsers((s) => s.filter((x) => x.id !== u.id));
    setSelected(null);
  };

const exportCSV = () => {
  if (!visible || visible.length === 0) {
    alert("No users to export.");
    return;
  }

  const rows = [
    [
      "id",
      "displayName",
      "email",
      "phone",
      "role",
      "disabled",
      "bankName",
      "accountHolderName",
      "ifscCode",
      "upiId",
      "AccountNumber",
      "createdAt",
    ].join(","),
    ...visible.map((u) =>
  [
    `"${u.id}"`,
    `"${(u.displayName || "").replace(/"/g, '""')}"`,
    `"${(u.email || "").replace(/"/g, '""')}"`,
    `"${(u.phone || "").replace(/"/g, '""')}"`,
    `"${u.role || "user"}"`,
    `"${u.disabled ? "true" : "false"}"`,
    `"${(u.bankName || "").replace(/"/g, '""')}"`,
    `"${(u.accountHolderName || "").replace(/"/g, '""')}"`,
    `"${(u.ifsc || "").replace(/"/g, '""')}"`,
    `"${(u.upiId || "").replace(/"/g, '""')}"`,
    `"${u.accountNumber ? `XXXXXX${u.accountNumber.slice(-4)}` : ""}"`,
    `"${u.createdAt ? new Date(u.createdAt).toISOString() : ""}"`
  ].join(",")
    ),
  ];

  const csv = rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `giveaura-users-${new Date()
    .toISOString()
    .slice(0, 19)
    .replace(/[:T]/g, "-")}.csv`;
  a.click();

  URL.revokeObjectURL(url);
};

const formatJoined = (date) => {
  if (!date) return "—";
  try {
    return new Date(date).toLocaleDateString();
  } catch {
    return "—";
  }
};



  /* ================= GUARDS ================= */

  if (authLoading) return <div>Loading…</div>;
  if (!isAdmin)
    return <div className="text-red-500">You are not authorized.</div>;

  /* ================= UI (UNCHANGED) ================= */
  return (
    <div>
      <header className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold">Users</h2>
          <div className="text-sm text-gray-500">
            Manage registered users — promote, block, or review profiles.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            className="btn-outline"
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            Refresh
          </button>
          <button className="btn" onClick={exportCSV}>
            Export CSV
          </button>
        </div>
      </header>

      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 12,
          alignItems: "center",
        }}
      >
        <input
          placeholder="Search name, email or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="admin-input"
          style={{ minWidth: 220 }}
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="admin-input"
          style={{ width: 140 }}
        >
          <option value="all">All roles</option>
          <option value="admin">Admins</option>
          <option value="user">Users</option>
        </select>
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          className="admin-input"
          style={{ width: 140 }}
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
        </select>
        <div
          style={{
            marginLeft: "auto",
            fontSize: 13,
            color: "#6b7280",
          }}
        >
          {visible.length} shown
        </div>
      </div>

      {loading ? (
        <div>Loading users…</div>
      ) : visible.length === 0 ? (
        <div className="text-gray-500">No users</div>
      ) : (
        <div className="space-y-2">
          {visible.map((u) => (
            <div
              key={u.id}
              className="bg-white p-3 rounded shadow-sm flex justify-between items-center"
            >
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <img
                  src={u.photoURL || "/default-avatar.png"}
                  alt={u.displayName || u.email}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 999,
                    objectFit: "cover",
                    border: "1px solid #eef2f7",
                  }}
                />
                <div>
                  <div style={{ fontWeight: 700 }}>
                    {u.displayName || u.email || "(no name)"}
                  </div>
                  <div className="text-sm text-gray-500">
                    {u.email}
                    {u.phone ? (
                      <span style={{ display: "block", marginTop: 4 }}>
                        📞 {u.phone}
                      </span>
                    ) : null}
                    <span style={{ display: "block", marginTop: 4 }}>
                      Joined: {formatJoined(u.createdAt)}
                    </span>
                  </div>
                </div>
                <div style={{ marginLeft: 12 }}>
                  <div style={{ fontSize: 12, color: "#374151" }}>
                    {u.role === "admin" ? "Admin" : "User"}
                  </div>
                  {u.disabled && (
                    <div style={{ fontSize: 12, color: "#d45555" }}>
                      Disabled
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  className="px-3 py-1 rounded bg-indigo-50 text-indigo-600"
                  onClick={() => setSelected(u)}
                >
                  View
                </button>

                <button
                  className="px-3 py-1 rounded border"
                  onClick={() => {
                    copyEmail(u.email);
                  }}
                  title="Copy email"
                >
                  Copy
                </button>

                <button
                  className="px-3 py-1 rounded border"
                  onClick={() => {
                    copyPhone(u.phone);
                  }}
                  title="Copy phone"
                >
                  Copy phone
                </button>

                <button
                  className="px-3 py-1 rounded"
                  onClick={() => toggleAdmin(u)}
                  disabled={!!actionLoading[u.id]}
                  title={
                    u.role === "admin"
                      ? "Demote from admin"
                      : "Promote to admin"
                  }
                >
                  {actionLoading[u.id]
                    ? "…"
                    : u.role === "admin"
                    ? "Demote"
                    : "Promote"}
                </button>

                <button
                  className="px-3 py-1 rounded delete-btn"
                  onClick={() => toggleDisabled(u)}
                  disabled={!!actionLoading[u.id]}
                >
                  {actionLoading[u.id]
                    ? "…"
                    : u.disabled
                    ? "Enable"
                    : "Disable"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: view user */}
      <Modal
        open={!!selected}
        title={selected ? selected.displayName || selected.email : ""}
        onClose={() => {setSelected(null); setShowAccount(false);}}
      >
        {selected && (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <img
                src={selected.photoURL || "/default-avatar.png"}
                alt={selected.displayName || selected.email}
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: 12,
                  objectFit: "cover",
                }}
              />
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  {selected.displayName || "(no name)"}
                </div>
                <div style={{ color: "#6b7280" }}>{selected.email}</div>
                {selected.phone && (
                  <div style={{ marginTop: 6 }}>
                    Phone: <strong>{selected.phone}</strong>
                  </div>
                )}
                <div style={{ marginTop: 8, fontSize: 13 }}>
                  Role: <strong>{selected.role}</strong>
                </div>
                <div style={{ fontSize: 13 }}>
                  Status:{" "}
                  <strong>{selected.disabled ? "Disabled" : "Active"}</strong>
                </div>
                <div style={{ fontSize: 13 }}>
                  Joined:{" "}
                  <strong>
                    {selected.createdAt
                      ? new Date(selected.createdAt).toLocaleString()
                      : "—"}
                  </strong>
                </div>
              </div>
            </div>

            {selected.bio && (
              <div>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Bio</div>
                <div style={{ color: "#374151" }}>{selected.bio}</div>
              </div>
            )}

            {/* Email Section */}
              <div style={{ fontSize: 13 }}>
                <strong>Email:</strong>{" "}
                <span style={{ color: "#374151" }}>
                  {selected.email || "—"}
                </span>
              </div>

              {/* Bank Details Section */}
              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  Bank Details
                </div>

                <div style={{ fontSize: 13 }}>
                  <strong>Account Holder:</strong>{" "}
                  {selected.accountHolderName || "—"}
                </div>

                <div style={{ fontSize: 13 }}>
                  <strong>Bank Name:</strong>{" "}
                  {selected.bankName || "—"}
                </div>

                <div style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                <strong>Account Number:</strong>

                <span>
                  {selected.accountNumber
                    ? showAccount
                      ? selected.accountNumber
                      : `XXXXXX${selected.accountNumber.slice(-4)}`
                    : "—"}
                </span>

                {selected.accountNumber && (
                  <button
                    type="button"
                    onClick={() => setShowAccount((v) => !v)}
                    style={{
                      fontSize: 12,
                      padding: "2px 6px",
                      borderRadius: 6,
                      border: "1px solid #d1d5db",
                      cursor: "pointer",
                    }}
                  >
                    {showAccount ? "Hide" : "View"}
                  </button>
                )}
                </div>

                <div style={{ fontSize: 13 }}>
                  <strong>IFSC Code:</strong>{" "}
                  {selected.ifscCode || "—"}
                </div>

                <div style={{ fontSize: 13 }}>
                  <strong>UPI ID:</strong>{" "}
                  {selected.upiId || "—"}
                </div>
              </div>


            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
              }}
            >
              <button className="btn-outline" onClick={() => setSelected(null)}>
                Close
              </button>

              <button
                className="btn"
                onClick={() => toggleAdmin(selected)}
                disabled={!!actionLoading[selected.id]}
              >
                {actionLoading[selected.id]
                  ? "…"
                  : selected.role === "admin"
                  ? "Demote from admin"
                  : "Promote to admin"}
              </button>

              <button
                className="btn delete-btn"
                onClick={() => toggleDisabled(selected)}
                disabled={!!actionLoading[selected.id]}
              >
                {actionLoading[selected.id]
                  ? "…"
                  : selected.disabled
                  ? "Enable user"
                  : "Disable user"}
              </button>

              {/*dangerous delete user button */}
              { 
              <button
                className="btn small-btn delete-btn"
                onClick={() => removeUser(selected)}
                disabled={!!actionLoading[selected.id]}
              >
                Delete user
              </button>
              }
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
