// Operator command: list the owners worth a look today (counts only). Run it once a day while the managed route is on.
// Same store loading as suspend.ts: give the module that holds the store with --store <file> (or SUSPEND_STORE).
import { signalLines } from "../src/signals.ts";
import type { Store } from "../src/store.ts";

const argv = process.argv.slice(2);
const at = argv.indexOf("--store");
const storePath = at >= 0 ? argv.splice(at, 2)[1] : process.env.SUSPEND_STORE;
if (!storePath) {
  console.log("No store is connected. The real store is not built yet. Give the module that holds it with --store <file> (or the SUSPEND_STORE setting). Nothing was read.");
  process.exit(1);
}
const mod = await import(new URL(storePath, `file://${process.cwd()}/`).href);
const store: Store = typeof mod.default === "function" ? await mod.default() : mod.default;
for (const l of await signalLines(store, Date.now())) console.log(l);
