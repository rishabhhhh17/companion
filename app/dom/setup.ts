// M59: the DOM tests' preload (bun test --preload ./dom/setup.ts, package.json test:dom): the DOM and the stand in app
// first (globals.ts), then Testing Library, which needs the DOM to exist when it loads.
import { afterEach } from "bun:test";
import { app } from "./globals.ts";
// Loaded only now: bun loads a statically imported CommonJS package before this module's own imports run.
const { cleanup, configure } = await import("@testing-library/react");

export { app };
export type { Call } from "./globals.ts";

// A query that finds nothing says so in one line, not with the whole page printed under it.
configure({ getElementError: (message) => { const e = new Error(message ?? "not found"); e.name = "TestingLibraryElementError"; return e; } });

// Settings are read once per page load (settingsStore.ts): each test starts as a fresh page would, asking settings_get.
const settingsStore = await import("../src/settingsStore.ts");

afterEach(() => {
  cleanup();
  settingsStore._resetForTests();
  app.reset();
  try { localStorage.clear(); } catch { /* storage may be unavailable */ }
});
