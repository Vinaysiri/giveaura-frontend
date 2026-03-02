// src/pages/admin/Events.jsx
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
  Timestamp,
} from "firebase/firestore";
import { db } from "../../firebase";
// NOTE: updated path to match your admin components folder
import Modal from "./admincomponents/Modal.jsx";

// reuse centralized upload helper
import { uploadMedia } from "../../services/firestoreService";

export default function Events() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const emptyForm = {
  title: "",
  description: "",
  location: "",
  eventDate: "",

  imageUrl: "",
  imageFile: null,
  imageUrlInput: "",

  videoUrl: "",
  videoFile: null,
  videoUrlInput: "",

  // BOOKING
  bookingEnabled: false,
  ticketType: "free",
  ticketPrice: 0,
  totalSeats: 50,
};

  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // upload states
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // local preview url (object URL) - revoke when changed
  const previewUrlRef = useRef(null);

  const parseDate = (v) => {
    if (v === null || typeof v === "undefined") return null;
    try {
      if (v?.toDate && typeof v.toDate === "function") return v.toDate();
      if (typeof v === "object" && typeof v.seconds === "number") return new Date(v.seconds * 1000);
      if (v instanceof Date) return v;
      if (typeof v === "number") return v > 1e12 ? new Date(v) : new Date(v * 1000);
      if (typeof v === "string") {
        const d = new Date(v);
        return isNaN(d.getTime()) ? null : d;
      }
    } catch {}
    return null;
  };

  const normalizeEventDoc = (docSnap) => {
    const data = docSnap.data ? docSnap.data() : docSnap || {};
    const startRaw = data.eventDate ?? data.startAt ?? data.startDate ?? data.startTimestamp ?? data.start ?? data.createdAt ?? null;
    const startAt = parseDate(startRaw);
    return {
  id: docSnap.id,
  title: data.title || "",
  description: data.description || "",
  location: data.location || "",
  imageUrl: data.imageUrl || "",
  videoUrl: data.videoUrl || "",
  eventDate: startAt,

  bookingEnabled: !!data.bookingEnabled,
  ticketType: data.ticketType || "free",
  ticketPrice: Number(data.ticketPrice || 0),
  totalSeats: Number(data.totalSeats || 0),
  seatsSold: Number(data.seatsSold || 0),

  revenue: Number(data.revenue || 0),
  active: data.active !== false,

  createdAt: data.createdAt ?? null,
};
  };

  const formatDateForInput = (d) => {
    if (!d) return "";
    try {
      const dt = d instanceof Date ? d : (d.toDate ? d.toDate() : new Date(d));
      const iso = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString();
      return iso.slice(0, 16);
    } catch {
      return "";
    }
  };

  // small url tester (same logic as public page)
  const isUrl = (value) => {
    if (!value || typeof value !== "string") return false;
    const trimmed = value.trim();
    if (/^https?:\/\//i.test(trimmed)) return true;
    if (/^www\./i.test(trimmed) && /\.[a-z]{2,}/i.test(trimmed)) return true;
    if (/maps\.google\.com|goo\.gl\/maps|google\.com\/maps/i.test(trimmed)) return true;
    try {
      const test = /^([a-z0-9-]+\.)+[a-z]{2,}/i.test(trimmed) ? `https://${trimmed}` : trimmed;
      new URL(test);
      return true;
    } catch (e) {
      return false;
    }
  };

  const fetchEvents = async () => {
    setLoading(true);
    try {
      // try ordering by eventDate if present, fallback to createdAt
      let q;
      try {
        q = query(collection(db, "events"), orderBy("eventDate", "desc"));
      } catch {
        q = query(collection(db, "events"), orderBy("createdAt", "desc"));
      }
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => normalizeEventDoc(d));
      setEvents(list);
    } catch (err) {
      console.error("fetchEvents", err);
      alert("Could not load events — see console.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
    return () => {
      // revoke any leftover preview object URL on unmount
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetFormState = () => setForm(emptyForm);

  const openCreate = () => {
    setEditing(null);
    resetFormState();
    setModalOpen(true);
  };

  const openEdit = (e) => {
    setEditing(e);
    setForm({
  title: e.title,
  description: e.description,
  location: e.location,
  eventDate: formatDateForInput(e.eventDate),

  imageUrl: e.imageUrl,
  imageFile: null,
  imageUrlInput: e.imageUrl,

  videoUrl: e.videoUrl,
  videoFile: null,
  videoUrlInput: e.videoUrl,

  bookingEnabled: e.bookingEnabled,
  ticketType: e.ticketType,
  ticketPrice: e.ticketPrice,
  totalSeats: e.totalSeats,
});

    setModalOpen(true);
  };

  const uploadFileViaService = async (file, folder = "events") => {
    if (!file) return null;
    try {
      setUploading(true);
      setUploadProgress(5);
      const res = await uploadMedia(file, `${folder}`);
      setUploadProgress(90);
      setTimeout(() => setUploadProgress(100), 150);
      return res && res.url ? res.url : null;
    } catch (err) {
      console.error("uploadMedia failed:", err);
      throw err;
    } finally {
      setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
      }, 500);
    }
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      alert("Title is required.");
      return;
    }

    setSaving(true);
    try {
      let uploadedImageUrl = form.imageUrl || "";
      let uploadedVideoUrl = form.videoUrl || "";

      if (form.imageFile) {
        uploadedImageUrl = await uploadFileViaService(form.imageFile, "events/images");
      } else if (form.imageUrlInput && !form.imageUrl) {
        uploadedImageUrl = form.imageUrlInput.trim();
      }

      if (form.videoFile) {
        uploadedVideoUrl = await uploadFileViaService(form.videoFile, "events/videos");
      } else if (form.videoUrlInput && !form.videoUrl) {
        uploadedVideoUrl = form.videoUrlInput.trim();
      }

      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        location: form.location.trim(),

        imageUrl: uploadedImageUrl || "",
        videoUrl: uploadedVideoUrl || "",

        bookingEnabled: form.bookingEnabled,
        ticketType: form.ticketType,
        ticketPrice: Number(form.ticketPrice || 0),
        totalSeats: Number(form.totalSeats || 0),

        seatsSold: editing ? editing.seatsSold : 0,
        revenue: editing ? editing.revenue : 0,
        currency: "INR",

        active: true,
        updatedAt: serverTimestamp(),
      };


      if (form.eventDate) {
        const dt = new Date(form.eventDate);
        const ts = Timestamp.fromDate(dt);
        payload.eventDate = ts; 
        payload.startAt = ts;   
      } else {
        payload.eventDate = null;
        payload.startAt = null;
      }

      if (editing && editing.id) {
        await updateDoc(doc(db, "events", editing.id), payload);
      } else {
        await addDoc(collection(db, "events"), { ...payload, createdAt: serverTimestamp() });
      }

      // small debug log so you can confirm fields in console
      console.info("Saved event (admin):", { title: payload.title, eventDate: payload.eventDate, startAt: payload.startAt });

      await fetchEvents();
      setModalOpen(false);
    } catch (err) {
      console.error("save event:", err);
      alert("Save failed — check console.");
    } finally {
      setSaving(false);
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDelete = async (e) => {
    if (!window.confirm("Delete event? This is irreversible.")) return;
    try {
      await deleteDoc(doc(db, "events", e.id));
      setEvents((s) => s.filter((x) => x.id !== e.id));
      if (editing && editing.id === e.id) {
        setEditing(null);
        setModalOpen(false);
      }
    } catch (err) {
      console.error("delete event:", err);
      alert("Delete failed — check console.");
    }
  };

  const onImageFileChange = (file) => {
    if (previewUrlRef.current) {
      try { URL.revokeObjectURL(previewUrlRef.current); } catch {}
      previewUrlRef.current = null;
    }
    if (file) {
      previewUrlRef.current = URL.createObjectURL(file);
    }
    setForm((s) => ({ ...s, imageFile: file, imageUrlInput: "", imageUrl: "" }));
  };
  const onVideoFileChange = (file) => {
    if (previewUrlRef.current) {
      try { URL.revokeObjectURL(previewUrlRef.current); } catch {}
      previewUrlRef.current = null;
    }
    if (file) {
      previewUrlRef.current = URL.createObjectURL(file);
    }
    setForm((s) => ({ ...s, videoFile: file, videoUrlInput: "", videoUrl: "" }));
  };

  const renderMediaPreview = () => {
    if (form.imageFile && previewUrlRef.current) {
      return <img src={previewUrlRef.current} alt="image preview" style={{ maxWidth: "100%", borderRadius: 8 }} />;
    }
    if (form.videoFile && previewUrlRef.current) {
      return <video src={previewUrlRef.current} controls style={{ maxWidth: "100%", borderRadius: 8 }} />;
    }
    const url = form.imageUrlInput || form.imageUrl;
    if (url) {
      return (
        <img
          src={url}
          alt="image preview"
          style={{ maxWidth: "100%", borderRadius: 8 }}
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      );
    }
    const vurl = form.videoUrlInput || form.videoUrl;
    if (vurl) {
      return (
        <video
          src={vurl}
          controls
          style={{ maxWidth: "100%", borderRadius: 8 }}
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      );
    }
    return null;
  };

  return (
    <div>
      <header className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Events</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-outline" onClick={fetchEvents}>
            Refresh
          </button>
          <button className="btn-primary" onClick={openCreate}>
            Create Event
          </button>
        </div>
      </header>

      {loading ? (
        <div className="muted">Loading events…</div>
      ) : events.length === 0 ? (
        <div className="text-gray-500">No events</div>
      ) : (
        <div className="space-y-3">
          {events.map((ev) => {
            const evDate = ev.eventDate instanceof Date ? ev.eventDate : parseDate(ev.eventDate);
            const loc = ev.location;
            const locIsUrl = isUrl(loc);

            return (
              <div
                key={ev.id}
                className="bg-white rounded p-3 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"
              >
                <div style={{ flex: 1, display: "flex", gap: 12 }}>
                  <div style={{ width: 96, minWidth: 96 }}>
                    {ev.imageUrl ? (
                      <img src={ev.imageUrl} alt={ev.title} style={{ width: "100%", height: 64, objectFit: "cover", borderRadius: 8 }} />
                    ) : ev.videoUrl ? (
                      <video src={ev.videoUrl} style={{ width: "100%", height: 64, objectFit: "cover", borderRadius: 8 }} />
                    ) : (
                      <div style={{ width: "100%", height: 64, background: "#f3f4f6", borderRadius: 8 }} />
                    )}
                  </div>

                  <div>
                    <div className="font-medium">{ev.title || "(no title)"}</div>
                    <div className="text-sm text-gray-500" style={{ marginTop: 6 }}>
                      {ev.description?.slice(0, 120)}
                    </div>
                    <div style={{ marginTop: 8 }} className="text-xs text-gray-500">
                      {loc ? (
                        locIsUrl ? (
                          <span>Location: <a className="link" href={loc} target="_blank" rel="noreferrer">Open map</a></span>
                        ) : (
                          <span>Location: {loc} • </span>
                        )
                      ) : null}
                      {evDate ? `When: ${evDate.toLocaleString()}` : "Date: not set"}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <button className="btn small-btn" onClick={() => openEdit(ev)}>
                    Manage
                  </button>
                  <button className="btn small-btn delete-btn" onClick={() => handleDelete(ev)}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal wrapper - form inside a scrollable container */}
      <Modal open={modalOpen} title={editing ? "Edit event" : "Create event"} onClose={() => setModalOpen(false)}>
        {/* scrollable body: maxHeight ensures the modal header/footer remain visible on small screens */}
        <div
          style={{
            display: "grid",
            gap: 8,
            maxHeight: "60vh",
            overflowY: "auto",
            paddingRight: 8,
            boxSizing: "border-box",
            // keep some bottom padding so last inputs/buttons aren't flushed to the edge
            paddingBottom: 12,
          }}
        >
          <label className="text-sm font-medium">Title</label>
          <input
            className="admin-input"
            value={form.title}
            onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
            placeholder="Event title"
          />

          <label className="text-sm font-medium">Description</label>
          <textarea
            className="admin-input"
            rows={4}
            value={form.description}
            onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
            placeholder="Short description"
          />

          <label className="text-sm font-medium">Location (address or map link)</label>
          <input className="admin-input" value={form.location} onChange={(e) => setForm((s) => ({ ...s, location: e.target.value }))} placeholder="Address or URL (https://...)" />

          <label className="text-sm font-medium">Date & time</label>
          <input
            className="admin-input"
            type="datetime-local"
            value={form.eventDate}
            onChange={(e) => setForm((s) => ({ ...s, eventDate: e.target.value }))}
          />

          <hr />

<label className="text-sm font-medium">
  Enable Ticket Booking
</label>
<input
  type="checkbox"
  checked={form.bookingEnabled}
  onChange={(e) =>
    setForm((s) => ({ ...s, bookingEnabled: e.target.checked }))
  }
/>

{form.bookingEnabled && (
  <>
    <label className="text-sm font-medium">Ticket Type</label>
    <select
      className="admin-input"
      value={form.ticketType}
      onChange={(e) =>
        setForm((s) => ({
          ...s,
          ticketType: e.target.value,
          ticketPrice: e.target.value === "free" ? 0 : s.ticketPrice,
        }))
      }
    >
      <option value="free">Free</option>
      <option value="paid">Paid</option>
    </select>

    {form.ticketType === "paid" && (
      <>
        <label className="text-sm font-medium">Ticket Price (₹)</label>
        <input
          type="number"
          className="admin-input"
          value={form.ticketPrice}
          onChange={(e) =>
            setForm((s) => ({
              ...s,
              ticketPrice: Number(e.target.value),
            }))
          }
        />
      </>
    )}

    <label className="text-sm font-medium">Total Seats</label>
    <input
      type="number"
      className="admin-input"
      value={form.totalSeats}
      onChange={(e) =>
        setForm((s) => ({
          ...s,
          totalSeats: Number(e.target.value),
        }))
      }
    />
  </>
)}


          <hr />

          <div>
            <div className="text-sm font-medium">Image (optional)</div>
            <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="text"
                placeholder="Paste image URL"
                className="admin-input"
                value={form.imageUrlInput}
                onChange={(e) => setForm((s) => ({ ...s, imageUrlInput: e.target.value, imageFile: null }))}
                style={{ flex: 1 }}
              />
              <label className="btn-outline small" style={{ cursor: "pointer", padding: "8px 10px" }}>
                Upload
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(evt) => {
                    const f = evt.target.files && evt.target.files[0];
                    if (f) onImageFileChange(f);
                  }}
                />
              </label>
            </div>
            <div style={{ marginTop: 8 }}>{renderMediaPreview()}</div>
          </div>

          <hr />

          <div>
            <div className="text-sm font-medium">Video (optional)</div>
            <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="text"
                placeholder="Paste video URL (mp4, webm...)"
                className="admin-input"
                value={form.videoUrlInput}
                onChange={(e) => setForm((s) => ({ ...s, videoUrlInput: e.target.value, videoFile: null }))}
                style={{ flex: 1 }}
              />
              <label className="btn-outline small" style={{ cursor: "pointer", padding: "8px 10px" }}>
                Upload
                <input
                  type="file"
                  accept="video/*"
                  style={{ display: "none" }}
                  onChange={(evt) => {
                    const f = evt.target.files && evt.target.files[0];
                    if (f) onVideoFileChange(f);
                  }}
                />
              </label>
            </div>
            <div style={{ marginTop: 8 }}>{renderMediaPreview()}</div>
          </div>

          {uploading && (
            <div style={{ marginTop: 6 }}>
              <div className="muted">Uploading: {uploadProgress}%</div>
              <progress value={uploadProgress} max="100" style={{ width: "100%" }} />
            </div>
          )}

          {/* Footer actions: keep outside the scroll if you prefer them fixed.
              Here we render them after the scrollable area so they'll scroll into view
              if the user scrolls to the bottom. If you want them fixed, move them out
              of the scroll container and style Modal to show them separately. */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button className="btn-outline" onClick={() => setModalOpen(false)} disabled={saving || uploading}>
              Cancel
            </button>
            <button className="btn-primary" onClick={handleSave} disabled={saving || uploading}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
