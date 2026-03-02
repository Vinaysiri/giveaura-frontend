import React from "react";

/**
 * StatCard - small tile for numeric KPIs
 * props: title, value, subtitle
 */
export default function StatCard({ title, value, subtitle }) {
  return (
    <div className="kpi-card" style={{padding:12, borderRadius:12}}>
      <div className="kpi-value" style={{fontSize:20, fontWeight:700}}>{value}</div>
      <div className="kpi-label" style={{marginTop:6}}>{title}</div>
      {subtitle && <div className="small text-muted" style={{marginTop:6}}>{subtitle}</div>}
    </div>
  );
}
