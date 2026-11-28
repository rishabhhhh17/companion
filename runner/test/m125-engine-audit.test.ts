// M125 engine audit: each test here failed before its fix. Fixture folders only; no model, no network.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { cachePaths, sandboxSettings } from "../src/sandbox.ts";
import { evaluate } from "../src/safety.ts";
import { setOwnSecretPatterns } from "../src/secretfiles.ts";
import { boxedExecutor, KEPT_FOLDER, screen } from "../src/engine/messages-loop/executor.ts";
import { redact } from "../src/redact.ts";
import { testKey } from "../src/keytest.ts";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { RunOptions, RunResult } from "../src/proof/exec.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { setOwnSecretPatterns([]); while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-m125-${l}-`))); made.push(d); return d; };
const sh = (command: string, project: string) => evaluate({ tool: "Bash", input: { command } } as never, { project } as never);
const ok: RunResult = { code: 0, signal: null, stdout: "ok", stderr: "", timedOut: false, ms: 1 };

describe("E4: the home folder caches a boxed command may write hold no program folder on PATH", () => {
  const HOME = "/Users/someone";
  // allowWrite entries are whole folders (subpaths): a path is writable when it is one of them or inside one.
  const writable = (p: string) => (sandboxSettings(HOME, "darwin").filesystem.allowWrite as string[]).some((w) => p === w || p.startsWith(w + "/"));
  test("pnpm's and Yarn's bin folders are not writable; their stores and caches are", () => {
    for (const bad of ["Library/pnpm/git", "Library/pnpm/x", ".yarn/bin/git", ".yarn/x", ".local/share/pnpm/git"]) expect(writable(`${HOME}/${bad}`), bad).toBe(false);
    for (const good of ["Library/pnpm/store/v3/x", ".local/share/pnpm/store/v3/x", ".yarn/berry/cache/x.zip", ".yarn/cache/x.zip", ".npm/_cacache/x"]) expect(writable(`${HOME}/${good}`), good).toBe(true);
    expect(cachePaths(HOME)).not.toContain(`${HOME}/.yarn`);
  });
});

describe("E5: a command never reads a key or credential file the file tools refuse", () => {
  test("cat of terraform state, a credentials file and a never sent pattern are refused", () => {
    const p = tmp("e5");
    writeFileSync(join(p, "terraform.tfstate"), "{}"); writeFileSync(join(p, "credentials.json"), "{}");
    mkdirSync(join(p, "clients")); writeFileSync(join(p, "clients", "acme.txt"), "private");
    setOwnSecretPatterns(["clients"]);
    for (const c of ["cat terraform.tfstate", "head credentials.json", "cat clients/acme.txt"]) {
      const v = sh(c, p);
      expect(v.decision, c).toBe("deny");
    }
    expect(sh("cat README.md", p).decision).not.toBe("deny");
    expect(sh("cat .env.example", p).decision).not.toBe("deny");   // the shared template stays readable: refusals point to it
  });
  test("a recursive grep over a folder holding a key file is refused", () => {
    const p = tmp("e5g");
    mkdirSync(join(p, "infra")); writeFileSync(join(p, "infra", "prod.tfvars"), "x");
    expect(sh("grep -r password infra", p).decision).toBe("deny");
  });
  test("a shell glob that would match a key file is refused too", () => {
    const p = tmp("e5glob");
    writeFileSync(join(p, "terraform.tfstate"), "{}"); writeFileSync(join(p, "credentials.json"), "{}"); writeFileSync(join(p, "README.md"), "hi");
    mkdirSync(join(p, "infra")); writeFileSync(join(p, "infra", "prod.tfvars"), "x");
    mkdirSync(join(p, "clients")); writeFileSync(join(p, "clients", "acme.txt"), "private");
    setOwnSecretPatterns(["clients"]);
    for (const c of ["cat *", "cat *.tfstate", "cat terraform.*", "cat cred*", "head -100 *.tf*", "cat infra/*", "cat clients/*", `cat ${p}/*.json`]) expect(sh(c, p).decision, c).toBe("deny");
    expect(sh("cat *.md", p).decision).not.toBe("deny");
    expect(sh("ls *", p).decision).not.toBe("deny");
  });
});

describe("E7: an approved install opens the internet only for a line that is all installs", () => {
  test("pip install with another command on the line runs with this Mac's addresses only", async () => {
    const p = tmp("e7"), seen: RunOptions[] = [];
    const ex = boxedExecutor({ boxReady: () => true, run: async (_c, o) => { seen.push(o); return ok; } });
    await ex({ name: "Bash", input: { command: "pip install requests && node upload.js" } }, { project: p });
    await ex({ name: "Bash", input: { command: "pip install requests" } }, { project: p });
    expect(seen.map((o) => o.box?.net)).toEqual(["local", "open"]);
  });
});

describe("E8: editor settings and the MCP servers file are not written by the file tools either", () => {
  for (const f of [".vscode/tasks.json", ".idea/workspace.xml", ".mcp.json", "sub/.vscode/settings.json"]) test(f, () => {
    const p = tmp("e8");
    const v = evaluate({ tool: "Write", input: { file_path: join(p, f), content: "{}" } } as never, { project: p } as never);
    expect(v.decision, `${f} on a Claude Code task`).not.toBe("allow");
    expect(screen({ name: "Write", input: { file_path: join(p, f), content: "{}" } }, p), `${f} in the loop`).toBe(KEPT_FOLDER);
    expect(screen({ name: "Edit", input: { file_path: join(p, f), old_string: "a", new_string: "b" } }, p)).toBe(KEPT_FOLDER);
  });
  test("reading them is still fine, and other files are written as before", () => {
    const p = tmp("e8r");
    expect(screen({ name: "Read", input: { file_path: join(p, ".vscode/settings.json") } }, p)).toBeNull();
    expect(evaluate({ tool: "Write", input: { file_path: join(p, "src/a.js"), content: "x" } } as never, { project: p } as never).decision).toBe("allow");
  });
});

describe("E9: two spellings of one project folder share one lock", () => {
  const slow: Step = { text: "thinking", costUsd: 0, delayMs: 2500 };
  test("a link to the folder, and the folder in other capital letters, are the same project", async () => {
    const real = tmp("Busy"); writeFileSync(join(real, "a.txt"), "a");
    const link = join(tmp("l"), "proj"); symlinkSync(real, link);
    const upper = join(dirname(real), basename(real).toUpperCase());
    for (const other of [link, upper]) {
      const events: Event[] = [];
      const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([[slow], [slow]]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async () => ({ verdict: "passed", steps: [] }) });
      const first = runner.handle({ v: 1, id: "c1", type: "agent.start", project: real, agent: "a", mode: "drive", prompt: "x", model: "m", budgetUsd: 3 });
      await Bun.sleep(300);
      await runner.handle({ v: 1, id: "c2", type: "agent.start", project: other, agent: "b", mode: "drive", prompt: "y", model: "m", budgetUsd: 3 });
      expect(events.filter((e) => e.type === "protocol.error").map((e: any) => e.reason).join(" "), other).toMatch(/already working on this project/i);
      await runner.handle({ v: 1, id: "k", type: "agent.interruptAll", reason: "t" });
      await first;
    }
  }, 20_000);
});

describe("E9: a watch's check is one lock across spellings of the folder", () => {
  test("a check running on the real folder makes a link to it busy, and work through the link ends the check", async () => {
    const real = tmp("Watch"); writeFileSync(join(real, "a.txt"), "a");
    const link = join(tmp("wl"), "proj"); symlinkSync(real, link);
    const runner = new AgentRunner({ shadowRoot: tmp("ws"), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), emit: () => {}, proof: async () => ({ verdict: "passed", steps: [] }) });
    const r = runner as any;
    const pending = r.checkLive(real, new AbortController().signal, null);   // the lock is taken before its first await
    expect(runner.busyIn(link)).toBe(true);
    const run = [...r.watchRuns.values()][0];
    r.yieldWatch(link);
    expect(run.abort.signal.aborted).toBe(true);
    await pending;
  });
});

describe("E19: a Squibby token is hidden and never sent to Anthropic", () => {
  const TOKEN = "cmp_" + "AbC123_-".repeat(4);
  test("redact hides a cmp_ token", () => {
    expect(redact(`token ${TOKEN} here`)).toBe("token [secret] here");
    expect(redact("cmp_short")).toBe("cmp_short");
  });
  test("testing a key never sends a cmp_ value", async () => {
    let sent = 0;
    const f = (async () => { sent++; return new Response("{}", { status: 200 }); }) as unknown as typeof fetch;
    expect(await testKey(TOKEN, f)).toBe("refused");
    expect(sent).toBe(0);
  });
});

describe("E20: a model's Grep pattern can never freeze the engine", () => {
  test("a pattern that backtracks forever returns within a second", async () => {
    const p = tmp("e20");
    writeFileSync(join(p, "a.txt"), ("a".repeat(40) + "!\n").repeat(20));   // Bun gives up on one line after about 0.3 s; twenty lines held the engine 6 s
    const ex = boxedExecutor({ grepLimitMs: 300 });
    const t0 = Date.now();
    const r = await ex({ name: "Grep", input: { pattern: "^(a+)+$" } }, { project: p });
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(r.output).toMatch(/too long/);
  });
  test("an ordinary pattern still finds its lines", async () => {
    const p = tmp("e20b");
    writeFileSync(join(p, "a.js"), "one\nconst add = 1;\nthree\n");
    const r = await boxedExecutor()({ name: "Grep", input: { pattern: "add" } }, { project: p });
    expect(r.output).toContain("a.js:2: const add = 1;");
  });
});
