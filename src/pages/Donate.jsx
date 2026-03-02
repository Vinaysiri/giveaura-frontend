// src/pages/Donate.jsx
import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getCampaignById } from "../services/firestoreService";
import { createOrder } from "../services/paymentService";
import { recordSuccessfulDonation } from "../services/donationService";
import {createCampaignBoost} from "../services/boostService";
import GiveAuraLoader from "../components/GiveAuraLoader";
import { db } from "../firebase";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import "./Donate.css";


export default function Donate() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [campaign, setCampaign] = useState(null);
  const [amount, setAmount] = useState("");
  const [donorName, setDonorName] = useState("");
  const [donorPhoto, setDonorPhoto] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  /* prevents double execution */
  const successRef = useRef(false);

  /* ads */
  const [banners, setBanners] = useState([]);
  const [posters, setPosters] = useState([]);
  const carouselRef = useRef(null);
  const carouselIndex = useRef(0);

  /* ---------------- load campaign ---------------- */
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const doc = await getCampaignById(id);
        if (mounted) setCampaign(doc);
      } catch {
        setError("Failed to load campaign");
      }
    })();
    return () => (mounted = false);
  }, [id]);

  /* ---------------- load ads ---------------- */
  useEffect(() => {
    const qRef = query(
      collection(db, "popups"),
      where("location", "==", "donate"),
      where("active", "==", true),
      orderBy("order", "asc")
    );

    const unsub = onSnapshot(qRef, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setBanners(all.filter((x) => x.kind === "banner"));
      setPosters(all.filter((x) => x.kind === "poster"));
    });

    return () => unsub();
  }, []);

  /* carousel auto scroll */
  useEffect(() => {
    if (!banners.length) return;
    const idt = setInterval(() => {
      carouselIndex.current =
        (carouselIndex.current + 1) % banners.length;
      if (carouselRef.current) {
        carouselRef.current.style.transform = `translateX(-${
          carouselIndex.current * 100
        }%)`;
      }
    }, 4500);
    return () => clearInterval(idt);
  }, [banners]);

  /* ---------------- donate handler ---------------- */
  const handleDonate = async (e) => {
    e.preventDefault();
    setError(null);


    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      setError("Enter a valid amount");
      return;
    }

    setSaving(true);
    successRef.current = false;

    try {
      /* 1 Create order */
      const order = await createOrder({
        amount: numericAmount,
        campaignId: id,
        purpose: "donation",
        meta: { campaignType: campaign?.campaignType || "personal" },
      });


      const confirmedAmount = numericAmount;
      
if (!window.Razorpay) {
  setSaving(false);
  setError("Payment system not ready. Please refresh.");
  return;
}
      /* 2️ Open Razorpay */
      const rzp = new window.Razorpay({
        key: order.key,
        amount: order.amount,
        currency: "INR",
        name: "GiveAura",
        description: `Donation to ${campaign.title}`,
        order_id: order.orderId,

        handler: async (res) => {
  if (successRef.current) return;

  if (!res?.razorpay_payment_id) {
    console.error("[Donate] Razorpay response invalid", res);
    setSaving(false);
    setError("Payment failed. Please try again.");
    return;
  }

  try {
    // 1️ Record donation
    let photoURL = null;

    if (!currentUser && donorPhoto) {
      try {
        const { uploadMedia } = await import("../services/firestoreService");
        const uploadRes = await uploadMedia(donorPhoto, "guest-donors");
        photoURL = uploadRes?.url || null;
      } catch (err) {
        console.warn("Guest photo upload failed");
      }
    }

    await recordSuccessfulDonation({
      campaignId: id,
      amount: confirmedAmount,
      user: currentUser || null,
      paymentId: res.razorpay_payment_id,
      donorName: currentUser?.displayName || donorName || "Well-Wisher",
      donorPhotoURL: currentUser?.photoURL || photoURL || null,
    });

    // 2️ campaign boost (SAFE GUARD)
    if (campaign?.enableBoost === true && campaign?.boostAmount > 0) {
      await createCampaignBoost({
        campaignId: id,
        donorId: currentUser?.uid || null,
        amount: campaign.boostAmount,
        paymentId: res.razorpay_payment_id,
      });
    }

    successRef.current = true;

    setTimeout(() => {
      setSuccess(true);
      setSaving(false);
      setError(null);
    }, 150);
  } catch (err) {
    console.error("[Donate] Donation record failed:", err);
    setSaving(false);
    setSuccess(false);
    setError(
      "Payment was successful, but donation recording failed. Please contact support."
    );
  }
},

        modal: {
          ondismiss: () => {
            if (!successRef.current) {
              setSaving(false);
            }
          },
        },

        prefill: {
        name: currentUser?.displayName || "Well-Wisher",
        email: currentUser?.email || "",
        },


        theme: { color: "#2563eb" },
      });

      rzp.open();
    } catch (err) {
      setError(err?.message || "Payment failed");
      setSaving(false);
    }
  };

  
  if (!campaign)
    return <div className="donate-loading"><GiveAuraLoader /></div>;

  return (
    <div className="donate-page">
      <div className="donate-layout">
        {/* LEFT: ADS */}
        <div>
          {banners.length > 0 && (
            <div className="donate-hero-carousel">
              <div className="carousel-track" ref={carouselRef}>
                {banners.map((b) => (
                  <div
                    key={b.id}
                    className="carousel-slide"
                    onClick={() =>
                      b.id && navigate(`/giveaura/ads/${b.id}`)
                    }
                  >
                    <img src={b.imageUrl} alt={b.title} />
                    <div className="carousel-caption">
                      {b.title || "Support this cause"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {posters.length > 0 && (
            <div className="poster-grid">
              {posters.map((p) => (
                <div
                  key={p.id}
                  className="poster-card"
                  onClick={() =>
                    p.id && navigate(`/giveaura/ads/${p.id}`)
                  }
                >
                  <img src={p.imageUrl} alt={p.title} />
                  <div className="poster-body">
                    <div className="poster-title">{p.title}</div>
                    <div className="poster-caption">{p.caption}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: DONATE CARD */}
        <div className="donate-card">
          <h1 className="donate-title">
            Donate to {campaign.title}
          </h1>

          <form onSubmit={handleDonate}>
            <div className="amount-label">Donation Amount</div>
            {/* Guest Name Input */}
            {!currentUser && (
              <>
                <div className="amount-label">Your Name</div>
                <input
                  type="text"
                  className="amount-input"
                  placeholder="Enter your name"
                  value={donorName}
                  onChange={(e) => setDonorName(e.target.value)}
                  disabled={saving}
                  required
                />

                <div className="amount-label">Upload Photo (Optional)</div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setDonorPhoto(e.target.files[0])}
                  disabled={saving}
                />
              </>
            )}
            <input
              type="number"
              className="amount-input"
              placeholder="₹ Enter amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={saving}
            />

            <button
              type="submit"
              className="donate-btn"
              disabled={saving}
            >
              {saving ? "Processing…" : "Donate Securely"}
            </button>
          </form>

          <div className="trust-box">
            🔒 Secure payments • Verified campaigns • Instant receipt
          </div>

          {error && <div className="donate-error">{error}</div>}
        </div>
      </div>

      {/* SUCCESS MODAL */}
      {success && (
        <div className="success-backdrop">
          <div className="success-modal">
            <div className="success-tick">
              <span />
            </div>
            <h3>Donation Successful</h3>
            <p>
              Thank you for supporting <b>{campaign.title}</b>
            </p>
            <button
              className="success-btn"
              onClick={() => navigate(`/campaign/${id}`)}
            >
              View Campaign
            </button>
          </div>
        </div>
      )}
    </div>
  );
}