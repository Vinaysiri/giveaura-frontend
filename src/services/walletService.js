// src/services/walletService.js
import {
  collection,
  collectionGroup,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "../firebase";

/* ======================================================
   WALLET OVERVIEW
   ====================================================== */
export async function getWalletOverview(uid) {
  if (!uid) throw new Error("uid required");

  let lifetime = 0;
  let available = 0;
  let pending = 0;
  let campaignsEarnings = 0;
  let csrEarnings = 0;

  /* -------------------------------
     1️⃣ DONATIONS (campaign + root)
     ------------------------------- */
  const seen = new Set();

  const campaignSnap = await getDocs(
    query(
      collectionGroup(db, "donations"),
      where("campaignCreatorId", "==", uid)
    )
  );

  const rootSnap = await getDocs(
    query(
      collection(db, "donations"),
      where("campaignCreatorId", "==", uid)
    )
  );

  [...campaignSnap.docs, ...rootSnap.docs].forEach((doc) => {
    if (seen.has(doc.id)) return;
    seen.add(doc.id);

    const d = doc.data();
    const amount = Number(d.amount || 0);

    lifetime += amount;
    campaignsEarnings += amount;

    if (d.settled === true || d.settlementStatus === "settled") {
      available += amount;
    } else {
      pending += amount;
    }
  });

  /* -------------------------------
     2️⃣ SETTLEMENTS (authoritative)
     ------------------------------- */
  try {
    const settlementsSnap = await getDocs(
      query(
        collection(db, "settlements"),
        where("campaignCreatorId", "==", uid)
      )
    );

    let settledTotal = 0;
    settlementsSnap.forEach((doc) => {
      settledTotal += Number(doc.data().amount || 0);
    });

    // settlements are source of truth
    available = settledTotal;
    pending = Math.max(lifetime - settledTotal, 0);
  } catch {
    // settlements optional
  }

  return {
    available,
    pending,
    lifetime,
    campaignsEarnings,
    csrEarnings,
    boostsSpent: 0,
    subscriptionsSpent: 0,
  };
}


/* ======================================================
   WALLET ACTIVITY (TIMELINE)
   ====================================================== */
export async function getWalletActivity(uid, limitCount = 25) {
  if (!uid) return [];

  const activity = [];
const seen = new Set();

let campaignSnap;
try {
  campaignSnap = await getDocs(
    query(
      collectionGroup(db, "donations"),
      where("campaignCreatorId", "==", uid),
      orderBy("createdAt", "desc"),
      limit(limitCount)
    )
  );
} catch {
  campaignSnap = await getDocs(
    query(
      collectionGroup(db, "donations"),
      where("campaignCreatorId", "==", uid),
      limit(limitCount)
    )
  );
}

const rootSnap = await getDocs(
  query(
    collection(db, "donations"),
    where("campaignCreatorId", "==", uid),
    limit(limitCount)
  )
);

[...campaignSnap.docs, ...rootSnap.docs].forEach((doc) => {
  if (seen.has(doc.id)) return;
  seen.add(doc.id);

  const d = doc.data();

  activity.push({
    id: doc.id,
    type: "donation-credit",
    direction: "credit",
    amount: Number(d.amount || 0),
    createdAt: d.createdAt?.toDate?.() || null,
    label: "Donation received",
    meta: {
      campaignId: d.campaignId || null,
      campaignTitle: d.campaignTitle || null,
      paymentId: d.paymentId || null,
    },
  });
});

  /* --------------------------------------------------
     2️⃣ SETTLEMENT EVENTS
     -------------------------------------------------- */
  try {
    const settlementsSnap = await getDocs(
      query(
        collection(db, "settlements"),
        where("campaignCreatorId", "==", uid),
        orderBy("createdAt", "desc"),
        limit(limitCount)
      )
    );

    settlementsSnap.forEach((doc) => {
      const s = doc.data();

      activity.push({
        id: doc.id,
        type: "payout",
        direction: "credit",
        amount: Number(s.amount || 0),
        createdAt: s.createdAt?.toDate?.() || null,
        label: "Funds settled",
        meta: {
          settlementId: doc.id,
          note: s.note || null,
        },
      });
    });
  } catch {
    // settlements optional
  }

  
  /* --------------------------------------------------
     3️⃣ SORT + LIMIT
     -------------------------------------------------- */
  return activity
    .sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    })
    .slice(0, limitCount);
}
