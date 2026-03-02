import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  writeBatch,
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase";

/* ===============================
   GET MY REFERRALS
================================ */
export async function getMyReferrals(userId) {
  if (!userId) return [];

  const q = query(
    collection(db, "referrals"),
    where("referrerId", "==", userId),
    orderBy("createdAt", "desc")
  );

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
}

/* ===============================
   HANDLE REFERRAL ON SIGNUP
================================ */
export async function handleReferralOnSignup(newUserId) {
  const referrerId = localStorage.getItem("referralCode");

  // safety checks
  if (!referrerId) return;
  if (referrerId === newUserId) return;

  const batch = writeBatch(db);

  // ensure user doc exists + mark referral
  batch.set(
    doc(db, "users", newUserId),
    { referredBy: referrerId },
    { merge: true } // 🔑 important
  );

  // create referral record
  batch.set(doc(collection(db, "referrals")), {
    referrerId,
    refereeId: newUserId,
    status: "registered",
    source: "profile-share",
    createdAt: serverTimestamp(),
  });

  await batch.commit();

  localStorage.removeItem("referralCode");
}
