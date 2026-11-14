import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development the API (house data and chat) runs in server.mjs on port 3001.
const apiProxy = {
  target: "http://127.0.0.1:3001",
  changeOrigin: true,
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": apiProxy,
    },
  },
  preview: {
    proxy: {
      "/api": apiProxy,
    },
  },
});
