import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // GitHub Pages отдаёт проект по подпути /<репозиторий>/
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: { "/api": process.env.API_PROXY ?? "http://localhost:8000" },
  },
});
