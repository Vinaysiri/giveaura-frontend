// src/pages/RefundPolicy.jsx
import React from "react";
import { useNavigate } from "react-router-dom";

export default function RefundPolicy() {
  const navigate = useNavigate();

  return (
    <div style={styles.container}>
      <h1 style={styles.heading}>Refund & Cancellation Policy</h1>

      <p style={styles.text}>
        The <strong>GiveAura</strong> platform enables individuals and organizations to raise funds
        for verified causes. Since donations are voluntary contributions intended to support
        campaigns, refunds are handled carefully to protect donors and beneficiaries.
      </p>

      <h2 style={styles.subheading}>1. Refund Eligibility</h2>
      <p style={styles.text}>Refunds may be considered in the following cases:</p>
      <ul style={styles.list}>
        <li>If a donation was made by mistake (incorrect amount / duplicate transaction).</li>
        <li>If fraudulent or misleading campaign activity is detected.</li>
        <li>If GiveAura or payment partners reverse a payment due to technical failure.</li>
        <li>If a campaign is proven to violate GiveAura policies and is suspended.</li>
      </ul>

      <h2 style={styles.subheading}>2. Refunds Not Available For</h2>
      <ul style={styles.list}>
        <li>Voluntary valid donations after campaign withdrawal.</li>
        <li>Donations used or transferred to beneficiaries.</li>
        <li>Donations made anonymously without verifiable identity.</li>
      </ul>

      <h2 style={styles.subheading}>3. Refund Request Procedure</h2>
      <ul style={styles.list}>
        <li>Email your request to <strong>refunds@giveaura.com</strong> within 7 days of donation.</li>
        <li>Include payment receipt, UPI/transaction ID, donor name, and campaign link.</li>
        <li>Provide a clear reason for the refund request.</li>
      </ul>
      <p style={styles.text}>
        The GiveAura Support Team will review requests and may contact you for verification.
      </p>

      <h2 style={styles.subheading}>4. Processing Time</h2>
      <p style={styles.text}>
        Approved refunds will be processed within <strong>7–14 business days</strong>, depending on
        bank/payment gateway timelines.
      </p>

      <h2 style={styles.subheading}>5. Payment Disputes / Chargebacks</h2>
      <p style={styles.text}>
        If a donor raises a dispute with their bank or payment provider, GiveAura will cooperate with
        investigations and may temporarily hold funds.
      </p>

      <h2 style={styles.subheading}>6. Changes to Policy</h2>
      <p style={styles.text}>
        GiveAura reserves the right to update this policy to improve safety and compliance.
      </p>

      <p style={{ marginTop: 40, fontSize: 14, color: "#666", textAlign: "center" }}>
        For any refund related support, contact:
        <br />
        <b>refunds@giveaura.com</b> | <b>support@giveaura.com</b>
      </p>

      <button style={styles.button} onClick={() => navigate(-1)}>
        ← Back
      </button>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: 800,
    margin: "80px auto",
    padding: "20px",
    lineHeight: "1.6",
    fontFamily: "Inter, sans-serif",
  },
  heading: {
    fontSize: 32,
    marginBottom: 16,
    fontWeight: 800,
    color: "#1f2937",
  },
  subheading: {
    fontSize: 20,
    marginTop: 24,
    marginBottom: 8,
    fontWeight: 700,
    color: "#111827",
  },
  text: {
    fontSize: 15,
    color: "#374151",
  },
  list: {
    marginLeft: 20,
    color: "#374151",
    fontSize: 15,
  },
  button: {
    marginTop: 40,
    background: "#2563eb",
    color: "#fff",
    padding: "10px 18px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    fontWeight: 600,
  },
};
