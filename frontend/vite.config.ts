import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // GitLab Pages отдаёт проект по подпути /<проект>/
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: { "/api": process.env.API_PROXY ?? "http://localhost:8000" },
  },
});
