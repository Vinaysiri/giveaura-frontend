// src/pages/admin/Support.jsx
import React, {
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
} from "react";
import {
  collection,
  collectionGroup,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../firebase";

/**
 * Modern Admin Support panel
 *
 * - Realtime list (onSnapshot)
 * - Realtime replies for selected thread
 * - Search with debounce
 * - Filters: status (open/resolved/all) and priority (high/medium/low/all)
 * - Nice UI: badges, avatars (initials), timestamps, skeleton loading
 * - Reply composer: saves reply to subcollection and opens mailto: fallback
 * - Mark resolved / reopen / open mail
 *
 * Assumes collection `support_requests` with fields:
 *  - subject, message, requesterEmail / email, requesterName / name,
 *    createdAt, status, priority
 * Replies stored at:
 *    support_requests/{id}/replies
 * with fields: message, createdAt, createdBy
 */

const PAGE_SIZE = 30;
const DEBOUNCE_MS = 260;

const toLocal = (ts) => {
  try {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString();
  } catch {
    return String(ts);
  }
};

const initialsFrom = (nameOrEmail) => {
  if (!nameOrEmail) return "A";
  const parts = String(nameOrEmail)
    .split(/[\s@.]+/)
    .filter(Boolean);
  if (parts.length === 0) return "A";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + (parts[1][0] || "")).toUpperCase();
};

function useDebounced(value, ms = DEBOUNCE_MS) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function Support() {
  const [requests, setRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(true);

  const [filterStatus, setFilterStatus] = useState("open"); // open | resolved | all
  const [filterPriority, setFilterPriority] = useState("all"); // all | high | medium | low
  const [pageLimit, setPageLimit] = useState(PAGE_SIZE);

  const [queryStr, setQueryStr] = useState("");
  const debouncedQuery = useDebounced(queryStr);

  const [selected, setSelected] = useState(null);
  const [selectedLoading, setSelectedLoading] = useState(false);

  const [replies, setReplies] = useState([]);
  const repliesUnsubRef = useRef(null);

  const [replyText, setReplyText] = useState("");
  const [replySaving, setReplySaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (repliesUnsubRef.current) {
        try {
          repliesUnsubRef.current();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  // Build base query for support_requests
  const buildQuery = useCallback(() => {
    try {
      const col = collection(db, "support_requests");
      const clauses = [];
      if (filterStatus === "open") {
        clauses.push(where("status", "==", "open"));
      } else if (filterStatus === "resolved") {
        clauses.push(where("status", "==", "resolved"));
      }
      if (filterPriority !== "all") {
        clauses.push(where("priority", "==", filterPriority));
      }
      clauses.push(orderBy("createdAt", "desc"));
      return query(col, ...clauses, limit(pageLimit));
    } catch (err) {
      console.error("buildQuery error", err);
      return null;
    }
  }, [filterStatus, filterPriority, pageLimit]);

  // Subscribe to support_requests (realtime)
  useEffect(() => {
    const q = buildQuery();
    if (!q) return;
    setLoadingRequests(true);

    const unsub = onSnapshot(
      q,
      (snap) => {
        if (!mountedRef.current) return;
        const arr = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() || {}),
        }));
        setRequests(arr);
        setLoadingRequests(false);
      },
      (err) => {
        console.error("support onSnapshot error:", err);
        if (mountedRef.current) setLoadingRequests(false);
      }
    );

    return () => {
      try {
        unsub();
      } catch {
        // ignore
      }
    };
  }, [buildQuery]);

  // Client-side search across fetched list
  const visible = useMemo(() => {
    const q = (debouncedQuery || "").trim().toLowerCase();
    if (!q) return requests;

    return requests.filter((r) => {
      const subject = String(r.subject || "").toLowerCase();
      const message = String(r.message || "").toLowerCase();
      const name = String(r.requesterName || r.name || "").toLowerCase();
      const email = String(r.requesterEmail || r.email || "").toLowerCase();
      return (
        subject.includes(q) ||
        message.includes(q) ||
        name.includes(q) ||
        email.includes(q)
      );
    });
  }, [requests, debouncedQuery]);

  const loadMore = () => setPageLimit((p) => p + PAGE_SIZE);

  const resetList = () => {
    setPageLimit(PAGE_SIZE);
    setQueryStr("");
    setFilterStatus("open");
    setFilterPriority("all");
  };

  // Select request & subscribe to replies in realtime
  const selectRequest = async (r) => {
    if (!r) {
      setSelected(null);
      setReplies([]);
      if (repliesUnsubRef.current) {
        try {
          repliesUnsubRef.current();
        } catch {
          // ignore
        }
        repliesUnsubRef.current = null;
      }
      return;
    }

    setSelectedLoading(true);
    setSelected(r);

    if (repliesUnsubRef.current) {
      try {
        repliesUnsubRef.current();
      } catch {
        // ignore
      }
      repliesUnsubRef.current = null;
    }

    try {
      const repliesCol = collection(db, "support_requests", r.id, "replies");
      const repliesQ = query(
        repliesCol,
        orderBy("createdAt", "asc"),
        limit(500)
      );

      const unsubR = onSnapshot(
        repliesQ,
        (snap) => {
          const arr = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() || {}),
          }));
          setReplies(arr);
          setSelectedLoading(false);
        },
        (err) => {
          console.error("replies onSnapshot error", err);
          setSelectedLoading(false);
        }
      );

      repliesUnsubRef.current = unsubR;
    } catch (err) {
      console.error("selectRequest error", err);
      setSelectedLoading(false);
    }
  };

  // Mark as resolved / reopen
  const toggleResolved = async (r, toResolved = true) => {
    if (!r?.id) return;
    setStatusSaving(true);
    try {
      const ref = doc(db, "support_requests", r.id);
      await updateDoc(ref, {
        status: toResolved ? "resolved" : "open",
        updatedAt: serverTimestamp(),
        resolvedAt: toResolved ? serverTimestamp() : null,
      });

      // Local optimistic update
      setRequests((prev) =>
        prev.map((p) =>
          p.id === r.id
            ? { ...p, status: toResolved ? "resolved" : "open" }
            : p
        )
      );
      if (selected?.id === r.id) {
        setSelected((s) =>
          s ? { ...s, status: toResolved ? "resolved" : "open" } : s
        );
      }
    } catch (err) {
      console.error("toggleResolved failed:", err);
      alert("Failed to update status. See console.");
    } finally {
      if (mountedRef.current) setStatusSaving(false);
    }
  };

  // Send reply: add to subcollection + update parent preview + mailto fallback
  const sendReply = async () => {
    if (!selected?.id) return;
    if (!replyText || replyText.trim().length < 2) {
      alert("Please enter a reply (min 2 chars).");
      return;
    }

    setReplySaving(true);
    try {
      const repliesCol = collection(
        db,
        "support_requests",
        selected.id,
        "replies"
      );
      const payload = {
        message: replyText.trim(),
        createdAt: serverTimestamp(),
        createdBy: "admin", // TODO: replace with actual admin ID/email
      };

      const res = await addDoc(repliesCol, payload);

      const parentRef = doc(db, "support_requests", selected.id);
      await updateDoc(parentRef, {
        lastReplyAt: serverTimestamp(),
        lastReplyPreview: replyText.trim().slice(0, 400),
        updatedAt: serverTimestamp(),
      });

      // Mail fallback
      const to = selected.requesterEmail || selected.email || "";
      if (to) {
        const subject = encodeURIComponent(
          selected.subject || "Reply from GiveAura Support"
        );
        const body = encodeURIComponent(
          `${replyText.trim()}\n\n—\nGiveAura Support`
        );
        window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
      } else {
        alert("Reply saved to thread (no requester email).");
      }

      // Optimistic local append (snapshot will also refill)
      setReplies((prev) => [
        ...prev,
        { id: res.id, ...payload, createdAt: new Date() },
      ]);
      setReplyText("");
    } catch (err) {
      console.error("sendReply error", err);
      alert("Failed to send reply. See console.");
    } finally {
      if (mountedRef.current) setReplySaving(false);
    }
  };

  const openMail = (r) => {
    const to = r.requesterEmail || r.email || "support@giveaura.com";
    const subject = encodeURIComponent(r.subject || "Support reply");
    window.location.href = `mailto:${to}?subject=${subject}`;
  };

  // Small UI subcomponents
  const EmptyState = () => (
    <div className="p-6 text-center text-gray-500">
      <div className="text-lg font-medium">No requests</div>
      <div className="mt-2">
        Adjust filters or click &quot;Load more&quot; to find older items.
      </div>
    </div>
  );

  const SkeletonItem = () => (
    <div className="animate-pulse p-3 border-b">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-md bg-gray-200" />
        <div className="flex-1">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
          <div className="h-3 bg-gray-200 rounded w-1/2" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-6">
      {/* Header / filters */}
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Support Requests</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage incoming support requests, reply quickly, and mark resolved.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <input
              value={queryStr}
              onChange={(e) => setQueryStr(e.target.value)}
              placeholder="Search subject, message, name or email..."
              className="px-3 py-2 w-72 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            {debouncedQuery && (
              <button
                onClick={() => setQueryStr("")}
                className="absolute right-1 top-1/2 -translate-y-1/2 text-sm px-2 py-1 rounded text-gray-500 hover:text-gray-700"
                title="Clear"
              >
                ✕
              </button>
            )}
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 border rounded-md"
            title="Status"
          >
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </select>

          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="px-3 py-2 border rounded-md"
            title="Priority"
          >
            <option value="all">All priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <button
            onClick={resetList}
            className="px-3 py-2 border rounded-md bg-white hover:bg-gray-50"
            title="Reset filters"
          >
            Reset
          </button>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-6">
        {/* Left column: list */}
        <div className="col-span-12 lg:col-span-4">
          <div className="bg-white rounded-lg overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="font-semibold">Requests</div>
              <div className="text-sm text-gray-500">
                {loadingRequests ? "Loading…" : `${requests.length} fetched`}
              </div>
            </div>

            <div style={{ maxHeight: "68vh", overflow: "auto" }}>
              {loadingRequests ? (
                <>
                  <SkeletonItem />
                  <SkeletonItem />
                  <SkeletonItem />
                </>
              ) : visible.length === 0 ? (
                <EmptyState />
              ) : (
                visible.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => selectRequest(r)}
                    className={`p-3 border-b flex gap-3 items-start cursor-pointer hover:bg-gray-50 ${
                      selected?.id === r.id ? "bg-indigo-50" : ""
                    }`}
                  >
                    <div
                      className="w-10 h-10 rounded-md flex items-center justify-center font-semibold text-white"
                      style={{
                        background:
                          r.priority === "high"
                            ? "#ef4444"
                            : r.priority === "medium"
                            ? "#f59e0b"
                            : "#3b82f6",
                      }}
                      title={r.requesterName || r.requesterEmail}
                    >
                      {initialsFrom(
                        r.requesterName || r.requesterEmail || r.subject
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="truncate font-medium">
                          {r.subject || "Support request"}
                        </div>
                        <div className="text-xs text-gray-400">
                          {toLocal(r.createdAt)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-1">
                        <div className="text-sm text-gray-500 truncate">
                          {r.message || r.lastReplyPreview || ""}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-2">
                        <div
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            r.status === "resolved"
                              ? "bg-green-100 text-green-800"
                              : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {r.status || "open"}
                        </div>
                        {r.priority && (
                          <div
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              r.priority === "high"
                                ? "bg-red-50 text-red-700"
                                : r.priority === "medium"
                                ? "bg-orange-50 text-orange-700"
                                : "bg-blue-50 text-blue-700"
                            }`}
                          >
                            {r.priority}
                          </div>
                        )}
                        <div className="text-xs text-gray-400 ml-auto">
                          {r.requesterName || r.requesterEmail || ""}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-3 flex items-center justify-between border-t bg-gray-50">
              <div className="text-sm text-gray-600">
                Showing {visible.length} / {requests.length}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="px-3 py-1 border rounded"
                  onClick={loadMore}
                >
                  Load more
                </button>
                <button
                  className="px-3 py-1 border rounded bg-white"
                  onClick={() => {
                    setPageLimit(PAGE_SIZE);
                  }}
                >
                  Top
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right column: details */}
        <div className="col-span-12 lg:col-span-8">
          <div
            className="bg-white rounded-lg shadow-sm p-6"
            id="support-details"
          >
            {!selected ? (
              <div className="text-center text-gray-500 p-12">
                <div className="text-lg font-medium">
                  Select a request to view details
                </div>
                <div className="mt-3">
                  Click an item on the left to open the conversation and reply.
                </div>
              </div>
            ) : (
              <>
                {/* Header of selected request */}
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-md flex items-center justify-center text-white font-bold"
                        style={{
                          background:
                            selected.priority === "high"
                              ? "#ef4444"
                              : selected.priority === "medium"
                              ? "#f59e0b"
                              : "#3b82f6",
                        }}
                      >
                        {initialsFrom(
                          selected.requesterName ||
                            selected.requesterEmail ||
                            selected.subject
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xl font-semibold truncate">
                          {selected.subject || "Support request"}
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          {selected.requesterName ||
                            selected.name ||
                            "Anonymous"}
                          {selected.requesterEmail || selected.email
                            ? ` • ${
                                selected.requesterEmail || selected.email
                              }`
                            : ""}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          Created: {toLocal(selected.createdAt)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-sm">
                      <div
                        className={`font-medium ${
                          selected.status === "resolved"
                            ? "text-green-600"
                            : "text-yellow-700"
                        }`}
                      >
                        {selected.status}
                      </div>
                      <div className="text-xs text-gray-400">
                        Priority: {selected.priority || "normal"}
                      </div>
                    </div>

                    {selected.status !== "resolved" ? (
                      <button
                        onClick={() => toggleResolved(selected, true)}
                        disabled={statusSaving}
                        className="px-4 py-2 bg-green-600 text-white rounded shadow"
                      >
                        Mark resolved
                      </button>
                    ) : (
                      <button
                        onClick={() => toggleResolved(selected, false)}
                        disabled={statusSaving}
                        className="px-4 py-2 bg-yellow-500 text-white rounded shadow"
                      >
                        Reopen
                      </button>
                    )}

                    <button
                      onClick={() => openMail(selected)}
                      className="px-3 py-2 border rounded bg-white"
                    >
                      Open mail
                    </button>
                  </div>
                </div>

                {/* Original message */}
                <div className="mt-6 prose max-w-none text-gray-800">
                  <div className="whitespace-pre-wrap">
                    {selected.message || "(no message provided)"}
                  </div>
                </div>

                <hr className="my-6" />

                {/* Conversation */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-semibold">Conversation</div>
                    <div className="text-sm text-gray-500">
                      {selectedLoading
                        ? "Loading…"
                        : `${replies.length} replies`}
                    </div>
                  </div>

                  <div className="space-y-3 max-h-64 overflow-auto p-2 border rounded-md">
                    {selectedLoading ? (
                      <div className="text-sm text-gray-400">
                        Loading conversation…
                      </div>
                    ) : replies.length === 0 ? (
                      <div className="text-sm text-gray-500">
                        No replies yet.
                      </div>
                    ) : (
                      replies.map((rep) => (
                        <div key={rep.id} className="bg-gray-50 p-3 rounded">
                          <div className="text-xs text-gray-500 mb-1">
                            {rep.createdBy || "admin"} •{" "}
                            {toLocal(rep.createdAt)}
                          </div>
                          <div className="whitespace-pre-wrap text-sm">
                            {rep.message}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Reply box */}
                <div className="mt-6">
                  <div className="font-semibold mb-2">Reply</div>
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Write your reply here. This will be saved to the support thread and open your mail client to send to the requester."
                    className="w-full p-3 border rounded-md min-h-[110px] resize-y"
                  />

                  <div className="flex items-center gap-3 mt-3">
                    <button
                      onClick={sendReply}
                      disabled={replySaving}
                      className="px-4 py-2 bg-indigo-600 text-white rounded shadow"
                    >
                      {replySaving
                        ? "Sending…"
                        : "Send reply & open mail"}
                    </button>

                    <button
                      onClick={() => setReplyText("")}
                      className="px-3 py-2 border rounded"
                    >
                      Clear
                    </button>

                    <div className="ml-auto text-sm text-gray-400">
                      Replies saved at{" "}
                      <code>support_requests/{selected.id}/replies</code>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
