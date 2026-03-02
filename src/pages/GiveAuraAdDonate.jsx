// src/pages/GiveAuraAdDonate.jsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase";
import {
  doc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { createOrder } from "../services/paymentService";
import { addNotification } from "../services/firestoreService";
import "./GiveAuraAdDonate.css";
import GiveAuraLoader from "../components/GiveAuraLoader";

/* =====================================================
   CONSTANTS
===================================================== */
const RAZORPAY_SRC = "https://checkout.razorpay.com/v1/checkout.js";
const GST_PERCENT = 0.0236; // 2.36%

/* =====================================================
   HELPERS
===================================================== */
const loadRazorpay = () =>
  new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve(true);

    const script = document.createElement("script");
    script.src = RAZORPAY_SRC;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () =>
      reject(new Error("Failed to load Razorpay SDK"));
    document.body.appendChild(script);
  });

const fmtINR = (n) =>
  new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(Number(n || 0));

/* =====================================================
   COMPONENT
===================================================== */
export default function GiveAuraAdDonate() {
  const { adId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [ad, setAd] = useState(null);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  /* ================= LOAD AD ================= */
  useEffect(() => {
    let mounted = true;

    const fetchAd = async () => {
      try {
        const ref = doc(db, "popups", adId);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setError("Advertisement not found.");
          return;
        }

        if (mounted) {
          setAd({ id: snap.id, ...snap.data() });
        }
      } catch (err) {
        console.error("[GiveAuraAdDonate] fetchAd error:", err);
        setError("Failed to load advertisement.");
      }
    };

    fetchAd();
    return () => {
      mounted = false;
    };
  }, [adId]);

  /* ================= DONATE ================= */
  const handleDonate = async (e) => {
    e.preventDefault();
    setError(null);

    if (!currentUser?.email) {
      setError("Please login to continue.");
      return;
    }

    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setError("Enter a valid donation amount.");
      return;
    }

    setSaving(true);

    try {
      // 1️⃣ Create order
      const order = await createOrder({
        amount: amt,
        purpose: "giveaura-ad",
        adId,
      });

      await loadRazorpay();

      const gst = Number((amt * GST_PERCENT).toFixed(2));
      const net = Number((amt - gst).toFixed(2));

      const rzp = new window.Razorpay({
        key: order.key,
        amount: order.amount,
        currency: "INR",
        name: "GiveAura",
        description: `Support GiveAura – ${ad?.title || ""}`,
        order_id: order.orderId,

        handler: async (res) => {
          // 2️⃣ Save contribution
          await addDoc(
            collection(db, "platform_contributions"),
            {
              kind: "giveaura-ad",
              adId,
              adTitle: ad?.title || "",
              adImageUrl: ad?.imageUrl || "",
              amount: amt,
              gst,
              netToGiveAura: net,
              donorId: currentUser.uid,
              donorEmail: currentUser.email,
              donorName:
                currentUser.displayName ||
                currentUser.email.split("@")[0],
              paymentId: res.razorpay_payment_id,
              orderId: res.razorpay_order_id,
              createdAt: serverTimestamp(),
            }
          );

          // 3️⃣ Notify donor
          await addNotification({
            userId: currentUser.uid,
            title: "🙏 Thank you for supporting GiveAura",
            message: `Your donation of ₹${fmtINR(
              amt
            )} helps GiveAura operate and expand its impact.`,
          });

          setSuccess({ total: amt, gst, net });
          setAmount("");
        },

        prefill: {
          name: currentUser.displayName || "Donor",
          email: currentUser.email,
        },

        theme: { color: "#2563eb" },
      });

      rzp.open();
    } catch (err) {
      console.error("[GiveAuraAdDonate] payment error:", err);
      setError("Payment failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  /* ================= STATES ================= */
  if (!currentUser) {
    return (
      <div className="donate-empty">
        🚫 Please login to continue.
      </div>
    );
  }

  if (error) {
    return <div className="donate-error">⚠️ {error}</div>;
  }

  if (!ad) {
    return (
      <div className="donate-loading">
        <GiveAuraLoader />
      </div>
    );
  }

  const amtNum = Number(amount) || 0;
  const gstPreview = Number((amtNum * GST_PERCENT).toFixed(2));
  const netPreview = Number((amtNum - gstPreview).toFixed(2));

  /* ================= RENDER ================= */
  
  return (
    <div className="donate-page">
      {/* Back button */}
      <button
        className="donate-back-btn"
        onClick={() => navigate(-1)}
        aria-label="Go back"
      >
        ← Back
      </button>

      <section className="donate-hero">
        {/* LEFT */}
        <div className="donate-hero-left">
          <h1 className="donate-title">💙 Support GiveAura</h1>

          <p className="donate-sub">
            {ad.caption ||
              "Your support enables GiveAura to run verified drives, relief operations, and platform services."}
          </p>

          <form className="donate-form" onSubmit={handleDonate}>
            <div className="amount-row">
              <input
                type="number"
                min="1"
                className="input-amount"
                placeholder="Enter amount (₹)"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={saving}
              />

              <button
                type="submit"
                className={`btn-primary ${
                  saving ? "btn-disabled" : ""
                }`}
                disabled={saving}
              >
                {saving ? "Processing…" : "Donate to GiveAura"}
              </button>
            </div>

            <div className="split-box">
              <div className="split-item">
                <span className="split-label">Total</span>
                <span className="split-value">
                  ₹{fmtINR(amtNum)}
                </span>
              </div>
              <div className="split-item">
                <span className="split-label">GST (2.36%)</span>
                <span className="split-value">
                  ₹{fmtINR(gstPreview)}
                </span>
              </div>
              <div className="split-item">
                <span className="split-label">Net to GiveAura</span>
                <span className="split-value">
                  ₹{fmtINR(netPreview)}
                </span>
              </div>
            </div>

            <div className="trust-line">
              🔒 Secure payments • Transparent usage • Receipts emailed
            </div>
          </form>
        </div>

        {/* RIGHT */}
        <div className="donate-hero-right">
          <div className="carousel-wrap single-image">
            <div className="carousel-item">
              <img
                src={ad.imageUrl || "/assets/donate-banner-1.jpg"}
                alt={ad.title || "GiveAura"}
              />
              <div className="carousel-caption">
                {ad.title || "Support GiveAura"}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SUCCESS */}
      {success && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-head">
              <h3>🎉 Thank you!</h3>
              <button
                className="close"
                onClick={() => navigate(-1)}
              >
                ✕
              </button>
            </div>

            <div className="alloc-list">
              <div className="alloc-item">
                <span>Total Paid</span>
                <strong>₹{fmtINR(success.total)}</strong>
              </div>
              <div className="alloc-item">
                <span>GST</span>
                <strong>₹{fmtINR(success.gst)}</strong>
              </div>
              <div className="alloc-item">
                <span>Net to GiveAura</span>
                <strong>₹{fmtINR(success.net)}</strong>
              </div>
            </div>

            <div className="modal-actions">
              <button
                className="btn-primary"
                onClick={() => navigate("/")}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
