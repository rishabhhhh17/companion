// M67 bug bash, review fixes: Stop everything reaches a check that is waiting to start (rule 11), the receipt's git line
// offers a reset only for a plain commit on the same branch (rule 10, F13), and each Forget everything erase is answered with
// its own outcome. Stand in engine (no model), temporary fixture folders and fixture git repos only.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { headMovedLine, headOf } from "../src/githead.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `m67-rf-${l}-`))); made.push(d); return d; };
const gitEnv = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
const git = (cwd: string, ...a: string[]) => Bun.spawnSync(["git", ...a], { cwd, env: gitEnv }).stdout.toString().trim();
const repo = () => {
  const p = tmp("git");
  git(p, "init", "-q", "-b", "main");
  writeFileSync(join(p, "a.txt"), "1\n"); git(p, "add", "-A"); git(p, "commit", "-q", "-m", "first");
  return p;
};

// ---------- 1. Stop everything reaches a check waiting for a stopped one to end ----------

test("Stop everything during Check again's wait: the waiting check never starts", async () => {
  const project = tmp("wait");
  // A test runner that cleans up for a while on SIGTERM, as many do.
  writeFileSync(join(project, "package.json"), JSON.stringify({ name: "shop", scripts: { test: "node -e \"process.on('SIGTERM',()=>setTimeout(()=>process.exit(1),2500));setTimeout(()=>{},9000)\"" } }));
  const events: Event[] = [];
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), emit: (e) => events.push(e) });
  const a = runner.handle({ v: 1, id: "f1", type: "problem.find", project, agent: "builder-1", first: true } as never);
  const end = Date.now() + 10000;
  while (!events.some((e: any) => e.type === "proof.step" && e.rung === "tests" && e.status === "running") && Date.now() < end) await Bun.sleep(10);
  await Bun.sleep(300);
  await runner.handle({ v: 1, id: "i1", type: "agent.interrupt", agent: "builder-1" } as never);   // Back
  await Bun.sleep(100);
  const b = runner.handle({ v: 1, id: "f2", type: "problem.find", project, agent: "builder-1", first: true } as never);   // Check again
  await Bun.sleep(200);
  const stopAt = events.length;
  await runner.handle({ v: 1, id: "s1", type: "agent.interruptAll", reason: "hotkey" } as never);   // Stop everything
  const t0 = Date.now();
  await b;
  const bMs = Date.now() - t0;
  await a;
  const after = events.slice(stopAt);
  // Nothing of the project runs after Stop everything, and the waiting press ends at once, as cancelled.
  expect(after.some((e: any) => e.type === "proof.step" && e.status === "running")).toBe(false);
  expect(after.filter((e) => e.type === "problem.found").map((e: any) => e.verdict)).toEqual(["cancelled"]);
  expect(bMs).toBeLessThan(1500);
}, 40000);

// ---------- 2. The receipt's git line ----------

test("a plain commit on the same branch: the reset that keeps the changes", () => {
  const p = repo();
  const before = headOf(p);
  writeFileSync(join(p, "a.txt"), "2\n"); git(p, "commit", "-q", "-am", "wip");
  const line = headMovedLine(before, headOf(p));
  expect(line).toContain(`git reset --soft ${before!.sha!.slice(0, 12)}`);
});

test("two plain commits: still the one reset back to where the task started", () => {
  const p = repo();
  const before = headOf(p);
  writeFileSync(join(p, "a.txt"), "2\n"); git(p, "commit", "-q", "-am", "one");
  writeFileSync(join(p, "a.txt"), "3\n"); git(p, "commit", "-q", "-am", "two");
  expect(headMovedLine(before, headOf(p))).toContain(`git reset --soft ${before!.sha!.slice(0, 12)}`);
});

test("a branch switch is said as a switch, with no reset", () => {
  const p = repo();
  git(p, "switch", "-q", "-c", "feature"); writeFileSync(join(p, "b.txt"), "x\n"); git(p, "add", "-A"); git(p, "commit", "-q", "-m", "feat");
  git(p, "switch", "-q", "main");
  const before = headOf(p);
  git(p, "switch", "-q", "feature");
  const line = headMovedLine(before, headOf(p))!;
  expect(line).not.toContain("reset");
  expect(line).toMatch(/main/);
  expect(line).toMatch(/feature/);
  expect(line).toContain("git switch main");
});

test("a fast forward merge is not called a commit, and no reset is offered", () => {
  const p = repo();
  git(p, "switch", "-q", "-c", "feature"); writeFileSync(join(p, "b.txt"), "x\n"); git(p, "add", "-A"); git(p, "commit", "-q", "-m", "feat");
  git(p, "switch", "-q", "main");
  const before = headOf(p);
  git(p, "merge", "-q", "--ff-only", "feature");
  const line = headMovedLine(before, headOf(p))!;
  expect(line).toBeTruthy();
  expect(line).not.toContain("reset");
  expect(line).not.toMatch(/commit was made/i);
});

test("an amended commit gets no reset either (it would drop the amend's history)", () => {
  const p = repo();
  const before = headOf(p);
  writeFileSync(join(p, "a.txt"), "2\n"); git(p, "commit", "-q", "-a", "--amend", "-m", "first again");
  const line = headMovedLine(before, headOf(p))!;
  expect(line).not.toContain("reset");
});

test("nothing moved: no line; a first commit in a new repo: the update-ref line", () => {
  const p = repo();
  expect(headMovedLine(headOf(p), headOf(p))).toBeNull();
  const q = tmp("new"); git(q, "init", "-q", "-b", "main");
  const before = headOf(q);
  expect(before?.sha).toBeNull();
  writeFileSync(join(q, "a.txt"), "1\n"); git(q, "add", "-A"); git(q, "commit", "-q", "-m", "first");
  expect(headMovedLine(before, headOf(q))).toContain("git update-ref -d HEAD");
  expect(headOf(tmp("nogit"))).toBeNull();
});

// ---------- 3. Each erase is answered with its own outcome ----------

test("a refused erase: its memory.state names the command and carries the reason, before the memory.refused", async () => {
  const project = tmp("p");
  writeFileSync(join(project, "package.json"), "{}");
  const elsewhere = tmp("elsewhere");
  symlinkSync(elsewhere, join(project, ".companion"));
  const events: any[] = [];
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), memoryDir: tmp("md"), proof: async () => ({ verdict: "passed", steps: [] }) });
  await runner.handle({ v: 1, id: "e1", type: "memory.erase", project, scope: "project" } as never);
  await runner.handle({ v: 1, id: "e2", type: "memory.erase", project, scope: "profile" } as never);
  const states = events.filter((e) => e.type === "memory.state");
  expect(states.map((s) => s.answers)).toEqual(["e1", "e2"]);
  expect(states[0].refused).toMatch(/link/);
  expect(states[1].refused).toBeUndefined();
  // The Memory page's note still comes last, so it stays shown.
  const note = events.findIndex((e) => e.type === "memory.refused");
  expect(note).toBeGreaterThan(events.indexOf(states[0]));
  expect(note).toBeLessThan(events.indexOf(states[1]));
});

test("memory.list is answered by a memory.state naming it, with no refusal", async () => {
  const project = tmp("p3");
  writeFileSync(join(project, "package.json"), "{}");
  const events: any[] = [];
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), memoryDir: tmp("md"), proof: async () => ({ verdict: "passed", steps: [] }) });
  await runner.handle({ v: 1, id: "l1", type: "memory.list", project } as never);
  const s = events.find((e) => e.type === "memory.state");
  expect(s.answers).toBe("l1");
  expect(s.refused).toBeUndefined();
});
