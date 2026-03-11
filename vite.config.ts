import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
            return "vendor-react";
          }

          if (id.includes("node_modules/@tauri-apps")) {
            return "vendor-tauri";
          }

          if (
            id.includes("node_modules/@codemirror") ||
            id.includes("node_modules/@lezer") ||
            id.includes("node_modules/codemirror")
          ) {
            return "vendor-codemirror";
          }

          if (id.includes("node_modules/shiki")) {
            return "vendor-shiki";
          }

          if (id.includes("node_modules/react-markdown") || id.includes("node_modules/remark-gfm")) {
            return "vendor-markdown-preview";
          }

          if (
            id.includes("node_modules/@milkdown") ||
            id.includes("node_modules/prosemirror") ||
            id.includes("node_modules/markdown-it")
          ) {
            return "vendor-milkdown";
          }

          if (id.includes("node_modules/react-arborist")) {
            return "vendor-tree";
          }
        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
