// src/pages/EditProfile.jsx
import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getUserProfile, saveUserProfile } from "../services/firestoreService";
import { storage } from "../firebase";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

/**
 * EditProfile - improved flow to avoid stuck "Saving..." and to notify other windows/components
 * - ensures uploads have a timeout and won't block the save
 * - always resets saving flag in finally
 * - refetches the saved profile and dispatches a global event so other components can refresh
 *
 * IMPORTANT:
 * - This component intentionally avoids writing `email` to Firestore from client-side.
 * - Ensure any server-side endpoint that writes sensitive fields verifies ID tokens.
 */

export default function EditProfile() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const objectUrlRef = useRef(null);

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [photoURL, setPhotoURL] = useState("");
  const [file, setFile] = useState(null);
  const [bank, setBank] = useState({
    accountHolder: "",
    bankName: "",
    accountNumber: "",
    ifsc: "",
    upiId: "",
  });
  const [phone, setPhone] = useState("");

  const [showBankList, setShowBankList] = useState(false);
  const [filteredBanks, setFilteredBanks] = useState([]);

  const indianBanks = [
    "State Bank of India (SBI)",
    "HDFC Bank",
    "ICICI Bank",
    "Punjab National Bank (PNB)",
    "Bank of Baroda",
    "Axis Bank",
    "Canara Bank",
    "Union Bank of India",
    "Indian Bank",
    "IDBI Bank",
    "Kotak Mahindra Bank",
    "Bank of India",
    "Central Bank of India",
    "IndusInd Bank",
    "Yes Bank",
    "IDFC FIRST Bank",
    "UCO Bank",
    "Punjab & Sind Bank",
    "Federal Bank",
    "South Indian Bank",
    "RBL Bank",
    "Bank of Maharashtra",
    "Indian Overseas Bank",
    "Karur Vysya Bank",
    "Jammu & Kashmir Bank",
    "Tamilnad Mercantile Bank",
    "DCB Bank",
    "Bandhan Bank",
    "Nainital Bank",
    "City Union Bank",
    "AU Small Finance Bank",
    "Equitas Small Finance Bank",
    "ESAF Small Finance Bank",
    "Fincare Small Finance Bank",
    "Jana Small Finance Bank",
    "Suryoday Small Finance Bank",
    "Ujjivan Small Finance Bank",
    "North East Small Finance Bank",
    "Capital Small Finance Bank",
  ];

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Load user profile
  useEffect(() => {
    let mounted = true;
    const loadProfile = async () => {
      if (!currentUser) {
        if (mounted) setLoading(false);
        return;
      }
      try {
        const data = await getUserProfile(currentUser.uid);
        if (!mounted) return;
        if (data) {
          setDisplayName(data.displayName || "");
          setBio(data.bio || "");
          setPhotoURL(data.photoURL || "");
          setBank(
            data.bank || {
              accountHolder: "",
              bankName: "",
              accountNumber: "",
              ifsc: "",
              upiId: "",
            }
          );
          setPhone(data.phone || "");
        } else {
          // No document found -- fall back to Auth fields
          setDisplayName(currentUser.displayName || "");
          setPhotoURL(currentUser.photoURL || "");
        }
      } catch (err) {
        console.warn("load profile failed:", err);
        setError("Failed to load profile. Check console.");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadProfile();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  // revoke preview object URL on unmount / when replaced
  useEffect(() => {
    return () => {
      try {
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
          objectUrlRef.current = null;
        }
      } catch {}
    };
  }, []);

  // When user selects a file: preview from internal storage (not uploaded yet)
  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      setError("Image too large (max 5MB).");
      return;
    }
    setError(null);
    setFile(f);
    try {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      const preview = URL.createObjectURL(f);
      objectUrlRef.current = preview;
      setPhotoURL(preview); // local preview
    } catch (err) {
      console.warn("preview creation failed:", err);
      setPhotoURL("");
    }
  };

  // Upload selected file to Firebase only on Save
  // Adds a safety timeout to avoid hanging the UI forever
  const uploadImage = async (timeoutMs = 90000) => {
    // if no new file selected, return the current photoURL (could be remote URL or blank)
    if (!file) return photoURL;

    if (!currentUser || !currentUser.uid) throw new Error("Not authenticated");

    let timeoutId = null;
    // create an upload promise
    const uploadPromise = (async () => {
      const path = `profilePhotos/${currentUser.uid}_${Date.now()}`;
      const ref = storageRef(storage, path);
      // using uploadBytes (small files) — returns snapshot
      const snapshot = await uploadBytes(ref, file);
      // clear any preview object URL (we'll use uploaded url)
      try {
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
          objectUrlRef.current = null;
        }
      } catch {}
      const url = await getDownloadURL(snapshot.ref);
      return url;
    })();

    // timeout promise which rejects after timeoutMs
    const timeoutPromise = new Promise((_, rej) => {
      timeoutId = setTimeout(() => {
        timeoutId = null;
        rej(new Error("Upload timed out"));
      }, timeoutMs);
    });

    try {
      const url = await Promise.race([uploadPromise, timeoutPromise]);
      // if uploadPromise won, clear timer
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      return url;
    } catch (err) {
      // clear timeout if still pending
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      console.error("uploadImage error:", err);
      throw err;
    }
  };

  const handleSave = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setError(null);

    if (!displayName || !String(displayName).trim()) {
      setError("Display name is required.");
      return { success: false };
    }

    if (saving) {
      // already saving — ignore duplicate clicks
      return { success: false };
    }

    setSaving(true);
    try {
      console.debug("EditProfile: starting save", { uid: currentUser?.uid });

      let finalPhotoUrl = photoURL;

      // Upload only if a new file was selected
      if (file) {
        try {
          finalPhotoUrl = await uploadImage(90000); // 90s timeout
          console.debug("EditProfile: uploadImage returned", finalPhotoUrl);
        } catch (uploadErr) {
          // proceed but notify user and do not persist local blob URLs
          console.warn("EditProfile: Image upload failed, saving profile without new photo:", uploadErr);
          finalPhotoUrl = photoURL && photoURL.startsWith("blob:") ? "" : photoURL || "";
          setError("Image upload failed — profile saved without new photo. Try uploading again.");
        }
      }

      // never save blob: preview URLs into Firestore
      if (finalPhotoUrl && finalPhotoUrl.startsWith("blob:")) finalPhotoUrl = "";

      // sanitize bank fields (trim strings)
      const safeBank = {
        accountHolder: bank.accountHolder ? String(bank.accountHolder).trim() : "",
        bankName: bank.bankName ? String(bank.bankName).trim() : "",
        accountNumber: bank.accountNumber ? String(bank.accountNumber).trim() : "",
        ifsc: bank.ifsc ? String(bank.ifsc).trim() : "",
        upiId: bank.upiId ? String(bank.upiId).trim() : "",
      };

      // Build safe payload (server-side rules will sanitize too)
      const payload = {
        displayName: String(displayName).trim(),
        bio: typeof bio === "string" ? bio.trim() : "",
        photoURL: finalPhotoUrl || "",
        bank: (safeBank.accountHolder || safeBank.bankName || safeBank.accountNumber || safeBank.ifsc || safeBank.upiId) ? safeBank : null,
        phone: phone ? String(phone).trim() : "",
      };

      // Attempt save (saveUserProfile will try client write and server fallback)
      await saveUserProfile(currentUser.uid, payload);
      console.info("EditProfile: saveUserProfile completed (no exception thrown)");

      // Try to refetch authoritative profile up to 2 times (in case of brief propagation delay)
      let fresh = null;
      try {
        fresh = await getUserProfile(currentUser.uid);
        if (!fresh) {
          // short retry
          await new Promise((r) => setTimeout(r, 600));
          fresh = await getUserProfile(currentUser.uid);
        }
      } catch (refetchErr) {
        console.warn("EditProfile: refetch attempt failed:", refetchErr);
      }

      // Dispatch global event (best-effort)
      try {
        window.dispatchEvent(
          new CustomEvent("giveaura:profile-updated", {
            detail: { userId: currentUser.uid, profile: fresh || null },
          })
        );
      } catch (evErr) {
        console.warn("EditProfile: dispatch profile-updated event failed:", evErr);
      }

      // If refetch didn't return a doc, surface an error instead of blindly navigating home
      if (!fresh) {
        console.warn("EditProfile: profile saved but could not confirm via getUserProfile. Not navigating. Please check console & server logs.");
        setError("Profile saved but verification failed. Please refresh or open your profile from the menu.");
        return { success: true, verified: false };
      }

      // Navigation: only navigate when we have a confirmed profile and an authenticated user
      if (!currentUser || !currentUser.uid) {
        // defensive - don't navigate if auth disappeared
        console.error("EditProfile: auth lost after save; not navigating automatically.");
        setError("Profile saved, but you are no longer authenticated in this session. Please sign in again to view your profile.");
        return { success: true, verified: true };
      }

      try {
        // Use replace so back button doesn't return to the edit form
        navigate(`/profile/${currentUser.uid}`, { replace: true });
        return { success: true, verified: true };
      } catch (navErr) {
        console.warn("EditProfile: navigation to profile failed:", navErr);
        setError("Saved, but could not open your profile. Please open it from the menu.");
        return { success: true, verified: true, navFailed: true };
      }
    } catch (err) {
      // catch any unexpected errors from saveUserProfile / callAuthBackend / other internals
      console.error("EditProfile: Failed to save profile:", err);
      // Prefer descriptive message when available
      setError(err?.message ? `Failed to save profile: ${err.message}` : "Failed to save profile. See console for details.");
      return { success: false, error: err };
    } finally {
      // cleanup always runs
      try {
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
          objectUrlRef.current = null;
        }
      } catch (cleanupErr) {
        console.warn("EditProfile: failed to revoke object URL:", cleanupErr);
      }
      setFile(null);
      setSaving(false);
    }
  };

  const updateBank = (key, value) => {
    setBank((prev) => ({ ...prev, [key]: value }));
  };

  if (!currentUser)
    return <p style={{ textAlign: "center", marginTop: 40 }}>🚫 Please log in first.</p>;

  if (loading) return <p style={{ textAlign: "center", marginTop: 40 }}>⏳ Loading profile...</p>;

  return (
    <div
      style={{
        maxWidth: 700,
        margin: "40px auto",
        background: "#fff",
        borderRadius: 12,
        padding: 24,
        boxShadow: "0 6px 20px rgba(0,0,0,0.08)",
      }}
      aria-busy={saving}
    >
      <h2>Edit Profile</h2>
      <form onSubmit={handleSave}>
        {/* Profile Photo */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <img
            src={photoURL || "/default-avatar.png"}
            alt="profile"
            style={{
              width: 120,
              height: 120,
              borderRadius: "50%",
              objectFit: "cover",
              border: "2px solid #ddd",
              cursor: "pointer",
            }}
            onClick={() => fileInputRef.current?.click()}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          <p style={{ fontSize: 13, color: "#777" }}>
            {file ? "Previewing selected image — will upload when you save." : "Click photo to select from your storage"}
          </p>
        </div>

        {/* Personal Info */}
        <div style={{ marginBottom: 12 }}>
          <label>Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 8,
              border: "1px solid #ccc",
            }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows="3"
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 8,
              border: "1px solid #ccc",
            }}
          />
        </div>

        {/* Phone (public as requested) */}
        <div style={{ marginBottom: 12 }}>
          <label>Phone (public)</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. +91-9876543210"
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 8,
              border: "1px solid #ccc",
            }}
          />
          <small style={{ color: "#6b7280" }}>
            This phone number will be visible on your public profile.
          </small>
        </div>

        {/* Bank Details Section */}
        <h3 style={{ marginTop: 20 }}>Bank Details (public)</h3>
        <div style={{ display: "grid", gap: 8 }}>
          <input
            placeholder="Account Holder Name"
            value={bank.accountHolder}
            onChange={(e) => updateBank("accountHolder", e.target.value)}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
          />
          {/* Bank Name (Searchable Dropdown) */}
          <div style={{ position: "relative" }}>
            <label style={{ display: "block", marginBottom: 6 }}>Bank Name</label>
            <input
              type="text"
              placeholder="Search or select bank"
              value={bank.bankName}
              onChange={(e) => {
                const value = e.target.value;
                updateBank("bankName", value);
                setShowBankList(value.length > 0);
                setFilteredBanks(indianBanks.filter((b) => b.toLowerCase().includes(value.toLowerCase())));
              }}
              onFocus={() => setShowBankList(true)}
              onBlur={() => setTimeout(() => setShowBankList(false), 200)} // delay to allow click
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                border: "1px solid #ccc",
              }}
            />
            {showBankList && (
              <ul
                style={{
                  position: "absolute",
                  zIndex: 10,
                  background: "#fff",
                  border: "1px solid #ccc",
                  borderRadius: 8,
                  marginTop: 4,
                  maxHeight: 200,
                  overflowY: "auto",
                  width: "100%",
                  listStyle: "none",
                  padding: 0,
                }}
              >
                {filteredBanks.length === 0 ? (
                  <li
                    style={{
                      padding: "8px 12px",
                      color: "#777",
                      fontStyle: "italic",
                    }}
                  >
                    No banks found
                  </li>
                ) : (
                  filteredBanks.map((bankName) => (
                    <li
                      key={bankName}
                      onClick={() => {
                        updateBank("bankName", bankName);
                        setShowBankList(false);
                      }}
                      style={{
                        padding: "8px 12px",
                        cursor: "pointer",
                        borderBottom: "1px solid #eee",
                      }}
                      onMouseDown={(e) => e.preventDefault()} // prevent blur on click
                    >
                      {bankName}
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>

          <input
            placeholder="Account Number"
            value={bank.accountNumber}
            onChange={(e) => updateBank("accountNumber", e.target.value)}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
          />
          <input
            placeholder="IFSC Code"
            value={bank.ifsc}
            onChange={(e) => updateBank("ifsc", e.target.value)}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
          />
          <input
            placeholder="UPI ID (optional)"
            value={bank.upiId}
            onChange={(e) => updateBank("upiId", e.target.value)}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
          />
        </div>

        {error && <p style={{ color: "red", marginTop: 8 }}>{error}</p>}

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button
            type="submit"
            disabled={saving}
            aria-disabled={saving}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "none",
              background: "#3b82f6",
              color: "#fff",
              cursor: saving ? "default" : "pointer",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={() => navigate(`/profile/${currentUser.uid}`)}
            disabled={saving}
            aria-disabled={saving}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "1px solid #ccc",
              background: "#fafafa",
              cursor: saving ? "default" : "pointer",
              opacity: saving ? 0.6 : 1,
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
