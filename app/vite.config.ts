import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Two small pages, one per panel: the character (dock) and the card.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: { input: { dock: resolve(__dirname, "dock.html"), card: resolve(__dirname, "card.html"), overlay: resolve(__dirname, "overlay.html") } },
  },
});
