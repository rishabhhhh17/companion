// Operator command: find a person from the opaque id Anthropic reported (or from our own owner id), and suspend or restore them.
// A dry run unless --apply is given. See usage-proxy/README.md and docs/legal/abuse-process.md.
//
// There is no real store yet (see the README), so the store is loaded from a module you name with --store (or SUSPEND_STORE):
// its default export must be a Store, or a function returning one. Without it this prints a plain sentence and stops.
import { runOperator } from "../src/operator.ts";
import type { Store } from "../src/store.ts";

const argv = process.argv.slice(2);
const at = argv.indexOf("--store");
const storePath = at >= 0 ? argv.splice(at, 2)[1] : process.env.SUSPEND_STORE;
if (!storePath) {
  console.log("No store is connected. The real store is not built yet. Give the module that holds it with --store <file> (or the SUSPEND_STORE setting). Nothing was changed.");
  process.exit(1);
}
const mod = await import(new URL(storePath, `file://${process.cwd()}/`).href);
const store: Store = typeof mod.default === "function" ? await mod.default() : mod.default;
const r = await runOperator(argv, process.env, store, Date.now);
for (const l of r.lines) console.log(l);
process.exit(r.code);
