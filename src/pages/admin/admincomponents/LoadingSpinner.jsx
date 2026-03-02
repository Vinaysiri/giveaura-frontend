import React from "react";

/**
 * LoadingSpinner - small accessible spinner
 * props:
 *  - size (number) default 28
 *  - ariaLabel (string)
 */
export default function LoadingSpinner({ size = 28, ariaLabel = "Loading" }) {
  const s = Math.max(12, size);
  const stroke = Math.max(2, Math.round(s * 0.08));
  const view = 50;
  return (
    <svg
      role="status"
      aria-label={ariaLabel}
      width={s}
      height={s}
      viewBox={`0 0 ${view} ${view}`}
      style={{ display: "inline-block" }}
    >
      <circle
        cx={view/2}
        cy={view/2}
        r={(view/2) - stroke}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.12"
        strokeWidth={stroke}
      />
      <path
        d={`M${view-6} ${view/2} A ${view/2 - stroke} ${view/2 - stroke} 0 0 1 ${view/2} ${6}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
      >
        <animateTransform attributeName="transform" type="rotate" from={`0 ${view/2} ${view/2}`} to={`360 ${view/2} ${view/2}`} dur="0.9s" repeatCount="indefinite" />
      </path>
    </svg>
  );
}
