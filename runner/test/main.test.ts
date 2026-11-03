// The runner as a real program: the app starts it, writes commands to its stdin and reads
// events from its stdout, one JSON line each. Tested by starting the real process.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, rmSync, existsSync, writeFileSync } from "node:fs";
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

  test("it answers a heartbeat at once, even in the middle of a long task, so the app can tell it is alive", async () => {
    // The task only ends when it is stopped, so an answer at all shows the runner did not wait for it (the clock decides
    // nothing, so a busy Mac cannot fail this).
    const project = tmp("proj");
    const r = launch([{ text: "thinking", costUsd: 0, delayMs: 600_000 }]);
    await r.waitFor(() => r.lines.length >= 1);
    r.send(start(project));
    await r.waitFor(() => r.events().some((e: any) => e.type === "agent.state"));
    const before = r.lines.length;
    r.send({ v: 1, id: "ping-1", type: "runner.ping" });
    await r.waitFor(() => r.events().slice(before).some((e: any) => e.type === "runner.pong"), 15_000);
    // The answer names the ping it answers (must fix 12), so the Stop key waits for its own answer, not any event.
    expect(r.events().slice(before).find((e: any) => e.type === "runner.pong").ping).toBe("ping-1");
    expect(r.events().some((e: any) => e.type === "receipt")).toBe(false);   // the task was still going
    r.send({ v: 1, id: "k", type: "agent.interruptAll", reason: "test" });
    await r.close();
  }, 30_000);

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

  describe("the key handed over by the app", () => {
    const FAKE = "sk-ant-api03-HANDEDOVERFAKEKEY0123456789abcdefghij";
    const appRun = () => launch([], { COMPANION_ENGINE: "sdk", COMPANION_KEY_SOURCE: "app", COMPANION_KEYCHAIN_SERVICE: "companion-test-nonexistent-" + Math.random().toString(36).slice(2), CLAUDE_CONFIG_DIR: tmp("cfg") });
    const statuses = (r: ReturnType<typeof launch>) => r.events().filter((e) => e.type === "auth.status");

    test("it never asks the Keychain tool: without a handoff it is not signed in, and a handoff signs it in", async () => {
      const r = appRun();
      await r.waitFor(() => statuses(r).length >= 1);
      expect(statuses(r)[0].method).toBe("none");
      r.proc.stdin.write(JSON.stringify({ v: 1, type: "auth.key", key: FAKE }) + "\n");
      r.proc.stdin.flush?.();
      await r.waitFor(() => statuses(r).some((e) => e.method === "api_key"));
      await r.close();
    });

    test("the key is never repeated in anything the runner writes, and a null key signs it out again", async () => {
      const r = appRun();
      await r.waitFor(() => statuses(r).length >= 1);
      r.proc.stdin.write(JSON.stringify({ v: 1, type: "auth.key", key: FAKE }) + "\n");
      await r.waitFor(() => statuses(r).some((e) => e.method === "api_key"));
      r.proc.stdin.write(JSON.stringify({ v: 1, type: "auth.key", key: null }) + "\n");
      await r.waitFor(() => statuses(r).filter((e) => e.method === "none").length >= 2);
      expect(r.lines.join("\n")).not.toContain("HANDEDOVER");
      await r.close();
    });

    test("a damaged handoff is dropped without repeating what was in it", async () => {
      const r = appRun();
      await r.waitFor(() => statuses(r).length >= 1);
      r.proc.stdin.write('{"v":1,"type":"auth.key","key":"' + FAKE + '\n');
      await r.waitFor(() => r.events().some((e) => e.type === "protocol.error"));
      expect(r.lines.join("\n")).not.toContain("HANDEDOVER");
      await r.close();
    });

    test("a page cannot sign the engine in with a handoff of its own", async () => {
      const { parseCommand } = await import("../../protocol/index.ts");
      expect(parseCommand(JSON.stringify({ v: 1, id: "x", type: "auth.key", key: FAKE })).ok).toBe(false);
    });
  });
});

// The browser check's one time download, through the real program. COMPANION_BROWSER_STUB swaps in a pretend download
// (only with the scripted engine), so no test ever reaches the internet.
describe("the browser check's download, over the pipe", () => {
  const bev = (r: ReturnType<typeof launch>, type: string) => r.events().filter((e: any) => e.type === type);
  test("asking says it is not installed and nothing is running, and nothing is downloaded without the command", async () => {
    const r = launch([], { PLAYWRIGHT_BROWSERS_PATH: tmp("browsers") });
    r.send({ v: 1, id: "b1", type: "browser.check" });
    await r.waitFor(() => bev(r, "browser.status").length >= 1);
    expect(bev(r, "browser.status")[0]).toMatchObject({ installed: false, installing: false });
    await new Promise((res) => setTimeout(res, 150));
    expect(bev(r, "browser.install")).toHaveLength(0);
    await r.close();
  });
  test("a press downloads it, with progress, ends in Ready, and the next question says installed", async () => {
    const r = launch([], { COMPANION_BROWSER_STUB: "5" });
    r.send({ v: 1, id: "b1", type: "browser.install" });
    await r.waitFor(() => bev(r, "browser.install").some((e: any) => e.stage === "done"));
    expect(bev(r, "browser.install").some((e: any) => e.stage === "downloading" && e.percent === 40)).toBe(true);
    for (const l of r.lines) expect(parseEvent(l).ok, l).toBe(true);
    r.send({ v: 1, id: "b2", type: "browser.check" });
    await r.waitFor(() => bev(r, "browser.status").length >= 1);
    expect(bev(r, "browser.status")[0]).toMatchObject({ installed: true, installing: false });
    await r.close();
  });
  // The pretend download takes 12 seconds (six steps of 2), longer than the waits below: "it stopped" is shown by the
  // download never finishing, not by the clock, so a busy Mac cannot fail these.
  test("a second press while it downloads starts nothing new, and Stop everything ends it", async () => {
    const r = launch([], { COMPANION_BROWSER_STUB: "2000" });
    r.send({ v: 1, id: "b1", type: "browser.install" });
    await r.waitFor(() => bev(r, "browser.install").length >= 1);
    r.send({ v: 1, id: "b2", type: "browser.install" });
    r.send({ v: 1, id: "b3", type: "browser.check" });
    await r.waitFor(() => bev(r, "browser.status").length >= 1);
    expect(bev(r, "browser.status")[0]).toMatchObject({ installing: true });
    expect(bev(r, "browser.install").filter((e: any) => /starting/i.test(e.detail))).toHaveLength(1);
    r.send({ v: 1, id: "k", type: "agent.interruptAll", reason: "kill switch" });
    await r.waitFor(() => bev(r, "browser.install").some((e: any) => e.stage === "cancelled"), 10_000);
    expect(bev(r, "browser.install").some((e: any) => e.stage === "done")).toBe(false);
    await r.close();
  }, 30_000);
  test("closing the app ends a download that is running", async () => {
    const r = launch([], { COMPANION_BROWSER_STUB: "2000" });
    r.send({ v: 1, id: "b1", type: "browser.install" });
    await r.waitFor(() => bev(r, "browser.install").length >= 1);
    await r.close();
    // It was stopped and waited for (a real download runs in its own process group and would outlive the engine otherwise).
    expect(bev(r, "browser.install").some((e: any) => e.stage === "cancelled")).toBe(true);
    expect(bev(r, "browser.install").some((e: any) => e.stage === "done")).toBe(false);
  }, 30_000);
  test("the pretend download is never used by the real engine", async () => {
    const { readSettings } = await import("../src/engines.ts");
    expect(readSettings({ COMPANION_BROWSER_STUB: "5" }).browserStubMs).toBeUndefined();
    expect(readSettings({ COMPANION_BROWSER_STUB: "5", COMPANION_ENGINE: "scripted" }).browserStubMs).toBe(5);
    expect(readSettings({ COMPANION_BROWSER_STUB_INSTALLER: "/x.ts" }).browserStubInstaller).toBeUndefined();
    expect(readSettings({ COMPANION_BROWSER_STUB_INSTALLER: "/x.ts", COMPANION_ENGINE: "scripted" }).browserStubInstaller).toBe("/x.ts");
  });
});

// The same download through the real downloader and a real installer process: a stand in for Playwright's installer that
// prints what Playwright prints (the browser, then FFmpeg) into a temporary browsers folder, with no network.
describe("the browser check's download, with a real installer process", () => {
  const bev = (r: ReturnType<typeof launch>, type: string) => r.events().filter((e: any) => e.type === type);
  const installer = join(import.meta.dir, "fixtures", "fake-playwright-installer.ts");
  // A dead proxy on this Mac, so that even if the stand in were not used, Playwright's real installer could not reach the
  // internet (it reads these settings, and the runner passes them on). This happened once while these tests were written.
  const noNetwork = { HTTPS_PROXY: "http://127.0.0.1:9", https_proxy: "http://127.0.0.1:9", HTTP_PROXY: "http://127.0.0.1:9", http_proxy: "http://127.0.0.1:9", ALL_PROXY: "http://127.0.0.1:9", all_proxy: "http://127.0.0.1:9", NO_PROXY: "", no_proxy: "" };
  const withInstaller = (mode = "") => {
    const browsers = tmp("browsers");
    if (mode) writeFileSync(join(browsers, ".stub-mode"), mode);
    return { browsers, r: launch([], { ...noNetwork, PLAYWRIGHT_BROWSERS_PATH: browsers, COMPANION_BROWSER_STUB_INSTALLER: installer }) };
  };
  const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  test("FFmpeg's download after the browser's never moves the bar back or changes the size, and it ends in Ready", async () => {
    const { r } = withInstaller();
    r.send({ v: 1, id: "b1", type: "browser.install" });
    await r.waitFor(() => bev(r, "browser.install").some((e: any) => e.stage !== "downloading"));
    const progress = bev(r, "browser.install").filter((e: any) => typeof e.percent === "number");
    expect(progress.length).toBeGreaterThan(3);
    for (let i = 1; i < progress.length; i++) expect(progress[i].percent).toBeGreaterThanOrEqual(progress[i - 1].percent);
    expect(progress.every((e: any) => e.mb === 94)).toBe(true);
    expect(bev(r, "browser.install").at(-1)).toMatchObject({ stage: "done", detail: "Ready. The next check will use it." });
    r.send({ v: 1, id: "b2", type: "browser.check" });
    await r.waitFor(() => bev(r, "browser.status").length >= 1);
    expect(bev(r, "browser.status")[0]).toMatchObject({ installed: true, installing: false });
    await r.close();
  }, 20000);
  test("when FFmpeg fails after the browser is in place, the card says Ready, because the browser check works", async () => {
    const { r } = withInstaller("ffmpeg-fails");
    r.send({ v: 1, id: "b1", type: "browser.install" });
    await r.waitFor(() => bev(r, "browser.install").some((e: any) => e.stage !== "downloading"));
    expect(bev(r, "browser.install").some((e: any) => e.stage === "failed")).toBe(false);
    expect(bev(r, "browser.install").at(-1)).toMatchObject({ stage: "done" });
    await r.close();
  }, 20000);
  test("when the engine is killed by force during the download, the installer ends with it", async () => {
    const { browsers, r } = withInstaller("slow");
    r.send({ v: 1, id: "b1", type: "browser.install" });
    await r.waitFor(() => bev(r, "browser.install").some((e: any) => typeof e.percent === "number"));
    const pid = Number(readFileSync(join(browsers, ".stub-pid"), "utf8"));
    try {
      expect(alive(pid)).toBe(true);
      r.proc.kill("SIGKILL");
      await r.proc.exited;
      const end = Date.now() + 3000;
      while (alive(pid) && Date.now() < end) await new Promise((res) => setTimeout(res, 50));
      expect(alive(pid), "the installer outlived the engine").toBe(false);
    } finally { try { process.kill(pid, "SIGKILL"); } catch { /* gone */ } }
  }, 20000);
});
