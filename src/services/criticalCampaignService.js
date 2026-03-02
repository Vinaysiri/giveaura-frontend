import { db } from "../firebase";
import { collection, getDocs } from "firebase/firestore";

export async function getMostCriticalCampaign() {
  const snap = await getDocs(collection(db, "campaigns"));
  const now = Date.now();

  let best = null;
  let bestScore = -1;

  snap.forEach((doc) => {
    const c = doc.data();
    if (c.status !== "active" || !c.isApproved) return;
    if (!c.endDate || !c.goalAmount) return;

    const endMs = c.endDate.seconds * 1000;
    const daysLeft = Math.max(0.5, (endMs - now) / 86400000);
    const fundedPct =
      c.goalAmount > 0 ? (c.fundsRaised / c.goalAmount) * 100 : 0;

    if (fundedPct > 60) return;

    let categoryWeight = 1;
    if (c.category === "medical") categoryWeight = 1.6;
    if (c.category === "disaster") categoryWeight = 1.4;

    const urgencyScore =
      (1 / daysLeft) * 45 +
      (100 - fundedPct) * 0.45 +
      Math.log(c.goalAmount + 1) * 6;

    const finalScore = urgencyScore * categoryWeight;

    if (finalScore > bestScore) {
      bestScore = finalScore;
      best = {
        id: doc.id,
        ...c,
        urgencyScore: Math.min(100, Math.round(finalScore)),
      };
    }
  });

  return best;
}
