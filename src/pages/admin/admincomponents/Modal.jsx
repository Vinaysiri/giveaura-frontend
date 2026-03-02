// src/pages/admin/components/Modal.jsx
import React, { useEffect, useRef } from "react";
import "../styles/modal.css";

/**
 * Modal
 *
 * Props:
 * - open (bool)
 * - title (string)
 * - children (node)
 * - onClose (fn)
 * - subtitle (string) optional: used for aria-describedby
 */
export default function Modal({ open = false, title = "", subtitle = "", children, onClose }) {
  const cardRef = useRef(null);
  const previouslyFocused = useRef(null);

  // Prevent background scroll while modal open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev || "";
    };
  }, [open]);

  // Save/restore focus and focus first focusable element inside modal
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement;

    // small timeout to ensure modal DOM exists
    setTimeout(() => {
      const card = cardRef.current;
      if (!card) return;
      const focusable = card.querySelectorAll(
        'a[href], area[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable && focusable.length) {
        focusable[0].focus();
      } else {
        // fallback to close button or card itself
        const closeBtn = card.querySelector(".modal-close");
        if (closeBtn) closeBtn.focus();
        else card.setAttribute("tabindex", "-1"), card.focus();
      }
    }, 10);

    return () => {
      try {
        if (previouslyFocused.current && previouslyFocused.current.focus) previouslyFocused.current.focus();
      } catch {}
    };
  }, [open]);

  // key handlers: Escape + Tab trapping
  useEffect(() => {
    if (!open) return;

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose && onClose();
      } else if (e.key === "Tab") {
        // simple focus trap
        const card = cardRef.current;
        if (!card) return;
        const focusable = Array.from(
          card.querySelectorAll(
            'a[href], area[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetParent !== null); // visible
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "modal-title" : undefined}
      aria-describedby={subtitle ? "modal-subtitle" : undefined}
      onMouseDown={(e) => {
        // close when clicking backdrop (but not when clicking inside the card)
        if (e.target === e.currentTarget) {
          onClose && onClose();
        }
      }}
    >
      <div
        className="modal-card"
        ref={cardRef}
        onMouseDown={(e) => e.stopPropagation()}
        tabIndex={-1}
        style={{
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
        }}
      >

        <header className="modal-header">
          <div>
            <h3 id="modal-title" style={{ margin: 0 }}>
              {title}
            </h3>
            {subtitle && (
              <div id="modal-subtitle" className="text-muted small" style={{ marginTop: 6 }}>
                {subtitle}
              </div>
            )}
          </div>

          <button
            className="modal-close"
            onClick={() => onClose && onClose()}
            aria-label="Close modal"
            title="Close"
          >
            ✕
          </button>
        </header>

        <div
          className="modal-body"
          style={{
            overflowY: "auto",
            paddingRight: 8,
            flex: 1,
          }}
        >
          {children}
        </div>


        <footer className="modal-footer">
          <button className="btn-outline" onClick={() => onClose && onClose()}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
