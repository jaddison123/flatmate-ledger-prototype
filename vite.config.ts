import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const chatProxy = {
  target: "http://127.0.0.1:3001",
  changeOrigin: true,
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api/chat": chatProxy,
    },
  },
  preview: {
    proxy: {
      "/api/chat": chatProxy,
    },
  },
});
