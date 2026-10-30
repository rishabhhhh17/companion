import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// One small page per panel: the character (dock), the card (Home, with Settings inside it: F28, T17), the pointer overlay,
// the island in the notch and the ring that follows the pointer.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: { input: { dock: resolve(__dirname, "dock.html"), card: resolve(__dirname, "card.html"), overlay: resolve(__dirname, "overlay.html"), island: resolve(__dirname, "island.html"), follow: resolve(__dirname, "follow.html") } },
  },
});
