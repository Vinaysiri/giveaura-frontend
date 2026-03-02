// src/pages/Notifications.jsx
import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { db, auth } from "../firebase";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  limit,
} from "firebase/firestore";
import { getIdTokenResult } from "firebase/auth";
import {
  markNotificationRead,
  markTransferDone,
} from "../services/firestoreService";
import { useNavigate } from "react-router-dom";
import Modal from "react-modal";
import GiveAuraLoader from "../components/GiveAuraLoader";
import "./Notifications.css";

Modal.setAppElement("#root");

export default function NotificationsPage() {
  const { currentUser } = useAuth() || {};
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmModal, setConfirmModal] = useState(null);
  const navigate = useNavigate();

  const unreadCount = notifications.filter((n) => !n.read).length;

  /* ================= FIRESTORE LISTENERS ================= */
  useEffect(() => {
    if (!currentUser?.uid) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    let mounted = true;

    let unsubUserId, unsubRecipient, unsubAdminIsAdmin, unsubAdminRole;

    const buckets = {
      user: { userId: [], recipientId: [] },
      admin: { isAdmin: [], recipientRole: [] },
    };

    const recompute = () => {
      if (!mounted) return;

      const map = new Map();
      [
        ...buckets.user.userId,
        ...buckets.user.recipientId,
        ...buckets.admin.isAdmin,
        ...buckets.admin.recipientRole,
      ].forEach((doc) => doc?.id && map.set(doc.id, doc));

      const merged = Array.from(map.values()).sort((a, b) => {
        const ta = a.createdAt?.seconds
          ? a.createdAt.seconds * 1000
          : new Date(a.createdAt).getTime();
        const tb = b.createdAt?.seconds
          ? b.createdAt.seconds * 1000
          : new Date(b.createdAt).getTime();
        return tb - ta;
      });

      setNotifications(merged);
      setLoading(false);
    };

    const detectAdmin = async () => {
      if (
        currentUser.email ===
        (import.meta.env?.VITE_ADMIN_EMAIL || "admin@giveaura.com")
      )
        return true;

      try {
        const res = await getIdTokenResult(auth.currentUser);
        return (
          res.claims?.admin ||
          res.claims?.isAdmin ||
          res.claims?.role === "admin"
        );
      } catch {
        return false;
      }
    };

    const baseCol = collection(db, "notifications");

    const setupUser = () => {
      unsubUserId = onSnapshot(
        query(
          baseCol,
          where("userId", "==", currentUser.uid),
          orderBy("createdAt", "desc"),
          limit(200)
        ),
        (snap) => {
          buckets.user.userId = snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }));
          recompute();
        }
      );

      unsubRecipient = onSnapshot(
        query(
          baseCol,
          where("recipientId", "==", currentUser.uid),
          orderBy("createdAt", "desc"),
          limit(200)
        ),
        (snap) => {
          buckets.user.recipientId = snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }));
          recompute();
        }
      );
    };

    const setupAdmin = () => {
      unsubAdminIsAdmin = onSnapshot(
        query(
          baseCol,
          where("isAdmin", "==", true),
          orderBy("createdAt", "desc"),
          limit(200)
        ),
        (snap) => {
          buckets.admin.isAdmin = snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }));
          recompute();
        }
      );

      unsubAdminRole = onSnapshot(
        query(
          baseCol,
          where("recipientRole", "==", "admin"),
          orderBy("createdAt", "desc"),
          limit(200)
        ),
        (snap) => {
          buckets.admin.recipientRole = snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }));
          recompute();
        }
      );
    };

    setLoading(true);

    (async () => {
      setupUser();
      if (await detectAdmin()) setupAdmin();
    })();

    return () => {
      mounted = false;
      unsubUserId?.();
      unsubRecipient?.();
      unsubAdminIsAdmin?.();
      unsubAdminRole?.();
    };
  }, [currentUser]);

  /* ================= ACTIONS ================= */
  const markRead = useCallback(async (n) => {
    setNotifications((p) =>
      p.map((x) => (x.id === n.id ? { ...x, read: true } : x))
    );
    await markNotificationRead(n.id, true);
  }, []);

  const markAllRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    await Promise.all(unread.map((n) => markNotificationRead(n.id, true)));
  };

  const confirmTransfer = async () => {
    await markTransferDone(
      confirmModal.id,
      confirmModal.campaignId,
      currentUser?.uid
    );
    setConfirmModal(null);
  };

  /* ================= UI ================= */
  return (
    <div className="notif-page">
      <div className="notif-header">
        <h2 className="notif-title">Notifications</h2>

        <div className="notif-actions">
          <button className="notif-back" onClick={() => navigate("/campaigns")}>
            ← Back
          </button>

          <button className="notif-markall" onClick={markAllRead}>
            Mark all read
          </button>

          <div className="notif-unread">
            Unread <span>{unreadCount}</span>
          </div>
        </div>
      </div>

      {loading && <GiveAuraLoader />}
      {!loading && notifications.length === 0 && (
        <p className="notif-empty">No notifications yet</p>
      )}

      <ul className="notif-list">
        {notifications.map((n) => {
          const isAdminTask =
            n.type === "funds_pending" ||
            n.title?.toLowerCase().includes("transfer");

          return (
            <li
              key={n.id}
              className={`notif-item ${n.read ? "read" : "unread"}`}
            >
              <div className="notif-content">
                <div>
                  <div className="notif-item-title">{n.title}</div>
                  <div className="notif-item-msg">{n.message}</div>

                  {n.campaignId && (
                    <button
                      className="notif-link"
                      onClick={() => navigate(`/campaign/${n.campaignId}`)}
                    >
                      View Campaign
                    </button>
                  )}
                </div>

                <div className="notif-right">
                  {!n.read && (
                    <button
                      className="notif-btn success"
                      onClick={() => markRead(n)}
                    >
                      Mark Read
                    </button>
                  )}

                  {isAdminTask && (
                    <button
                      className="notif-btn warning"
                      onClick={() => setConfirmModal(n)}
                    >
                      Mark Transfer Done
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* ================= MODAL ================= */}
      <Modal
        isOpen={!!confirmModal}
        onRequestClose={() => setConfirmModal(null)}
        className="notif-modal"
        overlayClassName="notif-overlay"
      >
        <h3>Confirm Transfer</h3>
        <p>
          Mark funds for <b>{confirmModal?.campaignId}</b> as transferred?
        </p>

        <div className="notif-modal-actions">
          <button className="notif-btn success" onClick={confirmTransfer}>
            Yes, Transfer Done
          </button>
          <button
            className="notif-btn secondary"
            onClick={() => setConfirmModal(null)}
          >
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}
