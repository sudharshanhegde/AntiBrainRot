import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import "./index.css";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <App />
      {/* Vercel Web Analytics: first-party, privacy-friendly page view
          and unique-visitor tracking. No analytics on this screen, the
          script is injected at build and reports to the project's
          Analytics tab. */}
      <Analytics />
    </AuthProvider>
  </StrictMode>
);
