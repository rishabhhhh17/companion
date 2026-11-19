// M113 [verify] helper (docs/milestones/M109-real-mac-guide.md): reads the notes a real AI tool handed to the capture hook in a
// throwaway practice folder, and prints for each one the event and tool name the tool used, the keys it sent, and what the
// notch's live feed would show for it (livefeed.ts editsOf). It never prints the edit's text. No model, no network, no git.
// Usage: bun runner/scripts/m113-feed-check.ts <practice folder>
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { editsOf, shownPath } from "../src/livefeed.ts";

const dir = process.argv[2];
if (!dir) { console.error("Usage: bun runner/scripts/m113-feed-check.ts <practice folder>"); process.exit(2); }
const cap = join(dir, ".capture");
let names: string[] = [];
try { names = readdirSync(cap).filter((n) => n.endsWith(".json")).sort(); } catch { /* none */ }
if (!names.length) { console.log(`No notes yet in ${cap}. Ask the tool to edit hello.txt, then run this again.`); process.exit(1); }
let shown = 0;
for (const n of names) {
  const text = readFileSync(join(cap, n), "utf8");
  let o: Record<string, unknown> = {};
  try { o = JSON.parse(text); } catch { console.log(`${n}: not JSON (${text.length} bytes)`); continue; }
  const input = (o.tool_input ?? o.toolArgs ?? {}) as Record<string, unknown>;
  const edits = editsOf(text);
  shown += edits.length;
  console.log(`${n}: event ${String(o.hook_event_name ?? "?")}, tool ${String(o.tool_name ?? o.toolName ?? "(none)")}, keys [${Object.keys(o).sort().join(", ")}], input keys [${typeof input === "object" && input ? Object.keys(input).sort().join(", ") : typeof input}]`);
  for (const e of edits) console.log(`   the notch shows: ${shownPath(dir, e.path, e.cwd)}  ${e.added !== undefined ? `+${e.added}` : ""} ${e.removed !== undefined ? `−${e.removed}` : ""}`);
  if (!edits.length) console.log("   the notch shows nothing for this note");
}
console.log(shown ? `PASS: ${shown} edit line(s) would show.` : "FAIL: no note became an edit line. Send the keys above to the build session.");
process.exit(shown ? 0 : 1);
