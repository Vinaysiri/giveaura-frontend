// src/pages/Help.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

export default function Help() {
  const { currentUser } = useAuth() || {};
  const navigate = useNavigate();

  const [topic, setTopic] = useState("general");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState(currentUser?.email || "");
  const [name, setName] = useState(
    currentUser?.displayName || currentUser?.email?.split("@")[0] || ""
  );
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // viewport-based layout
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1024
  );

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isMobile = viewportWidth < 768;

  // Small helper to map topic -> subject + priority
  const getSubjectAndPriority = () => {
    switch (topic) {
      case "donation":
        return {
          subject: "Donation / payment issue",
          priority: "high",
        };
      case "campaign":
        return {
          subject: "Campaign related issue",
          priority: "medium",
        };
      case "verification":
        return {
          subject: "Verification / KYC",
          priority: "medium",
        };
      case "account":
        return {
          subject: "Account / login problem",
          priority: "medium",
        };
      case "other":
        return {
          subject: "Other support request",
          priority: "low",
        };
      default:
      case "general":
        return {
          subject: "General question",
          priority: "low",
        };
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    if (!message.trim()) {
      setErrorMsg("Please describe your issue.");
      return;
    }
    if (!email.trim()) {
      setErrorMsg("Email is required so support can reply.");
      return;
    }

    const { subject, priority } = getSubjectAndPriority();

    try {
      setSubmitting(true);

      // 🔥 Create document in support_requests
      await addDoc(collection(db, "support_requests"), {
        subject,
        message: message.trim(),
        topic,
        requesterEmail: email.trim(),
        requesterName: name.trim() || null,
        userId: currentUser?.uid || null,
        status: "open",                 // Support.jsx filter will pick this
        priority,                       // "high" | "medium" | "low"
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setSubmitted(true);
      setMessage("");

      // hide success after a few seconds
      setTimeout(() => {
        setSubmitted(false);
      }, 4000);
    } catch (err) {
      console.error("Failed to submit support request:", err);
      setErrorMsg("Something went wrong while sending your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  const faqs = [
    {
      q: "How do I contact customer care?",
      a: "You can reach us by email at support@giveaura.in, using the form on this page, or via WhatsApp/phone if provided on your fundraiser receipt or confirmation email.",
    },
    {
      q: "I made a donation but it is not showing in my history.",
      a: "Sometimes it can take a few minutes for payments to sync. Please check your Donation History page. If it still doesn’t appear after 30 minutes, contact support with your transaction ID and screenshot.",
    },
    {
      q: "How do I edit or close my campaign?",
      a: "Go to ‘My Campaigns’, choose the campaign you want to update, and click ‘Edit’. To close the campaign early, you can change its status in the edit screen or request help from the admin team via this Help page.",
    },
    {
      q: "Are my donations secure?",
      a: "GiveAura uses trusted payment gateways like Razorpay and follows best practices for secure payments. Card and UPI details are never stored on GiveAura servers.",
    },
    {
      q: "How long does verification take?",
      a: "Most campaigns are reviewed within 24–48 hours. If we need more information, our team will reach out to the email address linked to your account.",
    },
  ];

  const [openFaqIndex, setOpenFaqIndex] = useState(0);

  return (
    <div
      className="help-page"
      style={{
        padding: isMobile ? "16px 12px" : "24px 16px",
        maxWidth: 960,
        margin: "0 auto",
      }}
    >
      {/* Back button */}
      <button
        type="button"
        onClick={handleBack}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          borderRadius: 999,
          border: "1px solid rgba(148,163,184,0.7)",
          background: "rgba(15,23,42,0.85)",
          color: "#e5e7eb",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          marginBottom: 10,
        }}
      >
        ← Back
      </button>

      {/* Page header */}
      <header
        className="help-header card"
        style={{
          background: "linear-gradient(135deg,#020617,#111827)",
          color: "#e5e7eb",
          borderRadius: 16,
          padding: isMobile ? "14px 14px 12px" : "18px 18px 16px",
          marginBottom: 20,
          boxShadow: "0 16px 40px rgba(15,23,42,0.4)",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: isMobile ? 20 : 24,
            fontWeight: 700,
            color: "white",
          }}
        >
          Help &amp; Customer Care
        </h1>
        <p
          style={{
            marginTop: 6,
            fontSize: 14,
            color: "#9ca3af",
          }}
        >
          We’re here to help you with donations, campaigns, account issues and
          anything else related to GiveAura.
        </p>

        {/* contact summary row */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            marginTop: 12,
            fontSize: 13,
          }}
        >
          <div
            style={{
              padding: "8px 10px",
              borderRadius: 999,
              background: "rgba(15,23,42,0.8)",
              border: "1px solid rgba(148,163,184,0.4)",
            }}
          >
            📧 Email: <strong>support@giveaura.in</strong>
          </div>
          <div
            style={{
              padding: "8px 10px",
              borderRadius: 999,
              background: "rgba(15,23,42,0.8)",
              border: "1px solid rgba(148,163,184,0.4)",
            }}
          >
            🕒 Support hours: <strong>10:00 AM – 7:00 PM IST</strong>
          </div>
        </div>
      </header>

      {/* Main layout: 2 columns on desktop, stacked on mobile */}
      <div
        className="help-layout"
        style={{
          display: "grid",
          gridTemplateColumns: isMobile
            ? "minmax(0,1fr)"
            : "minmax(0,2fr) minmax(0,1.4fr)",
          gap: 18,
        }}
      >
        {/* LEFT: FAQ */}
        <section
          className="help-faq card"
          style={{
            background: "#ffffff",
            borderRadius: 14,
            padding: 16,
            boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            Frequently Asked Questions
          </h2>
          <p style={{ marginTop: 4, fontSize: 13, color: "#6b7280" }}>
            Quick answers to the most common questions from donors and campaign
            owners.
          </p>

          <div style={{ marginTop: 10 }}>
            {faqs.map((item, index) => {
              const isOpen = index === openFaqIndex;
              return (
                <div
                  key={index}
                  className="faq-item"
                  style={{
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    marginBottom: 8,
                    overflow: "hidden",
                    background: isOpen ? "#f3f4ff" : "#ffffff",
                  }}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setOpenFaqIndex((prev) => (prev === index ? -1 : index))
                    }
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 10px",
                      background: "transparent",
                      border: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      cursor: "pointer",
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    <span>{item.q}</span>
                    <span style={{ fontSize: 18, marginLeft: 8 }}>
                      {isOpen ? "−" : "+"}
                    </span>
                  </button>
                  {isOpen && (
                    <div
                      style={{
                        padding: "0 10px 10px",
                        fontSize: 13,
                        color: "#4b5563",
                      }}
                    >
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* RIGHT: contact form / ticket */}
        <section
          className="help-contact card"
          style={{
            background: "#ffffff",
            borderRadius: 14,
            padding: 16,
            boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            Contact Customer Care
          </h2>
          <p style={{ marginTop: 4, fontSize: 13, color: "#6b7280" }}>
            Tell us what you need help with and our support team will get back
            to you.
          </p>

          <form
            onSubmit={handleSubmit}
            style={{
              marginTop: 12,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div>
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Your Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
              />
            </div>

            <div>
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  display: "block",
                  marginBottom: 4,
                }}
              >
                What do you need help with?
              </label>
              <select
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              >
                <option value="general">General question</option>
                <option value="donation">Donation / payment issue</option>
                <option value="campaign">My campaign</option>
                <option value="verification">Verification / KYC</option>
                <option value="account">Account / login problem</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Message
              </label>
              <textarea
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe your issue in detail. Include transaction ID or campaign link if applicable."
                required
              />
            </div>

            <div style={{ fontSize: 11, color: "#6b7280" }}>
              By submitting this form, you agree to be contacted on the email
              address provided for support regarding your request.
            </div>

            <button
              type="submit"
              className="btn"
              style={{ marginTop: 6 }}
              disabled={submitting}
            >
              {submitting ? "Submitting…" : "📩 Submit to Customer Care"}
            </button>

            {errorMsg && (
              <div
                style={{
                  marginTop: 8,
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "#fef2f2",
                  color: "#b91c1c",
                  fontSize: 13,
                }}
              >
                {errorMsg}
              </div>
            )}

            {submitted && (
              <div
                style={{
                  marginTop: 8,
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "#ecfdf5",
                  color: "#15803d",
                  fontSize: 13,
                }}
              >
                ✅ Your request has been recorded. Our customer care team will
                review it and get back to you shortly.
              </div>
            )}
          </form>

          {/* Extra quick info box */}
          <div
            style={{
              marginTop: 12,
              padding: "8px 10px",
              borderRadius: 8,
              background: "#f9fafb",
              fontSize: 12,
              color: "#6b7280",
            }}
          >
            <strong>Tip:</strong> For payment issues, please attach your{" "}
            <em>transaction ID, payment screenshot</em> and the{" "}
            <em>email / phone number</em> used for payment when you reply to our
            support email. That helps us resolve your case faster.
          </div>
        </section>
      </div>
    </div>
  );
}
