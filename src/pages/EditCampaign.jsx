// src/pages/EditCampaign.jsx
import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Cropper from "react-easy-crop";
import { useAuth } from "../context/AuthContext";
import { doc, updateDoc, onSnapshot } from "firebase/firestore";
import {
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
} from "firebase/storage";
import { db, storage } from "../firebase";
import "../styles/EditCampaign.css";
import GiveAuraLoader from "../components/GiveAuraLoader";

/* ===================== Crop Helper ===================== */
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

export default function EditCampaign() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  /* ===================== STATE ===================== */
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [goalAmount, setGoalAmount] = useState("");
  const [fundsRaised, setFundsRaised] = useState(0);
  const [tags, setTags] = useState("");
  const [endDate, setEndDate] = useState("");
  const [boostPlan, setBoostPlan] = useState("none");
  const [boostFeePaid, setBoostFeePaid] = useState(false);
  const [isBoosted, setIsBoosted] = useState(false);


  const boostPlanOriginalRef = useRef("none");

  const [imageUrl, setImageUrl] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);

  const [imageFile, setImageFile] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [videoPreview, setVideoPreview] = useState("");

  const [existingProofs, setExistingProofs] = useState([]);
  const [removedProofIndexes, setRemovedProofIndexes] = useState([]);
  const [newProofFiles, setNewProofFiles] = useState([]);

  /* ===================== CROP ===================== */
  const [showCropper, setShowCropper] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedPixels, setCroppedPixels] = useState(null);

  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const proofInputRef = useRef(null);

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

  /* ===================== LOAD ===================== */
  useEffect(() => {
    const ref = doc(db, "campaigns", id);

    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();

      setTitle(d.title || "");
      setDescription(d.description || "");
      setGoalAmount(String(d.goalAmount || ""));
      setFundsRaised(Number(d.fundsRaised || 0));
      setTags(Array.isArray(d.tags) ? d.tags.join(", ") : "");
      const activePlan = d.boostPlan || "none";
      const requestedPlan = d.boostRequestedPlan || activePlan;
      setBoostPlan(requestedPlan);
      boostPlanOriginalRef.current = activePlan;

      setBoostFeePaid(d.boostFeePaid || false);
      setIsBoosted(d.isBoosted || false);


      setImageUrl(d.imageUrl || null);
      setVideoUrl(d.videoUrl || null);
      setExistingProofs(d.proofDocuments || []);

      if (d.endDate) {
        const iso =
          typeof d.endDate?.toDate === "function"
            ? d.endDate.toDate().toISOString().split("T")[0]
            : String(d.endDate).split("T")[0];
        setEndDate(iso);
      }

      setLoading(false);
    });

    return () => unsub();
  }, [id]);

  /* ===================== VALIDATION ===================== */
  const handleImage = (file) => {
    if (!file || !file.type.startsWith("image/"))
      return setError("Invalid image file");

    if (file.size > 5 * 1024 * 1024)
      return setError("Image must be under 5MB");

    setError(null);
    setImagePreview(URL.createObjectURL(file));
    setShowCropper(true);
  };

  const handleVideo = (file) => {
    if (!file || !file.type.startsWith("video/"))
      return setError("Invalid video file");

    if (file.size > 50 * 1024 * 1024)
      return setError("Video must be under 50MB");

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

  const handleProofFiles = (files) => {
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
    const max = 10 * 1024 * 1024;

    for (const file of Array.from(files)) {
      if (!allowed.includes(file.type))
        return setError("Only PDF, JPG, PNG allowed");
      if (file.size > max)
        return setError("Each proof must be under 10MB");
    }

    setNewProofFiles((p) => [...p, ...Array.from(files)]);
  };

  /* ===================== UPLOAD ===================== */
  const uploadFile = (file, path) =>
    new Promise((resolve, reject) => {
      const task = uploadBytesResumable(storageRef(storage, path), file);
      task.on("state_changed", null, reject, async () => {
        resolve(await getDownloadURL(task.snapshot.ref));
      });
    });

  /* ===================== SAVE ===================== */
  const handleSave = async (e) => {
    e.preventDefault();
    setError(null);

    const goal = Number(goalAmount);
    if (goal < fundsRaised)
      return setError("Goal cannot be lower than raised amount.");

    try {
      setSaving(true);

      let finalImageUrl = imageUrl;
      let finalVideoUrl = videoUrl;

      if (imageFile) {
        finalImageUrl = await uploadFile(
          imageFile,
          `campaigns/${currentUser.uid}/image_${Date.now()}.jpg`
        );
      }

      if (videoFile) {
        finalVideoUrl = await uploadFile(
          videoFile,
          `campaigns/${currentUser.uid}/video_${Date.now()}.mp4`
        );
      }

      const uploadedProofs = [];
      for (const file of newProofFiles) {
        const url = await uploadFile(
          file,
          `campaigns/${currentUser.uid}/proofs/${Date.now()}_${file.name}`
        );
        uploadedProofs.push({
          name: file.name,
          url,
          uploadedAt: new Date(),
        });
      }

      const finalProofs = existingProofs
        .filter((_, i) => !removedProofIndexes.includes(i))
        .concat(uploadedProofs);

      await updateDoc(doc(db, "campaigns", id), {
        title,
        description,
        goalAmount: goal,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        endDate: endDate ? new Date(endDate) : null,
        boostRequestedPlan: boostPlan,
        imageUrl: finalImageUrl,
        videoUrl: finalVideoUrl,
        proofDocuments: finalProofs,
        updatedAt: new Date(),
      });

      const boostChanged = boostPlan !== boostPlanOriginalRef.current;

      if (boostChanged) {

        if (boostPlan === "none" && isBoosted) {
          setError("Boost cannot be removed after activation.");
          setSaving(false);
          return;
        }

        const BOOST_PRICING = {
          none: 0,
          basic: 399,
          premium: 999,
          super: 4999,
        };

        const fromPlan = boostPlanOriginalRef.current || "none";
        const toPlan = boostPlan;

        const diffAmount =
          BOOST_PRICING[toPlan] - BOOST_PRICING[fromPlan];

        await updateDoc(doc(db, "campaigns", id), {
          boostRequestedPlan: toPlan,
          boostFeePaid: false,
          isBoosted: false,
        });

        if (toPlan !== "none") {
          navigate(
            `/boost-payment/${id}?source=edit&from=${fromPlan}&to=${toPlan}&amount=${diffAmount}`
          );
          return;
        }
      }


      navigate(`/campaign/${id}`);

    } catch (err) {
      console.error(err);
      setError("Update failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <GiveAuraLoader />;

  return (
    <div className="cc-page">
      {/* Cropper Modal */}
      {showCropper && (
        <div className="cc-cropper-overlay">
          <div className="cc-cropper-card">
            <div className="cc-cropper-area">
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

            <input
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="cc-zoom-slider"
            />

            <div className="cc-crop-actions">
              <button type="button" onClick={() => setShowCropper(false)}>
                Cancel
              </button>
              <button type="button" onClick={applyCrop}>
                Save Crop
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="cc-card">
        <h2>Edit Campaign</h2>
        {error && <div className="cc-error">{error}</div>}

        {/* IMAGE */}
        <div className="cc-label">
          <div
            className="cc-image-preview"
            onClick={() => imageInputRef.current.click()}
          >
            {imagePreview || imageUrl ? (
              <img
                src={imagePreview || imageUrl}
                className="cc-img-preview"
                alt=""
              />
            ) : (
              <div className="cc-img-placeholder">Add Image</div>
            )}
          </div>
          <input
            ref={imageInputRef}
            hidden
            type="file"
            accept="image/*"
            onChange={(e) => handleImage(e.target.files[0])}
          />
        </div>

        {/* VIDEO */}
        <div className="cc-label">
          <div
            className="cc-video-preview"
            onClick={() => videoInputRef.current.click()}
          >
            {videoPreview || videoUrl ? (
              <video src={videoPreview || videoUrl} controls />
            ) : (
              <div className="cc-video-placeholder">Add Video</div>
            )}
          </div>
          <input
            ref={videoInputRef}
            hidden
            type="file"
            accept="video/*"
            onChange={(e) => handleVideo(e.target.files[0])}
          />
        </div>

        {/* PROOFS */}
        {existingProofs.length > 0 && (
          <div className="cc-proof-list">
            {existingProofs.map((p, i) => (
              <div key={i} className="cc-proof-item">
                <a href={p.url} target="_blank" rel="noreferrer">
                  {p.name}
                </a>
                <button
                  type="button"
                  onClick={() =>
                    setRemovedProofIndexes((r) => [...r, i])
                  }
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <div
          className="cc-proof-box"
          onClick={() => proofInputRef.current.click()}
        >
          Upload Proof Documents
        </div>
        <input
          ref={proofInputRef}
          hidden
          type="file"
          multiple
          accept=".pdf,image/*"
          onChange={(e) => handleProofFiles(e.target.files)}
        />

        {/* FORM */}
        <form onSubmit={handleSave}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} required />
          <input value={tags} onChange={(e) => setTags(e.target.value)} />
          <input type="number" value={goalAmount} onChange={(e) => setGoalAmount(e.target.value)} required />
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <select value={boostPlan} onChange={(e) => setBoostPlan(e.target.value)}>
            <option value="none">No Boost</option>
            <option value="basic">Basic</option>
            <option value="premium">Premium</option>
            <option value="super">Super</option>
          </select>

          <button disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </div>
    </div>
  );
}
