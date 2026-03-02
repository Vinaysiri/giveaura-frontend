// scripts/backfillCreatorNames.js
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, getDoc, updateDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyA00P16ZpwA1O6XUg1jfmWbouJcA9KzxxU",
  authDomain: "fundraiser-donations.firebaseapp.com",
  projectId: "fundraiser-donations",
  storageBucket: "fundraiser-donations.appspot.com",
  messagingSenderId: "413991844748",
  appId: "1:413991844748:web:b947deed6f0f2a49e3f4a9",
  measurementId: "G-N0XGL81P88",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function getProfileName(uid, email) {
  try {
    if (!uid) return email ? email.split("@")[0] : "Anonymous";
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) {
      const d = snap.data();
      if (d?.displayName && d.displayName.trim()) return d.displayName;
      if (d?.email) return d.email.split("@")[0];
    }
    return email ? email.split("@")[0] : "Anonymous";
  } catch (err) {
    console.warn("getProfileName failed:", err);
    return email ? email.split("@")[0] : "Anonymous";
  }
}

(async () => {
  try {
    console.log("Starting backfill of campaigns.creatorName...");
    const snaps = await getDocs(collection(db, "campaigns"));
    let updated = 0;
    for (const s of snaps.docs) {
      const data = s.data();
      if (!data?.creatorName || data.creatorName === "") {
        const name = await getProfileName(data?.creatorId, data?.creatorEmail);
        await updateDoc(doc(db, "campaigns", s.id), { creatorName: name, updatedAt: new Date() });
        console.log("Updated", s.id, "->", name);
        updated++;
      }
    }
    console.log("Backfill complete. Updated:", updated);
    process.exit(0);
  } catch (err) {
    console.error("Backfill failed:", err);
    process.exit(1);
  }
})();
