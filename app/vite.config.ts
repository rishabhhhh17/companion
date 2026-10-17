import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// One small page per panel: the character (dock), the card (Home), the pointer overlay and the island in the notch.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: { input: { dock: resolve(__dirname, "dock.html"), card: resolve(__dirname, "card.html"), overlay: resolve(__dirname, "overlay.html"), island: resolve(__dirname, "island.html") } },
  },
});
