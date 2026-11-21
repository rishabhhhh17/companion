// M108 [verify] on a real Mac (docs/milestones/M109-real-mac-guide.md), run by scripts/m108-check-start.sh. Uses the engine's
// own code, so the start line and the start file are exactly what Squibby writes:
//   setup <codex|gemini|antigravity> <folder> <data>  one decided note with a practice word, the tool's start line, its file
//   show <folder> <data>                              what the tool's hook prints right now (run with /bin/sh, as the tool runs it)
// The practice word lives only in Squibby's start file, in <data>, a separate folder outside the practice folder (M108 review:
// a data folder inside it let a tool find the word by searching the folder). The project's own note file (.companion/project.md)
// would hold it too, so once the start file is written that copy is removed from the practice folder. Setup takes only a new,
// empty practice folder, refuses a data folder inside it, and checks that no file of the practice folder holds the word, so a
// tool that names it was handed the block.
// No model is called by this script, nothing is sent anywhere, git is never run.
import { mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, isAbsolute } from "node:path";
import { spawnSync } from "node:child_process";
import { DoneSignals, HOOK_FILE, START_TOOLS, startCommand, type DoneTool } from "../src/donesignal.ts";
import { MemoryStore } from "../src/memory/store.ts";
import { SessionStartNotes } from "../src/memory/sessionstart.ts";

export const PRACTICE_WORD = "PLUM-7";
const [cmd, a, b, c] = process.argv.slice(2);
/** True when `inner` is `outer` or inside it. */
const inside = (outer: string, inner: string) => { const r = relative(outer, inner); return r === "" || (!r.startsWith("..") && !isAbsolute(r)); };
const real = (p: string) => { try { return realpathSync(p); } catch { return resolve(p); } };
/** Every file of the practice folder that holds the practice word (there should be none). */
const holding = (dir: string): string[] => readdirSync(dir, { recursive: true, encoding: "utf8" }).map((f) => join(dir, f))
  .filter((f) => { try { return statSync(f).isFile() && readFileSync(f, "utf8").includes(PRACTICE_WORD); } catch { return false; } });
if (cmd === "setup") {
  const tool = a as DoneTool, dir = b, data = c;
  if (!dir || !data) { console.log("Usage: setup <codex|gemini|antigravity> <folder> <data folder>"); process.exit(2); }
  if (tool === "claude" || !START_TOOLS.includes(tool)) { console.log(`${tool} has no start line here`); process.exit(2); }
  if (inside(real(dir), real(data)) || inside(resolve(dir), resolve(data))) { console.log("The data folder must be outside the practice folder, or a tool could find the word there."); process.exit(2); }
  // Only a new, empty practice folder: the note file is removed from it below, so never a real project.
  if (readdirSync(dir).length) { console.log("The practice folder must be new and empty."); process.exit(2); }
  mkdirSync(data, { recursive: true });
  writeFileSync(join(dir, "hello.txt"), "hello world\n");
  const m = new MemoryStore({ project: dir, profileDir: data });
  m.add("project", `Decided: the practice word is ${PRACTICE_WORD}, because this checks the start notes`, "you wrote it", new Date());
  const s = new DoneSignals(data), notes = new SessionStartNotes({ data, signals: s, memoryDir: data });
  const r = s.add(dir, tool, "start");
  notes.refresh(dir, m);
  writeFileSync(join(data, "tool"), tool);
  // The start file in <data> is now the only copy the tool can get; the note file this script just made in the folder goes.
  rmSync(join(dir, ".companion"), { recursive: true, force: true });
  console.log(`start: ${r.on ? "written" : `not written (${r.problem ?? "unknown"})`} in ${r.rel}`);
  const found = holding(dir);
  if (found.length) { console.log(`The practice word is in the practice folder, so the check would prove nothing: ${found.join(", ")}`); process.exit(1); }
  console.log(`The practice word is in no file of the practice folder.`);
} else if (cmd === "show") {
  const dir = a, data = b;
  if (!dir || !data) { console.log("Usage: show <folder> <data folder>"); process.exit(2); }
  const tool = readFileSync(join(data, "tool"), "utf8").trim() as DoneTool;
  const token = new DoneSignals(data).tokenFor(dir, false);
  if (!token) { console.log("No start line set up here"); process.exit(2); }
  const out = spawnSync("/bin/sh", ["-c", startCommand(join(data, "start"), token, tool)], { input: "{}", encoding: "utf8" });
  console.log(`${tool} (${HOOK_FILE[tool]}) prints, exit ${out.status}:\n${out.stdout}`);
} else {
  console.log("Usage: setup <codex|gemini|antigravity> <folder> <data folder> | show <folder> <data folder>");
  process.exit(2);
}
