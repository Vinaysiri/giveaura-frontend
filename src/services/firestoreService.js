  // src/services/firestoreService.js
  // Production-ready version - concise logging, safer fallbacks, uses firebaseApp for Storage/Functions
  // IMPORTANT: Region is controlled in src/firebase.js via functions init.

  import {
  db,
  auth,
  firebaseApp,
  storage as exportedStorage,
  functions as exportedFunctions,
  } from "../firebase";
  import {
  collection,
  addDoc,
  writeBatch,
  getDocs,
  query,
  where,
  Timestamp,
  updateDoc,
  doc,
  deleteDoc,
  getDoc,
  increment,
  orderBy,
  limit,
  setDoc,
  runTransaction,
  onSnapshot,
  collectionGroup,
  serverTimestamp,
  } from "firebase/firestore";

  import { updateProfile as fbUpdateProfile } from "firebase/auth";
  import {
  ref as storageRef,
  uploadBytesResumable,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  } from "firebase/storage";
  import { httpsCallable } from "firebase/functions";
  import { functions } from "../firebase";

  /* -------------------------
    Environment helpers
    ------------------------- */
  function getEnvVars() {
  try {
    if (typeof import.meta !== "undefined" && import.meta && import.meta.env)
      return import.meta.env;
  } catch (e) {}
  try {
    if (typeof process !== "undefined" && process && process.env)
      return process.env;
  } catch (e) {}
  return {};
  }
  const ENV = getEnvVars();

  const isBrowser = typeof window !== "undefined" && !!window;
  const isDev = (() => {
  try {
    if (ENV && (ENV.MODE || ENV.VITE_NODE_ENV || ENV.VITE_ENV)) {
      const mode = ENV.MODE || ENV.VITE_NODE_ENV || ENV.VITE_ENV;
      return mode !== "production" && mode !== "prod";
    }
    if (ENV && ENV.NODE_ENV)
      return ENV.NODE_ENV !== "production" && ENV.NODE_ENV !== "prod";
  } catch (e) {}
  return false;
  })();

  /* -------------------------
    Logging helpers
    ------------------------- */
  const LOG_PREFIX = "[firestoreService]";
  const log = {
  debug: (...args) => {
    if (isDev) {
      console.debug(LOG_PREFIX, ...args);
    } else {
      try {
        console.debug(LOG_PREFIX, ...args);
      } catch (e) {}
    }
  },
  info: (...args) => console.info(LOG_PREFIX, ...args),
  warn: (...args) => console.warn(LOG_PREFIX, ...args),
  error: (...args) => console.error(LOG_PREFIX, ...args),
  };

  /* -------------------------
    Constants
    ------------------------- */
  const PLATFORM_SHARE = 0.0264;
  const GST_SHARE = 0.0236;

  const CLIENT_CAN_WRITE_STATS = !!(
  (ENV &&
    (ENV.REACT_APP_ALLOW_CLIENT_PLATFORM_STATS === "1" ||
      ENV.VITE_ALLOW_CLIENT_PLATFORM_STATS === "1")) ||
  false
  );

  /* -------------------------
    Small helpers
    ------------------------- */
  const canUseLocalStorage = () => {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
  };

  const safeParseJSON = (raw, fallback = null) => {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    log.warn("safeParseJSON: parse failed, returning fallback");
    return fallback;
  }
  };

  async function retryWithBackoff(fn, attempts = 3, baseMs = 500) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const code = (err && err.code) || "";
      const msg = String((err && (err.message || err)) || "").toLowerCase();

      if (
        code &&
        (code.includes("permission-denied") ||
          code.includes("unauthenticated") ||
          code.includes("failed-precondition"))
      ) {
        log.error(
          "retryWithBackoff: non-transient Firebase error, aborting:",
          err
        );
        throw err;
      }

      const isTransient =
        /unavailable|deadline-exceeded|network|transport|timeout|socket hang up|connection reset|webchannel/i.test(
          msg
        ) ||
        (typeof code === "string" &&
          (code.includes("unavailable") ||
            code.includes("deadline-exceeded"))) ||
        !code;

      if (!isTransient) {
        log.error(
          "retryWithBackoff: non-transient-looking error, aborting:",
          err
        );
        throw err;
      }

      const wait = baseMs * Math.pow(2, i) + Math.round(Math.random() * 200);
      await new Promise((res) => setTimeout(res, wait));
    }
  }
  log.error(
    "retryWithBackoff: exhausted attempts, throwing last error:",
    lastErr
  );
  throw lastErr;
  }

  /* -------------------------
    Date / Timestamp helpers
    ------------------------- */
  const toTimestamp = (v) => {
  if (!v) return null;
  try {
    if (v instanceof Timestamp) return v;
    if (v && typeof v.toDate === "function")
      return Timestamp.fromDate(v.toDate());
    if (v instanceof Date) return Timestamp.fromDate(v);
    if (typeof v === "number") {
      return Timestamp.fromDate(
        v > 1e12 ? new Date(v) : new Date(v * 1000)
      );
    }
    if (typeof v === "string") {
      const d = new Date(v);
      if (!isNaN(d.getTime())) return Timestamp.fromDate(d);
    }
  } catch (err) {
    log.warn("toTimestamp conversion failed:", err);
  }
  return null;
  };

  const parseDate = (v) => {
  if (v === null || typeof v === "undefined") return null;
  try {
    if (v?.toDate && typeof v.toDate === "function") return v.toDate();
    if (typeof v === "object" && typeof v.seconds === "number")
      return new Date(v.seconds * 1000);
    if (v instanceof Date) return v;
    if (typeof v === "number")
      return v > 1e12 ? new Date(v) : new Date(v * 1000);
    if (typeof v === "string") {
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    }
  } catch (err) {
    log.warn("parseDate failed:", err);
  }
  return null;
  };

  /* -------------------------
    Campaign meta helpers
    ------------------------- */

  const normalizeCampaignType = (raw) => {
  if (!raw) return "personal";
  const v = String(raw).toLowerCase().trim();

  if (["emergency", "urgent", "critical"].includes(v)) return "emergency";
  if (["medical", "health", "hospital"].includes(v)) return "medical";
  if (["education", "school", "college", "fees"].includes(v)) return "education";
  if (["ngo", "social", "social_impact", "charity"].includes(v)) return "ngo";
  if (["csr", "corporate", "company"].includes(v)) return "csr";
  if (["personal", "family", "need"].includes(v)) return "personal";

  return "personal";
  };

  const sanitizeTags = (tags) => {
  if (!tags) return [];
  let arr = tags;

  if (typeof arr === "string") {
    arr = arr
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  if (!Array.isArray(arr)) return [];

  return arr
    .map((t) => String(t || "").trim())
    .filter(Boolean)
    .slice(0, 20); // cap number of tags
  };

  const buildCampaignMetaFromInput = (campaign = {}) => {
  // campaignType can come from multiple fields, normalize into one
  const type = normalizeCampaignType(
    campaign.campaignType || campaign.type || campaign.category
  );

  const tags = sanitizeTags(
    campaign.tags || campaign.labels || campaign.categories
  );

  // boost plan: none | basic | premium | super
  const rawBoostPlan =
    campaign.boostPlan ||
    campaign.boostTier ||
    (campaign.isBoosted ? "basic" : "none");

  const plan = String(rawBoostPlan || "none").toLowerCase();
  const boostPlan =
    plan === "super" || plan === "premium" || plan === "basic" ? plan : "none";

  const isBoosted = boostPlan !== "none" || !!campaign.isBoosted;

  const boostUntilRaw =
    campaign.boostUntil ||
    campaign.boostExpiry ||
    campaign.boostExpiresAt ||
    null;
  const boostUntil = toTimestamp(boostUntilRaw);

  return {
    campaignType: type,
    tags,
    isBoosted,
    boostPlan,
    boostUntil,
  };
  };


  /* -------------------------
    Normalizers
    ------------------------- */
  export const normalizeCampaign = (docSnap) => {
  const data = typeof docSnap.data === "function" ? docSnap.data() : docSnap;
  let createdAt = new Date(0);
  if (data?.createdAt?.toDate) createdAt = data.createdAt.toDate();
  else if (data?.createdAt?.seconds)
    createdAt = new Date(data.createdAt.seconds * 1000);
  else if (typeof data?.createdAt === "number")
    createdAt =
      data.createdAt > 1e12
        ? new Date(data.createdAt)
        : new Date(data.createdAt * 1000);
  else if (typeof data?.createdAt === "string")
    createdAt = new Date(data.createdAt);

  let parsedEndDate = null;
  try {
    if (data?.endDate?.toDate) parsedEndDate = data.endDate.toDate();
    else if (data?.endDate?.seconds)
      parsedEndDate = new Date(data.endDate.seconds * 1000);
    else if (typeof data?.endDate === "number")
      parsedEndDate =
        data.endDate > 1e12
          ? new Date(data.endDate)
          : new Date(data.endDate * 1000);
    else if (typeof data?.endDate === "string")
      parsedEndDate = new Date(data.endDate);
  } catch (err) {}

  return {
  id: docSnap.id,
  ...data,
  createdAt,
  endDate: parsedEndDate ?? data.endDate ?? null,

  //  ADD THESE (CRITICAL FOR OLD FLOW UI)
  goalAmount: Number(data.goalAmount || 0),
  fundsRaised: Number(data.fundsRaised || 0),
  progress:
    data.goalAmount > 0
      ? Math.min(
          100,
          Math.round((Number(data.fundsRaised || 0) / data.goalAmount) * 100)
        )
      : 0,

  videoUrl: data?.videoUrl || null,
  videoThumbnail: data?.videoThumbnail || null,
};
  };

  export const normalizeEventDoc = (docSnap) => {
  const data = typeof docSnap.data === "function" ? docSnap.data() : docSnap || {};
  const startRaw =
    data.eventDate ??
    data.startAt ??
    data.startDate ??
    data.startTimestamp ??
    data.start ??
    data.createdAt ??
    null;
  const endRaw =
    data.endAt ??
    data.endDate ??
    data.endTimestamp ??
    data.end ??
    null;
  const startAt = parseDate(startRaw);
  const endAt = parseDate(endRaw);
  const youtubeLiveUrl =
    data.youtubeLiveUrl ??
    data.youtubeUrl ??
    data.youtube ??
    data.youtube_live_url ??
    null;
  const images = Array.isArray(data.images)
    ? data.images
    : Array.isArray(data.photos)
    ? data.photos
    : data.imageUrl
    ? [data.imageUrl]
    : [];
  const videos = Array.isArray(data.videos)
    ? data.videos
    : Array.isArray(data.videoUrls)
    ? data.videoUrls
    : data.videoUrl
    ? [data.videoUrl]
    : [];
  return {
    id: docSnap.id,
    title: data.title || "",
    description: data.description || "",
    location: data.location || "",
    startAt,
    endAt,
    images,
    videos,
    youtubeLiveUrl,
    isLive: !!(data.isLive || data.live || data.is_live),
    raw: data,
  };
  };

  /* -------------------------
    User helpers
    ------------------------- */
  export const ensureUserDocFromAuth = async (uid) => {
  try {
    if (!uid) return null;
    const userRef = doc(db, "users", uid);
    const userSnap = await retryWithBackoff(() => getDoc(userRef), 3, 400);
    if (userSnap.exists()) return { id: userSnap.id, ...userSnap.data() };

    const a = auth?.currentUser;
    if (a && String(a.uid) === String(uid)) {
      const payload = {
        uid,
        email: auth.currentUser.email || null,
        displayName: a.displayName || null,
        photoURL: a.photoURL || null,
        publicProfile: false,
      };
      try {
        await retryWithBackoff(
          () => setDoc(userRef, payload, { merge: true }),
          3,
          400
        );
        log.info(
          "ensureUserDocFromAuth: created missing users doc from Auth for",
          uid
        );
        return { id: uid, ...payload };
      } catch (err) {
        log.warn(
          "ensureUserDocFromAuth: failed to create user doc from Auth"
        );
        return null;
      }
    }

    return null;
  } catch (err) {
    log.warn("ensureUserDocFromAuth error");
    return null;
  }
  };

  export const resolveCreatorName = async (creatorId, creatorEmail) => {
  try {
    if (!creatorId)
      return creatorEmail ? creatorEmail.split("@")[0] : "Anonymous";
    const userSnap = await retryWithBackoff(
      () => getDoc(doc(db, "users", creatorId)),
      3,
      400
    );
    if (userSnap.exists()) {
      const d = userSnap.data();
      if (d?.displayName && String(d.displayName).trim())
        return d.displayName;
      if (d?.email) return d.email.split("@")[0];
    }

    if (auth?.currentUser && auth.currentUser.uid === creatorId) {
      if (auth.currentUser.displayName) return auth.currentUser.displayName;
      if (auth.currentUser.email)
        return auth.currentUser.email.split("@")[0];
    }

    return creatorEmail ? creatorEmail.split("@")[0] : "Anonymous";
  } catch (err) {
    log.warn("resolveCreatorName failed");
    return creatorEmail ? creatorEmail.split("@")[0] : "Anonymous";
  }
  };

  /* -------------------------
    Events
    ------------------------- */
  export const getEvents = async () => {
  try {
    let qRef;
    try {
      qRef = query(collection(db, "events"), orderBy("eventDate", "desc"));
    } catch {
      try {
        qRef = query(collection(db, "events"), orderBy("startAt", "desc"));
      } catch {
        qRef = query(collection(db, "events"), orderBy("createdAt", "desc"));
      }
    }
    const snap = await retryWithBackoff(() => getDocs(qRef), 3, 600);
    const results = snap.docs.map((d) => normalizeEventDoc(d));
    return results;
  } catch (err) {
    log.error("getEvents failed");
    return [];
  }
  };

  export const getEventById = async (eventId) => {
  try {
    if (!eventId) return null;
    const docRef = doc(db, "events", eventId);
    const snap = await retryWithBackoff(() => getDoc(docRef), 3, 500);
    if (!snap.exists()) return null;
    return normalizeEventDoc(snap);
  } catch (err) {
    log.error("getEventById failed");
    return null;
  }
  };

  export const createEvent = async (
  eventData = {},
  imageFile = null,
  adminId = null,
  videoFile = null
  ) => {
  log.info("createEvent start");
  try {
    const now = Timestamp.now();
    const startTs =
      toTimestamp(
        eventData.startAt ?? eventData.eventDate ?? eventData.eventDateISO
      ) || null;
    const endTs =
      toTimestamp(eventData.endAt ?? eventData.endDate ?? eventData.endDateISO) ||
      null;

    const docData = {
      title: String(eventData.title || "").trim(),
      description: eventData.description || "",
      location: eventData.location || "",
      createdAt: now,
      updatedAt: now,
      startAt: startTs,
      eventDate: startTs,
      endAt: endTs,
      endDate: endTs,
      youtubeLiveUrl:
        eventData.youtubeLiveUrl || eventData.youtubeUrl || null,
      isLive: !!eventData.isLive,
      images: Array.isArray(eventData.images)
        ? eventData.images
        : eventData.imageUrl
        ? [eventData.imageUrl]
        : [],
      videos: Array.isArray(eventData.videos)
        ? eventData.videos
        : Array.isArray(eventData.videoUrls)
        ? eventData.videoUrls
        : eventData.videoUrl
        ? [eventData.videoUrl]
        : [],
      createdBy: adminId || null,
      raw: eventData.raw || null,
      isActive:
        typeof eventData.isActive === "boolean"
          ? eventData.isActive
          : true,
    };

    if (imageFile) {
      try {
        const res = await uploadMedia(imageFile, `events`);
        if (res && res.url) {
          docData.images = [...(docData.images || []), res.url];
        }
      } catch (err) {
        log.warn("createEvent: image upload failed, proceeding without image");
      }
    }

    if (videoFile) {
      try {
        const res = await uploadMedia(videoFile, `events/videos`);
        if (res && res.url) {
          docData.videos = [...(docData.videos || []), res.url];
        }
      } catch (err) {
        log.warn("createEvent: video upload failed, proceeding without video");
      }
    }

    const ref = await retryWithBackoff(
      () => addDoc(collection(db, "events"), docData),
      3,
      800
    );
    log.info("createEvent: success");
    return { id: ref.id, success: true };
  } catch (err) {
    log.error("createEvent failed");
    throw err;
  }
  };

  export const updateEvent = async (
  eventId,
  updates = {},
  imageFile = null,
  videoFile = null
  ) => {
  log.info("updateEvent start");
  try {
    if (!eventId) throw new Error("eventId required");

    const payload = {
      ...updates,
      updatedAt: Timestamp.now(),
    };

    if (updates.startAt || updates.eventDate) {
      const ts = toTimestamp(updates.startAt ?? updates.eventDate);
      payload.startAt = ts;
      payload.eventDate = ts;
    }
    if (updates.endAt || updates.endDate) {
      const ts = toTimestamp(updates.endAt ?? updates.endDate);
      payload.endAt = ts;
      payload.endDate = ts;
    }

    if (imageFile) {
      try {
        const res = await uploadMedia(imageFile, `events/${eventId}`);
        if (res && res.url) {
          try {
            const snap = await retryWithBackoff(
              () => getDoc(doc(db, "events", eventId)),
              3,
              400
            );
            const cur = snap.exists() ? snap.data() : {};
            const curImgs = Array.isArray(cur.images) ? cur.images : [];
            payload.images = [...curImgs, res.url];
          } catch {
            payload.images = [res.url];
          }
        }
      } catch {
        // continue without image
      }
    }

    if (videoFile) {
      try {
        const res = await uploadMedia(videoFile, `events/${eventId}/videos`);
        if (res && res.url) {
          try {
            const snap = await retryWithBackoff(
              () => getDoc(doc(db, "events", eventId)),
              3,
              400
            );
            const cur = snap.exists() ? snap.data() : {};
            const curV = Array.isArray(cur.videos) ? cur.videos : [];
            payload.videos = [...curV, res.url];
          } catch {
            payload.videos = [res.url];
          }
        }
      } catch {
        // continue
      }
    }

    await retryWithBackoff(
      () => updateDoc(doc(db, "events", eventId), payload),
      3,
      600
    );
    log.info("updateEvent: success");
    return { success: true };
  } catch (err) {
    log.error("updateEvent failed");
    throw err;
  }
  };

  export const deleteEvent = async (eventId) => {
  log.info("deleteEvent");
  try {
    if (!eventId) throw new Error("eventId required");
    await retryWithBackoff(
      () => deleteDoc(doc(db, "events", eventId)),
      3,
      600
    );
    return { success: true };
  } catch (err) {
    log.error("deleteEvent failed");
    throw err;
  }
  };

  export const subscribeEvents = (onUpdate, onError) => {
  try {
    let qRef;
    try {
      qRef = query(collection(db, "events"), orderBy("eventDate", "desc"));
    } catch {
      try {
        qRef = query(collection(db, "events"), orderBy("startAt", "desc"));
      } catch {
        qRef = query(collection(db, "events"), orderBy("createdAt", "desc"));
      }
    }

    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const arr = snap.docs.map((d) => normalizeEventDoc(d));
        if (typeof onUpdate === "function") onUpdate(arr);
      },
      (err) => {
        log.error("subscribeEvents error:", err);
        if (typeof onError === "function") onError(err);
      }
    );
    return unsub;
  } catch (err) {
    log.error("subscribeEvents failed");
    if (typeof onError === "function") onError(err);
    return () => {};
  }
  };

  /* -------------------------
    Propagate user profile updates helper (DEV SAFE VERSION)
    ------------------------- */
  export const propagateUserProfileUpdates = async (
  email,
  userId,
  updates = {}
  ) => {
  // No Firestore reads/writes here – handled server-side.
  try {
    log.info("propagateUserProfileUpdates: disabled on client (dev mode)", {
      email,
      userId,
      updatesKeys: Object.keys(updates || {}),
    });

    if (!userId) {
      log.warn(
        "propagateUserProfileUpdates: missing userId (dev mode, no-op)",
        {
          email,
          updatesKeys: Object.keys(updates || {}),
        }
      );
      return { success: false, reason: "invalid_parameters" };
    }

    return {
      success: true,
      updated: false,
      reason: "client_propagation_disabled",
    };
  } catch (err) {
    const code = (err && err.code) || "";
    const msg = err?.message || String(err);

    log.warn(
      "propagateUserProfileUpdates: unexpected error in dev no-op version",
      {
        code,
        message: msg,
      }
    );

    return {
      success: false,
      error: msg,
    };
  }
  };

  /* -------------------------
    Campaign CRUD
    ------------------------- */
  export const createCampaign = async (
  campaign,
  creator,
  isOrganization,
  clientId = null
  ) => {
  log.info("createCampaign start");
  if (!creator) throw new Error("Not authenticated");
  if (!campaign || !campaign.title)
    throw new Error("Campaign must include a title");

  const userSnap = await retryWithBackoff(
    () => getDoc(doc(db, "users", creator.uid)),
    3,
    600
  );
  if (!userSnap.exists())
    throw new Error("Please complete your profile before creating a campaign.");
  const bank = userSnap.data()?.bank || {};
  const missing = ["accountHolder", "bankName", "accountNumber", "ifsc"].filter(
    (f) => !bank[f]
  );
  if (missing.length > 0)
    throw new Error(`Incomplete bank details. Missing: ${missing.join(", ")}`);

  const now = Timestamp.now();
  const creatorName = await resolveCreatorName(creator.uid, creator.email);

  const endDateTs =
    toTimestamp(campaign.endDate) || toTimestamp(campaign.endAt) || null;
  const endDateISO =
    campaign.endDateISO ||
    (campaign.endDate
      ? campaign.endDate.toDate
        ? campaign.endDate.toDate().toISOString()
        : new Date(campaign.endDate).toISOString()
      : null);

  // 🆕 compute normalized category/boost meta
  const meta = buildCampaignMetaFromInput(campaign);

  const docData = {
    title: String(campaign.title).trim(),
    description: campaign.description || "",
    goalAmount: Number(campaign.goalAmount) || 0,
    fundsRaised: 0,
    createdAt: now,
    updatedAt: now,

    creatorId: creator.uid,
    creatorEmail: creator.email,
    creatorName,
    isOrganization: !!isOrganization,
    isVerified: false,

    imageUrl: campaign.imageUrl || null,
    videoUrl: campaign.videoUrl || null,
    videoThumbnail: campaign.videoThumbnail || null,
    creatorPhoto: campaign.creatorPhoto || null,

    status: "active",
    isActive: true,

    endDate: endDateTs,
    endAt: endDateTs,
    endDateISO: endDateISO || null,
    clientRequestId: clientId || null,

    // 🆕 category / tags / boost fields used by Home.jsx
    campaignType: meta.campaignType,  // "emergency" | "medical" | "education" | "ngo" | "csr" | "personal"
    tags: meta.tags,
    isBoosted: meta.isBoosted,
    boostPlan: meta.boostPlan,        // "none" | "basic" | "premium" | "super"
    boostUntil: meta.boostUntil || null,

    // 🆕 optional location-ish metadata (safe pass-through)
    location: campaign.location || campaign.city || null,
    city: campaign.city || null,
    state: campaign.state || null,
    country: campaign.country || campaign.countryCode || null,
    pincode: campaign.pincode || campaign.pin || campaign.postalCode || null,
  };

  // Idempotent path using clientId as doc id
  if (clientId) {
    const campaignDocRef = doc(db, "campaigns", clientId);
    try {
      const existing = await retryWithBackoff(
        () => getDoc(campaignDocRef),
        2,
        400
      );
      if (existing && existing.exists()) return { id: clientId };
    } catch {
      // continue to setDoc
    }

    try {
      await retryWithBackoff(
        () => setDoc(campaignDocRef, docData),
        3,
        1000
      );

      // 🔗 REFERRAL CONVERSION: first campaign created (clientId path)
try {
  const referralSnap = await getDocs(
    query(
      collection(db, "referrals"),
      where("refereeId", "==", creator.uid),
      where("status", "==", "registered")
    )
  );

  if (!referralSnap.empty) {
    await updateDoc(referralSnap.docs[0].ref, {
      status: "campaign_created",
      campaignId: clientId,
      convertedAt: serverTimestamp(),
    });
  }
} catch (err) {
  log.warn("Referral conversion skipped (non-fatal)", err);
}

      try {
        await incrementPlatformStats({ newCampaign: true });
      } catch {
        // ignore
      }
      return { id: clientId };
    } catch (err) {
      throw err;
    }
  }

  // Normal auto-id path
  try {
    const ref = await retryWithBackoff(
      () => addDoc(collection(db, "campaigns"), docData),
      3,
      1000
    );

    // 🔗 REFERRAL CONVERSION: first campaign created
try {
  const referralSnap = await getDocs(
    query(
      collection(db, "referrals"),
      where("refereeId", "==", creator.uid),
      where("status", "==", "registered")
    )
  );

  if (!referralSnap.empty) {
    await updateDoc(referralSnap.docs[0].ref, {
      status: "campaign_created",
      campaignId: ref.id,
      convertedAt: serverTimestamp(),
    });
  }
} catch (err) {
  log.warn("Referral conversion skipped (non-fatal)", err);
}

    try {
      await incrementPlatformStats({ newCampaign: true });
    } catch {
      // ignore
    }
    return { id: ref.id };
  } catch (err) {
    throw err;
  }
  };


export const donateToCampaign = async ({
  campaignId,
  amount,
  donorId = null,
  donorEmail = null,
  donorName = null,
  donorPhotoURL = null,
  paymentId = null,
}) => {
  if (!campaignId) throw new Error("campaignId required");

  const donationAmount = Number(amount || 0);
  if (!donationAmount || donationAmount <= 0) {
    throw new Error("Invalid donation amount");
  }

  const donationRef = doc(
    collection(db, "campaigns", campaignId, "donations")
  );

  /* =================================================
     1️ ONLY CREATE DONATION DOCUMENT
     ================================================= */

  await retryWithBackoff(
    () =>
      setDoc(donationRef, {
        campaignId,
        amount: donationAmount,

        donorId: donorId || null,
        donorEmail: donorEmail || null,
        donorName:
          donorName ||
          donorEmail?.split("@")[0] ||
          "Well-Wisher",

        donorPhotoURL: donorPhotoURL || null,
        donorType: donorId ? "user" : "guest",
        paymentId: paymentId || null,

        createdAt: Timestamp.now(),
        createdAtMs: Date.now(),
      }),
    3,
    800
  );

  /* =================================================
     2️ CALL CLOUD FUNCTION (SERVER UPDATES CAMPAIGN)
     ================================================= */

  try {
    const processDonation = httpsCallable(
      functions,
      "processDonation"
    );

    await processDonation({
      campaignId,
      amount: donationAmount,
    });
  } catch (err) {
    console.warn(
      "[donateToCampaign] processDonation failed",
      err
    );
  }

  /* =================================================
     3️ Notify campaign creator
     ================================================= */

  try {
    const campSnap = await getDoc(campaignRef);
    const camp = campSnap.exists()
      ? campSnap.data()
      : null;

    if (camp?.creatorId) {
      await addNotification({
        userId: camp.creatorId,
        title: "💖 New donation received",
        message: `₹${donationAmount.toLocaleString(
          "en-IN"
        )} was donated to your campaign "${camp.title}".`,
        campaignId,
        type: "donation_received",
      });
    }
  } catch {
    // non-blocking
  }

  return { success: true };
};
  export const getCampaigns = async () => {
  try {
    const campaignsRef = collection(db, "campaigns");
    const qRef = query(
      campaignsRef,
      orderBy("updatedAt", "desc")
    );

    const snapshot = await retryWithBackoff(() => getDocs(qRef), 3, 800);

    const results = await Promise.all(
      snapshot.docs.map(async (docSnap) => {
        const normalized = normalizeCampaign(docSnap);
        if (!normalized.creatorName || normalized.creatorName === "") {
          try {
            normalized.creatorName = await resolveCreatorName(
              normalized.creatorId,
              normalized.creatorEmail
            );
          } catch {
            normalized.creatorName = normalized.creatorEmail
              ? normalized.creatorEmail.split("@")[0]
              : "Anonymous";
          }
        }
        return normalized;
      })
    );

    return results;
  } catch (err) {
    log.error("getCampaigns failed", err);
    return [];
  }
};

  export const getCampaignById = async (campaignId) => {
  try {
    if (!campaignId) return null;

    const docSnap = await retryWithBackoff(
      () => getDoc(doc(db, "campaigns", campaignId)),
      3,
      600
    );
    if (!docSnap.exists()) return null;

    const normalized = normalizeCampaign(docSnap);

    // 🔒 numeric safety (old UI depended on this)
    normalized.fundsRaised = Number(normalized.fundsRaised || 0);
    normalized.goalAmount = Number(normalized.goalAmount || 0);

    if (!normalized.creatorName || normalized.creatorName === "") {
      try {
        normalized.creatorName = await resolveCreatorName(
          normalized.creatorId,
          normalized.creatorEmail
        );
      } catch {
        normalized.creatorName = normalized.creatorEmail
          ? normalized.creatorEmail.split("@")[0]
          : "Anonymous";
      }
    }

    return normalized;
  } catch (err) {
    log.error("getCampaignById failed", err);
    return null;
  }
};

  export const updateCampaign = async (campaignId, updates = {}) => {
  if (!campaignId) throw new Error("campaignId required");

  // 🔒 Strip payment-controlled fields (server/webhook only)
  const forbiddenKeys = [
  "isPaid",
  "transferred",
  "transferredAt",
  "transferredBy",
  "isApproved",
  "approvedAt",
  "platformFee",
  "gstAmount",
  "netAmount",
];

  for (const k of forbiddenKeys) {
    if (k in updates) delete updates[k];
  }

  // Normalize end date if present
  if (updates.endDate || updates.endAt) {
    const ts = toTimestamp(updates.endDate ?? updates.endAt);
    updates.endDate = ts;
    updates.endAt = ts;
  }

  await retryWithBackoff(
    () =>
      updateDoc(doc(db, "campaigns", campaignId), {
        ...updates,
        updatedAt: Timestamp.now(),
      }),
    3,
    600
  );

  return { success: true };
};

  export const verifyCampaign = async (campaignId) => {
  if (!campaignId) throw new Error("campaignId required");
  await retryWithBackoff(
    () =>
      updateDoc(doc(db, "campaigns", campaignId), {
        isVerified: true,
        updatedAt: Timestamp.now(),
      }),
    3,
    600
  );
  };

  export const revokeVerification = async (campaignId) => {
  if (!campaignId) throw new Error("campaignId required");
  await retryWithBackoff(
    () =>
      updateDoc(doc(db, "campaigns", campaignId), {
        isVerified: false,
        updatedAt: Timestamp.now(),
      }),
    3,
    600
  );
  };

  export const approveCampaign = async (campaignId, adminId = null) => {
  try {
    if (!campaignId) throw new Error("campaignId required");
    const payload = {
      isApproved: true,
      isVerified: true,
      approvedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    await retryWithBackoff(
      () => updateDoc(doc(db, "campaigns", campaignId), payload),
      3,
      800
    );

    try {
      await addDoc(collection(db, "campaign_approvals"), {
        campaignId,
        adminId: adminId || null,
        action: "approved",
        createdAt: Timestamp.now(),
      });
    } catch {
      // ignore audit failure
    }

    try {
      const camp = await getCampaignById(campaignId);
      if (camp?.creatorId) {
        await addNotification({
          userId: camp.creatorId,
          title: "✅ Campaign approved",
          message: `Your campaign "${camp.title}" has been approved by GiveAura.`,
          campaignId,
        });
      }
    } catch {
      // ignore notify failure
    }

    return { success: true };
  } catch (err) {
    log.error("approveCampaign failed");
    throw err;
  }
  };

  export const revokeApproval = async (campaignId, adminId = null) => {
  try {
    if (!campaignId) throw new Error("campaignId required");
    const payload = {
      isApproved: false,
      isVerified: false,
      approvedAt: null,
      updatedAt: Timestamp.now(),
    };
    await retryWithBackoff(
      () => updateDoc(doc(db, "campaigns", campaignId), payload),
      3,
      800
    );

    try {
      await addDoc(collection(db, "campaign_approvals"), {
        campaignId,
        adminId: adminId || null,
        action: "revoked",
        createdAt: Timestamp.now(),
      });
    } catch {
      // ignore
    }

    try {
      const camp = await getCampaignById(campaignId);
      if (camp?.creatorId) {
        await addNotification({
          userId: camp.creatorId,
          title: "⚠️ Campaign approval revoked",
          message: `Approval for your campaign "${camp.title}" was revoked by GiveAura.`,
          campaignId,
        });
      }
    } catch {
      // ignore
    }

    return { success: true };
  } catch (err) {
    log.error("revokeApproval failed");
    throw err;
  }
  };

  export const deleteCampaign = async (campaignId) => {
  if (!campaignId) throw new Error("campaignId required");
  await retryWithBackoff(
    () => deleteDoc(doc(db, "campaigns", campaignId)),
    3,
    600
  );
  return { success: true };
  };

  /* -------------------------
    Storage helpers
    ------------------------- */
  const storage = exportedStorage;

  export async function getLandingStories() {
  const q = query(
    collection(db, "campaigns"),
    orderBy("fundsRaised", "desc"),
    limit(6)
  );

  const snap = await getDocs(q);

  return snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }));
}

  export const uploadMedia = (file, pathPrefix = "uploads") =>
  new Promise((resolve, reject) => {
    try {
      if (!file) throw new Error("File required");
      if (!storage) throw new Error("Storage instance not available");

      const ts = Date.now();
      const safeName = (file.name || "file").replace(
        /[^a-zA-Z0-9.\-_]/g,
        "_"
      );
      const remotePath = `${pathPrefix}/${ts}_${safeName}`;
      const ref = storageRef(storage, remotePath);
      const uploadTask = uploadBytesResumable(ref, file);

      uploadTask.on(
        "state_changed",
        () => {},
        (err) => {
          log.error("uploadMedia failed", err);
          reject(err);
        },
        async () => {
          try {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            resolve({
              success: true,
              url,
              fullPath: uploadTask.snapshot.ref.fullPath,
            });
          } catch (err) {
            log.error("uploadMedia: getDownloadURL failed", err);
            reject(err);
          }
        }
      );
    } catch (err) {
      log.error("uploadMedia immediate error", err);
      reject(err);
    }
  });

  export const deleteMedia = async (fullPath) => {
  try {
    if (!fullPath) throw new Error("fullPath required");
    if (!storage) throw new Error("Storage instance not available");
    const ref = storageRef(storage, fullPath);
    await retryWithBackoff(() => deleteObject(ref), 3, 600);
    return { success: true };
  } catch (err) {
    log.warn("deleteMedia failed", err);
    throw err;
  }
  };

  /* -------------------------
    Local donation queue helpers
    ------------------------- */
  const LOCAL_DONATION_QUEUE_KEY = "giveaura_local_donation_queue";

  const enqueueLocalDonation = (donationRecord) => {
  try {
    if (!canUseLocalStorage()) {
      log.warn(
        "enqueueLocalDonation: localStorage unavailable, skipping queue"
      );
      return;
    }
    const raw = window.localStorage.getItem(LOCAL_DONATION_QUEUE_KEY);
    const queue = Array.isArray(safeParseJSON(raw, []))
      ? safeParseJSON(raw, [])
      : [];
    queue.push({ savedAt: new Date().toISOString(), donation: donationRecord });
    window.localStorage.setItem(
      LOCAL_DONATION_QUEUE_KEY,
      JSON.stringify(queue)
    );
    log.warn("Donation queued locally");
  } catch (err) {
    log.error("enqueueLocalDonation failed", err);
  }
  };

  
  /* =========================================================
    Central Revenue Split Logic (CATEGORY BASED)
    SINGLE SOURCE OF TRUTH
  ========================================================= */

  const CATEGORY_SPLITS = {
  emergency: { platform: 0.02, gst: 0 },
  medical: { platform: 0.04, gst: 0 },
  education: { platform: 0.04, gst: 0 },
  ngo: { platform: 0.06, gst: 0 },
  csr: { platform: 0.10, gst: 0 },
  global: { platform: 0.10, gst: 0 },
  personal: { platform: 0.05, gst: 0 },
  default: { platform: 0.05, gst: 0 },
  };

  /**
   * computeSplits
   * @param {number} grossAmount - donor paid amount (₹)
   * @param {string} campaignType - normalized campaign category
   */
  export function computeSplits(grossAmount, campaignType = "default") {
  const gross = Number(grossAmount || 0);

  if (!gross || gross <= 0) {
    throw new Error("computeSplits: invalid gross amount");
  }

  // 🔒 Normalize category (kept for analytics / future use)
  const type = normalizeCampaignType(campaignType);


  // No platform fee, no GST deduction from donor amount
  const gstAmount = 0;
  const platformShare = 0;
  const netAfterGst = gross;
  const fundraiserShare = gross;

  return {
    gross,                  // donor paid amount
    gst: gstAmount,         // always 0
    platform: platformShare,// always 0
    fundraiser: fundraiserShare,
    netAfterGst,            // equals gross
    category: type,
  };
  }


  /* -------------------------
    Donation flow (FINAL – overflow supported)
    ------------------------- */
export const confirmPayment = async () => {
  throw new Error(
    "confirmPayment is not used. Use donateToCampaign() instead."
  );
  /* =======================
      GOAL + OVERFLOW LOGIC
      ======================= */

  const fullNet = amount * netFactor;

  /* ---- CASE 1: fits fully in Campaign-A ---- */
  if (goal === 0 || raised + fullNet <= goal) {
    await recordDonation(donation.campaignId, amount, campaign.title);
    allocations.push({ id: donation.campaignId, amount });
    try {
  if (donation.donorId || donation.donorEmail) {
    const primary = allocations[0];
    const overflowTargets = allocations.slice(1);

    let message = `Your donation was successfully allocated.\n\n`;

    if (primary) {
      message += `✅ ₹${primary.amount.toLocaleString("en-IN")} fully funded "${campaign.title}".\n`;
    }

    if (overflowTargets.length > 0) {
      message += `\n🔁 Remaining amount supported:\n`;
      overflowTargets.forEach((a) => {
        message += `• ₹${a.amount.toLocaleString("en-IN")} → ${a.title || "another campaign"}\n`;
      });
    }

    await addNotification({
      userId: donation.donorId || null,
      title: "🙏 Donation Allocated Successfully",
      message,
      type: "donation_allocation",
      data: { allocations },
    });
  }
  } catch {
  // non-blocking
  }

    return { success: true, allocations };
  }

  /* ---- CASE 2: overflow ---- */
  const netNeeded = Math.max(goal - raised, 0);

  // Gross required to fill Campaign-A exactly
  const grossToFill =
    Math.ceil((netNeeded / netFactor) * 100) / 100;

  const fillGross = Math.min(amount, grossToFill);
  const overflowGross = Number((amount - fillGross).toFixed(2));

  /* ---- Fill Campaign-A ---- */
  if (fillGross > 0) {
    await recordDonation(
      donation.campaignId,
      fillGross,
      campaign.title
    );
    allocations.push({
      id: donation.campaignId,
      amount: fillGross,
    });
  }

  /* ---- Allocate overflow to Campaign-B ---- */
  let remainingGross = overflowGross;

  if (remainingGross > 0) {
    const qRef = query(
      collection(db, "campaigns"),
      where("isVerified", "==", true)
    );

    const snap = await getDocs(qRef);
    const targets = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter(
        (c) =>
          c.id !== donation.campaignId &&
          c.status !== "completed" &&
          (c.goalAmount || 0) > (c.fundsRaised || 0)
      )
      .sort((a, b) => {
        const ea = a.endDate?.seconds || Infinity;
        const eb = b.endDate?.seconds || Infinity;
        return ea - eb;
      });

    for (const c of targets) {
      if (remainingGross <= 0) break;

      const needNet = Math.max(
        (c.goalAmount || 0) - (c.fundsRaised || 0),
        0
      );

      const grossNeeded =
        Math.ceil((needNet / netFactor) * 100) / 100;

      const giveGross = Math.min(remainingGross, grossNeeded);
      if (giveGross <= 0) continue;

      await recordDonation(c.id, giveGross, c.title);

      try {
  if (c.creatorId) {
    await addNotification({
      userId: c.creatorId,
      title: "🎉 Extra Support Received",
      message: `Your campaign "${c.title}" received ₹${giveGross.toLocaleString(
        "en-IN"
      )} from an overflow donation.`,
      type: "overflow_received",
      campaignId: c.id,
      data: {
        sourceCampaignId: donation.campaignId,
        amount: giveGross,
      },
    });
  }
  } catch {
  // ignore notification failure
  }

  await addNotification({
  isAdmin: true,
  title: "🔀 Donation Overflow Allocated",
  message: `Overflow from "${campaign.title}" was allocated to ${targets.length} campaign(s).`,
  type: "overflow_admin_log",
  data: { allocations },
  });

      allocations.push({ id: c.id, amount: giveGross });

      remainingGross = Number(
        (remainingGross - giveGross).toFixed(2)
      );
    }
  }

  if (remainingGross > 0) {
    log.warn("Unallocated overflow:", remainingGross);
  }

  return { success: true, allocations };
  };

export const updateFundsRaised = async (campaignId, amount) => {
  if (!campaignId) throw new Error("campaignId required");
  const inc = Number(amount || 0);
  if (!inc || inc <= 0) throw new Error("Invalid amount");

  const ref = doc(db, "campaigns", campaignId);

  await retryWithBackoff(
    () =>
      runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("Campaign not found");

        const data = snap.data();
        const current = Number(data.fundsRaised || 0);
        const goal = Number(data.goalAmount || 0);
        const next = current + inc;

        
      }),
    3,
    800
  );

  return { success: true };
};

  
  export const getEventById_raw = async (eventId) => {
  try {
    if (!eventId) return null;
    const snap = await retryWithBackoff(
      () => getDoc(doc(db, "events", eventId)),
      3,
      500
    );
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  } catch (err) {
    log.error("getEventById_raw failed", err);
    return null;
  }
  };

  export const getEventById_normalized = async (eventId) => {
  return getEventById(eventId);
  };

  export const allocatePlatformFundsToEvent = async (
  eventId,
  amountRequest,
  adminId = null
  ) => {
  log.info("allocatePlatformFundsToEvent start");
  const amountNeeded = Number(amountRequest || 0);
  if (!amountNeeded || amountNeeded <= 0)
    throw new Error("Invalid allocation amount");

  const ev = await getEventById(eventId);
  if (!ev) throw new Error("Event not found");

  let remaining = amountNeeded;
  let allocatedTotal = 0;
  const allocationsCreated = [];

  try {
    const qRef = query(
      collection(db, "platform_contributions"),
      where("allocated", "==", false),
      orderBy("createdAt", "asc")
    );
    const snap = await retryWithBackoff(() => getDocs(qRef), 3, 800);
    const contributions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    for (const c of contributions) {
      if (remaining <= 0) break;

      const available = Number(c.amount || 0) - Number(c.allocatedAmount || 0);
      if (available <= 0) {
        try {
          await retryWithBackoff(
            () =>
              updateDoc(doc(db, "platform_contributions", c.id), {
                allocated: true,
                allocatedAmount: Number(c.amount || 0),
              }),
            2,
            400
          );
        } catch {
          // ignore
        }
        continue;
      }

      const take = Math.min(remaining, available);

      try {
        await retryWithBackoff(
          () =>
            runTransaction(db, async (tx) => {
              const cRef = doc(db, "platform_contributions", c.id);
              const cSnap = await tx.get(cRef);
              if (!cSnap.exists()) throw new Error("Contribution disappeared");
              const cData = cSnap.data();
              const currentAllocated = Number(cData.allocatedAmount || 0);
              const newAllocated = currentAllocated + take;
              const fullyAllocated =
                newAllocated >= Number(cData.amount || 0);

              tx.update(cRef, {
                allocatedAmount: newAllocated,
                allocated: fullyAllocated,
                allocatedAt: fullyAllocated ? Timestamp.now() : null,
                allocatedToEventId: fullyAllocated ? eventId : null,
              });

              const allocRef = doc(collection(db, "event_allocations"));
              tx.set(allocRef, {
                eventId,
                contributionId: c.id,
                donationId: cData.donationId || null,
                donorId: cData.donorId || null,
                donorEmail: cData.donorEmail || null,
                amount: take,
                adminId: adminId || null,
                createdAt: Timestamp.now(),
              });
            }),
          3,
          800
        );
      } catch {
        continue;
      }

      try {
        const allocDoc = {
          eventId,
          contributionId: c.id,
          donationId: c.donationId || null,
          donorId: c.donorId || null,
          donorEmail: c.donorEmail || null,
          amount: take,
          adminId: adminId || null,
          createdAt: Timestamp.now(),
        };
        const res = await retryWithBackoff(
          () => addDoc(collection(db, "event_allocations"), allocDoc),
          2,
          500
        );
        allocationsCreated.push({ id: res.id, ...allocDoc });
      } catch {
        // ignore
      }

      try {
        const donorId = c.donorId || null;
        const donorEmail = c.donorEmail || null;
        const message = `Your contribution of ₹${Number(take).toLocaleString(
          "en-IN"
        )} was used to support the event "${
          ev.title || ev.name || ev.id
        }".`;
        if (donorId) {
          await addNotification({
            userId: donorId,
            title: "🎉 Contribution used",
            message,
            data: { eventId },
          });
        } else if (donorEmail) {
          await addNotification({
            userId: null,
            title: "🎉 Contribution used",
            message: `${message} (donorEmail: ${donorEmail})`,
            data: { eventId },
          });
        }
      } catch {
        // ignore
      }

      remaining -= take;
      allocatedTotal += take;
    }

    if (allocatedTotal > 0) {
      try {
        await retryWithBackoff(
          () =>
            updateDoc(doc(db, "events", eventId), {
              platformFundsUsed: increment(allocatedTotal),
              lastPlatformAllocationAt: Timestamp.now(),
            }),
          3,
          600
        );
      } catch {
        // ignore
      }

      try {
        await incrementPlatformStats({ eventFunded: true });
      } catch {
        // ignore
      }
    }

    return { success: true, allocatedTotal, allocationsCreated };
  } catch (err) {
    log.error("allocatePlatformFundsToEvent failed", err);
    throw err;
  }
  };

  /* -------------------------
    Donations queries
    ------------------------- */
  export const getDonationsByCampaign = async (campaignId) => {
  try {
    if (!campaignId) return [];
    try {
      const qRef = query(
        collection(db, "campaigns", campaignId, "donations"),
        orderBy("createdAt", "desc")
      );
      const snap = await retryWithBackoff(() => getDocs(qRef), 3, 800);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch {
      try {
        const fallbackQ = query(
          collection(db, "campaigns", campaignId, "donations")
        );
        const fallbackSnap = await retryWithBackoff(
          () => getDocs(fallbackQ),
          3,
          800
        );
        const results = fallbackSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        results.sort((a, b) => {
          const aMs = a.createdAt?.seconds
            ? a.createdAt.seconds * 1000
            : a.createdAt
            ? new Date(a.createdAt).getTime()
            : 0;
          const bMs = b.createdAt?.seconds
            ? b.createdAt.seconds * 1000
            : b.createdAt
            ? new Date(b.createdAt).getTime()
            : 0;
          return bMs - aMs;
        });
        return results;
      } catch {
        return [];
      }
    }
  } catch (err) {
    log.error("getDonationsByCampaign error", err);
    return [];
  }
  };

  export const getRecentDonations = async (count = 10) => {
  try {
    const qRef = query(
      collectionGroup(db, "donations"),
      orderBy("createdAt", "desc"),
      limit(count)
    );
    const snap = await retryWithBackoff(() => getDocs(qRef), 3, 800);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    try {
      const fallbackQ = query(collectionGroup(db, "donations"), limit(count));
      const fallbackSnap = await retryWithBackoff(
        () => getDocs(fallbackQ),
        2,
        600
      );
      return fallbackSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch {
      return [];
    }
  }
  };

  export async function createCampaignBoost({
  campaignId,
  donorId,
  amount,
  paymentId
}) {
  if (!campaignId || !amount || amount <= 0) return;

  // 🔹 Boost duration rule (example: 7 days)
  const BOOST_DAYS = 7;
  const expiresAt = Timestamp.fromDate(
    new Date(Date.now() + BOOST_DAYS * 24 * 60 * 60 * 1000)
  );

  // 1️⃣ Store boost record (audit)
  await addDoc(collection(db, "campaignBoosts"), {
    campaignId,
    donorId,
    paymentId,
    amount,
    createdAt: serverTimestamp(),
    expiresAt
  });

  // 2️ Update campaign visibility
  await updateDoc(doc(db, "campaigns", campaignId), {
    isBoosted: true,
    boostAmount: amount,
    boostedAt: serverTimestamp(),
    boostExpiresAt: expiresAt
  });
}

  export const listenToLatestDonation = (onUpdate, onError) => {
  try {
    const qRef = query(
      collectionGroup(db, "donations"),
      orderBy("createdAt", "desc"),
      limit(1)
    );

    const unsub = onSnapshot(
      qRef,
      (snap) => {
        if (!snap.empty) {
          const d = snap.docs[0];
          if (typeof onUpdate === "function") {
            onUpdate({ id: d.id, ...d.data() });
          }
        } else if (typeof onUpdate === "function") {
          onUpdate(null);
        }
      },
      (err) => {
        log.error("listenToLatestDonation error:", err);
        if (typeof onError === "function") onError(err);
      }
    );
    return unsub;
  } catch (err) {
    log.error("listenToLatestDonation failed init:", err);
    if (typeof onError === "function") onError(err);
    return () => {};
  }
  };


  export const listenToUserDonations = (userId, onUpdate, onError) => {
  try {
    if (!userId) {
      if (typeof onUpdate === "function") onUpdate([]);
      return () => {};
    }

    const qRef = query(
      collectionGroup(db, "donations"),
      where("donorId", "==", userId),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (typeof onUpdate === "function") onUpdate(arr);
      },
      (err) => {
        log.error("listenToUserDonations error:", err);
        if (typeof onError === "function") onError(err);
      }
    );

    return unsub;
  } catch (err) {
    log.error("listenToUserDonations failed init:", err);
    if (typeof onError === "function") onError(err);
    return () => {};
  }
  };

  export async function saveUserDeviceToken(uid, token) {
  await setDoc(
    doc(db, "users", uid, "devices", token),
    { token, updatedAt: serverTimestamp() },
    { merge: true }
  );
  }



  export const listenToCampaignDonations = (
  campaignId,
  onUpdate,
  onError
  ) => {
  try {
    if (!campaignId) {
      if (typeof onUpdate === "function") onUpdate([]);
      return () => {};
    }

    const baseRef = collection(db, "campaigns", campaignId, "donations");
    let qRef;

    try {
      qRef = query(baseRef, orderBy("createdAt", "desc"));
    } catch {
      qRef = baseRef;
    }

    const unsub = onSnapshot(
      qRef,
      (snap) => {
        let arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));


        arr = arr.sort((a, b) => {
        const aMs = a.createdAt?.seconds
          ? a.createdAt.seconds * 1000
          : a.createdAt
          ? new Date(a.createdAt).getTime()
          : 0;

        const bMs = b.createdAt?.seconds
          ? b.createdAt.seconds * 1000
          : b.createdAt
          ? new Date(b.createdAt).getTime()
          : 0;

        return bMs - aMs;
      });
        if (typeof onUpdate === "function") onUpdate(arr);
      },
      (err) => {
        log.error("listenToCampaignDonations error:", err);
        if (typeof onError === "function") onError(err);
      }
    );

    

    return unsub;
  } catch (err) {
    log.error("listenToCampaignDonations failed init:", err);
    if (typeof onError === "function") onError(err);
    return () => {};
  }
  };

  export const listenToCampaign = (campaignId, onUpdate, onError) => {
  try {
    if (!campaignId) {
      if (typeof onUpdate === "function") onUpdate(null);
      return () => {};
    }

    const ref = doc(db, "campaigns", campaignId);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          onUpdate(normalizeCampaign(snap));
        } else {
          onUpdate(null);
        }
      },
      (err) => {
        log.error("listenToCampaign error:", err);
        if (typeof onError === "function") onError(err);
      }
    );

    return unsub;
  } catch (err) {
    log.error("listenToCampaign init failed:", err);
    if (typeof onError === "function") onError(err);
    return () => {};
  }
};

  /* -------------------------
    User profile helpers
    ------------------------- */
  export const saveUserProfile = async (userId, profileData) => {
  log.info("[firestoreService] saveUserProfile start", { userId });

  try {
    if (!userId) throw new Error("userId required");

    const current = auth?.currentUser;
    if (!current || current.uid !== userId) {
      const e = new Error("Not authorized to update this profile");
      e.code = "not-authorized";
      throw e;
    }

    if (!profileData || typeof profileData !== "object") profileData = {};

    if (typeof profileData.email !== "undefined") {
      log.warn("saveUserProfile: stripping email from client payload");
      delete profileData.email;
    }
    if (typeof profileData.role !== "undefined") {
      log.warn("saveUserProfile: stripping role from client payload");
      delete profileData.role;
    }
    if (typeof profileData.disabled !== "undefined") {
      log.warn("saveUserProfile: stripping disabled from client payload");
      delete profileData.disabled;
    }

    const allowedKeys = [
      "uid",
      "displayName",
      "photoURL",
      "bio",
      "contact",
      "bank",
      "phone",
      "publicProfile",
      "createdAt",
    ];

    profileData.uid = userId;

    const incomingKeys = Object.keys(profileData);
    const removedKeys = incomingKeys.filter((k) => !allowedKeys.includes(k));
    if (removedKeys.length > 0) {
      log.warn(
        "saveUserProfile: removing disallowed keys from payload",
        removedKeys
      );
      for (const k of removedKeys) delete profileData[k];
    }

    if (profileData.displayName) {
      if (typeof profileData.displayName !== "string") {
        profileData.displayName = String(profileData.displayName);
      }
      profileData.displayName = profileData.displayName.trim().slice(0, 200);
    }

    if (typeof profileData.phone !== "undefined" && profileData.phone !== null) {
      if (typeof profileData.phone !== "string") {
        profileData.phone = String(profileData.phone);
      }
      if (profileData.phone.length > 60) {
        profileData.phone = profileData.phone.slice(0, 60);
      }
    }

    if (typeof profileData.publicProfile !== "undefined") {
      profileData.publicProfile = !!profileData.publicProfile;
    }

    if (typeof profileData.bank !== "undefined") {
      const rawB = profileData.bank;
      if (!rawB || typeof rawB !== "object") {
        delete profileData.bank;
      } else {
        const upiRaw =
          rawB.upiId ??
          rawB.upi ??
          rawB.upi_id ??
          rawB.UPI ??
          null;

        const upiNormalized = upiRaw ? String(upiRaw).trim() : "";

        const nb = {
          accountHolder: rawB.accountHolder
            ? String(rawB.accountHolder).trim()
            : "",
          bankName: rawB.bankName ? String(rawB.bankName).trim() : "",
          accountNumber: rawB.accountNumber
            ? String(rawB.accountNumber).trim()
            : "",
          ifsc: rawB.ifsc ? String(rawB.ifsc).trim() : "",
          upiId: upiNormalized,
          // keep 'upi' for backward compatibility with older UI / admin views
          upi: upiNormalized,
        };
        if (
          nb.accountHolder ||
          nb.bankName ||
          nb.accountNumber ||
          nb.ifsc ||
          nb.upiId ||
          nb.upi
        ) {
          profileData.bank = nb;
        } else {
          delete profileData.bank;
        }
      }
    }

    const safePayload = { ...profileData };
    log.info("[firestoreService] saveUserProfile: safePayload keys", {
      keys: Object.keys(safePayload),
    });

    const callableNamesToTry = ["setUserProfileCallable", "setUserProfile"];

    let serverMethod = null;
    let serverResponse = null;

    // 1) Try Cloud Functions callables
    for (const name of callableNamesToTry) {
      try {
        if (!exportedFunctions) throw new Error("Functions not initialized");
        const callable = httpsCallable(exportedFunctions, name);
        let res = null;

        try {
          res = await callable({ userId, profile: safePayload });
        } catch (e1) {
          try {
            res = await callable(safePayload);
          } catch (e2) {
            log.debug(`saveUserProfile: callable ${name} attempts failed`, {
              e1,
              e2,
            });
            res = null;
          }
        }

        if (res) {
          serverMethod = name;
          serverResponse = res?.data ?? res;
          log.info(
            "[firestoreService] saveUserProfile: server callable succeeded",
            {
              name,
              userId,
            }
          );
          break;
        }
      } catch (fnErr) {
        log.warn(
          "[firestoreService] saveUserProfile: callable invocation failed, trying next",
          { name, fnErr }
        );
      }
    }

    // 2) Fallback: direct Firestore write to /users/{userId} if no callable worked
    if (!serverMethod) {
      log.warn(
        "[firestoreService] saveUserProfile: all callables failed, falling back to Firestore setDoc on /users/{userId}"
      );
      try {
        await retryWithBackoff(
          () =>
            setDoc(doc(db, "users", userId), safePayload, {
              merge: true,
            }),
          3,
          800
        );
        serverMethod = "firestore:setDoc";
        serverResponse = { via: "firestore", merged: true };
      } catch (fallbackErr) {
        log.error(
          "[firestoreService] saveUserProfile: Firestore fallback also failed",
          fallbackErr
        );
        const err = new Error(
          "All profile callables and Firestore fallback failed; profile not saved"
        );
        err.code = "profile_persist_failed";
        throw err;
      }
    }

    // Sync minimal fields back to Firebase Auth profile
    try {
      if (current && current.uid === userId) {
        const updatePayload = {};
        if (safePayload.displayName)
          updatePayload.displayName = safePayload.displayName;
        if (safePayload.photoURL)
          updatePayload.photoURL = safePayload.photoURL;

        if (Object.keys(updatePayload).length > 0) {
          await fbUpdateProfile(current, updatePayload);
          log.info(
            "[firestoreService] saveUserProfile: updated Firebase Auth profile",
            { userId }
          );
        }
      }
    } catch (authErr) {
      log.warn(
        "[firestoreService] saveUserProfile: failed to update Auth profile (non-fatal)",
        authErr
      );
    }

    // Optionally propagate displayName/photoURL to other docs (no-op client version)
    try {
      const updates = {};
      if (safePayload.displayName)
        updates.displayName = safePayload.displayName;
      if (safePayload.photoURL) updates.photoURL = safePayload.photoURL;
      if ((updates.displayName || updates.photoURL) && userId) {
        await propagateUserProfileUpdates(null, userId, updates);
      }
    } catch (propErr) {
      log.warn(
        "[firestoreService] saveUserProfile: propagateUserProfileUpdates failed (non-fatal)",
        propErr
      );
    }

    return {
      saved: true,
      method: serverMethod,
      userId,
      updatedKeys: Object.keys(safePayload),
      serverResponse,
    };
  } catch (err) {
    log.error("[firestoreService] saveUserProfile error", err);
    const code = err?.code || "unknown_error";
    const message = err?.message || String(err);
    return { saved: false, code, message, original: err };
  }
  };

  export const getUserProfile = async (userId) => {
  const uid = userId || auth?.currentUser?.uid || null;

  try {
    if (!uid) {
      log.warn("getUserProfile: no userId provided and no currentUser");
      return null;
    }

    log.info("[firestoreService] getUserProfile start", { userId: uid });

    // 1) Try callable (if functions initialized)
    try {
      if (firebaseApp && exportedFunctions) {
        const callable = httpsCallable(
          exportedFunctions,
          "getUserProfileCallable"
        );
        let res = null;

        try {
          res = await callable({ uid });
        } catch (cErr1) {
          try {
            res = await callable(uid);
          } catch (cErr2) {
            log.warn(
              "getUserProfile: callable getUserProfileCallable attempts failed",
              { cErr1, cErr2 }
            );
            res = null;
          }
        }

        if (res && (res.data || res.result)) {
          const data = res.data ?? res.result ?? res;
          log.info(
            "[firestoreService] getUserProfile: callable returned data for user",
            { userId: uid }
          );
          return { uid, ...data };
        }
      } else {
        log.warn(
          "getUserProfile: exportedFunctions not initialized, skipping callable"
        );
      }
    } catch (callErr) {
      log.warn("getUserProfile: callable fallback errored", callErr);
    }

    // 2) Fallback: direct Firestore read of /users/{uid} (relies on security rules)
    try {
      const userDocRef = doc(db, "users", uid);
      const snap = await retryWithBackoff(
        () => getDoc(userDocRef),
        3,
        600
      );
      if (snap.exists()) {
        const data = snap.data() || {};
        log.info(
          "[firestoreService] getUserProfile: Firestore users doc read succeeded",
          { userId: uid }
        );
        return { uid, ...data };
      } else {
        log.warn(
          "[firestoreService] getUserProfile: no users doc found for uid (Firestore fallback)",
          { userId: uid }
        );
      }
    } catch (fsErr) {
      const code = fsErr?.code || "";
      log.warn(
        "[firestoreService] getUserProfile: Firestore fallback failed (may be rules).",
        { code, error: fsErr }
      );
    }

    // 3) Final fallback: Auth-only profile for current user
    const a = auth?.currentUser;
    if (a && a.uid === uid) {
      const authProfile = {
        uid: a.uid,
        displayName: a.displayName || null,
        photoURL: a.photoURL || null,
        email: a.email || null,
      };
      log.info(
        "[firestoreService] getUserProfile: using auth-only profile (no Firestore/callable data)",
        { userId: uid }
      );
      return authProfile;
    }

    log.warn(
      "getUserProfile: no callable data, no Firestore doc, and no matching auth user; returning null",
      { userId: uid }
    );
    return null;
  } catch (err) {
    const code = err?.code || "unknown";
    const msg = err?.message || String(err);
    log.error("getUserProfile error:", { code, message: msg, err });
    return null;
  }
  };

  export const getUserByEmail = async (email) => {
  try {
    if (!email) return null;
    const qRef = query(collection(db, "users"), where("email", "==", email));
    const snap = await retryWithBackoff(() => getDocs(qRef), 3, 600);
    if (snap.empty) return null;
    const docSnap = snap.docs[0];
    return { id: docSnap.id, ...docSnap.data() };
  } catch (err) {
    log.error("getUserByEmail error", err);
    return null;
  }
  };

  export const getAllUsers = async () => {
  try {
    // No admin-claim check here. Firestore rules control who can read.
    const snap = await retryWithBackoff(
      () => getDocs(collection(db, "users")),
      3,
      800
    );

    if (!snap) {
      log.warn("[firestoreService] getAllUsers: no snapshot returned");
      return [];
    }

    const users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    log.info("[firestoreService] getAllUsers: fetched users", {
      count: users.length,
    });
    return users;
  } catch (err) {
    const code = err?.code || "";
    const message = err?.message || String(err);
    log.error("[firestoreService] getAllUsers error", { code, message, err });
    return [];
  }
  };

  /* -------------------------
    Notifications
    ------------------------- */
  export const addNotification = async (notification) => {
  try {
    const payload = {
      userId: notification.userId || null,
      recipientId: notification.recipientId || notification.userId || null,
      recipientRole:
        notification.recipientRole ||
        (notification.isAdmin ? "admin" : null),
      isAdmin: !!notification.isAdmin,
      type: notification.type || "general",
      title: notification.title || "Notification",
      message: notification.message || "",
      campaignId: notification.campaignId || null,
      data: notification.data || null,
      read: false,
      createdAt: Timestamp.now(),
    };
    const ref = await retryWithBackoff(
      () => addDoc(collection(db, "notifications"), payload),
      3,
      600
    );
    return { id: ref.id, success: true };
  } catch (err) {
    log.error("addNotification failed", err);
    throw err;
  }
  };

  export const markNotificationRead = async (
  notificationId,
  markRead = true
  ) => {
  try {
    if (!notificationId) throw new Error("notificationId required");
    const updates = { read: !!markRead };
    if (markRead) updates.readAt = Timestamp.now();
    else updates.readAt = null;
    await retryWithBackoff(
      () => updateDoc(doc(db, "notifications", notificationId), updates),
      3,
      400
    );
    return { success: true };
  } catch (err) {
    log.error("markNotificationRead failed", err);
    return { success: false };
  }
  };

  export const getUserNotifications = async (userId) => {
  try {
    if (!userId) return [];
    const qRef = query(
      collection(db, "notifications"),
      where("userId", "==", userId),
      orderBy("createdAt", "desc")
    );
    const snapshot = await retryWithBackoff(() => getDocs(qRef), 3, 800);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    log.error("getUserNotifications failed", err);
    return [];
  }
  };

  export const getAdminNotifications = async () => {
  try {
    const qRef = query(
      collection(db, "notifications"),
      where("isAdmin", "==", true),
      orderBy("createdAt", "desc")
    );
    const snapshot = await retryWithBackoff(() => getDocs(qRef), 3, 800);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    log.error("getAdminNotifications failed", err);
    return [];
  }
  };

  export const sendNotification = async (
  userId,
  title,
  message,
  extra = {}
  ) => {
  try {
    const notifRef = doc(collection(db, "notifications"));
    await retryWithBackoff(
      () =>
        setDoc(
          notifRef,
          {
            userId,
            title,
            message,
            read: false,
            createdAt: Timestamp.now(),
            ...extra,
          },
          { merge: true }
        ),
      3,
      600
    );
    return { success: true };
  } catch (err) {
    log.error("sendNotification failed", err);
    throw err;
  }
  };

  export const markTransferDone = async (
  notificationId,
  campaignId,
  adminId = null
  ) => {
  try {
    if (!notificationId || !campaignId)
      throw new Error("notificationId and campaignId required");
    const campaignRef = doc(db, "campaigns", campaignId);
    const notifRef = doc(db, "notifications", notificationId);

    await retryWithBackoff(
      () =>
        runTransaction(db, async (tx) => {
          const campSnap = await tx.get(campaignRef);
          if (!campSnap.exists()) throw new Error("Campaign not found");

          const campData = campSnap.data();

          tx.update(campaignRef, {
            transferred: true,
            transferredAt: Timestamp.now(),
            transferredBy: adminId || null,
            isActive: false,
            status: "completed",
            updatedAt: Timestamp.now(),
          });

          tx.update(notifRef, {
            resolved: true,
            read: true,
            resolvedAt: Timestamp.now(),
          });

          if (campData.creatorId) {
            const creatorNotifRef = doc(collection(db, "notifications"));
            tx.set(creatorNotifRef, {
              userId: campData.creatorId,
              recipientId: campData.creatorId,
              type: "funds_transferred",
              title: "✅ Funds Transferred",
              message: `Funds for your campaign "${campData.title}" have been successfully transferred.`,
              campaignId,
              read: false,
              createdAt: Timestamp.now(),
            });
          }
        }),
      3,
      1000
    );

    return { success: true };
  } catch (err) {
    log.error("markTransferDone failed", err);
    throw err;
  }
  };

  /* --------------------------------------------------
   Admin compatibility wrapper
   (DO NOT duplicate logic)
-------------------------------------------------- */
export const markCampaignAsPaid = async (campaignId, adminId = null) => {
  if (!campaignId) {
    throw new Error("campaignId required");
  }

  /**
   * We DO NOT require notificationId here because:
   * - Admin is manually confirming payout
   * - Some campaigns may not have an active admin notification
   */

  const campaignRef = doc(db, "campaigns", campaignId);

  await retryWithBackoff(
    () =>
      runTransaction(db, async (tx) => {
        const snap = await tx.get(campaignRef);
        if (!snap.exists()) throw new Error("Campaign not found");

        tx.update(campaignRef, {
          transferred: true,
          transferredAt: Timestamp.now(),
          transferredBy: adminId || null,
          isActive: false,
          status: "completed",
          updatedAt: Timestamp.now(),
        });
      }),
    3,
    800
  );

  return { success: true };
};

  /* -------------------------
    Platform stats helpers
    ------------------------- */
  const STATS_DOC_REF = doc(db, "platformStats", "summary");

  export async function getPlatformStats() {
  try {
    const snap = await retryWithBackoff(() => getDoc(STATS_DOC_REF), 3, 600);
    if (!snap.exists()) {
      return {
        campaignsRun: 0,
        donorsSupported: 0,
        eventsFunded: 0,
        totalDonationsAmount: 0,
        totalDonationsCount: 0,
        avgDonorGift: 0,
      };
    }
    return snap.data();
  } catch (err) {
    log.error("getPlatformStats failed", err);
    return {
      campaignsRun: 0,
      donorsSupported: 0,
      eventsFunded: 0,
      totalDonationsAmount: 0,
      totalDonationsCount: 0,
      avgDonorGift: 0,
    };
  }
  }

  export function subscribePlatformStats(onUpdate, onError) {
  try {
    const unsub = onSnapshot(
      STATS_DOC_REF,
      (snap) => {
        onUpdate(snap.exists() ? snap.data() : {});
      },
      onError
    );
    return unsub;
  } catch (err) {
    log.error("subscribePlatformStats failed", err);
    if (typeof onError === "function") onError(err);
    return () => {};
  }
  }

  export async function incrementPlatformStats(payload = {}) {
  // TEMP: disabled on client – Firestore rules block this in production.
  log.warn(
    "incrementPlatformStats: skipped — client-side stats writes are disabled."
  );
  return { success: false, reason: "client_stats_disabled" };
  }
