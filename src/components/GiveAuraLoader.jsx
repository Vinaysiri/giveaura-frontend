import React from "react";
import "./GiveAuraLoader.css";

export default function GiveAuraLoader({ fullScreen = true }) {
  return (
    <div className={fullScreen ? "ga-loader-overlay" : "ga-loader-inline"}>
      <svg
        width="260"
        height="80"
        viewBox="0 0 260 80"
        className="ga-loader-svg"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Give */}
        <text
          x="40"
          y="50"
          className="ga-text ga-give"
        >
          Give
        </text>

        {/* Aura */}
        <text
          x="150"
          y="50"
          className="ga-text ga-aura"
        >
          Aura
        </text>
      </svg>
    </div>
  );
}
