// Bug bash (M67): a destructive database command on a project's own SQLite file. Fixture folders only.
import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
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

test("sqlite3 DROP TABLE on the project's own database asks first and Undo puts the table back", async () => {
  const project = tmp("proj");
  writeFileSync(join(project, ".gitignore"), "*.db\n");
  writeFileSync(join(project, "index.js"), "console.log(1)\n");
  const db = new Database(join(project, "dev.db")); db.run("CREATE TABLE users (name TEXT)"); db.run("INSERT INTO users VALUES ('ann')"); db.close();
  const events: Event[] = [];
  let runner!: AgentRunner;
  runner = new AgentRunner({ shadowRoot: tmp("shadow"), engine: new ScriptedEngine([{ tool: { name: "Bash", input: { command: `sqlite3 dev.db "DROP TABLE users"` } }, costUsd: 0.01 }, { text: "done", costUsd: 0.01 }]), log: new TaskLog(":memory:"), approvalTimeoutMs: 20000, emit: (e) => { events.push(e); if (e.type === "approval.request") setTimeout(() => void runner.handle({ v: 1, id: "n", type: "approval.resolve", approval: (e as any).approval, decision: "deny", scope: "once" } as never), 5); }, now: () => new Date("2026-11-05T12:00:00Z") });
  await runner.handle({ v: 1, id: "c1", type: "agent.start", project, agent: "b1", mode: "drive", prompt: "clean up", model: "m", budgetUsd: 3 } as never);
  const asked = events.filter((e) => e.type === "approval.request");
  const tools = events.filter((e) => e.type === "agent.tool").map((e: any) => e.outcome);
  const gone = () => { const d = new Database(join(project, "dev.db")); try { return d.query("SELECT count(*) AS n FROM sqlite_master WHERE name='users'").get() as { n: number }; } finally { d.close(); } };
  console.log("approval cards:", asked.length, "tool outcomes:", tools, "users table present after task:", gone().n);
  const cp = (events.find((e) => e.type === "checkpoint.created") as any)?.checkpoint;
  if (cp) await runner.handle({ v: 1, id: "r1", type: "checkpoint.restore", project, checkpoint: cp } as never);
  console.log("users table present after Undo:", gone().n, "restored event:", JSON.stringify(events.find((e) => e.type === "checkpoint.restored")));
  console.log("receipt notUndoable:", JSON.stringify((events.find((e) => e.type === "receipt") as any)?.notUndoable), "changed:", JSON.stringify((events.find((e) => e.type === "receipt") as any)?.changed));
  expect(asked.length).toBeGreaterThan(0);
});
