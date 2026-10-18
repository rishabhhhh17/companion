// What the runner starts itself (proof checks, dev servers): a small environment, no leftovers, stoppable, never hung.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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
// None of these checks read the clock to decide: "it did not wait" is shown by what was still running, or had not run yet,
// when the command came back, and a hang is caught by the test's own time limit, far longer than what it must not wait for.
// A killed program can take a moment to be gone on a busy Mac, so that is waited for, never assumed after a fixed sleep.
const gone = async (pid: number, ms = 10_000) => { const end = Date.now() + ms; while (alive(pid) && Date.now() < end) await sleep(50); return !alive(pid); };
/** Stop, once the command has written its child's number (so the child surely started, however slow the Mac is). */
const stopOnceStarted = (ac: AbortController, pidFile: string) => void (async () => { while (!existsSync(pidFile)) await sleep(20); ac.abort(); })();

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
    const r = await runCommand(`node -e "const c=require('child_process').spawn('sleep',['25'],{detached:true,stdio:'inherit'});require('fs').writeFileSync('${pidFile}',String(c.pid));c.unref()"`, { cwd: d, timeoutMs: 2000 });
    const pid = Number(await Bun.file(pidFile).text());
    // It came back while that child was still holding the output open (it sleeps 25 seconds): it did not wait for it.
    expect(alive(pid)).toBe(true);
    expect(r.code).toBe(0);
    try { process.kill(pid, "SIGKILL"); } catch { /* gone */ }   // tidy up the test's own leftover
  }, 15000);
  test("a background job in the command's own group is stopped when the command ends", async () => {
    const d = tmp(); const pidFile = join(d, "pid");
    const r = await runCommand(`sleep 25 & echo $! > '${pidFile}'`, { cwd: d, timeoutMs: 3000 });
    expect(r.code).toBe(0);
    expect(await gone(Number(await Bun.file(pidFile).text())), "the background job is still running").toBe(true);
  }, 15000);
  test("a command can be stopped from outside, and everything it started goes with it", async () => {
    const d = tmp(); const ac = new AbortController();
    stopOnceStarted(ac, join(d, "pid"));
    const r = await runCommand(`sleep 30 & echo $! > '${join(d, "pid")}'; sleep 30; echo finished`, { cwd: d, timeoutMs: 60_000, signal: ac.signal });
    expect(r.aborted).toBe(true);
    expect(r.stdout).not.toContain("finished");   // it did not run on to its end (that takes 30 seconds; this test may take 15)
    expect(await gone(Number(await Bun.file(join(d, "pid")).text()))).toBe(true);
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
  test("a command may keep a longer end of its output (a build log), still with a limit", async () => {
    const r = await runCommand("yes 0123456789 | head -c 100000; echo THE-END", { cwd: tmp(), timeoutMs: 10000, keep: 40000 });
    expect(r.stdout.length).toBeGreaterThan(30000); expect(r.stdout.length).toBeLessThanOrEqual(40000); expect(r.stdout).toContain("THE-END");
  });
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
    // Its own wait would be a minute, three times this test's limit: coming back at all means Stop was heard.
    const r = await startServer({ kind: "server", command: "node slow.js" } as never, { cwd: d, timeoutMs: 60_000, signal: ac.signal });
    expect(r.ok).toBe(false);
    expect((r as { aborted?: boolean }).aborted).toBe(true);
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

describe("stopping a command when its output says so", () => {
  test("a command that starts something we do not want is stopped at once", async () => {
    const r = await runCommand("echo 'Starting login flow'; sleep 30; echo carried on", { cwd: tmp(), timeoutMs: 60_000, stopWhen: /login flow/ });
    expect(r.matched).toBe(true); expect(r.timedOut).toBe(false);
    expect(r.stdout).not.toContain("carried on");   // stopped before the rest (30 seconds away; this test may take 15)
  }, 15000);
  test("without a match nothing changes", async () => {
    const r = await runCommand("echo fine", { cwd: tmp(), timeoutMs: 5000, stopWhen: /login flow/ });
    expect(r.matched).toBeUndefined(); expect(r.code).toBe(0);
  });
});

describe("following a command's output as it runs", () => {
  test("each piece of output is passed on while the command is still running, from both streams", async () => {
    // The command waits, before its last line, until the test has seen the first ones: so the first pieces can only have
    // been passed on while it was still running, however busy the Mac is.
    const d = tmp(), seen: string[] = [];
    const r = await runCommand("echo one; echo two >&2; while [ ! -f go ]; do sleep 0.05; done; echo three", { cwd: d, timeoutMs: 20_000, onOutput: (t) => { seen.push(t); if (/one/.test(seen.join("")) && /two/.test(seen.join(""))) writeFileSync(join(d, "go"), ""); } });
    expect(r.timedOut).toBe(false);
    expect(seen.join("")).toContain("one"); expect(seen.join("")).toContain("two"); expect(seen.join("")).toContain("three");
    expect(r.code).toBe(0);
  });
  test("a listener that throws does not break the command", async () => {
    const r = await runCommand("echo fine", { cwd: tmp(), timeoutMs: 5000, onOutput: () => { throw new Error("listener broke"); } });
    expect(r.code).toBe(0); expect(r.stdout).toContain("fine");
  });
});

// A command in its own process group is out of reach when the app has to end the engine by force (a stuck engine after
// Stop everything, or a crash): killing the engine's group does not reach it. With endWithUs it ends the moment the
// program that started it ends, however that happens.
describe("a command that must end with the program that started it", () => {
  const leftovers: number[] = [];
  afterEach(() => { while (leftovers.length) { try { process.kill(leftovers.pop()!, "SIGKILL"); } catch { /* gone */ } } });
  const standIn = (d: string, endWithUs: boolean) => {
    writeFileSync(join(d, "engine.ts"), `
      import { spawn } from "node:child_process";
      import { runCommand } from ${JSON.stringify(join(import.meta.dir, "../src/proof/exec.ts"))};
      void runCommand("sleep 30 & echo JOB:$!; wait", { cwd: ${JSON.stringify(d)}, timeoutMs: 60000, endWithUs: ${endWithUs}, onOutput: (t) => process.stdout.write(t) });
      // Something the program starts afterwards (as the engine does) must not keep the command alive.
      setTimeout(() => { const o = spawn("sleep", ["30"], { detached: true, stdio: "ignore" }); o.unref(); process.stdout.write("OTHER:" + o.pid + "\\n"); }, 200);
      setInterval(() => {}, 1000);
    `);
    return Bun.spawn(["bun", join(d, "engine.ts")], { cwd: d, stdout: "pipe", stderr: "ignore" });
  };
  const readPids = async (p: ReturnType<typeof Bun.spawn>) => {
    let text = "";
    const reader = (p.stdout as ReadableStream<Uint8Array>).getReader();
    const dec = new TextDecoder();
    const end = Date.now() + 8000;
    while (!(/JOB:\d+/.test(text) && /OTHER:\d+/.test(text)) && Date.now() < end) { const { value, done } = await reader.read(); if (done) break; text += dec.decode(value); }
    reader.releaseLock();
    return { job: Number(/JOB:(\d+)/.exec(text)?.[1]), other: Number(/OTHER:(\d+)/.exec(text)?.[1]) };
  };
  test("when the program is killed by force (SIGKILL), the command and everything in its group end at once", async () => {
    const d = tmp();
    const engine = standIn(d, true);
    const { job, other } = await readPids(engine);
    leftovers.push(job, other);
    expect(alive(job)).toBe(true);
    engine.kill("SIGKILL");
    await engine.exited;
    const end = Date.now() + 3000;
    while (alive(job) && Date.now() < end) await sleep(50);
    expect(alive(job), "the command outlived the program that started it").toBe(false);
  }, 20000);
  test("its exit code, output and empty input are the command's own", async () => {
    const r = await runCommand(`echo "a b" 'c$d'; echo err >&2; read x; echo "read:$?"; exit 3`, { cwd: tmp(), timeoutMs: 5000, endWithUs: true });
    expect(r.timedOut).toBe(false);
    expect(r.code).toBe(3);
    expect(r.stdout).toContain("a b c$d");
    expect(r.stdout).toContain("read:1");
    expect(r.stderr).toContain("err");
  });
  test("Stop still ends it and everything it started", async () => {
    const d = tmp(); const ac = new AbortController();
    stopOnceStarted(ac, join(d, "pid"));
    const r = await runCommand(`sleep 30 & echo $! > '${join(d, "pid")}'; wait; echo finished`, { cwd: d, timeoutMs: 60_000, signal: ac.signal, endWithUs: true });
    expect(r.aborted).toBe(true);
    expect(r.stdout).not.toContain("finished");   // it did not run on to its end (30 seconds away; this test may take 15)
    expect(await gone(Number(await Bun.file(join(d, "pid")).text()))).toBe(true);
  }, 15000);
});
