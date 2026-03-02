// src/components/SessionAdPopup.jsx
import React, { useEffect, useState, useRef } from "react";
import { db } from "../firebase";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from "firebase/firestore";

const SESSION_KEY = "giveaura_ad_popup_sequence_shown";

/**
 * SessionAdPopup
 * - Shows verified campaign suggestions
 * - Calm slide-in (left / right alternating)
 * - Runs once per session
 * - Trust / institutional UI
 */
export default function SessionAdPopup() {
  const [ads, setAds] = useState([]);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);

  const timerRef = useRef(null);

  /* ================= LOAD ADS ================= */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(SESSION_KEY) === "yes") return;

    const loadAds = async () => {
      try {
        const qRef = query(
          collection(db, "popups"),
          where("location", "==", "donate"),
          where("active", "==", true),
          where("kind", "==", "poster"),
          orderBy("order", "asc")
        );

        const snap = await getDocs(qRef);
        if (!snap.empty) {
          setAds(
            snap.docs.map((d) => ({
              id: d.id,
              ...d.data(),
            }))
          );
        }
      } catch (err) {
        console.error("[SessionAdPopup] load error:", err);
      }
    };

    loadAds();
  }, []);

  /* ================= SEQUENCE CONTROL ================= */
  useEffect(() => {
    if (!ads.length) return;

    if (index >= ads.length) {
      sessionStorage.setItem(SESSION_KEY, "yes");
      return;
    }

    setVisible(true);

    timerRef.current = setTimeout(() => {
      setVisible(false);
      setTimeout(() => setIndex((i) => i + 1), 300);
    }, 4500);

    return () => clearTimeout(timerRef.current);
  }, [ads, index]);

  if (!ads.length || index >= ads.length) return null;

  const ad = ads[index];
  const side = index % 2 === 0 ? "right" : "left";

  /* ================= ACTIONS ================= */
  const handleDismiss = () => {
    setVisible(false);
    setTimeout(() => setIndex((i) => i + 1), 300);
  };

  const handleClickAd = () => {
    window.location.href = `/campaign/${ad.campaignId || ad.id}`;
  };

  /* ================= STYLES (TRUST UI) ================= */
  const containerStyle = {
    position: "fixed",
    bottom: 20,
    [side]: 20,
    zIndex: 300,
    maxWidth: 360,
    background: "#ffffff",
    borderRadius: 12,
    padding: 12,
    border: "1px solid #e5e7eb",
    boxShadow: "0 12px 30px rgba(0,0,0,0.12)",
    color: "#111827",
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    transform: visible
      ? "translateX(0)"
      : side === "right"
      ? "translateX(120%)"
      : "translateX(-120%)",
    opacity: visible ? 1 : 0,
    transition: "transform 0.35s ease, opacity 0.35s ease",
  };

  const imgStyle = {
    width: 72,
    height: 72,
    borderRadius: 8,
    objectFit: "cover",
    flexShrink: 0,
    cursor: "pointer",
    background: "#f3f4f6",
  };

  const titleStyle = {
    fontWeight: 700,
    fontSize: 14,
    lineHeight: 1.35,
  };

  const captionStyle = {
    fontSize: 13,
    marginTop: 4,
    color: "#4b5563",
    lineHeight: 1.45,
  };

  const viewBtnStyle = {
    marginTop: 8,
    padding: "6px 12px",
    borderRadius: 8,
    border: "none",
    background: "#0f766e",
    color: "#ffffff",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  };

  const closeBtnStyle = {
    marginLeft: 4,
    background: "transparent",
    border: "none",
    color: "#9ca3af",
    cursor: "pointer",
    fontSize: 16,
    lineHeight: 1,
  };

  const labelStyle = {
    fontSize: 11,
    fontWeight: 600,
    color: "#6b7280",
    marginBottom: 4,
  };

  /* ================= RENDER ================= */
  return (
    <div style={containerStyle} role="dialog" aria-live="polite">
      {ad.imageUrl && (
        <img
          src={ad.imageUrl}
          alt={ad.title || "Campaign"}
          style={imgStyle}
          loading="lazy"
          onClick={handleClickAd}
        />
      )}

      <div style={{ flex: 1 }}>
        <div style={labelStyle}>Recommended campaign</div>

        <div style={titleStyle}>
          {ad.title || "Support a verified campaign"}
        </div>

        {ad.caption && <div style={captionStyle}>{ad.caption}</div>}

        <button type="button" style={viewBtnStyle} onClick={handleClickAd}>
          View details
        </button>
      </div>

      <button
        type="button"
        aria-label="Dismiss"
        style={closeBtnStyle}
        onClick={handleDismiss}
      >
        ✕
      </button>
    </div>
  );
}
