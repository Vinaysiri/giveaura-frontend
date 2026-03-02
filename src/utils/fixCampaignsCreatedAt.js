// src/utils/fixCampaignsCreatedAt.js
import { db } from "../firebase";
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";

/**
 * Temporary migration utility:
 * Fix campaigns missing `createdAt` by setting serverTimestamp()
 */
export async function fixCampaignsCreatedAt() {
  try {
    const snap = await getDocs(collection(db, "campaigns"));
    let fixed = 0;

    for (const d of snap.docs) {
      const data = d.data();
      if (!data.createdAt) {
        await updateDoc(doc(db, "campaigns", d.id), {
          createdAt: serverTimestamp(),
        });
        fixed++;
      }
    }

    console.log(`🛠 Fixed ${fixed} campaigns with missing createdAt`);
    return fixed;
  } catch (err) {
    console.error(" Migration error:", err);
    return 0;
  }
}
