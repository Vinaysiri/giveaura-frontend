// src/main.jsx

// Global/base styles first
import "./index.css";
// App-level + mobile-fix styles
import "./App.css";
// Any extra project styles
import "./styles/global.css";

// Initialize firebase early
import "./firebase";

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ErrorBoundary from "./components/ErrorBoundary";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element (#root) not found in index.html");
}

/* =====================================================
   APP BOOTSTRAP
===================================================== */
createRoot(container).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
