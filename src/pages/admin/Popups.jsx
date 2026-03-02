// src/pages/admin/Popups.jsx
import React, { useEffect, useState, useRef } from "react";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../firebase";
import Modal from "./admincomponents/Modal.jsx";

// storage helpers from your updated firestoreService
import { uploadMedia, deleteMedia } from "../../services/firestoreService";

export default function Popups() {
  const [popups, setPopups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null); // null => create, object => edit
  const [form, setForm] = useState({
    title: "",
    message: "",
    active: true,
    // link: { type: 'none' | 'internal' | 'external', url: string }
    link: { type: "none", url: "" },
    // media: { type: 'image'|'video'|null, source: 'none'|'external'|'upload', url: '', fullPath: null }
    media: { type: null, source: "none", url: "", fullPath: null },
    // new fields:
    showOnce: false,
    primaryLabel: "",
  });
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);
  const [fileToUpload, setFileToUpload] = useState(null);

  const resetForm = () =>
    setForm({
      title: "",
      message: "",
      active: true,
      link: { type: "none", url: "" },
      media: { type: null, source: "none", url: "", fullPath: null },
      showOnce: false,
      primaryLabel: "",
    });

  const fetchPopups = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "popups"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      setPopups(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })));
    } catch (err) {
      console.error("fetchPopups:", err);
      alert("Could not fetch popups. See console.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPopups();
  }, []);

  const openCreate = () => {
    setEditing(null);
    resetForm();
    setFileToUpload(null);
    setModalOpen(true);
  };

  const openEdit = (p) => {
    setEditing(p);
    // prefer structured fields but fall back to legacy keys if present
    // IMPORTANT: treat legacy p.url as either internal (if startsWith '/') or external
    const existingLink =
      p.link ||
      (p.url
        ? { type: String(p.url).startsWith("/") ? "internal" : "external", url: p.url }
        : { type: "none", url: "" });

    const existingMedia =
      p.media ||
      (p.imageUrl
        ? { type: "image", source: "external", url: p.imageUrl, fullPath: null }
        : p.videoUrl
        ? { type: "video", source: "external", url: p.videoUrl, fullPath: null }
        : { type: null, source: "none", url: "", fullPath: null });

    setForm({
      title: p.title || "",
      message: p.message || "",
      active: !!p.active,
      link: existingLink,
      media: existingMedia,
      showOnce: !!p.showOnce,
      primaryLabel: p.primaryLabel || "",
    });
    setFileToUpload(null);
    setModalOpen(true);
  };

  // helper: upload file if fileToUpload is present and media.source === 'upload'
  const handleFileChange = (e) => {
    const f = e.target.files && e.target.files[0];
    setFileToUpload(f || null);
  };

  // preview helper
  const isImageUrl = (u) => {
    if (!u) return false;
    return /\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i.test(u);
  };
  const isVideoUrl = (u) => {
    if (!u) return false;
    return (
      /\.(mp4|webm|ogg|mov|m3u8|mpd)(\?.*)?$/i.test(u) ||
      /youtube\.com|youtu\.be|vimeo\.com/.test(u)
    );
  };

  // normalize internal path: ensure it starts with '/'
  const normalizeInternalPath = (p) => {
    if (!p) return "";
    const trimmed = String(p).trim();
    if (!trimmed) return "";
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      alert("Title required.");
      return;
    }

    setSaving(true);

    try {
      // If uploading a file, do that first so we have url/fullPath
      let mediaPayload = { ...form.media }; // start with whatever user set

      if (fileToUpload && form.media.source === "upload") {
        // If replacing an existing uploaded file, delete old one (best-effort)
        try {
          if (mediaPayload.fullPath) {
            await deleteMedia(mediaPayload.fullPath).catch((e) => {
              // non-fatal, log and continue
              console.warn("delete old media failed (non-fatal):", e);
            });
          }
        } catch (err) {
          console.warn("delete old media error (ignored):", err);
        }

        // upload to storage under `popups/`
        try {
          const result = await uploadMedia(fileToUpload, `popups`);
          // result: { success: true, url, fullPath }
          mediaPayload = {
            type: isImageUrl(result.url)
              ? "image"
              : isVideoUrl(result.url)
              ? "video"
              : "image",
            source: "upload",
            url: result.url,
            fullPath: result.fullPath || null,
          };
        } catch (err) {
          console.error("uploadMedia failed:", err);
          alert("Upload failed — see console.");
          setSaving(false);
          return;
        }
      } else if (form.media.source === "external") {
        // ensure url is set
        if (!form.media.url || !String(form.media.url).trim()) {
          alert("External media URL required for external media source.");
          setSaving(false);
          return;
        }
        mediaPayload = {
          type: isImageUrl(form.media.url)
            ? "image"
            : isVideoUrl(form.media.url)
            ? "video"
            : "image",
          source: "external",
          url: form.media.url,
          fullPath: null,
        };
      } else if (form.media.source === "none") {
        // If user requested to remove media and editing had old uploaded fullPath, delete it
        if (editing && editing.media && editing.media.fullPath) {
          try {
            await deleteMedia(editing.media.fullPath).catch((e) =>
              console.warn("delete old media (on remove) failed:", e)
            );
          } catch (e) {
            console.warn("delete media error:", e);
          }
        }
        mediaPayload = { type: null, source: "none", url: "", fullPath: null };
      }

      // Build payload with both structured fields and legacy top-level compatibility keys
      // IMPORTANT: internal links are stored as root-paths (start with '/'), not as campaignId field
      let finalUrl = null;
      if (form.link && form.link.type === "internal") {
        finalUrl = normalizeInternalPath(form.link.url);
      } else if (form.link && form.link.type === "external") {
        finalUrl = form.link.url || null;
      } else {
        finalUrl = null;
      }

      const payload = {
        title: form.title.trim(),
        message: form.message || "",
        active: !!form.active,
        link: form.link || { type: "none", url: "" },
        media: mediaPayload,
        // legacy top-level fields for backward compatibility:
        imageUrl:
          mediaPayload && mediaPayload.type === "image"
            ? mediaPayload.url
            : (editing && editing.imageUrl) || null,
        videoUrl:
          mediaPayload && mediaPayload.type === "video"
            ? mediaPayload.url
            : (editing && editing.videoUrl) || null,
        // store route or external url in `url` (internal paths will start with '/')
        url: finalUrl,
        // NOTE: we intentionally do NOT write campaignId from the internal input — internal is a root path only
        campaignId: editing && editing.campaignId ? editing.campaignId : null,
        primaryLabel: form.primaryLabel || (editing && editing.primaryLabel) || null,
        showOnce: !!form.showOnce,
        updatedAt: serverTimestamp(),
      };

      if (editing && editing.id) {
        await updateDoc(doc(db, "popups", editing.id), payload);
      } else {
        // createdAt timestamp for new doc
        await addDoc(collection(db, "popups"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }

      await fetchPopups();
      setModalOpen(false);
    } catch (err) {
      console.error("save popup:", err);
      alert("Save failed — check console.");
    } finally {
      setFileToUpload(null);
      setSaving(false);
    }
  };

  const handleDelete = async (p) => {
    if (!window.confirm("Delete popup? This cannot be undone.")) return;
    try {
      // delete any uploaded media (best-effort)
      if (p.media && p.media.fullPath) {
        try {
          await deleteMedia(p.media.fullPath);
        } catch (e) {
          console.warn("deleteMedia on popup delete failed (non-fatal):", e);
        }
      }

      await deleteDoc(doc(db, "popups", p.id));
      setPopups((s) => s.filter((x) => x.id !== p.id));
    } catch (err) {
      console.error("delete popup:", err);
      alert("Delete failed — check console.");
    }
  };

  const handleToggleActive = async (p) => {
    try {
      await updateDoc(doc(db, "popups", p.id), {
        active: !p.active,
        updatedAt: serverTimestamp(),
      });
      setPopups((s) =>
        s.map((x) => (x.id === p.id ? { ...x, active: !x.active } : x))
      );
    } catch (err) {
      console.error("toggle active:", err);
      alert("Could not update popup status.");
    }
  };

  // UI helpers for link preview
  const renderLinkPreview = (link, p) => {
    if (!link || link.type === "none" || !link.url) return null;
    if (link.type === "external") {
      return (
        <a href={link.url} target="_blank" rel="noreferrer" className="link">
          Open external link
        </a>
      );
    }
    // internal: show as root path
    return (
      <a
        href={link.url}
        onClick={(e) => e.stopPropagation()}
        className="link"
      >
        Internal path: {link.url}
      </a>
    );
  };

  return (
    <div>
      <header className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Popups</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn-outline"
            onClick={fetchPopups}
            aria-label="Refresh popups"
          >
            Refresh
          </button>
          <button className="btn-primary" onClick={openCreate}>
            New Popup
          </button>
        </div>
      </header>

      {loading ? (
        <div className="muted">Loading popups…</div>
      ) : popups.length === 0 ? (
        <div className="text-gray-500">No popups</div>
      ) : (
        <div className="space-y-3">
          {popups.map((p) => (
            <div
              key={p.id}
              className="bg-white rounded p-3 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"
            >
              <div style={{ flex: 1 }}>
                <div className="font-medium">{p.title}</div>
                <div
                  className="text-sm text-gray-500"
                  style={{ marginTop: 6 }}
                >
                  {p.message}
                </div>

                {/* Link / redirect preview */}
                <div
                  style={{ marginTop: 8 }}
                  className="text-xs text-gray-500"
                >
                  Redirect:{" "}
                  {p.link?.type === "none" ? "None" : p.link?.type}
                  {p.link?.url ? (
                    <>
                      {" "}
                      — {renderLinkPreview(p.link, p)}
                    </>
                  ) : p.url ? (
                    <>
                      {" "}
                      —{" "}
                      {String(p.url).startsWith("/") ? (
                        <>
                          Internal path: <code>{p.url}</code>
                        </>
                      ) : (
                        <>
                          External:{" "}
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {p.url}
                          </a>
                        </>
                      )}
                    </>
                  ) : null}
                  {p.primaryLabel ? (
                    <>
                      <br />
                      CTA label: <strong>{p.primaryLabel}</strong>
                    </>
                  ) : null}
                  {p.showOnce ? (
                    <>
                      <br />
                      <small className="muted">
                        (Shown once per session)
                      </small>
                    </>
                  ) : null}
                </div>

                {/* Media preview */}
                {p.media?.url ? (
                  <div style={{ marginTop: 8 }}>
                    {p.media.type === "image" || isImageUrl(p.media.url) ? (
                      <img
                        src={p.media.url}
                        alt={p.title}
                        style={{
                          maxWidth: 220,
                          maxHeight: 140,
                          objectFit: "cover",
                          borderRadius: 6,
                        }}
                      />
                    ) : (
                      <video
                        src={p.media.url}
                        controls
                        style={{ maxWidth: 300, maxHeight: 180 }}
                      />
                    )}
                  </div>
                ) : null}

                <div
                  style={{ marginTop: 8 }}
                  className="text-xs text-gray-500"
                >
                  Status: {p.active ? "Active" : "Inactive"}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginTop: 6,
                  flexWrap: "wrap",
                }}
              >
                <button
                  className="btn small-btn"
                  onClick={() => openEdit(p)}
                >
                  Edit
                </button>
                <button
                  className="btn small-btn"
                  onClick={() => handleToggleActive(p)}
                >
                  {p.active ? "Disable" : "Enable"}
                </button>
                <button
                  className="btn small-btn delete-btn"
                  onClick={() => handleDelete(p)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        title={editing ? "Edit popup" : "New popup"}
        onClose={() => setModalOpen(false)}
      >
        {/* 🔽 SCROLLABLE WRAPPER FOR THE FORM */}
        <div
          style={{
            maxHeight: "70vh",
            overflowY: "auto",
            paddingRight: 4,
          }}
        >
          <div style={{ display: "grid", gap: 8 }}>
            <label className="text-sm font-medium">Title</label>
            <input
              value={form.title}
              onChange={(e) =>
                setForm((s) => ({ ...s, title: e.target.value }))
              }
              placeholder="Popup title"
              className="admin-input"
            />

            <label className="text-sm font-medium">Message</label>
            <textarea
              value={form.message}
              onChange={(e) =>
                setForm((s) => ({ ...s, message: e.target.value }))
              }
              rows={4}
              placeholder="Short message to show in popup"
              className="admin-input"
            />

            <label
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) =>
                  setForm((s) => ({ ...s, active: e.target.checked }))
                }
              />{" "}
              Active
            </label>

            {/* NEW: showOnce + primaryLabel */}
            <label
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <input
                type="checkbox"
                checked={form.showOnce}
                onChange={(e) =>
                  setForm((s) => ({ ...s, showOnce: e.target.checked }))
                }
              />{" "}
              Show once per session
            </label>

            <label className="text-sm font-medium">
              Primary CTA label (optional)
            </label>
            <input
              value={form.primaryLabel}
              onChange={(e) =>
                setForm((s) => ({ ...s, primaryLabel: e.target.value }))
              }
              placeholder='e.g. "Open" or "Read more"'
              className="admin-input"
            />

            {/* Redirect / link options */}
            <div style={{ marginTop: 8 }}>
              <div className="text-sm font-medium">Redirect / Target</div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginTop: 6,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <label>
                  <input
                    type="radio"
                    name="linkType"
                    checked={form.link.type === "none"}
                    onChange={() =>
                      setForm((s) => ({
                        ...s,
                        link: { type: "none", url: "" },
                      }))
                    }
                  />{" "}
                  No redirect
                </label>
                <label>
                  <input
                    type="radio"
                    name="linkType"
                    checked={form.link.type === "internal"}
                    onChange={() =>
                      setForm((s) => ({
                        ...s,
                        link: { type: "internal", url: "" },
                      }))
                    }
                  />{" "}
                  Internal path (root)
                </label>
                <label>
                  <input
                    type="radio"
                    name="linkType"
                    checked={form.link.type === "external"}
                    onChange={() =>
                      setForm((s) => ({
                        ...s,
                        link: { type: "external", url: "" },
                      }))
                    }
                  />{" "}
                  External URL
                </label>
              </div>

              {form.link.type !== "none" && (
                <input
                  value={form.link.url}
                  onChange={(e) =>
                    setForm((s) => ({
                      ...s,
                      link: { ...s.link, url: e.target.value },
                    }))
                  }
                  placeholder={
                    form.link.type === "internal"
                      ? "/some/path (root)"
                      : "https://example.com"
                  }
                  className="admin-input"
                  style={{ marginTop: 8 }}
                />
              )}
              {form.link.type === "internal" && (
                <div
                  style={{ marginTop: 6 }}
                  className="text-xs muted"
                >
                  Internal path must be a root path (e.g.{" "}
                  <code>/campaign/abc123</code> or <code>/events</code>).
                </div>
              )}
            </div>

            {/* Media section */}
            <div style={{ marginTop: 8 }}>
              <div className="text-sm font-medium">Media (optional)</div>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginTop: 6,
                  flexWrap: "wrap",
                }}
              >
                <label>
                  <input
                    type="radio"
                    name="mediaSource"
                    checked={form.media.source === "none"}
                    onChange={() =>
                      setForm((s) => ({
                        ...s,
                        media: {
                          type: null,
                          source: "none",
                          url: "",
                          fullPath: null,
                        },
                      }))
                    }
                  />{" "}
                  None
                </label>

                <label>
                  <input
                    type="radio"
                    name="mediaSource"
                    checked={form.media.source === "external"}
                    onChange={() =>
                      setForm((s) => ({
                        ...s,
                        media: {
                          type: s.media.type || "image",
                          source: "external",
                          url: "",
                          fullPath: null,
                        },
                      }))
                    }
                  />{" "}
                  External URL
                </label>

                <label>
                  <input
                    type="radio"
                    name="mediaSource"
                    checked={form.media.source === "upload"}
                    onChange={() =>
                      setForm((s) => ({
                        ...s,
                        media: {
                          type: s.media.type || "image",
                          source: "upload",
                          url: "",
                          fullPath: null,
                        },
                      }))
                    }
                  />{" "}
                  Upload
                </label>
              </div>

              {/* External URL input */}
              {form.media.source === "external" && (
                <>
                  <input
                    value={form.media.url}
                    onChange={(e) =>
                      setForm((s) => ({
                        ...s,
                        media: { ...s.media, url: e.target.value },
                      }))
                    }
                    placeholder="https://example.com/image.jpg or video.mp4"
                    className="admin-input"
                    style={{ marginTop: 8 }}
                  />
                  <div style={{ marginTop: 8 }}>
                    <small className="muted">
                      Detected type:{" "}
                      {isImageUrl(form.media.url)
                        ? "image"
                        : isVideoUrl(form.media.url)
                        ? "video"
                        : "unknown"}
                    </small>
                  </div>
                </>
              )}

              {/* Upload input */}
              {form.media.source === "upload" && (
                <>
                  <div
                    style={{
                      marginTop: 8,
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*,video/*"
                      onChange={handleFileChange}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        className="btn"
                        onClick={() => {
                          // if user wants to clear selected file
                          setFileToUpload(null);
                          if (fileRef.current) fileRef.current.value = "";
                        }}
                        type="button"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  {fileToUpload && (
                    <div style={{ marginTop: 8 }}>
                      <div className="muted small">
                        Selected: {fileToUpload.name} —{" "}
                        {Math.round(fileToUpload.size / 1024)} KB
                      </div>
                    </div>
                  )}
                  <div style={{ marginTop: 8 }}>
                    <small className="muted">
                      When you save, the file will be uploaded to internal
                      storage and the popup will reference it.
                    </small>
                  </div>
                </>
              )}

              {/* current media preview (editing existing) */}
              {editing &&
                editing.media &&
                editing.media.url &&
                form.media.source !== "upload" && (
                  <div style={{ marginTop: 8 }}>
                    <div className="muted small">Existing media:</div>
                    {editing.media.type === "image" ||
                    isImageUrl(editing.media.url) ? (
                      <img
                        src={editing.media.url}
                        alt="existing"
                        style={{
                          maxWidth: 220,
                          maxHeight: 140,
                          objectFit: "cover",
                          borderRadius: 6,
                        }}
                      />
                    ) : (
                      <video
                        src={editing.media.url}
                        controls
                        style={{ maxWidth: 300, maxHeight: 180 }}
                      />
                    )}
                    <div style={{ marginTop: 6 }}>
                      <button
                        className="btn small-btn"
                        onClick={() => {
                          // mark removal: set source none and clear fileToUpload
                          setForm((s) => ({
                            ...s,
                            media: {
                              type: null,
                              source: "none",
                              url: "",
                              fullPath: null,
                            },
                          }));
                          setFileToUpload(null);
                        }}
                        type="button"
                      >
                        Remove media
                      </button>
                    </div>
                  </div>
                )}
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
                marginTop: 8,
              }}
            >
              <button
                className="btn-outline"
                onClick={() => setModalOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleSave}
                disabled={saving}
                type="button"
              >
                {saving
                  ? "Saving…"
                  : editing
                  ? "Save changes"
                  : "Create popup"}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
