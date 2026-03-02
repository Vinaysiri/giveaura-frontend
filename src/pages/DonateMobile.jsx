// src/pages/DonateMobile.jsx
import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getCampaignById } from "../services/firestoreService";
import { createOrder } from "../services/paymentService";
import { recordSuccessfulDonation } from "../services/donationService";
import { createCampaignBoost } from "../services/boostService";
import GiveAuraLoader from "../components/GiveAuraLoader";
import { db } from "../firebase";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import "./DonateMobile.css";


export default function DonateMobile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [campaign, setCampaign] = useState(null);
  const [amount, setAmount] = useState("");
  const [donorName, setDonorName] = useState("");
  const [donorPhoto, setDonorPhoto] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [banners, setBanners] = useState([]);
  const [posters, setPosters] = useState([]);

  const carouselRef = useRef(null);
  const carouselIndex = useRef(0);
  const successRef = useRef(false);

  /* load campaign */
  useEffect(() => {
    getCampaignById(id).then(setCampaign).catch(() => {
      setError("Failed to load campaign");
    });
  }, [id]);

  /* load ads */
  useEffect(() => {
    const qRef = query(
      collection(db, "popups"),
      where("location", "==", "donate"),
      where("active", "==", true),
      orderBy("order", "asc")
    );

    return onSnapshot(qRef, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setBanners(all.filter((x) => x.kind === "banner"));
      setPosters(all.filter((x) => x.kind === "poster"));
    });
  }, []);

  /* banner auto scroll */
  useEffect(() => {
    if (!banners.length) return;
    const idt = setInterval(() => {
      carouselIndex.current =
        (carouselIndex.current + 1) % banners.length;
      carouselRef.current.style.transform =
        `translateX(-${carouselIndex.current * 100}%)`;
    }, 4000);
    return () => clearInterval(idt);
  }, [banners]);

  const handleDonate = async () => {
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      setError("Enter a valid amount");
      return;
    }

    setSaving(true);
    successRef.current = false;

    try {
      const order = await createOrder({
        amount: numericAmount,
        campaignId: id,
        purpose: "donation",
      });
if (!window.Razorpay) {
  setSaving(false);
  setError("Payment system not ready. Please refresh the page.");
  return;
}

      const rzp = new window.Razorpay({
        key: order.key,
        amount: order.amount,
        currency: "INR",
        name: "GiveAura",
        description: `Donation to ${campaign.title}`,
        order_id: order.orderId,

        handler: async (res) => {
          if (successRef.current) return;

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
            amount: numericAmount,
            user: currentUser || null,
            paymentId: res.razorpay_payment_id,
            donorName: currentUser?.displayName || donorName || "Well-Wisher",
            donorPhotoURL: currentUser?.photoURL || photoURL || null,
          });
          if (campaign?.enableBoost && campaign?.boostAmount > 0) {
            await createCampaignBoost({
              campaignId: id,
              donorId: currentUser?.uid || null,
              amount: campaign.boostAmount,
              paymentId: res.razorpay_payment_id,
            });
          }

          successRef.current = true;
          navigate(`/campaign/${id}`);
        },

        modal: {
          ondismiss: () => setSaving(false),
        },
      });

      rzp.open();
    } catch {
      setError("Payment failed");
      setSaving(false);
    }
  };

  if (!campaign) {
    return (
      <div className="dm-loading">
        <GiveAuraLoader />
      </div>
    );
  }

  return (
    <div className="dm-page">
      {/* ADS */}
      {banners.length > 0 && (
        <div className="dm-carousel">
          <div className="dm-track" ref={carouselRef}>
            {banners.map((b) => (
              <img
                key={b.id}
                src={b.imageUrl}
                alt={b.title}
                onClick={() => navigate(`/giveaura/ads/${b.id}`)}
              />
            ))}
          </div>
        </div>
      )}

      {/* POSTERS */}
      {posters.length > 0 && (
        <div className="dm-posters">
          {posters.map((p) => (
            <img
              key={p.id}
              src={p.imageUrl}
              alt={p.title}
              onClick={() => navigate(`/giveaura/ads/${p.id}`)}
            />
          ))}
        </div>
      )}

      {/* CONTENT */}
      <div className="dm-content">
        <h2>{campaign.title}</h2>
        <p className="dm-trust">
          🔒 Secure payments • Verified campaigns
        </p>

        {!currentUser && (
          <>
            <input
              type="text"
              placeholder="Your Name"
              value={donorName}
              onChange={(e) => setDonorName(e.target.value)}
              required
            />

            <input
              type="file"
              accept="image/*"
              onChange={(e) => setDonorPhoto(e.target.files[0])}
            />
          </>
        )}

        <input
          type="number"
          placeholder="₹ Enter amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />

        {error && <div className="dm-error">{error}</div>}
      </div>

      {/* FIXED CTA */}
      <button
        className="dm-donate-btn"
        disabled={saving}
        onClick={handleDonate}
      >
        {saving ? "Processing…" : "Donate Securely"}
      </button>
    </div>
  );
}
