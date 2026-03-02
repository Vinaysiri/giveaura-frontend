// src/pages/BoostPayment.jsx
import React, { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  getCampaignById,
  updateCampaign,
} from "../services/firestoreService";
import "./BoostPayment.css";
import { createCampaignBoost } from "../services/boostService";

/* ---------------- BOOST PRICING ---------------- */
const BOOST_PRICING = {
  none: 0,
  basic: 399,
  premium: 999,
  super: 4999,
};

const BOOST_LABEL = {
  basic: "Basic Boost",
  premium: "Premium Boost",
  super: "Super Boost",
};

const RAZORPAY_KEY_ID =
  import.meta?.env?.VITE_RAZORPAY_KEY_ID || "";

/* ---------------- RAZORPAY LOADER ---------------- */
function useRazorpayScript() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (window.Razorpay) {
      setReady(true);
      return;
    }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => setReady(true);
    s.onerror = () => setError("Failed to load Razorpay SDK");
    document.body.appendChild(s);
    return () => document.body.removeChild(s);
  }, []);

  return { ready, error };
}

export default function BoostPayment() {
  const { campaignId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { ready, error: razorpayError } = useRazorpayScript();

  /* ---------------- QUERY PARAMS ---------------- */
  const source = params.get("source"); // "edit" | null
  const fromPlan = params.get("from") || "none";
  const toPlan = params.get("to") || params.get("plan") || "basic";
  const diffAmount = Number(params.get("amount"));

  const isUpgradeFlow = source === "edit";

  /* ---------------- STATE ---------------- */
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState(null);
  const [statusMsg, setStatusMsg] = useState(null);

  /* ---------------- LOAD CAMPAIGN ---------------- */
  useEffect(() => {
    async function load() {
      try {
        const camp = await getCampaignById(campaignId);
        // Prevent duplicate activation
      if (!isUpgradeFlow && camp.boostFeePaid && camp.isBoosted) {
        setError("This campaign is already boosted.");
        return;
      }

        if (!camp) {
          setError("Campaign not found.");
          return;
        }

        if (
          isUpgradeFlow &&
          BOOST_PRICING[toPlan] <= BOOST_PRICING[fromPlan]
        ) {
          setError("Invalid boost upgrade request.");
          return;
        }

        setCampaign(camp);
      } catch (err) {
        console.error(err);
        setError("Failed to load campaign.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [campaignId, fromPlan, toPlan, isUpgradeFlow]);

  /* ---------------- PAYMENT AMOUNT ---------------- */
  const payableAmount = isUpgradeFlow
    ? diffAmount
    : BOOST_PRICING[toPlan];

  /* ---------------- SAVE AFTER PAYMENT ---------------- */
  const markBoostPaid = async (paymentId, razorpayMeta = {}) => {
  try {
    const boostFeeMeta = {
      source: isUpgradeFlow ? "edit-upgrade" : "create",
      fromPlan,
      toPlan,
      amount: payableAmount,
    };

    if (razorpayMeta.orderId) boostFeeMeta.orderId = razorpayMeta.orderId;
    if (razorpayMeta.signature) boostFeeMeta.signature = razorpayMeta.signature;
    if (razorpayMeta.mode) boostFeeMeta.mode = razorpayMeta.mode;

    // 1️⃣ Update campaign
    await updateCampaign(campaignId, {
      boostPlan: toPlan,
      boostFeePaid: true,
      boostFeeAmount: payableAmount,
      boostFeePaymentId: paymentId,
      boostFeeMeta,
      isBoosted: true,
      boostedAt: new Date(),
    });

    // 2️⃣ 🔥 CREATE BOOST DOCUMENT (THIS WAS MISSING)
    await createCampaignBoost({
      campaignId,
      campaignTitle: campaign.title,
      ownerId: currentUser.uid,
      plan: toPlan,
      paymentId,
      orderId: razorpayMeta.orderId || null,
    });

    setStatusMsg("Boost activated successfully");

    setTimeout(() => {
      navigate(`/campaign/${campaignId}`, { replace: true });
    }, 800);

  } catch (err) {
    console.error("Boost activation failed:", err);
    setError(
      "Payment succeeded but boost activation failed. Please contact support."
    );
  } finally {
    setPaying(false);
  }
};

  /* ---------------- PAY ---------------- */
  const handlePay = async () => {
    setError(null);
    setPaying(true);

    if (!currentUser) {
      navigate("/login");
      return;
    }

    // DEV MODE
    if (!RAZORPAY_KEY_ID || !ready || !window.Razorpay) {
      const ok = window.confirm(
        `Dev mode: mark ₹${payableAmount} boost as paid?`
      );
      if (!ok) {
        setPaying(false);
        return;
      }
      await markBoostPaid("DEV_TEST_PAYMENT", {
        mode: "dev",
      });
      return;
    }

    try {
      const rzp = new window.Razorpay({
        key: RAZORPAY_KEY_ID,
        amount: payableAmount * 100,
        currency: "INR",
        name: "GiveAura Boost",
        description: BOOST_LABEL[toPlan],
        handler: async (res) => {
          await markBoostPaid(res.razorpay_payment_id, {
            orderId: res.razorpay_order_id || null,
            signature: res.razorpay_signature || null,
          });
        },
        prefill: {
          name:
            currentUser.displayName ||
            currentUser.email?.split("@")[0] ||
            "GiveAura User",
          email: currentUser.email || "",
        },
        notes: {
          campaignId,
          fromPlan,
          toPlan,
          upgrade: isUpgradeFlow,
        },
        theme: { color: "#2563eb" },
      });

      rzp.open();
    } catch (err) {
      console.error(err);
      setError("Unable to initiate payment.");
      setPaying(false);
    }
  };

  /* ---------------- UI ---------------- */
  if (loading) return <p style={{ textAlign: "center" }}>Loading…</p>;

  if (error) {
    return (
      <div className="bp-page">
        <div className="bp-card">
          <h2>Boost Payment</h2>
          <p className="bp-error">{error}</p>
          <button onClick={() => navigate(-1)}>Go Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="bp-page">
      <div className="bp-card">
        <h2>Boost Payment</h2>

        <p>
          Campaign: <strong>{campaign?.title}</strong>
        </p>

        {isUpgradeFlow && (
          <p className="bp-upgrade">
            Upgrading from <strong>{fromPlan}</strong> →{" "}
            <strong>{toPlan}</strong>
          </p>
        )}

        <div className="bp-summary">
          <div>
            <span>Plan</span>
            <strong>{BOOST_LABEL[toPlan]}</strong>
          </div>
          <div>
            <span>Amount</span>
            <strong>₹{payableAmount}</strong>
          </div>
        </div>

        {razorpayError && (
          <p className="bp-warning">{razorpayError}</p>
        )}

        {statusMsg && <p className="bp-status">{statusMsg}</p>}

        <button
          className="bp-btn primary"
          onClick={handlePay}
          disabled={paying}
        >
          {paying ? "Processing…" : `Pay ₹${payableAmount} & Activate Boost`}
        </button>

        <button
          className="bp-btn secondary"
          onClick={() => navigate(`/campaign/${campaignId}`)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
