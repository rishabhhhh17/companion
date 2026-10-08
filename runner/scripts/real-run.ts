// MANUAL check, not part of the test suite: one tiny real task through the real runner,
// the real Agent SDK and the test login in a throwaway config folder. Prints events
// only (never the environment, never credentials). Usage: bun scripts/real-run.ts
import { mkdtempSync, readdirSync, readFileSync, realpathSync, existsSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { SdkEngine, resolveClaudeBinary } from "../src/sdkEngine.ts";
import { buildChildEnv } from "../src/safety.ts";
import { TaskLog } from "../src/tasklog.ts";

const testConfig = join(homedir(), "Library/Application Support/Companion-test-claude");
const project = realpathSync(mkdtempSync(join(tmpdir(), "companion-real-")));
const shadow = realpathSync(mkdtempSync(join(tmpdir(), "companion-real-shadow-")));
const env = { ...buildChildEnv(process.env, { route: "plan" }), CLAUDE_CONFIG_DIR: testConfig };
const engine = new SdkEngine({ claudeBinary: resolveClaudeBinary(), env });
const log = new TaskLog(":memory:");
const t0 = Date.now();
const runner = new AgentRunner({
  shadowRoot: shadow, engine, log, approvalTimeoutMs: 60_000,
  emit: (e) => console.log(`${String(Date.now() - t0).padStart(6)} ms  ${e.type}`, JSON.stringify({ ...e, v: undefined, id: undefined, ts: undefined, type: undefined })),
});
console.log("project:", project);
await runner.handle({
  v: 1, id: "real1", type: "agent.start", project, agent: "builder-1", mode: "drive",
  prompt: process.env.REAL_PROMPT ?? "Create a file named hello.txt in this folder containing the single word hi. Do nothing else, then stop.",
  model: "claude-haiku-4-5-20251001", budgetUsd: 0.25,
});
console.log("--- files now in the project:", readdirSync(project));
if (existsSync(join(project, "hello.txt"))) console.log("hello.txt contains:", JSON.stringify(readFileSync(join(project, "hello.txt"), "utf8")));
console.log("--- task log:", JSON.stringify(log.list()[0]));
