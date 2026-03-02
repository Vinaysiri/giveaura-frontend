import React from "react";
import "./Footer.css";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-container">
        {/* Brand */}
        <h3 className="footer-brand">
          GIVEAURA
          <sup>™</sup>
        </h3>

        <p className="footer-tagline">
          Empowering verified fundraisers, donors, and impact events — built on
          trust and transparency.
        </p>

        {/* Links */}
        <nav className="footer-links">
          {[
            { href: "/csr-dashboard", label: "CSR Dashboard" },
            { href: "/about", label: "About Us" },
            { href: "/membership", label: "Membership" },
            { href: "/events", label: "Events" },
            { href: "/terms", label: "Terms of Service" },
            { href: "/refund-policy", label: "Privacy Policy" },
            { href: "mailto:support@giveaura.com", label: "Contact" },
          ].map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>

        <hr className="footer-divider" />

        {/* Social Icons */}
        <div className="footer-social">
          {/* Instagram */}
          <a
            href="https://www.instagram.com/giveaura_official/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram"
          >
            <svg viewBox="0 0 24 24">
              <rect x="2" y="2" width="20" height="20" rx="5" />
              <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
              <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
            </svg>
          </a>

          {/* Twitter / X */}
          <a
            href="https://twitter.com/Give_Aura"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Twitter"
          >
            <svg viewBox="0 0 24 24">
              <path d="M23 3s-2 .8-3.2 1.2C18.5 3.1 16.9 3 15.4 3 10 3 6 7.3 6 12.2c0 4-3 6-6 6 2 .1 3.9-.6 5.5-1.8a6.5 6.5 0 0 1-5.3-6.3v-.1c.9.5 2.1.8 3.4.8a6.8 6.8 0 0 1-2.8-5.6c0-1.2.3-2.3.9-3.2A19.5 19.5 0 0 0 16.5 8c-.3-1.7 1-3.4 3-3.4 1 0 2 .5 2.6 1.3A9.3 9.3 0 0 0 23 3z" />
            </svg>
          </a>

          {/* LinkedIn */}
          <a
            href="https://linkedin.com/company/giveaura"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn"
          >
            <svg viewBox="0 0 24 24">
              <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z" />
              <rect x="2" y="9" width="4" height="12" />
              <circle cx="4" cy="4" r="2" />
            </svg>
          </a>
        </div>

        {/* Copyright */}
        <p className="footer-copy">
          © {new Date().getFullYear()} GiveAura™. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
