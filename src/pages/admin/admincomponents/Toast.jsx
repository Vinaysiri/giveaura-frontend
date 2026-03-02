// src/pages/admin/components/Toast.jsx
import React, { useEffect, useState } from "react";
import "../styles/admin.css";

export default function Toast() {
  const [visible, setVisible] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      setMsg("Welcome to GiveAura admin");
      setVisible(true);
      const hide = setTimeout(() => setVisible(false), 3500);
      return () => clearTimeout(hide);
    }, 500);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;
  return (
    <div className="ga-toast" role="status" aria-live="polite">
      <div className="ga-toast-card">{msg}</div>
    </div>
  );
}
