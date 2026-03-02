import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";

const profileCache = new Map();

export async function getUserProfile(uid) {
  if (!uid) return null;

  if (profileCache.has(uid)) {
    return profileCache.get(uid);
  }

  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) {
      profileCache.set(uid, null);
      return null;
    }

    const data = snap.data();
    profileCache.set(uid, data);
    return data;
  } catch {
    return null;
  }
}
