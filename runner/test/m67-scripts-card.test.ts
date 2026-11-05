// M67 bug bash fix: the card for running a project's changed scripts says that, not "add a tool", and is answered on Home
// where its why is shown, never in the notch. Stand in engine (no model), the real ladder, temporary fixture folders only.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { Event } from "../../protocol/index.ts";
import { parseEvent } from "../../protocol/index.ts";
// Loaded by path, so the runner's type check does not take in the page's JSX files.
const ISLAND = "../../app/src/islandPanel.ts", APPROVALS = "../../app/src/approvals.ts";
const approvalWords = async (a: unknown): Promise<{ question: string; canUndo: boolean }> => (await import(APPROVALS)).approvalWords(a);
const answerHere = async (risk: string, canUndo: boolean): Promise<boolean> => (await import(ISLAND)).answerHere(risk, canUndo);

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `m67-scripts-${l}-`))); made.push(d); return d; };
const write = (file: string, content: string): Step => ({ tool: { name: "Write", input: { file_path: file, content } }, costUsd: 0.01 });

test("a task that changes the test script asks with the scripts card", async () => {
  const pkg = (t: string) => JSON.stringify({ name: "x", scripts: { test: t } });
  const project = tmp("p");
  writeFileSync(join(project, "package.json"), pkg("node t.js")); writeFileSync(join(project, "t.js"), "process.exit(0)");
  const events: Event[] = [];
  let runner!: AgentRunner;
  runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([write("package.json", pkg("node t.js && echo ok"))]), log: new TaskLog(":memory:"), approvalTimeoutMs: 20000, emit: (e) => {
    events.push(e);
    if (e.type === "approval.request") setTimeout(() => void runner.handle({ v: 1, id: "n", type: "approval.resolve", approval: (e as any).approval, decision: "deny", scope: "once" } as never), 10);
  } });
  await runner.handle({ v: 1, id: "c1", type: "agent.start", project, agent: "builder-1", mode: "drive", prompt: "Make the tests print ok", model: "claude-sonnet-5-5", budgetUsd: 3 } as never);
  const ap = events.find((e) => e.type === "approval.request") as any;
  expect(ap).toBeDefined();
  expect(ap.risk).toBe("scripts");
  expect(parseEvent(JSON.stringify(ap)).ok).toBe(true);
  const w = await approvalWords(ap);
  expect(w.question).not.toMatch(/add a tool/i);
  expect(w.question).toMatch(/scripts/i);
  expect(await answerHere(ap.risk, w.canUndo)).toBe(false);
}, 60000);

test("the card with no safety box reads as one that cannot be undone, and is not answered in the notch", async () => {
  const w = await approvalWords({ risk: "irreversible", title: "The safety box for checks is not working on this Mac.", action: "Running: install, build, tests and server, without the safety box", undoable: false } as never);
  expect(w.canUndo).toBe(false);
  expect(await answerHere("irreversible", w.canUndo)).toBe(false);
});
