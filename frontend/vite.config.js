import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Base URL is absolute so the app can be served from a subpath or installed
// as a PWA. Keep it "/" for now; revisit when the PWA manifest lands.
export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    // Thin Express API will live on a different port during development.
    // Add a proxy here once /backend is wired in.
  },
});
