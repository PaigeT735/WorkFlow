import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The UI calls the analysis backend only through this same-origin proxy.
// Nothing in the browser talks to Grok or holds an API key.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  preview: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
});
