// The runner as a real program: the app starts it, writes commands to its stdin and reads
// events from its stdout, one JSON line each. Tested by starting the real process.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEvent } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-main-${l}-`))); made.push(d); return d; };

function launch(script: unknown[] = [], extraEnv: Record<string, string> = {}) {
  const data = tmp("data");
  const proc = Bun.spawn(["bun", join(import.meta.dir, "../src/main.ts")], {
    stdin: "pipe", stdout: "pipe", stderr: "pipe",
    env: { ...process.env, COMPANION_DATA: data, COMPANION_ENGINE: "scripted", COMPANION_SCRIPT: JSON.stringify(script), ...extraEnv },
  });
  const lines: string[] = [];
  let buf = "";
  const done = (async () => {
    const dec = new TextDecoder();
    for await (const chunk of proc.stdout) {
      buf += dec.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) { lines.push(buf.slice(0, i)); buf = buf.slice(i + 1); }
    }
  })();
  const send = (o: unknown) => { proc.stdin.write(typeof o === "string" ? o + "\n" : JSON.stringify(o) + "\n"); proc.stdin.flush(); };
  const events = () => lines.map((l) => JSON.parse(l));
  const waitFor = async (cond: () => boolean, ms = 8000) => { const end = Date.now() + ms; while (!cond()) { if (Date.now() > end) throw new Error("timed out; saw: " + lines.join(" | ").slice(0, 600)); await new Promise((r) => setTimeout(r, 20)); } };
  const close = async () => { proc.stdin.end(); await proc.exited; await done; };
  return { proc, send, events, lines, waitFor, close, data };
}
const start = (project: string, extra: Record<string, unknown> = {}) => ({ v: 1, id: "c1", type: "agent.start", project, agent: "a1", mode: "drive", prompt: "do it", model: "m", budgetUsd: 1, ...extra });

describe("the runner program", () => {
  test("says hello first, in the protocol, and reports it is not connected to an account in scripted mode", async () => {
    const r = launch();
    await r.waitFor(() => r.lines.length >= 1);
    const hello = r.events()[0];
    expect(hello.type).toBe("runner.hello");
    expect(hello.sdk).toBe("0.3.293");
    await r.close();
  });

  test("every line it writes is a valid protocol event", async () => {
    const project = tmp("proj");
    const r = launch([{ tool: { name: "Bash", input: { command: "echo hi > a.txt" } }, costUsd: 0.01 }]);
    r.send(start(project));
    await r.waitFor(() => r.events().some((e) => e.type === "receipt"));
    for (const l of r.lines) expect(parseEvent(l).ok, l).toBe(true);
    await r.close();
  });

  test("runs a whole task from commands to receipt", async () => {
    const project = tmp("proj");
    const r = launch([{ tool: { name: "Write", input: { file_path: "new.txt", content: "x" } }, costUsd: 0.01 }]);
    r.send(start(project));
    await r.waitFor(() => r.events().some((e) => e.type === "receipt"));
    const types = r.events().map((e) => e.type);
    expect(types.indexOf("checkpoint.created")).toBeGreaterThan(-1);
    expect(existsSync(join(project, "new.txt"))).toBe(true);
    expect(r.events().find((e) => e.type === "receipt").changed[0]).toEqual({ file: "new.txt", kind: "added" });
    await r.close();
  });

  test("a bad line is reported and the runner keeps going", async () => {
    const project = tmp("proj");
    const r = launch([{ tool: { name: "Bash", input: { command: "echo ok > ok.txt" } }, costUsd: 0 }]);
    r.send("this is not json");
    r.send({ v: 2, id: "x", type: "agent.interrupt", agent: "a" });
    r.send({ v: 1, id: "y", type: "agent.explode" });
    await r.waitFor(() => r.events().filter((e) => e.type === "protocol.error").length >= 3);
    r.send(start(project));
    await r.waitFor(() => r.events().some((e) => e.type === "receipt"));
    expect(existsSync(join(project, "ok.txt"))).toBe(true);
    await r.close();
  });

  test("an approval travels over the pipe: a push waits, then a tap lets it through", async () => {
    const project = tmp("proj");
    const r = launch([{ tool: { name: "Bash", input: { command: "git push origin main" } }, costUsd: 0 }]);
    r.send(start(project));
    await r.waitFor(() => r.events().some((e) => e.type === "approval.request"));
    const req = r.events().find((e) => e.type === "approval.request");
    expect(req.risk).toBe("git");
    expect(r.events().some((e) => e.type === "receipt")).toBe(false);
    r.send({ v: 1, id: "ap", type: "approval.resolve", approval: req.approval, decision: "deny", scope: "once" });
    await r.waitFor(() => r.events().some((e) => e.type === "receipt"));
    await r.close();
  });

  test("the stop everything command ends a running task even while another message is being handled", async () => {
    const project = tmp("proj");
    const r = launch([{ tool: { name: "Bash", input: { command: "echo 1" } }, costUsd: 0 }, { tool: { name: "Bash", input: { command: "echo 2 > late.txt" } }, costUsd: 0, delayMs: 3000 }]);
    r.send(start(project));
    await r.waitFor(() => r.events().some((e) => e.type === "cost.update"));
    r.send({ v: 1, id: "k", type: "agent.interruptAll", reason: "kill switch" });
    await r.waitFor(() => r.events().some((e) => e.type === "receipt"), 3000);
    expect(existsSync(join(project, "late.txt"))).toBe(false);
    await r.close();
  });

  test("an account key in the environment never appears in anything it writes", async () => {
    const project = tmp("proj");
    const r = launch([{ tool: { name: "Bash", input: { command: "env > dump.txt" } }, costUsd: 0 }], { ANTHROPIC_API_KEY: "sk-ant-api03-FAKEFAKEFAKEFAKEFAKE0123456789", CLAUDE_CODE_OAUTH_TOKEN: "oauth-FAKE" });
    r.send(start(project));
    await r.waitFor(() => r.events().some((e) => e.type === "receipt"));
    expect(r.lines.join("\n")).not.toContain("FAKEFAKE");
    expect(r.lines.join("\n")).not.toContain("oauth-FAKE");
    await r.close();
  });

  test("when the app closes the pipe, the runner stops and exits cleanly", async () => {
    const r = launch();
    await r.waitFor(() => r.lines.length >= 1);
    r.proc.stdin.end();
    const code = await Promise.race([r.proc.exited, new Promise<number>((res) => setTimeout(() => res(-1), 4000))]);
    expect(code).toBe(0);
  });

  test("with the real engine and no key it says not connected, and starting a task is refused in plain words", async () => {
    const project = tmp("proj");
    const r = launch([], { COMPANION_ENGINE: "sdk", COMPANION_KEYCHAIN_SERVICE: "companion-test-nonexistent-" + Math.random().toString(36).slice(2), CLAUDE_CONFIG_DIR: tmp("cfg") });
    await r.waitFor(() => r.events().some((e) => e.type === "auth.status"));
    expect(r.events().find((e) => e.type === "auth.status").method).toBe("none");
    r.send(start(project));
    await r.waitFor(() => r.events().some((e) => e.type === "protocol.error" && /not connected/i.test(e.reason)));
    await r.close();
  });
});
