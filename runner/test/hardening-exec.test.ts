// What the runner starts itself (proof checks, dev servers): a small environment, no leftovers, stoppable, never hung.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { minimalEnv, toolPath } from "../src/env.ts";
import { runCommand } from "../src/proof/exec.ts";
import { startServer } from "../src/proof/server.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-hx-"))); made.push(d); return d; };
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("the environment commands run in", () => {
  const parent = { PATH: "/usr/bin:/bin", HOME: "/Users/x", USER: "x", LANG: "en_US.UTF-8", LC_ALL: "en_US.UTF-8", TERM: "xterm", TMPDIR: "/tmp/", SHELL: "/bin/zsh",
    ANTHROPIC_API_KEY: "sk-ant-x", ANTHROPIC_FOUNDRY_API_KEY: "f", CLAUDE_CODE_OAUTH_TOKEN: "t", CLAUDE_CODE_OAUTH_REFRESH_TOKEN: "r", AWS_ACCESS_KEY_ID: "a", AWS_SECRET_ACCESS_KEY: "s", AWS_BEARER_TOKEN_BEDROCK: "b",
    GITHUB_TOKEN: "g", GH_TOKEN: "g", NPM_TOKEN: "n", OPENAI_API_KEY: "o", DATABASE_URL: "postgres://u:p@h/db", STRIPE_SECRET_KEY: "sk_live_x", SSH_AUTH_SOCK: "/tmp/agent", NODE_OPTIONS: "--require /evil.js",
    DYLD_INSERT_LIBRARIES: "/evil.dylib", BASH_ENV: "/evil.sh", HTTPS_PROXY: "http://proxy:8080", NODE_EXTRA_CA_CERTS: "/ca.pem" };
  const e = minimalEnv(parent);
  test("only ordinary working variables get through", () => { for (const k of ["PATH", "HOME", "USER", "LANG", "LC_ALL", "TERM", "TMPDIR", "SHELL"]) expect(e[k], k).toBeTruthy(); });
  test("no keys, tokens, passwords or account settings, whatever their names", () => {
    for (const k of Object.keys(parent).filter((x) => !["PATH", "HOME", "USER", "LANG", "LC_ALL", "TERM", "TMPDIR", "SHELL", "HTTPS_PROXY", "NODE_EXTRA_CA_CERTS"].includes(x))) expect(e[k], k).toBeUndefined();
  });
  test("settings that load code into every program are never passed on", () => { for (const k of ["NODE_OPTIONS", "DYLD_INSERT_LIBRARIES", "BASH_ENV", "LD_PRELOAD", "ENV"]) expect(e[k]).toBeUndefined(); });
  test("a person behind a proxy or a company certificate can still install", () => { expect(e.HTTPS_PROXY).toBe("http://proxy:8080"); expect(e.NODE_EXTRA_CA_CERTS).toBe("/ca.pem"); });
  test("nothing from the key route can come back in", () => expect(JSON.stringify(e)).not.toMatch(/sk-ant|sk_live|postgres:\/\//));
  test("when the app is opened from Finder, the usual places for node, bun and pnpm are still found", () => {
    const p = toolPath("/Users/x", "/usr/bin:/bin", () => true).split(":");
    for (const d of ["/opt/homebrew/bin", "/usr/local/bin", "/Users/x/.bun/bin", "/Users/x/.volta/bin", "/Users/x/.cargo/bin", "/Users/x/.local/bin"]) expect(p, d).toContain(d);
    expect(new Set(p).size).toBe(p.length);
  });
  test("places that do not exist are left out", () => expect(toolPath("/Users/x", "/usr/bin", (d) => d === "/opt/homebrew/bin").split(":")).toEqual(["/usr/bin", "/opt/homebrew/bin"]));
  test("a command really cannot see the keys", async () => {
    process.env.GITHUB_TOKEN = "ghp_should_not_leak_into_commands"; process.env.STRIPE_SECRET_KEY = "sk_live_should_not_leak";
    const r = await runCommand("env", { cwd: tmp(), timeoutMs: 5000 });
    delete process.env.GITHUB_TOKEN; delete process.env.STRIPE_SECRET_KEY;
    expect(r.stdout).not.toContain("should_not_leak");
    expect(r.stdout).toMatch(/^PATH=/m);
  });
});

describe("a command that leaves things behind or never ends", () => {
  test("a child that moved to its own session and holds the output open does not hang the check", async () => {
    const d = tmp(); const pidFile = join(d, "pid");
    const t0 = Date.now();
    const r = await runCommand(`node -e "const c=require('child_process').spawn('sleep',['25'],{detached:true,stdio:'inherit'});require('fs').writeFileSync('${pidFile}',String(c.pid));c.unref()"`, { cwd: d, timeoutMs: 2000 });
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(r.code).toBe(0);
    try { process.kill(Number(await Bun.file(pidFile).text()), "SIGKILL"); } catch { /* gone */ }   // tidy up the test's own leftover
  }, 15000);
  test("a background job in the command's own group is stopped when the command ends", async () => {
    const d = tmp(); const pidFile = join(d, "pid");
    const r = await runCommand(`sleep 25 & echo $! > '${pidFile}'`, { cwd: d, timeoutMs: 3000 });
    expect(r.code).toBe(0);
    await sleep(300);
    expect(alive(Number(await Bun.file(pidFile).text())), "the background job is still running").toBe(false);
  }, 15000);
  test("a command can be stopped from outside, and everything it started goes with it", async () => {
    const d = tmp(); const ac = new AbortController();
    setTimeout(() => ac.abort(), 400);
    const t0 = Date.now();
    const r = await runCommand("sleep 30 & sleep 30; wait", { cwd: d, timeoutMs: 20000, signal: ac.signal });
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(r.aborted).toBe(true);
  }, 15000);
  test("an already stopped request does not even start", async () => {
    const ac = new AbortController(); ac.abort();
    const r = await runCommand("echo hi", { cwd: tmp(), timeoutMs: 5000, signal: ac.signal });
    expect(r.aborted).toBe(true); expect(r.stdout).toBe("");
  });
  test("a command that reads input is not left waiting for it", async () => {
    const r = await runCommand("cat", { cwd: tmp(), timeoutMs: 3000 });
    expect(r.timedOut).toBe(false); expect(r.code).toBe(0);
  });
  test("a huge amount of output is kept to its end, in bounded memory", async () => {
    const r = await runCommand("yes line | head -c 20000000; echo THE-END", { cwd: tmp(), timeoutMs: 20000 });
    expect(r.stdout.length).toBeLessThanOrEqual(8000); expect(r.stdout).toContain("THE-END");
  }, 30000);
});

describe("starting a server", () => {
  test("a server that ignores the port it was given and says where it is listening is still found", async () => {
    const d = tmp(); writeFileSync(join(d, "s.js"), `const s=require('http').createServer((q,r)=>r.end('hi from the server')).listen(0,'127.0.0.1',()=>console.log('  Local:   http://localhost:'+s.address().port+'/'));`);
    const r = await startServer({ kind: "server", command: "node s.js" } as never, { cwd: d, timeoutMs: 15000 });
    if (!r.ok) throw new Error(r.reason);
    expect(await (await fetch(r.url)).text()).toBe("hi from the server");
    await r.stop();
  }, 30000);
  test("a server that listens only on the IPv6 local address is found too", async () => {
    const d = tmp(); writeFileSync(join(d, "s6.js"), `const s=require('http').createServer((q,r)=>r.end('six')).listen(Number(process.env.PORT),'::1',()=>console.log('up'));`);
    const r = await startServer({ kind: "server", command: "node s6.js" } as never, { cwd: d, timeoutMs: 15000 });
    if (!r.ok) throw new Error(r.reason);
    expect(await (await fetch(r.url)).text()).toBe("six");
    await r.stop();
  }, 30000);
  test("a start command that simply finishes (a tool, not a website) is reported as not a server, not as a failure", async () => {
    const d = tmp(); writeFileSync(join(d, "cli.js"), "console.log('done');");
    const r = await startServer({ kind: "server", command: "node cli.js" } as never, { cwd: d, timeoutMs: 8000 });
    expect(r.ok).toBe(false);
    expect((r as any).notAServer).toBe(true);
  }, 20000);
  test("a server that crashes is still a failure", async () => {
    const d = tmp(); writeFileSync(join(d, "bad.js"), "console.error('boom'); process.exit(1);");
    const r = await startServer({ kind: "server", command: "node bad.js" } as never, { cwd: d, timeoutMs: 8000 });
    expect(r.ok).toBe(false); expect((r as any).notAServer).toBeFalsy(); expect((r as any).reason).toContain("boom");
  }, 20000);
  test("stopping can be asked for from outside while it is still starting", async () => {
    const d = tmp(); writeFileSync(join(d, "slow.js"), "setInterval(()=>{},1000)");
    const ac = new AbortController(); setTimeout(() => ac.abort(), 500);
    const t0 = Date.now();
    const r = await startServer({ kind: "server", command: "node slow.js" } as never, { cwd: d, timeoutMs: 20000, signal: ac.signal });
    expect(Date.now() - t0).toBeLessThan(4000);
    expect(r.ok).toBe(false);
  }, 20000);
  test("the server and everything it started are gone after stop", async () => {
    const d = tmp(); writeFileSync(join(d, "pidserver.js"), `require('fs').writeFileSync('pid',String(process.pid));require('http').createServer((q,r)=>r.end('x')).listen(Number(process.env.PORT),'127.0.0.1');`);
    const r = await startServer({ kind: "server", command: "sh -c 'node pidserver.js'" } as never, { cwd: d, timeoutMs: 15000 });
    if (!r.ok) throw new Error(r.reason);
    const pid = Number(await Bun.file(join(d, "pid")).text());
    await r.stop(); await sleep(200);
    expect(alive(pid)).toBe(false);
  }, 30000);
});
