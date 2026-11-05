// M67 bug bash: after a yes, a commit an agent's command made is on the receipt with the exact git command to take it back
// (F13, rule 10: Companion never runs it), and a SQLite file git ignores is kept before a command on it, so Undo puts its
// table back. Temporary fixture repos and folders only; the stand in engine (no model).
import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `m67-ag-${l}-`))); made.push(d); return d; };
const git = (cwd: string, ...a: string[]) => Bun.spawnSync(["git", ...a], { cwd, env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", GIT_CONFIG_GLOBAL: "/dev/null" } }).stdout.toString().trim();
function runner(project: string, command: string, events: Event[], answer: "allow" | "deny" = "allow") {
  let r!: AgentRunner;
  r = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([{ tool: { name: "Bash", input: { command } }, costUsd: 0.01 }, { text: "done", costUsd: 0.01 }]), log: new TaskLog(":memory:"), approvalTimeoutMs: 20000, emit: (e) => {
    events.push(e);
    if (e.type === "approval.request") setTimeout(() => void r.handle({ v: 1, id: "y", type: "approval.resolve", approval: (e as any).approval, decision: answer, scope: "once" } as never), 5);
  } });
  return r;
}

test("a commit made by npm run save, after a yes, is on the receipt with the command to take it back", async () => {
  const project = tmp("p");
  writeFileSync(join(project, "package.json"), JSON.stringify({ name: "x", scripts: { save: "git add -A && git -c user.name=t -c user.email=t@t commit -q -m wip" } }));
  writeFileSync(join(project, "a.txt"), "1\n");
  git(project, "init", "-q"); git(project, "add", "-A"); git(project, "commit", "-q", "-m", "first");
  const first = git(project, "rev-parse", "HEAD");
  writeFileSync(join(project, "a.txt"), "2\n");
  const events: Event[] = [];
  await runner(project, "npm run save", events).handle({ v: 1, id: "c1", type: "agent.start", project, agent: "b1", mode: "drive", prompt: "tidy", model: "m", budgetUsd: 3 } as never);
  expect(events.filter((e) => e.type === "approval.request").map((e: any) => e.risk)).toEqual(["git"]);
  expect(git(project, "rev-list", "--count", "HEAD")).toBe("2");
  const receipt = events.find((e) => e.type === "receipt") as any;
  expect(receipt.notUndoable.join("\n")).toContain(`git reset --soft ${first.slice(0, 12)}`);
}, 60000);

test("no commit, no git line on the receipt", async () => {
  const project = tmp("q");
  writeFileSync(join(project, "a.txt"), "1\n");
  git(project, "init", "-q"); git(project, "add", "-A"); git(project, "commit", "-q", "-m", "first");
  const events: Event[] = [];
  await runner(project, "ls", events).handle({ v: 1, id: "c1", type: "agent.start", project, agent: "b1", mode: "drive", prompt: "look", model: "m", budgetUsd: 3 } as never);
  const receipt = events.find((e) => e.type === "receipt") as any;
  expect(receipt.notUndoable.join("\n")).not.toContain("git reset");
}, 60000);

test("sqlite3 DROP TABLE on a git ignored dev.db asks, and after a yes Undo brings the table back", async () => {
  const project = tmp("db");
  writeFileSync(join(project, ".gitignore"), "*.db\n");
  writeFileSync(join(project, "index.js"), "console.log(1)\n");
  const db = new Database(join(project, "dev.db")); db.run("CREATE TABLE users (name TEXT)"); db.run("INSERT INTO users VALUES ('ann')"); db.close();
  const has = () => { const d = new Database(join(project, "dev.db")); try { return (d.query("SELECT count(*) AS n FROM sqlite_master WHERE name='users'").get() as { n: number }).n; } finally { d.close(); } };
  const events: Event[] = [];
  const r = runner(project, `sqlite3 dev.db "DROP TABLE users"`, events);
  await r.handle({ v: 1, id: "c1", type: "agent.start", project, agent: "b1", mode: "drive", prompt: "clean up", model: "m", budgetUsd: 3 } as never);
  const card = events.find((e) => e.type === "approval.request") as any;
  expect(card.title).toMatch(/dev\.db/);
  expect(has()).toBe(0);
  const cp = (events.find((e) => e.type === "checkpoint.created") as any).checkpoint;
  await r.handle({ v: 1, id: "r1", type: "checkpoint.restore", project, checkpoint: cp } as never);
  expect(has()).toBe(1);
}, 60000);
