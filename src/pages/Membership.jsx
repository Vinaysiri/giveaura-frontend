import React from "react";
import { useNavigate } from "react-router-dom";

export default function About() {
  const navigate = useNavigate();

  return (
    <div style={{ fontFamily: "'Poppins', sans-serif", padding: 24, maxWidth: 980, margin: "32px auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 30 }}>Become a GiveAura™ Member</h1>
          <p style={{ marginTop: 6, color: "#6b7280" }}>Join a community of changemakers — stay informed, attend member-only events and support verified campaigns.</p>
        </div>
        <div>
          <button
            onClick={() => navigate("/")}
            className="btn"
            style={{ padding: "10px 14px", borderRadius: 10, background: "linear-gradient(90deg,#0ea5a2,#60a5fa)", color: "#fff", border: "none" }}
          >
            Browse campaigns
          </button>
        </div>
      </header>

      <section style={{ marginTop: 28, display: "grid", gridTemplateColumns: "1fr 320px", gap: 24 }}>
        <div>
          <h2 style={{ marginTop: 0 }}>Why become a member?</h2>

          <p style={{ color: "#374151" }}>
            GiveAura members get early access to new campaigns, priority invites to curated events, exclusive impact
            reports, and a closer line to the teams running on-the-ground projects. Membership helps us build a stable
            community of supporters so we can plan long-term campaigns and measure impact more effectively.
          </p>

          <h3 style={{ marginTop: 18 }}>Member benefits</h3>
          <ul style={{ marginTop: 8, color: "#374151" }}>
            <li>Monthly newsletter with project impact and partner stories</li>
            <li>Priority registration for in-person and online events</li>
            <li>Access to members-only fundraising toolkits and webinars</li>
            <li>Recognition in annual impact report (optional)</li>
            <li>Direct channel to GiveAura support for faster help</li>
          </ul>

          <h3 style={{ marginTop: 18 }}>Membership levels (suggested)</h3>
          <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 220px", background: "#fff", padding: 12, borderRadius: 10, boxShadow: "0 6px 18px rgba(2,6,23,0.06)" }}>
              <div style={{ fontWeight: 700 }}>Supporter</div>
              <div className="small muted">Free</div>
              <div style={{ marginTop: 8 }}>Access to newsletter and member updates; digital resources.</div>
            </div>

            <div style={{ flex: "1 1 220px", background: "#fff", padding: 12, borderRadius: 10, boxShadow: "0 6px 18px rgba(2,6,23,0.06)" }}>
              <div style={{ fontWeight: 700 }}>Member</div>
              <div className="small muted">₹499 / year (suggested)</div>
              <div style={{ marginTop: 8 }}>All Supporter benefits + priority event access and early campaign previews.</div>
            </div>

            <div style={{ flex: "1 1 220px", background: "#fff", padding: 12, borderRadius: 10, boxShadow: "0 6px 18px rgba(2,6,23,0.06)" }}>
              <div style={{ fontWeight: 700 }}>Patron</div>
              <div className="small muted">₹2499 / year (suggested)</div>
              <div style={{ marginTop: 8 }}>All Member benefits + exclusive invites and recognition in our reports.</div>
            </div>
          </div>

          <h3 style={{ marginTop: 18 }}>How it works</h3>
          <ol style={{ color: "#374151" }}>
            <li>Fill a short membership request form — name, email and mobile number.</li>
            <li>We’ll review the request and share next steps by email (usually within 3 business days).</li>
            <li>When approved, you’ll receive a welcome message and instructions to complete membership payment (if you choose a paid tier).</li>
          </ol>

          <h3 style={{ marginTop: 18 }}>Questions?</h3>
          <p style={{ color: "#374151" }}>
            For any membership-related questions, reach out at <a href="mailto:members@giveaura.com">members@giveaura.com</a>
            or use the Help & Support button in the site header.
          </p>
        </div>

        <aside style={{ background: "#fff", padding: 16, borderRadius: 10, boxShadow: "0 6px 18px rgba(2,6,23,0.06)" }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>Join as a member</div>
          <p className="small muted" style={{ marginTop: 6 }}>Quick request form</p>

          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input placeholder="Full name" style={{ padding: 10, borderRadius: 8, border: "1px solid #eee" }} />
              <input placeholder="Email" style={{ padding: 10, borderRadius: 8, border: "1px solid #eee" }} />
              <input placeholder="Mobile number" style={{ padding: 10, borderRadius: 8, border: "1px solid #eee" }} />

              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button
                  onClick={() => navigate("/")}
                  className="btn"
                  style={{ flex: 1, padding: "10px 12px", borderRadius: 8, background: "#0ea5a2", color: "#fff", border: "none" }}
                >
                  Continue on Home
                </button>
                <button
                  onClick={() => window.location.href = "mailto:members@giveaura.com?subject=Membership%20inquiry"}
                  className="btn"
                  style={{ padding: "10px 12px", borderRadius: 8, background: "#e5e7eb", color: "#111", border: "none" }}
                >
                  Email us
                </button>
              </div>
            </div>

            <p style={{ fontSize: 12, color: "#6b7280", marginTop: 10 }}>
              We only ask for minimal information here; official membership signup (if paid) happens securely and via a follow-up.
            </p>
          </div>
        </aside>
      </section>

      <style>{`
        .small { font-size: 13px; }
        .muted { color: #6b7280; }
        .btn { cursor: pointer; }

        @media (max-width: 900px) {
          section { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );

}
