// Bug bash (first run): what the first check answers for small fixture projects. Real ladder, stand in engine, temporary
// folders only, nothing installed (an install question is answered no).
import { afterEach, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-bbv-${l}-`))); made.push(d); return d; };

const FIX: Record<string, Record<string, string>> = {
  empty: {},
  html: { "index.html": "<h1>shop</h1>" },
  python: { "app.py": "import requestsxyz_not_installed\nprint(1)\n", "test_app.py": "import app\ndef test_x():\n    assert True\n" },
  nodeFail: { "package.json": JSON.stringify({ name: "s", scripts: { test: "node test.js" } }), "test.js": "throw new Error('total is wrong')\n" },
  needsInstall: { "package.json": JSON.stringify({ name: "s", dependencies: { "left-pad": "1.3.0" }, scripts: { test: "node -e \"require('left-pad')\"" } }) },
};

for (const [name, files] of Object.entries(FIX)) test(`first check: ${name}`, async () => {
  const project = tmp(name);
  for (const [f, c] of Object.entries(files)) { mkdirSync(join(project, f, ".."), { recursive: true }); writeFileSync(join(project, f), c); }
  const events: Event[] = [];
  let runner!: AgentRunner;
  runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), emit: (e) => {
    events.push(e);
    if (e.type === "approval.request") { console.log(name, "ASK", JSON.stringify(e).slice(0, 300)); setTimeout(() => void runner.handle({ v: 1, id: "n", type: "approval.resolve", approval: (e as any).approval, decision: "deny", scope: "once" } as never), 100); }
  } });
  await runner.handle({ v: 1, id: "f1", type: "problem.find", project, agent: "builder-1", first: true } as never);
  for (const e of events) if (["problem.found", "protocol.error", "notice", "proof.step"].includes(e.type)) console.log(name, JSON.stringify(e).slice(0, 2500));
}, 120000);
