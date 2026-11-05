// Bug bash (M67): a project script that writes git. Temporary fixture repo only.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { Event } from "../../protocol/index.ts";
// M67: each card is answered No, so a probe ends instead of waiting for an answer past bun's 5 second limit.

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-bugbash-${l}-`))); made.push(d); return d; };
const git = (cwd: string, ...a: string[]) => Bun.spawnSync(["git", ...a], { cwd, env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", GIT_CONFIG_GLOBAL: "/dev/null" } }).stdout.toString().trim();

test("npm run <script> that commits asks first (rule 10)", async () => {
  const project = tmp("proj");
  writeFileSync(join(project, "package.json"), JSON.stringify({ name: "x", scripts: { save: "git add -A && git -c user.name=t -c user.email=t@t commit -q -m wip" } }));
  writeFileSync(join(project, "a.txt"), "1\n");
  git(project, "init", "-q"); git(project, "add", "-A"); git(project, "commit", "-q", "-m", "first");
  writeFileSync(join(project, "a.txt"), "2\n");
  const events: Event[] = [];
  let runner!: AgentRunner;
  runner = new AgentRunner({ shadowRoot: tmp("shadow"), engine: new ScriptedEngine([{ tool: { name: "Bash", input: { command: "npm run save" } }, costUsd: 0.01 }, { text: "done", costUsd: 0.01 }]), log: new TaskLog(":memory:"), approvalTimeoutMs: 20000, emit: (e) => { events.push(e); if (e.type === "approval.request") setTimeout(() => void runner.handle({ v: 1, id: "n", type: "approval.resolve", approval: (e as any).approval, decision: "deny", scope: "once" } as never), 5); }, now: () => new Date("2026-11-05T12:00:00Z") });
  await runner.handle({ v: 1, id: "c1", type: "agent.start", project, agent: "b1", mode: "drive", prompt: "tidy", model: "m", budgetUsd: 3 } as never);
  const cards = events.filter((e) => e.type === "approval.request").length;
  const receipt = events.find((e) => e.type === "receipt") as any;
  console.log("cards:", cards, "commits now:", git(project, "rev-list", "--count", "HEAD"), "receipt notUndoable:", JSON.stringify(receipt?.notUndoable));
  expect(cards).toBeGreaterThan(0);
});
