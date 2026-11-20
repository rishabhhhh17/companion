// M115 [verify] on a real Mac (docs/milestones/M109-real-mac-guide.md), run by scripts/m115-check-tools.sh. Uses the engine's
// own code, so what is written and found is exactly what Squibby writes and finds:
//   setup <tool> <folder>  writes the tool's done line (or own file) with DoneSignals, its data folder inside the practice folder
//   check <folder>         lists which tools touched their done marker since setup
//   where                  walks the process table from this script up to the app it runs in (jump.ts whereOf)
//   go [notab]             runs Go to's own commands for this terminal (the first run asks the Mac's Automation question)
// No model is called, nothing is sent anywhere, git is never run.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { DONE_DIR, DoneSignals, TOOL_HOOKS, type DoneTool } from "../src/donesignal.ts";
import { jumpPlan, parsePs, whereOf } from "../src/jump.ts";

const [cmd, a, b] = process.argv.slice(2);
const table = () => parsePs(spawnSync("/bin/ps", ["-axo", "pid=,ppid=,tty=,comm="], { encoding: "utf8" }).stdout ?? "");
if (cmd === "setup") {
  const tool = a as DoneTool, dir = b!;
  if (!TOOL_HOOKS[tool]?.includes("done")) { console.log(`${tool} has no done line`); process.exit(2); }
  const data = join(dir, ".squibby-practice-data");
  mkdirSync(data, { recursive: true });
  writeFileSync(join(dir, "hello.txt"), "hello world\n");
  const s = new DoneSignals(data);
  for (const h of TOOL_HOOKS[tool].filter((k) => k === "done" || k === "guard")) {
    const r = s.add(dir, tool, h);
    console.log(`${h}: ${r.on ? "written" : `not written (${r.problem ?? "unknown"})`} in ${r.rel}`);
  }
} else if (cmd === "check") {
  const done = join(a!, ".squibby-practice-data", DONE_DIR);
  const seen = existsSync(done) ? readdirSync(done) : [];
  console.log(seen.length ? `Done markers touched: ${seen.join(", ")} (PASS for each tool named)` : "No done marker yet (FAIL if the tool has finished a task)");
} else if (cmd === "where") {
  const w = whereOf(table(), process.pid);
  console.log(w ? `App: ${w.name} (${w.app}); terminal: ${w.tty ?? "none"}; exact tab: ${w.tab ? "yes" : "no"}` : "No app above this process (tmux, ssh or a launchd job): Go to waits for an editor tool's own app");
} else if (cmd === "go") {
  const plan = jumpPlan(whereOf(table(), process.pid), process.cwd(), { tab: a !== "notab" });
  for (const argv of plan) { const r = spawnSync(argv[0]!, argv.slice(1), { stdio: "inherit" }); console.log(`${argv[0]} -> ${r.status}`); }
  if (!plan.length) console.log("Nothing to go to from here");
} else {
  console.log("Usage: setup <tool> <folder> | check <folder> | where | go [notab]");
  process.exit(2);
}
