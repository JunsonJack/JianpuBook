import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  clearScreen: false,
  server: {
    // Keep in sync with tauri.conf.json devUrl (Tauri default 1420)
    port: 1420,
    strictPort: true,
    host: "127.0.0.1",
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  build: {
    target: "es2022",
    outDir: "dist",
  },
});
