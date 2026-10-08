// MANUAL check: the runner program exactly as the app starts it (plan route, test sign in folder),
// given one real task over its pipe. Prints event types and short summaries, never the environment.
import { mkdtempSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const project = realpathSync(mkdtempSync(join(tmpdir(), "companion-e2e-")));
const data = realpathSync(mkdtempSync(join(tmpdir(), "companion-e2e-data-")));
const proc = Bun.spawn(["bun", join(import.meta.dir, "../src/main.ts")], {
  stdin: "pipe", stdout: "pipe", stderr: "inherit",
  env: { ...process.env, COMPANION_DATA: data, COMPANION_ROUTE: "plan", COMPANION_MODEL: "claude-haiku-4-5-20251001", CLAUDE_CONFIG_DIR: join(homedir(), "Library/Application Support/Companion-test-claude") },
});
const prompt = process.env.E2E_PROMPT ?? "Create index.html in this folder: a simple web page with a heading that says Hello from Companion and one short paragraph. Then stop.";
let started = false, done = false, buf = "";
const t0 = Date.now();
const send = (o: unknown) => { proc.stdin.write(JSON.stringify(o) + "\n"); proc.stdin.flush(); };
const dec = new TextDecoder();
setTimeout(() => { if (!done) { console.log("TIMEOUT"); proc.kill(); } }, 150_000);
for await (const chunk of proc.stdout) {
  buf += dec.decode(chunk, { stream: true });
  let i: number;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    const e = JSON.parse(line);
    const brief = e.type === "agent.tool" ? `${e.outcome} ${e.summary?.replace(project, "<project>")}` : e.type === "agent.state" ? e.state : e.type === "auth.status" ? e.method : e.type === "receipt" ? JSON.stringify({ changed: e.changed, cost: e.usdEstimate }) : e.type === "protocol.error" ? e.reason : e.type === "cost.update" ? e.usdEstimate : "";
    console.log(String(Date.now() - t0).padStart(6), "ms ", e.type, brief);
    if (e.type === "auth.status" && !started) {
      started = true;
      send({ v: 1, id: "c1", type: "agent.start", project, agent: "builder-1", mode: "drive", prompt, model: "claude-sonnet-5-5", budgetUsd: 0.5 });
    }
    if (e.type === "approval.request") send({ v: 1, id: "c2", type: "approval.resolve", approval: e.approval, decision: "deny", scope: "once" });
    if (e.type === "receipt") { done = true; proc.stdin.end(); }
  }
}
console.log("--- files:", readdirSync(project));
for (const f of readdirSync(project)) console.log(`--- ${f}:\n${readFileSync(join(project, f), "utf8").slice(0, 400)}`);
