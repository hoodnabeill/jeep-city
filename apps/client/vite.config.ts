import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
    // Dev only: lets a Cloudflare quick tunnel (https://….trycloudflare.com) reach this dev server for app testing.
    allowedHosts: [".trycloudflare.com"],
    // Dev only: the API runs on 8787 (npm run server). The desktop build calls VITE_API_URL directly.
    proxy: { "/api": { target: "http://localhost:8787", rewrite: (p) => p.replace(/^\/api/, "") } },
  },
});
