// src/pages/Landing.jsx
import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import {
  collection,
  query,
  orderBy,
  limit,
  where,
  onSnapshot,
  collectionGroup,
} from "firebase/firestore";
import "./Landing.css";
import Footer from "../components/Footer";
import logo from "../assets/GiveAuraLogo.jpg";
import founderImg from "../assets/profile.jpg";
import SessionAdPopup from "../components/SessionAdPopup";

/* ================= COUNT-UP ================= */
function useCountUp(target, duration = 1200) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let raf;
    const start = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.floor(eased * target));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}

/* ================= HELPERS ================= */

function summarize(text = "", maxChars = 180) {
  if (!text) return "";
  if (text.length <= maxChars) return text;

  const sentences = text.match(/[^.!?]+[.!?]+/g);
  if (!sentences) return text.slice(0, maxChars) + "…";

  let out = "";
  for (const s of sentences) {
    if ((out + s).length > maxChars) break;
    out += s;
  }

  return out.trim() || text.slice(0, maxChars) + "…";
}

const extractStory = (c) =>
  c.description ||
  c.campaignDescription ||
  c.about ||
  c.content ||
  "";


const resolveThumbnail = (campaign) => {
  if (campaign.coverImage) return campaign.coverImage;
  if (campaign.thumbnail) return campaign.thumbnail;

  if (Array.isArray(campaign.media) && campaign.media.length > 0) {
    return campaign.media[0]?.url;
  }

  if (Array.isArray(campaign.images) && campaign.images.length > 0) {
    return campaign.images[0];
  }

  return null;
};

/* ================= MAIN ================= */

export default function Landing() {
  const navigate = useNavigate();

  /* ---------- STATS ---------- */
  const [contributors, setContributors] = useState(0);
  const [campaigns, setCampaigns] = useState(0);
  const [raised, setRaised] = useState(0);
  const horizontalRef = useRef(null);
  const [showFounderMsg, setShowFounderMsg] = useState(false);

  /* ---------- STORIES ---------- */
  const [endingSoon, setEndingSoon] = useState([]);
  const [topContributed, setTopContributed] = useState([]);

  const fmtINR = (n = 0) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(Number(n || 0));

  /* ================= CONTRIBUTORS ================= */
  useEffect(() => {
    const q = query(collection(db, "platformStats"));

    return onSnapshot(q, (snap) => {
      const stats = snap.docs[0]?.data();
      if (stats?.contributorsCount) {
        setContributors(stats.contributorsCount);
      }
    });
  }, []);



  /* ================= PLATFORM STATS ================= */
  useEffect(() => {
    const q = query(collection(db, "campaigns"));
    return onSnapshot(q, (snap) => {
      let total = 0;
      snap.docs.forEach((d) => {
        total += Number(d.data()?.fundsRaised || 0);
      });
      setCampaigns(snap.size);
      setRaised(total);
    });
  }, []);

/* ================= ENDING SOON ================= */
useEffect(() => {
  const q = query(
    collection(db, "campaigns"),
    where("isApproved", "==", true),
    where("status", "==", "active"),
    orderBy("endDate", "asc"),
    limit(50)
  );

  return onSnapshot(q, (snap) => {
    const now = Date.now();

    const items = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(c => {
        if (!c.endDate || !c.goalAmount) return false;

        const endMs = c.endDate?.seconds
          ? c.endDate.seconds * 1000
          : new Date(c.endDate).getTime();

        return (
          endMs > now &&
          c.goalAmount > 0 &&
          (c.imageUrl || c.videoThumbnail)
        );
      })
      .map(c => {
        const goal = Number(c.goalAmount || 0);
        const raised = Number(c.fundsRaised || 0);
        return {
          ...c,
          fundPercent: goal > 0 ? (raised / goal) * 100 : 0,
        };
      });

    setEndingSoon(items.slice(0, 3));
  });
}, []);


useEffect(() => {
  const el = horizontalRef.current;
  if (!el) return;

  let rafId;
  let paused = false;

  const step = 0.35;

  const autoScroll = () => {
    if (!paused) {
      el.scrollLeft += step;

      if (el.scrollWidth > el.clientWidth) {
        if (el.scrollLeft >= el.scrollWidth - el.clientWidth - 1) {
          el.scrollLeft = 0;
        }
      }
    }
    rafId = requestAnimationFrame(autoScroll);
  };

  rafId = requestAnimationFrame(autoScroll);

  const onEnter = () => (paused = true);
  const onLeave = () => (paused = false);

  const onWheel = (e) => {
    e.preventDefault();
    paused = true;
    el.scrollLeft += e.deltaY;
  };

  el.addEventListener("mouseenter", onEnter);
  el.addEventListener("mouseleave", onLeave);
  el.addEventListener("wheel", onWheel, { passive: false });

  return () => {
    cancelAnimationFrame(rafId);
    el.removeEventListener("mouseenter", onEnter);
    el.removeEventListener("mouseleave", onLeave);
    el.removeEventListener("wheel", onWheel);
  };
}, []);


/* ================= MOST SUPPORTED ================= */
useEffect(() => {
  const q = query(
    collection(db, "campaigns"),
    where("status", "==", "active"),
    where("isApproved", "==", true),
    limit(50)
  );

  return onSnapshot(q, (snap) => {
    const items = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(c =>
        c.goalAmount > 0 &&
        (c.imageUrl || c.videoThumbnail)
      )
      .map(c => {
        const raised = Number(c.fundsRaised || 0);
        const goal = Number(c.goalAmount || 0);
        return {
          ...c,
          supportPercent: goal > 0 ? raised / goal : 0,
        };
      })

      .sort((a, b) => b.supportPercent - a.supportPercent)
      .slice(0, 6);

    setTopContributed(items);
  });
}, []);


  const aContributors = useCountUp(contributors);
  const aCampaigns = useCountUp(campaigns);
  const aRaised = useCountUp(raised);

  return (
    <div className="landing-page">
      {/* BRAND */}
      <header className="landing-brand">
        <img src={logo} alt="GiveAura" className="landing-logo" />
        <span className="brand-name">GiveAura</span>
      </header>

      {/* HERO */}
      <section className="hero">
        <h1>
          Fundraising built on <span>Trust</span>
          <br />& <span>Transparency</span>
        </h1>
        <p>Every story matters. Every donation is accountable.</p>

        <div className="hero-actions">
          <button className="btn-primary" onClick={() => navigate("/create")}>
            Start Fundraising
          </button>
          <button
            className="btn-secondary"
            onClick={() => navigate("/campaigns")}
          >
            Browse Fundraisers
          </button>
        </div>
      </section>

      {/* STATS */}
      <section className="stats">
        <StatCard label="Contributors" value={aContributors} />
        <StatCard label="Campaigns" value={aCampaigns} />
        <StatCard label="Funds Raised" value={fmtINR(aRaised)} />
      </section>

      {/* ENDING SOON */}
      {endingSoon.length > 0 && (
        <StorySection title="Ending Soon">
          {endingSoon.map((c) => (
            <StoryCard
              key={c.id}
              campaign={c}
              onClick={() => navigate(`/campaign/${c.id}`)}
            />
          ))}
        </StorySection>
      )}

      {/* MOST SUPPORTED – COMPLETED & RECENT */}
{topContributed.length > 0 && (
  <StorySection title="Most Supported Campaigns">
    <div className="campaign-grid horizontal-scroll is-auto" ref={horizontalRef}>
      
      {topContributed.map((c) => (
        <StoryCard
          key={c.id}
          campaign={c}
          onClick={() => navigate(`/campaign/${c.id}`)}
          showCompletedMeta
        />
      ))}
    </div>
  </StorySection>
)}
<SessionAdPopup/>
      {/* FOUNDER */}
<section
  className="founder"
  style={{ position: "relative", cursor: "pointer" }}
  onClick={() => setShowFounderMsg((v) => !v)}
>
  <img src={founderImg} className="founder-avatar-img" alt="Founder" />
  <div>
    <h3>Naga Vinay Kotipalli</h3>
    <p className="role">Founder & Platform Architect</p>
  </div>

  {showFounderMsg && (
    <div className="founder-popup">
      Built with transparency, donor trust, and long-term social impact
      as the core principles of GiveAura. 
      Making a world with Service of Social Engaging towards the people in need.
      Every Individual Story Matters, Every Donation is Accountable.
      Creating a platform that empowers individuals to share their stories, connect with compassionate donors, and make a meaningful difference in the lives of those in need.
    </div>
  )}
</section>

      {/* FOOTER */}
      <Footer />
    </div>
  );
}

/* ================= COMPONENTS ================= */

function StatCard({ label, value }) {
  return (
    <div className="stat-card">
      <h2>{value}</h2>
      <p>{label}</p>
    </div>
  );
}

function StorySection({ title, children }) {
  return (
    <section className="campaign-section">
      <h2>{title}</h2>
      <div className="campaign-grid">{children}</div>
    </section>
  );
}

function StoryCard({ campaign, onClick }) {
  const story = summarize(extractStory(campaign));


  const thumbnail =
    campaign.imageUrl ||
    campaign.videoThumbnail ||
    null;

  // progress calculation
  const goal = Number(campaign.goalAmount || 0);
  const raised = Number(campaign.fundsRaised || 0);
  const progress =
    goal > 0 ? Math.round((raised / goal) * 100) : 0;

  const isCompleted = goal > 0 && raised >= goal;
  const isEndingSoon = campaign.status === "active" && progress < 60;

  return (
    <div
      className={`campaign-card story-bg ${
        isCompleted ? "completed" : isEndingSoon ? "urgent" : ""
      }`}
      onClick={onClick}
      style={{
        backgroundImage: thumbnail
          ? `
            linear-gradient(
              rgba(2,6,23,0.75),
              rgba(2,6,23,0.75)
            ),
            url(${thumbnail})
          `
          : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
        minHeight: "220px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
      }}
    >
      {/* STATUS BADGE */}
      {isCompleted && (
        <span className="badge completed">COMPLETED</span>
      )}

      {isEndingSoon && (
        <span className="badge urgent">ENDING SOON</span>
      )}

      {/* TITLE */}
      <h4
        style={{
          color: "#ffffff",
          fontWeight: 600,
          marginBottom: "6px",
        }}
      >
        {campaign.title}
      </h4>

      {/* STORY */}
      <p
        className="story-text"
        style={{
          color: "#e5e7eb",
          fontSize: "14px",
          lineHeight: 1.6,
        }}
      >
        {story}
      </p>

      {/* FUNDING META */}
      {goal > 0 && (
        <div
          style={{
            marginTop: "8px",
            fontSize: "12px",
            color: "#cbd5f5",
            fontWeight: 500,
          }}
        >
          ₹{raised.toLocaleString("en-IN")} raised · {progress}% funded
        </div>
      )}
    </div>
  );
}
