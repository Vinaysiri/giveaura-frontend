// src/pages/Profile.jsx
import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getUserProfile } from "../services/firestoreService";
import { useNavigate, useParams, useLocation, Link } from "react-router-dom";
import "./Profile.css";
import GiveAuraLoader from "../components/GiveAuraLoader";

export default function Profile({ isAdminView: propIsAdminView = false }) {
  const { currentUser, loading: authLoading } = useAuth();
  const { id: routeId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [showCopiedToast, setShowCopiedToast] = useState(false);
useEffect(() => {
  if (location.state?.copiedReferral) {
    setShowCopiedToast(true);

    // auto hide
    setTimeout(() => {
      setShowCopiedToast(false);
    }, 2500);

    // clear navigation state (important)
    window.history.replaceState({}, document.title);
  }
}, [location.state]);


  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  

  // admin view detection preserved (query/state)
  const urlParams = new URLSearchParams(location.search || "");
  const isAdminQuery = urlParams.get("admin") === "1" || urlParams.get("admin") === "true";
  const stateAdmin = (location && location.state && location.state.isAdminView) === true;
  const isAdminView = propIsAdminView || stateAdmin || isAdminQuery;

  useEffect(() => {
    let cancelled = false;

    const fetchProfile = async () => {
      setLoading(true);
      setError(null);

      try {
        const uidToLoad = routeId || currentUser?.uid;
        if (!uidToLoad) {
          if (!cancelled) {
            setError("No user selected. Please login or open a user's profile.");
            setLoading(false);
          }
          return;
        }

        const data = await getUserProfile(uidToLoad);

        // If function returned null it may mean 'not found' or not-public
        if (!data) {
          // If owner - try to recover from auth fallback; otherwise inform user
          if (currentUser && currentUser.uid === uidToLoad) {
            // current user viewing their own profile but doc missing - create safe defaults
            const fallback = {
              id: uidToLoad,
              displayName: currentUser.displayName || "",
              email: currentUser.email || "",
              photoURL: currentUser.photoURL || "",
              bio: "",
              bank: null,
              phone: currentUser.phoneNumber || "",
              publicProfile: true,
            };
            if (!cancelled) setProfile(fallback);
            return;
          } else {
            if (!cancelled) {
              setError("Profile not found or is private.");
            }
            return;
          }
        }

        let safe = {
          id: uidToLoad,
          displayName: "",
          email: "",
          photoURL: "",
          bio: "",
          bank: null,
          phone: "",
          publicProfile: true, // default fallback
          ...((typeof data === "object" && data) ? data : {}),
        };

        // Fallbacks to auth where appropriate
        if (!safe.displayName || String(safe.displayName).trim() === "") {
          if (currentUser && currentUser.uid === uidToLoad && currentUser.displayName) {
            safe.displayName = currentUser.displayName;
          } else if (safe.email) {
            safe.displayName = String(safe.email).split("@")[0];
          } else {
            safe.displayName = "";
          }
        }

        if ((!safe.photoURL || safe.photoURL === "") && currentUser && currentUser.uid === uidToLoad && currentUser.photoURL) {
          safe.photoURL = currentUser.photoURL;
        }

        if ((!safe.phone || safe.phone === "") && currentUser && currentUser.uid === uidToLoad && currentUser.phoneNumber) {
          safe.phone = currentUser.phoneNumber;
        }

        if (!cancelled) {
          setProfile(safe);
        }
      } catch (err) {
        // Better error messaging: handle permission-denied shape from firestoreService
        // firestoreService may throw structured error or FirebaseError with .code
        console.error("Failed to fetch profile:", err);

        if (!cancelled) {
          const code = (err && (err.code || err?.original?.code)) || "";
          const msg = (err && (err.message || err?.original?.message || String(err))) || "Failed to load profile.";

          if (String(code).toLowerCase().includes("permission-denied")) {
            setError("This profile is private or access is restricted.");
          } else if (String(code).toLowerCase().includes("not-found") || msg.toLowerCase().includes("not found")) {
            setError("Profile not found.");
          } else {
            setError("Failed to load profile. Please try again later.");
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (!authLoading) {
      fetchProfile();
    } else {
      // Keep loading until auth settles
      setLoading(true);
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, routeId, authLoading]);

  if (loading)
    return <GiveAuraLoader />;

  if (error)
    return (
      <div style={{ textAlign: "center", marginTop: 50 }}>
        <p style={{ color: "red", marginBottom: 12 }}>{error}</p>
        <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
          {(!currentUser) && (
            <button
              onClick={() => navigate("/login")}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                background: "#3b82f6",
                color: "#fff",
                border: "none",
                cursor: "pointer",
              }}
            >
              Login
            </button>
          )}
          <button
            onClick={() => navigate(-1)}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid #ccc",
              background: "#fafafa",
              cursor: "pointer",
            }}
          >
            Back
          </button>
        </div>
      </div>
    );

  if (!profile)
    return <p style={{ textAlign: "center", marginTop: 50 }}>No profile found.</p>;

  const isOwner = currentUser && currentUser.uid === profile?.id;

  // If profile has explicit publicProfile=false and viewer is not owner/admin, show private notice
  if (profile.publicProfile === false && !isOwner && !isAdminView) {
    return (
      <div style={{ textAlign: "center", marginTop: 60 }}>
        <p style={{ fontSize: 16, color: "#333" }}>This profile is private.</p>
        <div style={{ marginTop: 16 }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid #ccc",
              background: "#fafafa",
              cursor: "pointer",
            }}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
  <div className="profile-container">
    {/* ===== HEADER ===== */}
    <div className="profile-header">
      <img
        src={profile?.photoURL || "/default-avatar.png"}
        alt="profile"
        className="profile-avatar"
      />

      <div className="profile-meta">
        <h2 className="profile-name">
          {profile?.displayName?.trim() || "Unnamed User"}
        </h2>

        <p className="profile-email">{profile?.email || ""}</p>

        <p className="profile-bio">
          {profile?.bio || "No bio added yet."}
        </p>

        <div className="profile-visibility">
          <span
            className={
              profile.publicProfile
                ? "profile-badge public"
                : "profile-badge private"
            }
          >
            {profile.publicProfile ? "Public profile" : "Private profile"}
          </span>

          {isOwner && (
            <span className="profile-owner-note">
              — You can edit this from Edit Profile
            </span>
          )}
        </div>
      </div>
    </div>

    <hr className="profile-divider" />

    {/* ===== PHONE ===== */}
    <div className="profile-section">
      <h3 className="profile-section-title">📱 Phone</h3>

      <div className="profile-box">
        {profile?.phone ? (
          profile.phone
        ) : (
          <span className="profile-muted">
            No phone number provided
          </span>
        )}
      </div>

      <p className="profile-hint">
        Note: This phone number is public on this site.
      </p>
    </div>

    {/* ===== BANK DETAILS ===== */}
    {profile?.bank ? (
      <div className="profile-section">
        <h3 className="profile-section-title">🏦 Bank Details</h3>

        <div className="profile-box bank-box">
          <p><strong>Account Holder:</strong> {profile.bank.accountHolder || "—"}</p>
          <p><strong>Bank Name:</strong> {profile.bank.bankName || "—"}</p>
          <p><strong>Account Number:</strong> {profile.bank.accountNumber || "—"}</p>
          <p><strong>IFSC Code:</strong> {profile.bank.ifsc || "—"}</p>

          {profile.bank.upiId && (
            <p><strong>UPI ID:</strong> {profile.bank.upiId}</p>
          )}
        </div>

        <p className="profile-hint">
          Note: Bank details are visible publicly on this site.
        </p>
      </div>
    ) : (
      <p className="profile-muted">No bank details provided.</p>
    )}

    {/* ===== COPY TOAST ===== */}
    {showCopiedToast && (
      <div className="referral-toast">
        Referral link copied successfully 🎉
      </div>
    )}

    {/* ===== OWNER ACTIONS ===== */}
    {isOwner && (
      <div className="profile-actions">
        <button
          className="profile-btn primary"
          onClick={() => navigate("/edit-profile")}
        >
          Edit Profile
        </button>

        <button
          className="profile-btn secondary"
          onClick={() => navigate(-1)}
        >
          Back
        </button>
      </div>
    )}

    {/* ===== WALLET BUTTON ===== */}
    <button
      className="wallet-btn"
      onClick={() => navigate("/wallet")}
      title="Wallet"
    >
      <svg viewBox="0 0 24 24" aria-hidden>
        <path
          d="M3 7.5C3 6.12 4.12 5 5.5 5H18.5C19.88 5 21 6.12 21 7.5V16.5C21 17.88 19.88 19 18.5 19H5.5C4.12 19 3 17.88 3 16.5V7.5Z"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <circle cx="15" cy="12" r="1.5" fill="currentColor" />
      </svg>
      <span>Wallet</span>
    </button>

    {/* ===== SHARE & EARN ===== */}
    <div className="share-earn-card">
      <h3>Share & Earn</h3>
      <p>
        Invite friends to GiveAura. Earn rewards when they donate or
        start campaigns.
      </p>

      <div className="share-earn-box">
        <input
          type="text"
          readOnly
          value={`${window.location.origin}/?ref=${currentUser.uid}`}
        />

        <button
          className="btn"
          onClick={() => {
            navigator.clipboard.writeText(
              `${window.location.origin}/?ref=${currentUser.uid}`
            );
          }}
        >
          Copy Link
        </button>
      </div>

      <div className="share-actions">
        <button
          className="btn-outline"
          onClick={() => {
            const url = `${window.location.origin}/?ref=${currentUser.uid}`;
            const text =
              "Join GiveAura and help real causes. Sign up using my link:";
            window.open(
              `https://wa.me/?text=${encodeURIComponent(text + " " + url)}`,
              "_blank"
            );
          }}
        >
          WhatsApp
        </button>

        {navigator.share && (
          <button
            className="btn-outline"
            onClick={() =>
              navigator.share({
                title: "GiveAura – Share & Earn",
                text: "Support causes and earn rewards on GiveAura",
                url: `${window.location.origin}/?ref=${currentUser.uid}`,
              })
            }
          >
            Share
          </button>
        )}
      </div>
    </div>

    <Link to="/referrals" className="profile-link">
      Referral Dashboard
    </Link>

    {isAdminView && (
      <p className="admin-view-note">
        🔒 You are viewing this profile as an admin.
      </p>
    )}
  </div>
);

}
