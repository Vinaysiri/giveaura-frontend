// src/pages/CreateCampaign.jsx
import React, { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Cropper from "react-easy-crop";
import { useAuth } from "../context/AuthContext";
import { createCampaign,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  serverTimestamp
 } from "../services/firestoreService";
import { auth, storage } from "../firebase";
import {
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
} from "firebase/storage";
import "./CreateCampaign.css";

/* -------------------- Analytics Stub -------------------- */
const trackEvent = (name, data = {}) => {
  console.log("[ANALYTICS]", name, data);
};

/* -------------------- Spinner -------------------- */
const Spinner = ({ className = "spinner-small" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none">
    <circle
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="3"
      opacity="0.15"
    />
    <path
      d="M22 12a10 10 0 00-10-10"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
    />
  </svg>
);

/* -------------------- Crop Helper -------------------- */
async function getCroppedImage(src, cropPixels) {
  const img = await new Promise((res) => {
    const i = new Image();
    i.onload = () => res(i);
    i.src = src;
  });

  const canvas = document.createElement("canvas");
  canvas.width = cropPixels.width;
  canvas.height = cropPixels.height;
  const ctx = canvas.getContext("2d");

  ctx.drawImage(
    img,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    cropPixels.width,
    cropPixels.height
  );

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) =>
        resolve(
          new File([blob], "campaign.jpg", {
            type: "image/jpeg",
            lastModified: Date.now(),
          })
        ),
      "image/jpeg",
      0.9
    );
  });
}

/* ============================ COMPONENT ============================ */
export default function CreateCampaign() {
  const { currentUser: ctxUser } = useAuth();
  const user = auth.currentUser || ctxUser;
  const navigate = useNavigate();

  /* -------------------- Agreement -------------------- */
  const [showAgreement, setShowAgreement] = useState(true);
  const [agreementScrolled, setAgreementScrolled] = useState(false);
const [agreementAccepted, setAgreementAccepted] = useState(false);


  /* -------------------- Guide Language -------------------- */
  const [guideLang, setGuideLang] = useState("en");

  /* -------------------- Core -------------------- */
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [goalAmount, setGoalAmount] = useState("");
  const [campaignType, setCampaignType] = useState("personal");
  const [tags, setTags] = useState("");
  const [endDate, setEndDate] = useState("");
  const [boostPlan, setBoostPlan] = useState("none");

  /* -------------------- Media -------------------- */
  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);
  

    /* -------------------- Proof Documents -------------------- */
  const proofInputRef = useRef(null);
  const [proofFiles, setProofFiles] = useState([]);
  const [proofPreviews, setProofPreviews] = useState([]);

  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreview, setVideoPreview] = useState("");

  /* -------------------- Cropper -------------------- */
  const [showCropper, setShowCropper] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedPixels, setCroppedPixels] = useState(null);

  const onCropComplete = useCallback((_, pixels) => {
    setCroppedPixels(pixels);
  }, []);

  const applyCrop = async () => {
    if (!croppedPixels) return;
    const cropped = await getCroppedImage(imagePreview, croppedPixels);
    setImageFile(cropped);
    setImagePreview(URL.createObjectURL(cropped));
    setShowCropper(false);
  };

  /* -------------------- UI -------------------- */
  const [uploadProgress, setUploadProgress] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /* -------------------- Lock Scroll -------------------- */
  useEffect(() => {
    document.body.style.overflow =
      showAgreement || showCropper ? "hidden" : "";
    return () => (document.body.style.overflow = "");
  }, [showAgreement, showCropper]);

  /* -------------------- Image -------------------- */
  const handleImage = (file) => {
    if (!file || !file.type.startsWith("image/")) {
      setError("Invalid image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5MB");
      return;
    }
    setError(null);
    setImagePreview(URL.createObjectURL(file));
    setShowCropper(true);
  };

  /* -------------------- Video -------------------- */
  const handleVideo = (file) => {
    if (!file || !file.type.startsWith("video/")) {
      setError("Invalid video file");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError("Video must be under 50MB");
      return;
    }

    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.src = url;
    v.onloadedmetadata = () => {
      if (v.duration > 120) {
        setError("Video must be under 2 minutes");
        URL.revokeObjectURL(url);
      } else {
        setVideoFile(file);
        setVideoPreview(url);
        setError(null);
      }
    };
  };

/* -------------------- Proof Documents -------------------- */
const handleProofFiles = (files) => {
  const allowedTypes = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/jpg",
  ];

  const maxSize = 10 * 1024 * 1024; // 10MB per file
  const newFiles = [];
  const newPreviews = [];

  for (const file of Array.from(files)) {
    if (!allowedTypes.includes(file.type)) {
      setError("Only PDF, JPG, or PNG files are allowed for proofs");
      return;
    }

    if (file.size > maxSize) {
      setError("Each proof document must be under 10MB");
      return;
    }

    newFiles.push(file);
    newPreviews.push({
      name: file.name,
      size: Math.round(file.size / 1024) + " KB",
    });
  }

  setError(null);

  setProofFiles((prev) => [...prev, ...newFiles]);
  setProofPreviews((prev) => [...prev, ...newPreviews]);
};

const removeProof = (index) => {
  setProofFiles((prev) =>
    prev.filter((_, i) => i !== index)
  );

  setProofPreviews((prev) =>
    prev.filter((_, i) => i !== index)
  );
};


  /* -------------------- Upload -------------------- */
  const uploadFile = (file, path) =>
    new Promise((resolve, reject) => {
      const task = uploadBytesResumable(storageRef(storage, path), file);
      task.on(
        "state_changed",
        (s) =>
          setUploadProgress(
            Math.round((s.bytesTransferred / s.totalBytes) * 100)
          ),
        reject,
        async () => {
          setUploadProgress(null);
          resolve(await getDownloadURL(task.snapshot.ref));
        }
      );
    });

  /* -------------------- Submit -------------------- */
  const handleSubmit = async (e) => {
  e.preventDefault();
  if (!user) return setError("Not authenticated");

  try {
    setLoading(true);
    setError(null);

    let imageUrl = null;
    let videoUrl = null;
    let proofUrls = [];

    /* ---------- Upload campaign image ---------- */
    if (imageFile) {
      imageUrl = await uploadFile(
        imageFile,
        `campaigns/${user.uid}/image_${Date.now()}.jpg`
      );
    }

    /* ---------- Upload campaign video ---------- */
    if (videoFile) {
      videoUrl = await uploadFile(
        videoFile,
        `campaigns/${user.uid}/video_${Date.now()}.mp4`
      );
    }

    /* ---------- Upload proof documents ---------- */
    if (proofFiles.length > 0) {
      for (const file of proofFiles) {
        const url = await uploadFile(
          file,
          `campaigns/${user.uid}/proofs/${Date.now()}_${file.name}`
        );
        proofUrls.push({
          name: file.name,
          url,
          uploadedAt: new Date(),
        });
      }
    }

    /* ---------- Category-based platform fee (LOCKED) ---------- */
    const CATEGORY_FEE_PERCENT = {
      personal: 10,
      emergency: 2,
      medical: 8,
      education: 10,
      ngo: 2,
      csr: 10,
    };

    const categoryFeePercent =
      CATEGORY_FEE_PERCENT[campaignType] ?? 10;

    /* ---------- Create campaign ---------- */
    const result = await createCampaign(
    {
      title,
      description,
      goalAmount: Number(goalAmount),
      campaignType,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      endDate: endDate ? new Date(endDate) : null,
      boostPlan: "none",
      boostRequestedPlan: boostPlan,
      boostFeePaid: false,
      isBoosted: false,

      imageUrl,
      videoUrl,
      proofDocuments: proofUrls,
      category_fee_percent: categoryFeePercent,
      payout_status: "pending",
      razorpay_account_id: null,
      createdAt: new Date(),
    },
    user,
    false
  );

  const campaignId = result.id;

  if (boostPlan !== "none") {
    navigate(`/boost-payment/${campaignId}?plan=${boostPlan}`);
  } else {
    navigate("/campaigns");
  }



  } catch (err) {
    setError(err.message || "Campaign creation failed");
  } finally {
    setLoading(false);
  }
};

  /* ============================ RENDER ============================ */
  return (
    
    <div className="cc-page">

      {showCropper && (
  <div
    className="cc-cropper-overlay"
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.75)",
      zIndex: 9999,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <div
      className="cc-cropper-card"
      style={{
        width: "90%",
        maxWidth: 520,
        background: "#0f172a",
        borderRadius: 12,
        padding: 12,
      }}
    >
      <div style={{ position: "relative", width: "100%", height: 320 }}>
        <Cropper
          image={imagePreview}
          crop={crop}
          zoom={zoom}
          aspect={16 / 9}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <input
          type="range"
          min={1}
          max={3}
          step={0.1}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          style={{ width: "100%" }}
        />
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 12,
        }}
      >
        <button
          type="button"
          className="btn-outline"
          onClick={() => setShowCropper(false)}
        >
          Cancel
        </button>

        <button
          type="button"
          className="btn"
          onClick={applyCrop}
        >
          Save Crop
        </button>
      </div>
    </div>
  </div>
)}


      {/* ================= AGREEMENT ================= */}
{showAgreement && (
  <div className="agreement-overlay">
    <div className="agreement-modal">

      <h3 className="agreement-title">
        GiveAura Campaign Agreement
      </h3>

      <div
        className="agreement-content"
        onScroll={(e) => {
          const el = e.target;
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 10) {
            setAgreementScrolled(true);
          }
        }}
      >
<p>
  By creating and publishing a campaign on <strong>GiveAura</strong>, you
  acknowledge and agree to comply with the platform’s operational policies,
  financial structure, verification standards, and applicable legal
  regulations governing fundraising activities in India.
</p>

<section>
  <h4>1. Transparency & Donor Protection</h4>
  <ul>
    <li>
      Donors are shown <strong>100% of the donation amount</strong> at the time of contribution.
    </li>
    <li>
      No platform fee is deducted from the donor during the donation process.
    </li>
    <li>
      Platform fees are applied only during the campaign creator’s payout request.
    </li>
    <li>
      Donation records are securely stored for compliance, audit, and transparency.
    </li>
  </ul>
</section>

<section>
  <h4>2. Platform Fee Structure (Applied at Payout)</h4>
  <ul>
    <li>Emergency / Disaster Relief Campaigns: 2%</li>
    <li>Medical & Healthcare Campaigns: 0%</li>
    <li>Education & Personal Campaigns: 10%</li>
    <li>Women & Child Welfare: 5%</li>
    <li>Animal Welfare: 3%</li>
    <li>NGO / Trust / CSR Campaigns: 2% – 10% (based on category and verification)</li>
  </ul>
  <p>
    Applicable GST or statutory taxes may be charged on the platform fee as
    required by Indian tax regulations.
  </p>
</section>

<section>
  <h4>3. Payout & Settlement Terms</h4>
  <ul>
    <li>
      Payout Amount = Total Donations − Platform Fee − Applicable Taxes.
    </li>
    <li>
      Payout requests require valid KYC documentation and verified bank details.
    </li>
    <li>
      GiveAura reserves the right to hold, delay, or review payouts for
      compliance verification.
    </li>
    <li>
      Campaign creators are responsible for lawful utilization of raised funds.
    </li>
  </ul>
</section>

<section>
  <h4>4. Campaign Review & Verification</h4>
  <ul>
    <li>
      All campaigns may undergo moderation before or after publication.
    </li>
    <li>
      Additional documentation may be requested for medical, emergency, or NGO campaigns.
    </li>
    <li>
      Misrepresentation of information may lead to suspension or removal.
    </li>
  </ul>
</section>

<section>
  <h4>5. Fraud Prevention & Compliance</h4>
  <ul>
    <li>
      Fraudulent activity, misuse of funds, or misleading content may result
      in permanent account suspension.
    </li>
    <li>
      GiveAura may cooperate with law enforcement authorities if required.
    </li>
    <li>
      The platform reserves the right to recover misused funds when legally permissible.
    </li>
  </ul>
</section>

<section>
  <h4>6. Boost & Visibility Services</h4>
  <ul>
    <li>
      Boost plans increase campaign visibility but do not guarantee donations.
    </li>
    <li>
      Boost payments are non-refundable once activated.
    </li>
  </ul>
</section>

<section>
  <h4>7. Legal Jurisdiction</h4>
  <ul>
    <li>
      This agreement is governed by the laws of India.
    </li>
    <li>
      Any disputes shall be subject to the jurisdiction of competent courts
      as determined by GiveAura’s registered business location.
    </li>
  </ul>
</section>

<p className="agreement-note">
  By proceeding, you confirm that the information provided in your campaign
  is accurate, lawful, and submitted in good faith.
</p>
      </div>

      {/* Checkbox (appears only after scroll) */}
      {agreementScrolled && (
        <label className="agreement-checkbox">
          <input
            type="checkbox"
            checked={agreementAccepted}
            onChange={(e) => setAgreementAccepted(e.target.checked)}
          />
          <span className="checkmark"></span>
          I have read and agree to the GiveAura Campaign Agreement
        </label>
      )}

      <button
        className="agreement-btn"
        disabled={!agreementAccepted}
        onClick={() => {
          trackEvent("agreement_accepted", { userId: user?.uid });
          setShowAgreement(false);
        }}
      >
        OK, I Agree
      </button>

    </div>
  </div>
)}

      {/* ================= FORM + GUIDE ================= */}
      <div className="cc-card cc-split">

        {/* LEFT FORM */}
<div className="cc-form-pane">
  <button className="cc-back-btn" onClick={() => navigate(-1)}>
    ← Back
  </button>

  <h2 className="cc-title">Create Campaign</h2>

  {/* ================= IMAGE ================= */}
  <div className="cc-label">
    <div className="cc-label-title">Campaign Image</div>
    <div
      className="cc-image-preview"
      onClick={() => imageInputRef.current.click()}
    >
      {imagePreview ? (
        <img src={imagePreview} className="cc-img-preview" alt="" />
      ) : (
        <div className="cc-img-placeholder">
          Click or Drag Image
        </div>
      )}
    </div>
    <input
      ref={imageInputRef}
      type="file"
      hidden
      accept="image/*"
      onChange={(e) => handleImage(e.target.files[0])}
    />
  </div>

  {/* ================= VIDEO ================= */}
  <div className="cc-label">
    <div className="cc-label-title">Campaign Video</div>
    <div
      className="cc-video-preview"
      onClick={() => videoInputRef.current.click()}
    >
      {videoPreview ? (
        <video src={videoPreview} controls />
      ) : (
        <div className="cc-video-placeholder">
          Click to add video
        </div>
      )}
    </div>
    <input
      ref={videoInputRef}
      type="file"
      hidden
      accept="video/*"
      onChange={(e) => handleVideo(e.target.files[0])}
    />
  </div>

  {/* ================= PROOF DOCUMENTS ================= */}
  <div className="cc-label">
    <div className="cc-label-title">
      Proof Documents <span className="cc-optional">(For increase of trust in the campaign)</span>
    </div>

    <div
      className="cc-proof-box"
      onClick={() => proofInputRef.current.click()}
    >
      <div className="cc-proof-hint">
        Upload bills, estimates, certificates (PDF / Images)
      </div>
    </div>

    <input
      ref={proofInputRef}
      type="file"
      hidden
      multiple
      accept=".pdf,image/*"
      onChange={(e) => handleProofFiles(e.target.files)}
    />

    {/*PROOF FILE LIST */}
    {proofPreviews.length > 0 && (
      <div className="cc-proof-list">
        {proofPreviews.map((p, i) => (
          <div key={i} className="cc-proof-item">
            <div className="cc-proof-info">
              <span className="cc-proof-name">{p.name}</span>
              <span className="cc-proof-size">{p.size}</span>
            </div>

            {p.progress != null && (
              <div className="cc-proof-progress">
                <div style={{ width: `${p.progress}%` }} />
              </div>
            )}

            <button
              type="button"
              className="cc-proof-remove"
              onClick={() => removeProof(i)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    )}
  </div>

  {/* ================= FORM ================= */}
  <form className="cc-form" onSubmit={handleSubmit}>
    <input
      className="cc-input"
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      placeholder="Campaign Title"
      required
    />

    <textarea
      className="cc-textarea"
      value={description}
      onChange={(e) => setDescription(e.target.value)}
      placeholder="Describe your campaign"
      required
    />

    <select
      className="cc-input"
      value={campaignType}
      onChange={(e) => setCampaignType(e.target.value)}
      required
    >
      <option value="personal">Personal</option>
      <option value="emergency">Emergency</option>
      <option value="medical">Medical</option>
      <option value="education">Education</option>
      <option value="ngo">NGO / Community</option>
      <option value="csr">CSR / Corporate</option>
    </select>

    <input
      className="cc-input"
      type="number"
      value={goalAmount}
      onChange={(e) => setGoalAmount(e.target.value)}
      placeholder="Goal Amount ₹"
      required
    />

    <input
      className="cc-input"
      value={tags}
      onChange={(e) => setTags(e.target.value)}
      placeholder="Tags (comma separated)"
    />

    <input
      className="cc-input"
      type="date"
      value={endDate}
      onChange={(e) => setEndDate(e.target.value)}
    />

    <select
      className="cc-input"
      value={boostPlan}
      onChange={(e) => setBoostPlan(e.target.value)}
    >
      <option value="none">No Boost</option>
      <option value="basic">Basic – ₹399</option>
      <option value="premium">Premium – ₹999</option>
      <option value="super">Super – ₹4,999</option>
    </select>

    {uploadProgress != null && (
      <div className="cc-progress">
        <div style={{ width: `${uploadProgress}%` }} />
      </div>
    )}

    {error && <div className="cc-error">{error}</div>}

    <button className="cc-btn" disabled={loading}>
      {loading ? <Spinner /> : "Create Campaign"}
    </button>
  </form>
</div>

        {/* RIGHT GUIDE */}
<div className="cc-guide-pane">
  <h3>Campaign Creation – Step by Step</h3>

  <div className="cc-guide-lang">
    <button
      className={guideLang === "en" ? "active" : ""}
      onClick={() => setGuideLang("en")}
    >
      English
    </button>
    <button
      className={guideLang === "te" ? "active" : ""}
      onClick={() => setGuideLang("te")}
    >
      తెలుగు
    </button>
    <button
      className={guideLang === "hi" ? "active" : ""}
      onClick={() => setGuideLang("hi")}
    >
      हिंदी
    </button>
  </div>

  {/* ================= ENGLISH ================= */}
  {guideLang === "en" && (
    <ol>
      <li>
        <strong>Campaign Title:</strong>  
        Use a clear, honest title that explains the need (medical, emergency,
        education, etc.).
      </li>

      <li>
        <strong>Description:</strong>  
        Clearly explain who the funds are for, why they are needed, and how the
        money will be used.
      </li>

      <li>
        <strong>Category Selection:</strong>  
        Choose the correct category. Platform fees depend on category and are
        applied only at payout.
      </li>

      <li>
        <strong>Goal Amount:</strong>  
        Enter the total amount required. Donors always see 100% of their donation.
      </li>

      <li>
        <strong>Media Upload:</strong>  
        Upload genuine images or videos. This improves trust and campaign reach.
      </li>

      <li>
        <strong>Agreement Awareness:</strong>  
        Donations are not deducted instantly. Platform fees and GST apply only
        during payout.
      </li>

      <li>
        <strong>Final Review:</strong>  
        Verify all details before submitting. Incorrect information may delay
        approval or payout.
      </li>
    </ol>
  )}

  {/* ================= TELUGU ================= */}
  {guideLang === "te" && (
    <ol>
      <li>
        <strong>క్యాంపెయిన్ శీర్షిక:</strong>  
        అవసరాన్ని స్పష్టంగా చూపించే నిజమైన శీర్షిక ఉపయోగించండి.
      </li>

      <li>
        <strong>వివరణ:</strong>  
        నిధులు ఎవరికోసం, ఎందుకు అవసరమో మరియు ఎలా వినియోగిస్తారో వివరించండి.
      </li>

      <li>
        <strong>వర్గం ఎంపిక:</strong>  
        సరైన వర్గాన్ని ఎంచుకోండి. ఫీజులు పేమెంట్ సమయంలో మాత్రమే వర్తిస్తాయి.
      </li>

      <li>
        <strong>లక్ష్య మొత్తం:</strong>  
        అవసరమైన మొత్తాన్ని నమోదు చేయండి. దాతలు 100% మొత్తాన్ని చూస్తారు.
      </li>

      <li>
        <strong>చిత్రాలు / వీడియోలు:</strong>  
        నిజమైన చిత్రాలు లేదా వీడియోలు నమ్మకాన్ని పెంచుతాయి.
      </li>

      <li>
        <strong>అగ్రిమెంట్ అవగాహన:</strong>  
        విరాళాల సమయంలో ఎలాంటి కోతలు ఉండవు. ఫీజులు పేమెంట్ సమయంలో మాత్రమే.
      </li>

      <li>
        <strong>చివరి తనిఖీ:</strong>  
        అన్ని వివరాలు సరిచూసి తర్వాతే క్యాంపెయిన్ సబ్మిట్ చేయండి.
      </li>
    </ol>
  )}

  {/* ================= HINDI ================= */}
  {guideLang === "hi" && (
    <ol>
      <li>
        <strong>कैम्पेन शीर्षक:</strong>  
        आवश्यकता को स्पष्ट दिखाने वाला सटीक और ईमानदार शीर्षक लिखें।
      </li>

      <li>
        <strong>विवरण:</strong>  
        धन किसके लिए है, क्यों जरूरी है और कैसे उपयोग होगा – स्पष्ट बताएं।
      </li>

      <li>
        <strong>श्रेणी चयन:</strong>  
        सही श्रेणी चुनें। प्लेटफ़ॉर्म शुल्क केवल भुगतान के समय लागू होता है।
      </li>

      <li>
        <strong>लक्ष्य राशि:</strong>  
        आवश्यक कुल राशि दर्ज करें। दाता पूरी 100% राशि देखते हैं।
      </li>

      <li>
        <strong>फोटो / वीडियो:</strong>  
        वास्तविक मीडिया भरोसा और पहुँच दोनों बढ़ाता है।
      </li>

      <li>
        <strong>समझौता जानकारी:</strong>  
        दान के समय कोई कटौती नहीं होती। शुल्क केवल भुगतान के समय लिया जाता है।
      </li>

      <li>
        <strong>अंतिम जाँच:</strong>  
        सबमिट करने से पहले सभी जानकारी सही होना आवश्यक है।
      </li>
    </ol>
  )}
</div>
      </div>
    </div>
  );
}
