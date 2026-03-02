// src/pages/Events.jsx
import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import {
  collection,
  query,
  orderBy,
  getDocs,
  doc,
  getDoc,
  where,
  addDoc,
  updateDoc,
  increment,
  serverTimestamp,
} from "firebase/firestore";
import { useNavigate, useParams } from "react-router-dom";
import "../styles/events.css";

export default function Events() {
  const [events, setEvents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();
  const { id: routeEventId } = useParams();
  const RAZORPAY_KEY = import.meta.env.VITE_RAZORPAY_KEY_ID;
  const API_BASE =
  import.meta.env.VITE_PAYMENT_API_BASE_URL?.replace(/\/$/, "");


  // Booking modal state
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingEvent, setBookingEvent] = useState(null);
  const [bookingForm, setBookingForm] = useState({ name: "", email: "", seats: 1 });
  const [bookingSubmitting, setBookingSubmitting] = useState(false);

  // ------------------ helpers ------------------
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

  const extractTotalRaised = (data = {}) => {
    const candidates = [
      data.totalRaised, data.total_raised, data.raised, data.amountRaised, data.amount_raised,
      data.collected, data.collectedAmount, data.donationsTotal, data.donations_total,
      data.collected_amount, data.totalAmount, data.total_amount,
    ];
    for (const c of candidates) {
      if (typeof c === "number" && !Number.isNaN(c)) return c;
      if (typeof c === "string" && c.trim() !== "") {
        const parsed = Number(c.replace(/[^0-9.-]+/g, ""));
        if (!Number.isNaN(parsed)) return parsed;
      }
      if (typeof c === "object" && c !== null) {
        const maybe = c._value ?? c.value ?? c.amount ?? c;
        if (typeof maybe === "number" && !Number.isNaN(maybe)) return maybe;
      }
    }
    const donations = Array.isArray(data.donations) ? data.donations : Array.isArray(data.donationItems) ? data.donationItems : null;
    if (Array.isArray(donations)) {
      let sum = 0;
      for (const d of donations) {
        if (typeof d === "number") sum += d;
        else if (typeof d === "string") {
          const p = Number(d.replace(/[^0-9.-]+/g, ""));
          if (!Number.isNaN(p)) sum += p;
        } else if (typeof d === "object" && d !== null) {
          const amount = d.amount ?? d.value ?? d._value ?? d;
          if (typeof amount === "number") sum += amount;
          else if (typeof amount === "string") {
            const p = Number(amount.replace(/[^0-9.-]+/g, ""));
            if (!Number.isNaN(p)) sum += p;
          }
        }
      }
      if (sum > 0) return sum;
    }
    return 0;
  };

  const normalizeEventDoc = (docSnap) => {
    const data = docSnap.data ? docSnap.data() : docSnap || {};
    
    const startRaw = data.eventDate ?? data.startAt ?? data.startDate ?? data.startDateTime ?? data.startTimestamp ?? data.start ?? data.createdAt ?? null;
    const endRaw = data.endAt ?? data.endDate ?? data.endTimestamp ?? data.end ?? null;
    const startAt = parseDate(startRaw);
    const endAt = parseDate(endRaw);

    const imagesFromArray = Array.isArray(data.images) ? data.images.slice() : Array.isArray(data.photos) ? data.photos.slice() : [];
    const videosFromArray = Array.isArray(data.videos) ? data.videos.slice() : Array.isArray(data.videoUrls) ? data.videoUrls.slice() : [];

    
    const singleImage = data.imageUrl ?? data.image ?? data.coverImage ?? data.photo ?? null;
    const singleVideo = data.videoUrl ?? data.video ?? data.video_link ?? null;

    const images = imagesFromArray.length > 0 ? imagesFromArray : singleImage ? [singleImage] : [];
    const videos = videosFromArray.length > 0 ? videosFromArray : singleVideo ? [singleVideo] : [];

    const youtubeLiveUrl = data.youtubeLiveUrl ?? data.youtubeUrl ?? data.youtube ?? data.youtube_live_url ?? null;
    const fallbackTotal = extractTotalRaised(data);

    const locationRaw = data.location ?? data.mapLink ?? data.map_link ?? data.map_url ?? data.locationName ?? null;

    return {
      id: docSnap.id || data.id || null,
      title: data.title || "Untitled Event",
      description: data.description || "",
      startAt,
      endAt,
      images,
      videos,
      
      imageUrl: singleImage || null,
      videoUrl: singleVideo || null,
      youtubeLiveUrl,
      isLive: !!(data.isLive || data.live || data.is_live),
      raw: data,
      totalRaised: fallbackTotal,
      
      locationRaw,
    };
  };

  const sumDonationAmount = (don) => {
    if (!don) return 0;
    if (typeof don === "number") return don;
    if (typeof don === "string") {
      const p = Number(don.replace(/[^0-9.-]+/g, ""));
      return Number.isNaN(p) ? 0 : p;
    }
    if (typeof don === "object") {
      const a = don.amount ?? don.value ?? don._value ?? don.total ?? don;
      if (typeof a === "number") return a;
      if (typeof a === "string") {
        const p = Number(a.replace(/[^0-9.-]+/g, ""));
        return Number.isNaN(p) ? 0 : p;
      }
    }
    return 0;
  };

  const chunkArray = (arr, size = 10) => {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  
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

  // ------------------ load events, then ensure totals ------------------
  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      try {
        // 1) load events
        let snap;
        try {
          
          snap = await getDocs(query(collection(db, "events"), orderBy("eventDate", "desc")));
        } catch {
          try {
            snap = await getDocs(query(collection(db, "events"), orderBy("startAt", "desc")));
          } catch {
            snap = await getDocs(query(collection(db, "events"), orderBy("createdAt", "desc")));
          }
        }

        if (!mounted) return;
        let list = snap.docs.map((d) => normalizeEventDoc(d));

        
        list.sort((a, b) => {
          const ta = a.startAt ? a.startAt.getTime() : a.raw?.createdAt?.seconds ? a.raw.createdAt.seconds * 1000 : 0;
          const tb = b.startAt ? b.startAt.getTime() : b.raw?.createdAt?.seconds ? b.raw.createdAt.seconds * 1000 : 0;
          return tb - ta;
        });

        // 2) For each event try to get eventTotals/{id} doc. Fallback: event_allocations -> donations -> event.raw.platformFundsUsed -> fallback
        const eventIds = list.map((e) => e.id).filter(Boolean);
        const totalsMap = {};

        
        const idChunks = chunkArray(eventIds, 10);
        for (const chunk of idChunks) {
          const promises = chunk.map(async (id) => {
            try {
              const td = await getDoc(doc(db, "eventTotals", id));
              if (td.exists()) {
                const d = td.data();
                const val = typeof d.totalRaised === "number" ? d.totalRaised : Number(d.totalRaised) || 0;
                totalsMap[id] = val;
              }
            } catch (err) {
              console.warn("eventTotals getDoc failed for", id, err);
            }
          });
          await Promise.all(promises);
        }

        
        const idsNeedingAllocations = eventIds.filter((id) => typeof totalsMap[id] !== "number");
        const allocChunks = chunkArray(idsNeedingAllocations, 8);
        for (const chunk of allocChunks) {
          const promises = chunk.map(async (evId) => {
            try {
              const aQ = query(collection(db, "event_allocations"), where("eventId", "==", evId));
              const aSnap = await getDocs(aQ);
              if (!aSnap.empty) {
                let sum = 0;
                aSnap.forEach((d) => {
                  const ad = d.data();
                  const amt = Number(ad.amount || ad.allocatedAmount || 0);
                  if (!Number.isNaN(amt)) sum += amt;
                });
                if (sum > 0) {
                  totalsMap[evId] = (totalsMap[evId] || 0) + sum;
                }
              }
            } catch (err) {
              console.warn("event_allocations fetch failed for", evId, err);
            }
          });
          await Promise.all(promises);
        }

        
        const donationChunks = chunkArray(eventIds, 6);
        for (const chunk of donationChunks) {
          const promises = chunk.map(async (id) => {
            try {
              const tDoc = await getDoc(doc(db, "eventTotals", id));
              if (tDoc.exists()) return;
              const dQ = query(collection(db, "donations"), where("eventId", "==", id));
              const dSnap = await getDocs(dQ);
              let sum = 0;
              dSnap.forEach((d) => {
                const dt = d.data();
                const a = sumDonationAmount(dt.amount ?? dt.value ?? dt.total ?? dt.donationAmount ?? dt.donation_amount ?? dt);
                sum += a;
              });
              if (sum > 0) {
                totalsMap[id] = (totalsMap[id] || 0) + sum;
              } else {
                if (typeof totalsMap[id] !== "number") totalsMap[id] = undefined;
              }
            } catch (err) {
              console.warn("donations fallback fetch failed for", id, err);
              if (typeof totalsMap[id] !== "number") totalsMap[id] = undefined;
            }
          });
          await Promise.all(promises);
        }

        // 3) merge totals into list
        list = list.map((ev) => {
          const platformFundsUsed = Number(ev.raw?.platformFundsUsed || 0);
          let baseTotal;
          if (typeof totalsMap[ev.id] === "number") {
            baseTotal = totalsMap[ev.id] || 0;
            if (!baseTotal && platformFundsUsed) baseTotal = platformFundsUsed;
          } else {
            baseTotal = ev.totalRaised || platformFundsUsed || 0;
          }

          return {
            ...ev,
            totalRaised: baseTotal,
            donationsFetched: typeof totalsMap[ev.id] === "number",
            totalsSource: typeof totalsMap[ev.id] === "number" ? "eventTotals_or_allocations_or_donations" : "fallback",
          };
        });

        if (!mounted) return;
        setEvents(list);
        setLoading(false);

        
        if (routeEventId) {
          const found = list.find((x) => x.id === routeEventId);
          if (found) {
            setSelected(found);
            return;
          }
          try {
            const docRef = doc(db, "events", routeEventId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
              let ev = normalizeEventDoc(docSnap);

              try {
                const tDoc = await getDoc(doc(db, "eventTotals", routeEventId));
                if (tDoc.exists()) {
                  const tdata = tDoc.data();
                  const s = typeof tdata.totalRaised === "number" ? tdata.totalRaised : Number(tdata.totalRaised) || 0;
                  if (s > 0) {
                    ev.totalRaised = s;
                  }
                } else {
                  const allocQ = query(collection(db, "event_allocations"), where("eventId", "==", routeEventId));
                  const aSnap = await getDocs(allocQ);
                  let allocSum = 0;
                  if (!aSnap.empty) {
                    aSnap.forEach((d) => {
                      const a = d.data();
                      allocSum += Number(a.amount || a.allocatedAmount || 0) || 0;
                    });
                  }
                  const dQ = query(collection(db, "donations"), where("eventId", "==", routeEventId));
                  const dSnap = await getDocs(dQ);
                  const donationsSum = dSnap.docs.reduce((acc, d) => acc + sumDonationAmount(d.data()?.amount ?? d.data()?.value ?? d.data()), 0);
                  const platformFundsUsed = Number(ev.raw?.platformFundsUsed || 0);
                  const combined = (allocSum || 0) + (donationsSum || 0);
                  const s = combined || platformFundsUsed || ev.totalRaised || 0;
                  if (s > 0) {
                    ev.totalRaised = s;
                  }
                }
              } catch (err) {
                console.warn("route-eventTotals/donations/allocations fallback failed:", err);
              }

              setEvents((prev) => {
                if (!prev.some((p) => p.id === ev.id)) return [ev, ...prev];
                return prev;
              });
              setSelected(ev);
            } else {
              setSelected(null);
            }
          } catch (err) {
            console.warn("Failed to fetch event by id fallback:", err);
            setSelected(null);
          }
        }
      } catch (err) {
        console.warn("Failed to fetch events:", err);
        setLoading(false);
      }
    };

    load();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeEventId]);

  // ------------------ UI actions ------------------
  const openEvent = (ev) => {
    if (!ev) return;
    setSelected(ev);
    try { navigate(`/events/${ev.id}`, { replace: false }); } catch {}
  };

  const closeEvent = () => {
    setSelected(null);
    try { navigate("/events", { replace: false }); } catch {}
  };

  const formatDateTime = (d) => { if (!d) return "—"; try { return d.toLocaleString(); } catch { return String(d); } };

  // Booking actions (left as-is; your functions like submitBooking remain unchanged)
  const openBooking = (ev) => {
    setBookingEvent(ev);
    setBookingForm({ name: "", email: "", seats: 1 });
    setBookingOpen(true);
  };
  const closeBooking = () => {
    setBookingOpen(false);
    setBookingEvent(null);
    setBookingForm({ name: "", email: "", seats: 1 });
  };
  const showTempToast = (msg, type = "info", ms = 3000) => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), ms);
  };

  const startRazorpayPayment = async ({ bookingId, event, amount, seats }) => {
  if (!window.Razorpay) {
    showTempToast("Payment system not loaded", "error");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/payment/create-order`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    amount,
    purpose: "event",
    meta: {
      bookingId,
      eventId: event.id,
      seats,
    },
  }),
});

if (!res.ok) {
  const errText = await res.text();
  console.error("Create-order failed:", res.status, errText);
  throw new Error("Order creation failed");
}

const order = await res.json();

if (!order.success || !order.orderId) {
  console.error("Invalid order response:", order);
  throw new Error("Invalid order response");
}

    const options = {
      key:order.key ?? RAZORPAY_KEY,
      amount: order.amount,
      currency: "INR",
      name: "GiveAura Events",
      description: event.title,
      order_id: order.orderId,
      prefill: {
        name: bookingForm.name,
        email: bookingForm.email,
      },
      handler: async (response) => {
        const verify = await fetch(`${API_BASE}/api/payment/verify-signature`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bookingId,
            paymentId: response.razorpay_payment_id,
            orderId: response.razorpay_order_id,
            signature: response.razorpay_signature,
          }),

        });

        const result = await verify.json();

        if (result.valid === true) {
          await updateDoc(doc(db, "events", event.id), {
            seatsSold: increment(seats),
          });

          closeBooking();

          await updateDoc(doc(db, "event_bookings", bookingId), {
            status: "confirmed",
            isPaid: true,
            paymentId: response.razorpay_payment_id,
            paidAt: serverTimestamp(),
          });

          showTempToast("Payment successful 🎉", "success");
        } else {
          showTempToast("Payment verification failed", "error");
        }
      },
      theme: { color: "#7c3aed" },
    };

    const rzp = new window.Razorpay(options);
    rzp.open();
  } catch (err) {
    console.error("Razorpay error:", err);
    showTempToast("Payment failed to start", "error");
    
  }
};

  const submitBooking = async (e) => {
  e.preventDefault();
  if (!bookingEvent) return;

  if (!bookingForm.name || !bookingForm.email) {
    showTempToast("Name and email are required", "error");
    return;
  }

  const seatsRequested = Number(bookingForm.seats || 1);
  if (seatsRequested <= 0) {
    showTempToast("Invalid seat count", "error");
    return;
  }

  setBookingSubmitting(true);

  try {
    const eventRef = doc(db, "events", bookingEvent.id);
    const eventSnap = await getDoc(eventRef);

    if (!eventSnap.exists()) {
      showTempToast("Event no longer exists", "error");
      return;
    }

    const eventData = eventSnap.data();
    const isPaidEvent =
  eventData.isPaid === true ||
  eventData.ticketType === "paid" ||
  eventData.price > 0;

    const totalSeats = Number(
  eventData.capacity ?? eventData.totalSeats ?? 0
);

    const seatsSold = Number(eventData.seatsSold || 0);
    const remainingSeats = totalSeats > 0 ? totalSeats - seatsSold : Infinity;

    if (eventData.bookingEnabled && totalSeats > 0) {
      if (seatsRequested > remainingSeats) {
        showTempToast(
          `Only ${remainingSeats} seat(s) available`,
          "error"
        );
        return;
      }
    }

    if (!eventData.bookingEnabled) {
      showTempToast("Booking is disabled for this event", "error");
      return;
    }

    // 1️ Create booking record
    const bookingRef = await addDoc(collection(db, "event_bookings"), {
      eventId: bookingEvent.id,
      eventTitle: bookingEvent.title,
      name: bookingForm.name.trim(),
      email: bookingForm.email.trim().toLowerCase(),
      seats: seatsRequested,
      isPaid: isPaidEvent,
      pricePerSeat: Number(eventData.price || eventData.ticketPrice || 0),
      totalAmount: isPaidEvent
        ? seatsRequested * Number(eventData.price || 0)
        : 0,
      status: isPaidEvent ? "pending_payment" : "confirmed",
      createdAt: serverTimestamp(),
    });


    // 2️ Update seatsSold (only for free OR reserve for paid)
    

    

    if (isPaidEvent) {
  const totalAmount =
    seatsRequested * Number(eventData.price || 0);
    showTempToast("Redirecting to payment…", "info");


  await startRazorpayPayment({
    bookingId: bookingRef.id,
    event: bookingEvent,
    amount: totalAmount,
    seats: seatsRequested,
  });
} else {
  showTempToast("Booking confirmed successfully 🎉", "success");
  }

  if (!isPaidEvent) {
    closeBooking();
  }
  } catch (err) {
    console.error("Booking failed:", err);
    showTempToast("Booking failed. Try again.", "error");
  } finally {
    setBookingSubmitting(false);
  }
};


  // ------------------ render ------------------
  return (
    <div className="events-page">
      <div className="events-hero" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <h1>GIVEAURA Events</h1>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
          <div style={{ position: "sticky", top: 18, zIndex: 2000 }}>
            <div style={{ marginTop: 0, display: "flex", gap: 8 }}>
              <button className="btn primary" onClick={() => navigate("/")}>← Back to Home</button>
            </div>
          </div>
        </div>
      </div>

      <div className="events-grid" style={{ marginTop: 18 }}>
        {loading ? <div className="muted">Loading events...</div> : events.length === 0 ? <div className="muted">No events yet — check back later.</div> : events.map((ev) => {
          const now = new Date();
          const isUpcoming = ev.startAt && ev.startAt > now;
          const isLive = ev.isLive;
          const isPast = ev.endAt && ev.endAt < now;

          // decide how to render location: prefer ev.locationRaw if present, else ev.raw.mapLink
          const loc = ev.locationRaw ?? ev.raw?.mapLink ?? ev.raw?.map_link ?? ev.raw?.map_url ?? null;
          const showMapButton = isUrl(loc);

          // pick thumbnail: prefer images array -> imageUrl -> videoUrl -> default
          const thumb = (Array.isArray(ev.images) && ev.images.length > 0 && ev.images[0]) || ev.imageUrl || (Array.isArray(ev.videos) && ev.videos.length > 0 && ev.videos[0]) || ev.videoUrl || null;

          return (
            <article key={ev.id} className="event-card" onClick={() => openEvent(ev)} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") openEvent(ev); }}>
              <div className="event-media">
                {thumb ? (
                  // if it's a video URL we still use <img> for poster if it's an image; if it's a video url (ends with mp4) show video tag
                  (typeof thumb === "string" && /\.(mp4|webm|ogg)(\?|$)/i.test(thumb)) ? (
                    <video src={thumb} controls onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.style.display = "none"; }} />
                  ) : (
                    <img src={thumb} alt={ev.title} onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/default-event.png"; }} />
                  )
                ) : (
                  <div className="event-no-media">No image</div>
                )}
              </div>

              <div className="event-body">
                <h3 className="event-title">{ev.title}</h3>
                <div className="event-dates">
                  <span>{formatDateTime(ev.startAt)}</span><span>•</span><span>{ev.endAt ? formatDateTime(ev.endAt) : "TBA"}</span>
                </div>
                <p className="muted small event-desc">{ev.description?.slice(0, 140)}</p>

                <div className="event-meta">
                  <div className="event-tags">
                    {isLive && <span className="badge live">Live</span>}
                    {isUpcoming && <span className="badge upcoming">Upcoming</span>}
                    {isPast && <span className="badge ended">Past</span>}
                    {ev.raw?.isPaid && <span className="badge" style={{ background: "linear-gradient(90deg,#6b21a8,#7c3aed)" }}>Paid Event</span>}
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {showMapButton ? (
                      <a
                        className="btn ghost"
                        href={loc}
                        onClick={(e) => e.stopPropagation()}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Map
                      </a>
                    ) : loc ? (
                      <div className="muted small" style={{ padding: "6px 8px", borderRadius: 8, background: "#f8fafc" }}>{loc}</div>
                    ) : null}

                    {ev.raw?.bookingEnabled ? (
                      <button className="btn primary" onClick={(e) => { e.stopPropagation(); openBooking(ev); }}>Book</button>
                    ) : (
                      <button className="btn ghost" onClick={(e) => { e.stopPropagation(); openEvent(ev); }}>View</button>
                    )}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {selected && (
        <div className="event-drawer" role="dialog" aria-modal="true">
          <div className="drawer-inner">
            <button className="drawer-close" onClick={closeEvent}>Close</button>
            <h2>{selected.title}</h2>

            <div className="event-meta">
              <div><strong>When:</strong> {formatDateTime(selected.startAt)} — {selected.endAt ? formatDateTime(selected.endAt) : "TBA"}</div>
              <div style={{ marginTop: 8 }}><strong>Description:</strong> {selected.description}</div>
              {/* Location rendering: if locationRaw is a URL show button, otherwise show address/name */}
              {(() => {
                const loc = selected.locationRaw ?? selected.raw?.mapLink ?? selected.raw?.map_link ?? selected.raw?.map_url ?? null;
                if (!loc) return null;
                if (isUrl(loc)) {
                  return (
                    <div style={{ marginTop: 8 }}>
                      <a className="btn ghost" href={loc} target="_blank" rel="noreferrer">Open map</a>
                    </div>
                  );
                } else {
                  return (
                    <div style={{ marginTop: 8 }}>
                      <strong>Location:</strong> <span>{loc}</span>
                    </div>
                  );
                }
              })()}
            </div>

            {selected.raw?.allowMap && selected.raw?.mapLink && (
              <div style={{ marginTop: 12 }}>
                {/* keep existing behavior for explicit fields */}
                <a className="btn ghost" href={selected.raw.mapLink} target="_blank" rel="noreferrer">Open map</a>
              </div>
            )}

            {selected.raw?.bookingEnabled && (
              <div style={{ marginTop: 12 }}>
                <button className="btn primary" onClick={() => openBooking(selected)}>Book for this event</button>
                {selected.raw?.isPaid ? <div className="small muted" style={{ marginTop: 8 }}>This is a paid event — booking requires payment. Price set by admin.</div> : null}
              </div>
            )}

            {selected.isLive && selected.youtubeLiveUrl ? (
              <div className="live-embed" style={{ marginTop: 14 }}>
                <iframe title="GIVEAURA Live Stream"
                  src={selected.youtubeLiveUrl.includes("youtube.com") ? selected.youtubeLiveUrl.replace("watch?v=", "embed/") : selected.youtubeLiveUrl}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              </div>
            ) : selected.youtubeLiveUrl ? (
              <div className="live-embed muted-note" style={{ marginTop: 12 }}>
                <a className="link" href={selected.youtubeLiveUrl} target="_blank" rel="noreferrer">Watch recording / stream on YouTube</a>
              </div>
            ) : null}

            {/* Gallery: use normalized selected.images (which now includes admin imageUrl fallback) */}
            {selected.images && selected.images.length > 0 && (
              <div className="gallery" style={{ marginTop: 12 }}>
                {selected.images.map((u, i) => (
                  <img key={i} src={u} alt={`${selected.title} ${i + 1}`} onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/default-event.png"; }} />
                ))}
              </div>
            )}

            {/* Videos: use normalized selected.videos or videoUrl */}
            {(selected.videos && selected.videos.length > 0) || selected.videoUrl ? (
              <div className="videos" style={{ marginTop: 12 }}>
                {(selected.videos && selected.videos.length > 0 ? selected.videos : [selected.videoUrl]).map((v, i) => (
                  v ? <video key={i} controls src={v} /> : null
                ))}
              </div>
            ) : null}

            <div className="drawer-actions" style={{ marginTop: 14 }}>
              <button className="btn" onClick={() => { closeEvent(); navigate("/"); }}>Back</button>
            </div>
          </div>
        </div>
      )}

      {bookingOpen && bookingEvent && (
        <div className="events-modal" role="dialog" aria-modal="true" onClick={closeBooking}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <h3 style={{ margin: 0 }}>Book: {bookingEvent.title}</h3>
              <button className="btn ghost" onClick={closeBooking}>Close</button>
            </div>

            <form onSubmit={submitBooking} style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <label style={{ fontSize: 13, color: "var(--muted)" }}>Name
                <input required value={bookingForm.name} onChange={(e) => setBookingForm((p) => ({ ...p, name: e.target.value }))} placeholder="Your full name" style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid var(--glass-border)" }} />
              </label>

              <label style={{ fontSize: 13, color: "var(--muted)" }}>Email
                <input required type="email" value={bookingForm.email} onChange={(e) => setBookingForm((p) => ({ ...p, email: e.target.value }))} placeholder="you@example.com" style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid var(--glass-border)" }} />
              </label>

              <label style={{ fontSize: 13, color: "var(--muted)" }}>Seats
                <input required type="number" min={1} value={bookingForm.seats} onChange={(e) => setBookingForm((p) => ({ ...p, seats: Math.max(1, Number(e.target.value || 1)) }))} style={{ width: 120, padding: 10, borderRadius: 8, border: "1px solid var(--glass-border)" }} />
              </label>

              {bookingEvent.raw?.isPaid && bookingEvent.raw?.price ? (
                <div className="small muted">This is a paid event. Price per booking (set by admin): ₹{bookingEvent.raw.price}</div>
              ) : null}

              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button className="btn primary" type="submit" disabled={bookingSubmitting}>{bookingSubmitting ? "Submitting..." : bookingEvent.raw?.isPaid ? "Pay & Book" : "Submit booking"}</button>
                <button type="button" className="btn ghost" onClick={closeBooking}>Cancel</button>
              </div>

              {bookingEvent.raw?.capacity ? (
                <div className="small muted" style={{ marginTop: 6 }}>Capacity: {bookingEvent.raw.capacity} seats (admin manages confirmations)</div>
              ) : null}
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: "fixed", right: 20, bottom: 20, zIndex: 6000 }}>
          <div style={{ padding: "10px 14px", borderRadius: 8, background: toast.type === "error" ? "var(--danger)" : toast.type === "success" ? "var(--success)" : "rgba(0,0,0,0.7)", color: "#fff" }}>
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}
