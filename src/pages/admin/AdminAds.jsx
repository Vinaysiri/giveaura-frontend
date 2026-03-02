import React, { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { db } from "../../firebase";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import "./AdminAds.css";
import GiveAuraLoader from "../../components/GiveAuraLoader";

/* ================= ADMIN CHECK ================= */
function useIsAdmin(currentUser) {
  if (!currentUser) return false;
  if (currentUser.isAdmin === true || currentUser.admin === true) return true;
  if (currentUser.email === "kotipallynagavinay12323@gmail.com") return true;
  return false;
}

export default function AdminAds() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const isAdmin = useIsAdmin(currentUser);

  const [banners, setBanners] = useState([]);
  const [posters, setPosters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    kind: "banner",
    title: "",
    caption: "",
    imageUrl: "",
    active: true,
  });

  /* ================= LOAD ADS ================= */
  useEffect(() => {
    if (!currentUser || !isAdmin) {
      setLoading(false);
      return;
    }

    const qRef = query(
      collection(db, "popups"),
      where("location", "==", "donate"),
      orderBy("order", "asc")
    );

    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setBanners(all.filter((x) => x.kind === "banner"));
        setPosters(all.filter((x) => x.kind === "poster"));
        setLoading(false);
      },
      (err) => {
        console.error("[AdminAds] snapshot error:", err);
        setError("Failed to load advertisements.");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [currentUser, isAdmin]);

  /* ================= FORM HANDLERS ================= */
  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError(null);

    if (!form.imageUrl.trim()) {
      setError("Image URL is required.");
      return;
    }

    setSaving(true);
    try {
      await addDoc(collection(db, "popups"), {
        kind: form.kind,
        location: "donate",
        title: form.title || "",
        caption: form.caption || "",
        imageUrl: form.imageUrl.trim(),
        active: !!form.active,
        order: Date.now(),
        createdAt: serverTimestamp(),
      });

      setForm({
        kind: "banner",
        title: "",
        caption: "",
        imageUrl: "",
        active: true,
      });
    } catch (err) {
      console.error("[AdminAds] create error:", err);
      setError("Failed to create advertisement.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (ad) => {
    try {
      await updateDoc(doc(db, "popups", ad.id), {
        active: !ad.active,
      });
    } catch {
      alert("Failed to update ad state.");
    }
  };

  const deleteAd = async (ad) => {
    if (!window.confirm("Delete this advertisement?")) return;
    try {
      await deleteDoc(doc(db, "popups", ad.id));
    } catch {
      alert("Failed to delete advertisement.");
    }
  };

  /* ================= ACCESS GUARDS ================= */
  if (!currentUser) {
    return (
      <div className="admin-ads-page">
        <div className="admin-ads-card">🚫 Please log in.</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="admin-ads-page">
        <div className="admin-ads-card">
          🔒 Admin access only.
          <button
            className="btn-outline admin-ads-back"
            onClick={() => navigate("/")}
          >
            Go home
          </button>
        </div>
      </div>
    );
  }

  /* ================= RENDER ================= */
  return (
    <div className="admin-ads-page">
      {/* HEADER */}
      <div className="admin-ads-header">
        <button
          className="btn-outline admin-ads-back"
          onClick={() => navigate(-1)}
        >
          ← Back
        </button>

        <h1>Donate Page Advertisements</h1>
        <p>Manage hero banners and poster cards shown on the Donate page.</p>
      </div>

      <div className="admin-ads-layout">
        {/* LEFT: CREATE */}
        <div className="admin-ads-column">
          <div className="admin-ads-card">
            <h2>Add new advertisement</h2>
            {error && <div className="admin-ads-error">⚠ {error}</div>}

            <form onSubmit={handleCreate} className="admin-ads-form">
              <div className="field-row">
                <label>Type</label>
                <select
                  value={form.kind}
                  onChange={(e) => handleChange("kind", e.target.value)}
                >
                  <option value="banner">Hero banner</option>
                  <option value="poster">Poster card</option>
                </select>
              </div>

              <div className="field-row">
                <label>Title</label>
                <input
                  value={form.title}
                  onChange={(e) => handleChange("title", e.target.value)}
                />
              </div>

              <div className="field-row">
                <label>Caption</label>
                <input
                  value={form.caption}
                  onChange={(e) => handleChange("caption", e.target.value)}
                />
              </div>

              <div className="field-row">
                <label>Image URL *</label>
                <input
                  required
                  value={form.imageUrl}
                  onChange={(e) =>
                    handleChange("imageUrl", e.target.value)
                  }
                />
              </div>

              <div className="field-row checkbox-row">
                <label>
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) =>
                      handleChange("active", e.target.checked)
                    }
                  />{" "}
                  Active
                </label>
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={saving}
              >
                {saving ? "Saving..." : "Add advertisement"}
              </button>
            </form>
          </div>
        </div>

        {/* RIGHT: LISTS */}
        <div className="admin-ads-column">
          {loading ? (
            <div className="admin-ads-card"><GiveAuraLoader/></div>
          ) : (
            <>
              {/* HERO BANNERS */}
              <div className="admin-ads-card">
                <h2>Hero banners</h2>
                {banners.length === 0 && (
                  <div className="admin-ads-empty">No banners</div>
                )}
                <div className="admin-ads-list">
                  {banners.map((ad) => (
                    <AdRow
                      key={ad.id}
                      ad={ad}
                      onToggle={toggleActive}
                      onDelete={deleteAd}
                    />
                  ))}
                </div>
              </div>

              {/* POSTERS */}
              <div className="admin-ads-card">
                <h2>Poster cards</h2>
                {posters.length === 0 && (
                  <div className="admin-ads-empty">No posters</div>
                )}
                <div className="admin-ads-list">
                  {posters.map((ad) => (
                    <AdRow
                      key={ad.id}
                      ad={ad}
                      onToggle={toggleActive}
                      onDelete={deleteAd}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================= REUSABLE ROW ================= */
function AdRow({ ad, onToggle, onDelete }) {
  return (
    <div className="admin-ads-item">
      <div className="admin-ads-thumb">
        {ad.imageUrl && (
          <img src={ad.imageUrl} alt={ad.title || "Ad"} />
        )}
      </div>

      <div className="admin-ads-info">
        <div className="admin-ads-title">
          {ad.title || "(No title)"}
        </div>
        {ad.caption && (
          <div className="admin-ads-caption">{ad.caption}</div>
        )}
        <span className={ad.active ? "pill pill-on" : "pill pill-off"}>
          {ad.active ? "Active" : "Hidden"}
        </span>
      </div>

      <div className="admin-ads-item-actions">
        <button className="btn-ghost" onClick={() => onToggle(ad)}>
          {ad.active ? "Hide" : "Show"}
        </button>
        <button className="btn-outline" onClick={() => onDelete(ad)}>
          Delete
        </button>
      </div>
    </div>
  );
}
