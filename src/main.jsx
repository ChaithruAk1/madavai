// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import AuthGate from "./auth/AuthGate.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthGate>
        <App />
      </AuthGate>
    </ErrorBoundary>
  </React.StrictMode>
);
