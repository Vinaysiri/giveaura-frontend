// src/pages/About.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getPlatformStats, subscribePlatformStats } from "../services/firestoreService";

const Stat = ({ label, value, loading }) => (
  <div style={{ flex: "1 1 150px", minWidth: 140, padding: 12, background: "#fff", borderRadius: 12, boxShadow: "0 6px 18px rgba(2,6,23,0.04)", textAlign: "center" }}>
    <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>{loading ? "—" : value}</div>
    <div style={{ marginTop: 6, color: "#6b7280", fontSize: 14 }}>{label}</div>
  </div>
);

export default function About() {
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    campaignsRun: "—",
    donorsSupported: "—",
    eventsFunded: "—",
    avgDonorGift: "—",
  });
  const [loading, setLoading] = useState(true);

  const fmtNumber = (n) => {
    if (typeof n === "number") return n.toLocaleString("en-IN");
    if (n === null || typeof n === "undefined") return "—";
    return String(n);
  };

  const fmtCurrency = (v) => {
    if (typeof v === "number") {
      return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
    }
    if (!v) return "—";
    // if already formatted string
    return String(v);
  };

  useEffect(() => {
    let unsub;

    const applyStats = (raw = {}) => {
      const campaignsRun = typeof raw.campaignsRun === "number" ? raw.campaignsRun : raw.campaignsRun ?? 0;
      const donorsSupported = typeof raw.donorsSupported === "number" ? raw.donorsSupported : raw.donorsSupported ?? 0;
      const eventsFunded = typeof raw.eventsFunded === "number" ? raw.eventsFunded : raw.eventsFunded ?? 0;

      // avgDonorGift: prefer explicit avgDonorGift field, else compute from totals
      let avg = "—";
      const explicitAvg = typeof raw.avgDonorGift === "number" ? raw.avgDonorGift : undefined;
      if (typeof explicitAvg === "number") avg = explicitAvg;
      else if (raw.totalDonationsAmount && raw.totalDonationsCount) avg = Number(raw.totalDonationsAmount || 0) / Math.max(1, Number(raw.totalDonationsCount || 0));
      else avg = 0;

      setStats({
        campaignsRun: fmtNumber(campaignsRun),
        donorsSupported: fmtNumber(donorsSupported),
        eventsFunded: fmtNumber(eventsFunded),
        avgDonorGift: avg === "—" ? "—" : fmtCurrency(avg),
      });
      setLoading(false);
    };

    // subscribe if available, otherwise one-time fetch
    if (typeof subscribePlatformStats === "function") {
      setLoading(true);
      try {
        unsub = subscribePlatformStats(
          (newStats) => {
            applyStats(newStats || {});
          },
          (err) => {
            console.error("subscribePlatformStats error:", err);
            // fallback to one-time fetch
            getPlatformStats()
              .then((s) => applyStats(s || {}))
              .catch((e) => {
                console.error("getPlatformStats fallback error:", e);
                setLoading(false);
              });
          }
        );
      } catch (err) {
        console.error("subscribePlatformStats threw:", err);
        // fallback
        getPlatformStats()
          .then((s) => applyStats(s || {}))
          .catch((e) => {
            console.error("getPlatformStats fallback error:", e);
            setLoading(false);
          });
      }
    } else {
      setLoading(true);
      getPlatformStats()
        .then((s) => applyStats(s || {}))
        .catch((e) => {
          console.error("getPlatformStats error:", e);
          setLoading(false);
        });
    }

    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, []);

  return (
    <div style={{ fontFamily: "'Poppins', Inter, system-ui, sans-serif", maxWidth: 1100, margin: "28px auto", padding: 20 }}>
      <button onClick={() => navigate(-1)} style={{ marginBottom: 12, background: "transparent", border: "none", color: "#2563eb", cursor: "pointer" }}>
        ← Back
      </button>

      <header style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap", marginBottom: 20 }}>
        <div style={{ flex: "1 1 340px", minWidth: 260 }}>
          <h1 style={{ margin: "6px 0", fontSize: 32, color: "#0f172a" }}>About GiveAura</h1>
          <p style={{ color: "#374151", fontSize: 16, lineHeight: 1.6 }}>
            GiveAura is a trust-first fundraising platform that helps verified fundraisers raise money for causes they care about.
            We combine simple campaign tools, transparent fees, and local events to maximize impact while keeping donors informed.
          </p>

          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => navigate("/create")} className="btn" style={{ padding: "10px 14px", borderRadius: 10 }}>
              Create a Campaign
            </button>
            <button onClick={() => navigate("/membership")} className="btn" style={{ padding: "10px 14px", borderRadius: 10, background: "#fff", color: "#0f172a", border: "1px solid #e6e6e6" }}>
              Membership
            </button>
          </div>
        </div>

        <div style={{ flex: "0 0 320px", minWidth: 240 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Stat label="Campaigns run" value={stats.campaignsRun} loading={loading} />
            <Stat label="Donors supported" value={stats.donorsSupported} loading={loading} />
            <Stat label="Events funded" value={stats.eventsFunded} loading={loading} />
            <Stat label="Avg. donor gift" value={stats.avgDonorGift} loading={loading} />
          </div>
          <p style={{ marginTop: 10, color: "#6b7280", fontSize: 13 }}>Stats update live from the dashboard (when available).</p>
        </div>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, alignItems: "start" }}>
        <main>
          <article style={{ background: "#fff", padding: 18, borderRadius: 12, boxShadow: "0 8px 30px rgba(2,6,23,0.04)" }}>
            <h2 style={{ marginTop: 0 }}>Our mission</h2>
            <p style={{ color: "#374151", lineHeight: 1.7 }}>
              We exist to make trustworthy fundraising simple and transparent. GiveAura empowers individuals and verified organizations to raise funds,
              share impact updates, and run local events that turn donations into measurable outcomes.
            </p>

            <h3 style={{ marginTop: 18 }}>How GiveAura works — at a glance</h3>
            <ol style={{ color: "#374151", lineHeight: 1.7 }}>
              <li><strong>Create:</strong> Anyone can create a campaign — individuals and organizations go through verification for added trust.</li>
              <li><strong>Share:</strong> Share your campaign link across social networks, WhatsApp, and email. Add updates and media to keep donors informed.</li>
              <li><strong>Donate:</strong> Donors contribute using secure payment options. We show clear receipts and donor histories.</li>
              <li><strong>Deliver:</strong> Funds are transferred to the fundraiser and event funds are allocated for platform-run drives and local impact.</li>
            </ol>

            <h3 style={{ marginTop: 18 }}>Transparency: our fee breakdown</h3>
            <p style={{ color: "#374151", lineHeight: 1.7 }}>
              We believe donors and fundraisers should always know where money goes. Here’s the split applied to each donation (example: ₹20,000 gross):
            </p>

            <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 220px", minWidth: 220, background: "#f8fafc", padding: 12, borderRadius: 10 }}>
                <div style={{ fontSize: 13, color: "#6b7280" }}>GST / Taxes</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginTop: 6 }}>2.36%</div>
                <div style={{ marginTop: 6, color: "#374151" }}>Applied where legally required. On ₹20,000 → ₹472 (example)</div>
              </div>

              <div style={{ flex: "1 1 220px", minWidth: 220, background: "#f8fafc", padding: 12, borderRadius: 10 }}>
                <div style={{ fontSize: 13, color: "#6b7280" }}>Platform & Event Fund</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginTop: 6 }}>2.64%</div>
                <div style={{ marginTop: 6, color: "#374151" }}>Funds GiveAura events and platform maintenance. On ₹20,000 → ₹528 (example)</div>
              </div>

              <div style={{ flex: "1 1 220px", minWidth: 220, background: "#f8fafc", padding: 12, borderRadius: 10 }}>
                <div style={{ fontSize: 13, color: "#6b7280" }}>Fundraiser receives</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginTop: 6 }}>95%</div>
                <div style={{ marginTop: 6, color: "#374151" }}>The fundraiser receives the remainder directly. On ₹20,000 → ₹19,000 (example)</div>
              </div>
            </div>

            <p style={{ marginTop: 12, color: "#6b7280" }}>
              Example flow: Donor pays ₹20,000 gross → GST(2.36%) removed → net shown (₹19,528) → Fundraiser gets 95% (₹19,000) and GiveAura Events gets 2.64% (₹528).
            </p>

            <h3 style={{ marginTop: 18 }}>Impact & trust</h3>
            <p style={{ color: "#374151", lineHeight: 1.7 }}>
              We prioritize verified fundraisers and clear reporting. After funds are disbursed, fundraisers are encouraged to post updates, receipts,
              and photos so donors can see the real-world outcomes of their contributions.
            </p>

            <h3 style={{ marginTop: 18 }}>Community standards & safety</h3>
            <p style={{ color: "#374151", lineHeight: 1.7 }}>
              We enforce community standards to prevent fraud and misuse. Campaigns that violate our terms are paused and investigated. If you suspect
              misuse, contact <a href="mailto:support@giveaura.com">support@giveaura.com</a>.
            </p>

            <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={() => navigate("/create")} className="btn" style={{ padding: "10px 14px", borderRadius: 10 }}>
                Start a Campaign
              </button>
              <button onClick={() => navigate("/donate")} className="btn" style={{ padding: "10px 14px", borderRadius: 10, background: "#fff", color: "#0f172a", border: "1px solid #e6e6e6" }}>
                Explore Campaigns
              </button>
            </div>
          </article>

          {/* Team / Contact */}
          <article style={{ marginTop: 18, background: "#fff", padding: 18, borderRadius: 12 }}>
            <h3 style={{ marginTop: 0 }}>Who we are</h3>
            <p style={{ color: "#374151", lineHeight: 1.7 }}>
              GiveAura is a small, mission-driven team of product builders, event organisers and trust & safety practitioners. We partner with local NGOs,
              hospitals, community groups and everyday citizens to make giving predictable and impactful.
            </p>

            <h4 style={{ marginTop: 12 }}>Contact & support</h4>
            <p style={{ color: "#374151", lineHeight: 1.6 }}>
              For partnership enquiries, media, or support: <strong><a href="mailto:hello@giveaura.com">hello@giveaura.com</a></strong>.
            </p>

            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a href="/terms" style={{ color: "#2563eb", textDecoration: "none" }}>Terms of Service</a>
              <span style={{ color: "#9ca3af" }}>•</span>
              <a href="/privacy" style={{ color: "#2563eb", textDecoration: "none" }}>Privacy Policy</a>
            </div>
          </article>
        </main>

        <aside style={{ minWidth: 280 }}>
          <div style={{ background: "#fff", padding: 16, borderRadius: 12, boxShadow: "0 6px 18px rgba(2,6,23,0.04)" }}>
            <h4 style={{ marginTop: 0 }}>Join the movement</h4>
            <p style={{ color: "#374151", lineHeight: 1.6 }}>Become a member to receive impact updates, priority invites, and help shape GiveAura programs.</p>
            <button onClick={() => navigate("/membership")} className="btn" style={{ width: "100%", marginTop: 8 }}>
              Learn about Membership
            </button>

            <div style={{ marginTop: 14 }}>
              <h5 style={{ margin: 0 }}>Quick links</h5>
              <ul style={{ paddingLeft: 16, marginTop: 8, color: "#374151" }}>
                <li><a href="/events" style={{ color: "#2563eb" }}>Upcoming Events</a></li>
                <li><a href="/donations" style={{ color: "#2563eb" }}>My Donations</a></li>
                <li><a href="/create" style={{ color: "#2563eb" }}>Create a Campaign</a></li>
              </ul>
            </div>
          </div>

          <div style={{ marginTop: 12, background: "#fff", padding: 14, borderRadius: 12 }}>
            <h5 style={{ marginTop: 0 }}>Safety & verification</h5>
            <p style={{ color: "#374151", lineHeight: 1.5 }}>
              We verify organizations and high-value campaigns before labeling them as “Verified”. Always check the campaign page for verification badges.
            </p>
            <button onClick={() => navigate("/help")} style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8 }}>Help Center</button>
          </div>
        </aside>
      </section>

      <footer style={{ marginTop: 26, textAlign: "center", color: "#6b7280" }}>
        <div style={{ marginBottom: 6 }}>
          © {new Date().getFullYear()} GiveAura — Building trust in giving.
        </div>

        {/* NEW: eventsFunded echoed in footer as requested */}
        <div style={{ fontSize: 13, marginTop: 6 }}>
          Events funded by the platform: <strong>{loading ? "—" : stats.eventsFunded}</strong>
        </div>

        <div style={{ marginTop: 6 }}>Have feedback? Email <a href="mailto:hello@giveaura.com" style={{ color: "#2563eb" }}>hello@giveaura.com</a></div>
      </footer>
    </div>
  );
}
