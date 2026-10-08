// A short, free demo of the runner. A stand in for Claude plays a small task in a throwaway
// project: it writes files, runs a command, then tries something risky. You decide, then undo.
// Usage: bun scripts/demo.ts        (DEMO_AUTO=allow|deny skips the questions, for checks)
import { mkdtempSync, readdirSync, readFileSync, realpathSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { Event } from "../../protocol/index.ts";

const project = realpathSync(mkdtempSync(join(tmpdir(), "companion-demo-")));
const shadow = realpathSync(mkdtempSync(join(tmpdir(), "companion-demo-shadow-")));
writeFileSync(join(project, "notes.txt"), "my original notes\n");
const log = new TaskLog(":memory:");
const auto = process.env.DEMO_AUTO;
const rl = auto ? null : createInterface({ input: process.stdin, output: process.stdout });
const say = (s: string) => console.log(s);
const ask = async (q: string, def: string) => (auto ? (say(`${q} [auto: ${auto}]`), auto === "allow" || def === "y" ? "y" : "n") : (await rl!.question(`${q} (y/n) `)).trim().toLowerCase().startsWith("y") ? "y" : "n");

let runner!: AgentRunner;
const pending: Event[] = [];
const engine = new ScriptedEngine([
  { text: "I'll add a page and a note.", costUsd: 0.004 },
  { tool: { name: "Write", input: { file_path: "index.html", content: "<h1>Hello</h1>\n" } }, costUsd: 0.006 },
  { tool: { name: "Bash", input: { command: "echo 'built' > build.log" } }, costUsd: 0.002 },
  { tool: { name: "Write", input: { file_path: "../../outside-the-project.txt", content: "should never exist" } }, costUsd: 0.001 },
  { tool: { name: "Bash", input: { command: "git push origin main" } }, costUsd: 0.001 },
  { text: "All done.", costUsd: 0.001 },
]);
const handlers: Record<string, (e: any) => void> = {
  "checkpoint.created": (e) => say(`  Saved a snapshot of your project first (${e.checkpoint}, ${e.files} file${e.files === 1 ? "" : "s"}).`),
  "agent.state": (e) => say(`  [${e.state}]`),
  "agent.tool": (e) => say(e.outcome === "blocked" ? `  BLOCKED: ${e.summary}` : e.outcome === "needs_approval" ? `  Wants to: ${e.summary}` : `  Did: ${e.summary}`),
  "approval.request": (e) => pending.push(e),
  "cost.update": (e) => say(`  Cost so far: $${e.usdEstimate.toFixed(3)}`),
  "receipt": (e) => {
    say("\n  RECEIPT");
    for (const c of e.changed) say(`    ${c.kind.padEnd(8)} ${c.file}`);
    say(`    commands run: ${e.commands}   cannot be undone: ${e.notUndoable.length ? e.notUndoable.join("; ") : "nothing"}   cost: $${e.usdEstimate.toFixed(3)}`);
  },
  "protocol.error": (e) => say(`  Note: ${e.reason}`),
};
let checkpoint = "";
runner = new AgentRunner({
  shadowRoot: shadow, engine, log, approvalTimeoutMs: 120_000,
  emit: async (e) => {
    if (e.type === "checkpoint.created") checkpoint = (e as any).checkpoint;
    handlers[e.type]?.(e);
    if (e.type === "approval.request") {
      const a = e as any;
      say(`\n  ASK: ${a.title}. Risk: ${a.risk}.`);
      const ans = await ask("  Allow this?", "n");
      await runner.handle({ v: 1, id: "demo-approve", type: "approval.resolve", approval: a.approval, decision: ans === "y" ? "allow" : "deny", scope: "once" });
    }
  },
});

say(`\nDemo project: ${project}`);
say(`It holds: ${readdirSync(project).join(", ")}\n`);
say("Starting a task: \"add a page\". A stand in for Claude plays the steps.\n");
await runner.handle({ v: 1, id: "demo", type: "agent.start", project, agent: "builder-1", mode: "drive", prompt: "Add a page", model: "stand-in", budgetUsd: 1 });
say(`\nProject now holds: ${readdirSync(project).join(", ")}`);
say(`Was anything written outside the project? ${existsSync(join(project, "../../outside-the-project.txt")) ? "YES (bad)" : "No. The safety gate stopped it."}`);
say(`The task log has: ${log.list().map((r) => `${r.status}, $${r.usd.toFixed(3)}`).join("; ")}`);
if ((await ask("\nUndo everything this task did?", "y")) === "y") {
  await runner.handle({ v: 1, id: "demo-undo", type: "checkpoint.restore", project, checkpoint });
  say(`Undone. Project holds again: ${readdirSync(project).join(", ")}`);
  say(`notes.txt says: ${JSON.stringify(readFileSync(join(project, "notes.txt"), "utf8"))}`);
}
rl?.close();
rmSync(project, { recursive: true, force: true });
rmSync(shadow, { recursive: true, force: true });
