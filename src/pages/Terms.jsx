// src/pages/Terms.jsx
import React from "react";
import { useNavigate } from "react-router-dom";

export default function Terms() {
  const navigate = useNavigate();

  return (
    <div style={styles.container}>
      <h1 style={styles.heading}>Terms & Conditions</h1>

      <p style={styles.text}>
        Welcome to <strong>GiveAura</strong>. By accessing or using our
        platform, you agree to be bound by the following terms and conditions.
        Please read them carefully.
      </p>

      <h2 style={styles.subheading}>1. About GiveAura</h2>
      <p style={styles.text}>
        GiveAura is a crowdfunding platform that enables users to raise funds
        for causes including medical, education, emergency support, charity,
        and other personal or social initiatives. GiveAura acts solely as a
        platform provider and is not responsible for the accuracy of campaign
        content or how raised funds are used by campaign creators.
      </p>

      <h2 style={styles.subheading}>2. User Accounts</h2>
      <p style={styles.text}>
        You must create an account to start a campaign or make donations.
        You are responsible for maintaining confidentiality of your login
        credentials and all activities associated with your account.
      </p>

      <h2 style={styles.subheading}>3. Campaign Rules</h2>
      <ul style={styles.list}>
        <li>Campaign creators must provide accurate and truthful information.</li>
        <li>GiveAura may request identity, medical, organisational or legal verification documents.</li>
        <li>Campaigns with fraudulent or misleading intentions will be removed immediately.</li>
        <li>GiveAura reserves the right to approve or reject campaign listings.</li>
      </ul>

      <h2 style={styles.subheading}>4. Donations</h2>
      <ul style={styles.list}>
        <li>Donations made through the platform are voluntary and non-refundable.</li>
        <li>GiveAura does not guarantee the outcome, use, or results of funds donated.</li>
        <li>GiveAura may deduct platform & payment processing fees where applicable.</li>
      </ul>

      <h2 style={styles.subheading}>5. Withdrawal & Settlements</h2>
      <p style={styles.text}>
        Funds raised may only be withdrawn by verified campaign owners after review.
        GiveAura may delay withdrawals if documents or verification are pending.
      </p>

      <h2 style={styles.subheading}>6. Prohibited Content</h2>
      <ul style={styles.list}>
        <li>Illegal activities, gambling, political funding, or explicit content.</li>
        <li>Duplicate or misleading fundraising campaigns.</li>
        <li>Campaigns that incite hate or violence.</li>
      </ul>

      <h2 style={styles.subheading}>7. Liability</h2>
      <p style={styles.text}>
        GiveAura is not liable for disputes between donors and campaign creators,
        misuse of funds, transaction delays, or losses caused by third-party services.
      </p>

      <h2 style={styles.subheading}>8. Privacy & Data Usage</h2>
      <p style={styles.text}>
        By using GiveAura, you consent to our data collection practices outlined in
        our Privacy Policy. We do not sell personal information to third-parties.
      </p>

      <h2 style={styles.subheading}>9. Termination</h2>
      <p style={styles.text}>
        GiveAura retains the right to suspend or terminate user accounts or remove
        campaigns for violating these terms.
      </p>

      <h2 style={styles.subheading}>10. Changes to Terms</h2>
      <p style={styles.text}>
        We may update this policy at any time. Continued use of GiveAura means you
        accept updated terms.
      </p>

      <p style={{ marginTop: 30, fontSize: 14, textAlign: "center", color: "#666" }}>
        If you have questions, contact us at <b>support@giveaura.org</b>
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
