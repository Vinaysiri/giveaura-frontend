import React from "react";

/**
 * Minimal ChartCard wrapper.
 * Props:
 *  - title (string)
 *  - children (chart markup or svg)
 */
export default function ChartCard({ title, children }) {
  return (
    <div className="card chart-card-shell" style={{padding:12}}>
      {title && <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8}}>
        <h4 style={{margin:0, fontSize:16}}>{title}</h4>
      </div>}
      <div className="chart-placeholder" style={{padding:12}}>
        {children}
      </div>
    </div>
  );
}
