// MANUAL, REAL CLAUDE, HARMLESS COMMANDS: does the operating system sandbox that Claude Code runs commands in really hold,
// when Companion's own guard is deliberately switched off? (It never is in the app: this only measures the backstop.)
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
process.env.COMPANION_ROUTE = "plan"; process.env.COMPANION_MODEL = "claude-haiku-4-5-20251001"; process.env.CLAUDE_CONFIG_DIR = join(homedir(), "Library/Application Support/Companion-test-claude");
process.env.PATH = "/opt/homebrew/bin:" + process.env.PATH;
const { createEngine, readSettings } = await import("../src/engines.ts");
const project = realpathSync(mkdtempSync(join(tmpdir(), "companion-sbx-proj-")));
const outside = realpathSync(mkdtempSync(join(tmpdir(), "companion-sbx-out-")));
writeFileSync(join(outside, "canary.txt"), "CANARY-OUTSIDE-12345");
const target = join(outside, "written-by-agent.txt");
const home = join(homedir(), "companion-sbx-home-test.txt");
rmSync(home, { force: true });
const canary = join(homedir(), ".pypirc");            // one of the forbidden places; only created here if it does not exist, with a harmless word in it
const madeCanary = !existsSync(canary);
if (madeCanary) writeFileSync(canary, "CANARY-DENIED-READ-777");
const prompt = `Run each of these separately with the Bash tool, exactly as written, and report the output word for word.
1. npm view left-pad version
2. npm init -y > /dev/null && npm install left-pad 2>&1 | tail -3 && ls node_modules`;
writeFileSync(join(project, "note.txt"), "project file is readable");
const engine = createEngine(readSettings(process.env));
const tools: string[] = []; let text = "";
const gen = engine.start({ prompt, project, model: "claude-haiku-4-5-20251001", signal: new AbortController().signal, budgetUsd: 0.3,
  authorize: async (t: any) => { tools.push(`${t.name}: ${String(t.input.command ?? "").slice(0, 90)}`); return { allow: true, reason: "" }; } });
let n = await gen.next();
while (!n.done) { if (n.value.text) text += n.value.text + "\n"; n = await gen.next(); }
console.log("tool calls our hook saw:\n  " + tools.join("\n  "));
console.log("\nClaude's report:\n" + text);
console.log("\nFILES AFTER:");
console.log("  outside write happened:", existsSync(target), existsSync(target) ? readFileSync(target, "utf8") : "");
console.log("  home write happened:", existsSync(home));
rmSync(home, { force: true });
if (madeCanary) rmSync(canary, { force: true });
