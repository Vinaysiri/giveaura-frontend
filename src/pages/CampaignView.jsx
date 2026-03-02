import React, { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getUserProfile,
  getUserByEmail,
  listenToCampaignDonations,
} from "../services/firestoreService";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import "./CampaignView.css";

/* ---------- Helpers ---------- */
const toNumber = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const formatDateOnly = (d) => {
  if (!d) return "—";
  const dt = d?.toDate ? d.toDate() : new Date(d);
  return isNaN(dt.getTime())
    ? "—"
    : dt.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
};

/* ---------- Safe Avatar ---------- */
const getDonorAvatarUrl = (d = {}) => {
  const name =
    d.donorName || d.donorEmail?.split("@")[0] || "Someone";

  const photo = d.donorPhoto || d.donorPhotoURL;
  if (
    typeof photo === "string" &&
    (photo.includes("googleusercontent.com") ||
      photo.includes("lh3.googleusercontent.com"))
  ) {
    return `${photo}?v=${Date.now()}`;
  }

  return `https://ui-avatars.com/api/?name=${encodeURIComponent(
    name
  )}&size=64&background=2563eb&color=ffffff`;
};

/* ---------- Campaign Status ---------- */
const computeTimeStatus = (c) => {
  if (!c?.endDate) return { label: "Ongoing", colorKey: "gray" };

  const end = new Date(c.endDate).getTime();
  const now = Date.now();
  const days = Math.ceil((end - now) / (1000 * 60 * 60 * 24));

  if (days < 0) return { label: "Ended", colorKey: "red" };
  if (days <= 3) return { label: `${days} days left`, colorKey: "yellow" };
  return { label: `${days} days left`, colorKey: "green" };
};

const colorMap = {
  green: { bg: "#ecfdf5", fill: "#10b981", text: "#166534" },
  yellow: { bg: "#fffbeb", fill: "#f59e0b", text: "#92400e" },
  red: { bg: "#fff1f2", fill: "#ef4444", text: "#991b1b" },
  gray: { bg: "#f3f4f6", fill: "#6b7280", text: "#475569" },
};

export default function CampaignView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [campaign, setCampaign] = useState(null);
  const [donors, setDonors] = useState([]);
  const [activeDonorTab, setActiveDonorTab] = useState("recent");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [donationToast, setDonationToast] = useState(null);
  const lastDonationRef = useRef(null);
  const campaignUnsub = useRef(null);
  const donationUnsub = useRef(null);

  /* ---------- Campaign ---------- */
  useEffect(() => {
    const ref = doc(db, "campaigns", id);

    campaignUnsub.current = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setError("Campaign not found");
        setLoading(false);
        return;
      }

      const d = snap.data();
      setCampaign({
        id: snap.id,
        ...d,
        endDate: d.endDate?.toDate?.() || d.endDate || null,
      });
      setLoading(false);
    });

    return () => campaignUnsub.current?.();
  }, [id]);

  /* ---------- Donations ---------- */
  useEffect(() => {
    donationUnsub.current = listenToCampaignDonations(id, async (rows) => {
      const resolved = await Promise.all(
        rows.map(async (d) => {
          const profile = d.donorId
            ? await getUserProfile(d.donorId)
            : d.donorEmail
            ? await getUserByEmail(d.donorEmail)
            : null;

          return {
            ...d,
            donorName:
              profile?.displayName ||
              d.donorName ||
              d.donorEmail?.split("@")[0] ||
              "Someone",
            donorPhoto:
              typeof profile?.photoURL === "string"
                ? profile.photoURL
                : null,
            amount: toNumber(d.amount),
            createdAt:
              d.createdAt?.toDate?.() ||
              (d.createdAt ? new Date(d.createdAt) : null),
          };
        })
      );


      const sorted = [...resolved].sort(
        (a, b) =>
          (b.createdAt?.getTime?.() || 0) -
          (a.createdAt?.getTime?.() || 0)
      );

      const latest = sorted[0];


      if (
        latest &&
        lastDonationRef.current &&
        latest.createdAt &&
        latest.createdAt.getTime() > lastDonationRef.current &&
        latest.donorId !== currentUser?.uid 
      ) {
        setDonationToast({
          name: latest.donorName,
          amount: latest.amount,
          campaign: campaign?.title || "this campaign",
        });

        setTimeout(() => setDonationToast(null), 4500);
      }


      if (latest?.createdAt) {
        lastDonationRef.current = latest.createdAt.getTime();
      }

      setDonors(sorted);
    });

    return () => donationUnsub.current?.();
  }, [id, campaign?.title, currentUser?.uid]);

  /* ---------- Derived ---------- */
  const goal = toNumber(campaign?.goalAmount);

  const raised = useMemo(() => {
  return donors.reduce((sum, d) => sum + toNumber(d.amount), 0);
}, [donors]);

  const percentage = goal ? Math.min((raised / goal) * 100, 100) : 0;
  const timeStatus = computeTimeStatus(campaign);
  const colors = colorMap[timeStatus.colorKey];

  const canDonate =
    campaign?.isVerified && timeStatus.colorKey !== "red";

  const canEdit =
    !!currentUser &&
    (currentUser.uid === campaign?.creatorId ||
      currentUser.email === campaign?.creatorEmail);

  const recentDonors = useMemo(
    () =>
      [...donors]
        .sort(
          (a, b) =>
            (b.createdAt?.getTime?.() || 0) -
            (a.createdAt?.getTime?.() || 0)
        )
        .slice(0, 10),
    [donors]
  );

  const topDonors = useMemo(
    () =>
      [...donors]
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10),
    [donors]
  );

  const visibleDonors =
    activeDonorTab === "recent" ? recentDonors : topDonors;

  if (loading) return <div className="cv-loading">Loading…</div>;
  if (error || !campaign) return <div className="cv-error">{error}</div>;

  const contributorCount = new Set(
    donors.map((d) => d.donorId || d.donorEmail).filter(Boolean)
  ).size;

  const proofDocs =
    campaign?.proofDocuments ||
    campaign?.proofs ||
    campaign?.proofFiles ||
    [];

  return (
    <div className="cv-container">
      {/* Header */}
      <div className="cv-header">
        <button onClick={() => navigate("/campaigns")}>← Back</button>

        <div className="cv-actions">
          <button
            className="cv-share-btn"
            onClick={() => {
              const text = `Support "${campaign.title}" on GiveAura\n${window.location.href}`;
              navigator.share
                ? navigator.share({ title: campaign.title, text })
                : navigator.clipboard.writeText(text);
            }}
          >
            <svg
              className="cv-share-icon"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M21.8 2.2L2.9 10.3c-.9.4-.9 1.7 0 2.1l7.2 2.8 2.8 7.2c.4.9 1.7.9 2.1 0L21.8 2.2z"
                fill="currentColor"
              />
            </svg>

            <span>Share</span>
          </button>


          {canEdit && (
            <button
              className="cv-btn cv-btn-edit"
              onClick={() => navigate(`/edit/${campaign.id}`)}
            >
              Edit
            </button>
          )}

          {canDonate && (
            <button
              className="cv-btn cv-btn-donate"
              onClick={() => navigate(`/donate/${campaign.id}`)}
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                <circle cx="12" cy="6" r="3" />
                <path d="M4 14h16v4H4z" />
              </svg>
              Donate
            </button>

          )}
        </div>
      </div>


      {/* ================= MEDIA SLIDER ================= */}
      {(campaign.imageUrl || campaign.videoUrl) && (
        <div className="cv-media-slider">
          <div className="cv-media-track">
            {campaign.imageUrl && (
              <div className="cv-media-item">
                <img src={campaign.imageUrl} alt="Campaign" />
              </div>
            )}

            {campaign.videoUrl && (
              <div className="cv-media-item">
                <video
                  src={campaign.videoUrl}
                  controls
                  preload="metadata"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= PROOF DOCUMENTS ================= */}
      {proofDocs.length > 0 && (
        <div className="cv-proofs">
          <h4 className="cv-proof-title">Proof Documents</h4>

          <div className="cv-proof-grid">
            {proofDocs.map((p, i) => {
              const isPdf =
                p.type === "application/pdf" ||
                p.url?.toLowerCase().endsWith(".pdf");

              return (
                <a
                  key={i}
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cv-proof-card"
                >
                  {isPdf ? (
                  <div className="cv-proof-pdf-card">
                    <div className="cv-proof-pdf-icon">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M6 2h7l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"
                          fill="#ef4444"
                        />
                        <path
                          d="M13 2v5h5"
                          fill="#fee2e2"
                        />
                        <text
                          x="7"
                          y="17"
                          fontSize="6"
                          fontWeight="700"
                          fill="#ffffff"
                        >
                          PDF
                        </text>
                      </svg>
                    </div>

                    <div className="cv-proof-pdf-meta">
                      <span className="cv-proof-pdf-name">
                        {p.name || "PDF Document"}
                      </span>
                      <span className="cv-proof-pdf-hint">
                        Click to view document
                      </span>
                    </div>
                  </div>
                ) : (
                  <img
                    src={p.url}
                    alt={p.name || "Proof"}
                    loading="lazy"
                  />
                )}

                </a>
              );
            })}
          </div>
        </div>
      )}

      <h2>{campaign.title}</h2>
      <p>{campaign.description}</p>

      <div className="cv-stats">
        <span>Goal: ₹{goal.toLocaleString("en-IN")}</span>
        <span>Raised: ₹{raised.toLocaleString("en-IN")}</span>
        <span>Contributors: {contributorCount}</span>
      </div>

      <div
        className="cv-timing"
        style={{ background: colors.bg, color: colors.text }}
      >
        {campaign.endDate
          ? `Ends on ${formatDateOnly(campaign.endDate)} • ${timeStatus.label}`
          : "Ongoing campaign"}
      </div>

      <div className="cv-progress">
        <div
          style={{
            width: `${percentage}%`,
            background: colors.fill,
          }}
        />
      </div>

      <small style={{ color: colors.text }}>
        {percentage.toFixed(1)}% funded
      </small>

      <div className="cv-donor-tabs-wrapper">
        <div className="cv-donor-tabs">
          <button
            className={activeDonorTab === "recent" ? "active" : ""}
            onClick={() => setActiveDonorTab("recent")}
          >
            Recent Donors
          </button>
          <button
            className={activeDonorTab === "top" ? "active" : ""}
            onClick={() => setActiveDonorTab("top")}
          >
            Top Donors
          </button>
        </div>
      </div>

      <ul className="cv-donors">
        {visibleDonors.map((d) => (
          <li
            key={d.paymentId || d.donorId || d.createdAt}
            className="cv-donor-item"
          >
            <img
              src={getDonorAvatarUrl(d)}
              alt={d.donorName}
              className="cv-donor-avatar"
            />
            <div className="cv-donor-meta">
              <strong>{d.donorName}</strong>
              <span>
                ₹{toNumber(d.amount).toLocaleString("en-IN")}
              </span>
            </div>
          </li>
        ))}
      </ul>
      {donationToast && (
        <div className="cv-donation-toast">
          <strong>{donationToast.name}</strong>{" "}
          donated <strong>₹{donationToast.amount.toLocaleString("en-IN")}</strong>
          <div className="cv-donation-sub">
            to {donationToast.campaign}
          </div>
        </div>
      )}

    </div>
  );
}
