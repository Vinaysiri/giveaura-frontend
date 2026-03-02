import React, { useEffect, useState } from "react";
import { getSettlements, markSettlementStatus } from "../../services/firestoreService";

export default function SettlementsPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const pending = await getSettlements("pending", 200);
    setList(pending);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const markDone = async (id) => {
    if (!window.confirm("Mark as completed?")) return;
    await markSettlementStatus(id, "completed");
    await load();
  };

  const markFailed = async (id) => {
    if (!window.confirm("Mark as failed?")) return;
    await markSettlementStatus(id, "failed");
    await load();
  };

  if (loading) return <div>Loading…</div>;
  return (
    <div>
      <h2>Pending settlements</h2>
      {list.length === 0 ? <div>No pending settlements</div> : (
        <ul>
          {list.map((s) => (
            <li key={s.id} style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <div><strong>Campaign:</strong> {s.campaignId}</div>
                <div><strong>Amount:</strong> ₹{s.amount}</div>
                <div className="muted small">{s.notes}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => markDone(s.id)}>Mark completed</button>
                <button onClick={() => markFailed(s.id)}>Mark failed</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
