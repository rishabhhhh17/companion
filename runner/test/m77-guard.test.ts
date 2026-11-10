// M77 (the safety net): the snapshot before a destructive Claude Code command, and "Claude is waiting for you". The hooks
// Squibby adds after the person's yes, what they do when run for real with sh, which commands count as destructive, the
// guard's answers, the History row, and the waiting note. Every folder is a temporary fixture; the person's own git is
// never written or read, and nothing here runs a model.
import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEvent, PROTOCOL_VERSION } from "../../protocol/index.ts";
import { CheckpointStore } from "../src/checkpoints.ts";
import { DoneSignals, GUARD_DIR, GUARD_PID, HOOK_FILE, guardCommand, waitingCommand } from "../src/donesignal.ts";
import { destructiveCommand, HookGuard, parseRequest, SAVED_LABEL, shortCommand } from "../src/guard.ts";
import { TaskLog } from "../src/tasklog.ts";

const made: string[] = [];
const guards: HookGuard[] = [];
afterEach(() => { while (guards.length) guards.pop()!.stop(); while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tmp = (label: string) => { const d = mkdtempSync(join(tmpdir(), `companion-test-m77-${label}-`)); made.push(d); return d; };
const until = async (pred: () => boolean, ms = 6000) => { for (let i = 0; i < ms / 20 && !pred(); i++) await sleep(20); expect(pred()).toBe(true); };
function print(dir: string): string {
  const out: string[] = [];
  const walk = (d: string) => { for (const n of readdirSync(d).sort()) { const f = join(d, n); if (statSync(f).isDirectory()) walk(f); else out.push(`${f.slice(dir.length)} ${createHash("sha256").update(readFileSync(f)).digest("hex")}`); } };
  walk(dir);
  return out.join("\n");
}
function gitProject(): string {
  const p = tmp("proj");
  writeFileSync(join(p, "index.html"), "<h1>Hi</h1>\n");
  mkdirSync(join(p, "src"));
  writeFileSync(join(p, "src/app.ts"), "export const a = 1;\n");
  Bun.spawnSync(["git", "init", "-q"], { cwd: p, env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } });
  return p;
}
const request = (command: string, cwd: string) => JSON.stringify({ session_id: "s1", transcript_path: "/x/t.jsonl", cwd, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command, description: "Reset", timeout: 1000, run_in_background: false }, tool_use_id: "toolu_1" });
const runHook = (cmd: string, input: string, cwd: string) => Bun.spawnSync(["/bin/sh", "-c", cmd], { stdin: new TextEncoder().encode(input), cwd });

describe("which commands are destructive", () => {
  const p = "/tmp/companion-m77-fixture-project";
  const bad = [
    "git reset --hard", "git reset --hard HEAD~1", "git checkout -- src/app.ts", "git checkout HEAD -- .", "git restore src/app.ts", "git restore --source=HEAD~2 src", "git checkout -f main",
    "git clean -fd", "git stash drop", "git stash clear", "git stash pop", "git branch -D feature", "git push --force origin main", "git push -f",
    "rm -rf dist", "rm -r src/old", "rm -f src/app.ts", "find . -name '*.log' -delete", "truncate -s 0 data.csv",
    "cd src && rm -rf .", "npm test && git reset --hard",
    "psql -h db.example.com -d shop -c 'DROP TABLE users'", "sqlite3 dev.db 'DELETE FROM users'", "npx prisma migrate reset", "rails db:drop",
  ];
  const fine = ["git status", "git diff", "git log --oneline", "git checkout main", "git checkout -b feature", "git switch main", "git stash", "git stash list", "git add .", "git commit -m 'x'", "git push",
    "rm notes.txt", "rm -rf /tmp/elsewhere", "rm -rf ~/Downloads/x", "npm test", "bun run build", "ls -la", "cat src/app.ts", "psql -h localhost -d shop -c 'SELECT 1'", "git branch -d feature", "git reset src/app.ts", "git reset --soft HEAD~1"];
  test.each(bad)("destructive: %s", (c) => { expect(destructiveCommand(c, p)).toBeTruthy(); });
  test.each(fine)("not destructive: %s", (c) => { expect(destructiveCommand(c, p)).toBeNull(); });
  test("a tangled line never throws", () => {
    expect(() => destructiveCommand("$(((", p)).not.toThrow();
    expect(() => destructiveCommand("", p)).not.toThrow();
  });
  test("the short form is one redacted line, at most 60 characters, never a key", () => {
    expect(shortCommand("git reset --hard")).toBe("git reset --hard");
    expect(shortCommand("git\n  reset   --hard")).toBe("git reset --hard");
    expect(Array.from(shortCommand("x".repeat(200))).length).toBe(60);
    expect(shortCommand("curl -H 'Authorization: Bearer sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789abcdefghij' x")).not.toContain("abcdefghijklmnop");
  });
  test("a request is only a Bash tool call with a command; anything else is nothing", () => {
    expect(parseRequest(request("git reset --hard", "/p"))).toEqual({ command: "git reset --hard", cwd: "/p" });
    expect(parseRequest(JSON.stringify({ tool_name: "Edit", tool_input: { file_path: "a" } }))).toBeNull();
    expect(parseRequest(JSON.stringify({ tool_name: "Bash", tool_input: { command: "" } }))).toBeNull();
    expect(parseRequest("{ not json")).toBeNull();
  });
});

describe("the guard and waiting hooks Squibby adds, only after a yes", () => {
  test("the plans name the exact file, event and lines, and write nothing", () => {
    const data = tmp("data"), p = gitProject();
    const s = new DoneSignals(data);
    const g = s.plan(p, "claude", "guard"), w = s.plan(p, "claude", "waiting");
    expect(g.rel).toBe(".claude/settings.local.json");
    expect(g.on).toBe(false);
    expect(g.creates).toBe(true);
    const gj = JSON.parse(g.adds), wj = JSON.parse(w.adds);
    expect(gj.hooks.PreToolUse[0].matcher).toBe("Bash");
    expect(gj.hooks.PreToolUse[0].hooks[0]).toMatchObject({ type: "command", timeout: 10 });
    expect(wj.hooks.Notification[0].matcher).toBe("permission_prompt|idle_prompt");
    expect(wj.hooks.Notification[0].hooks[0]).toMatchObject({ type: "command", timeout: 5 });
    expect(existsSync(join(p, ".claude"))).toBe(false);
    // Codex has only the done signal.
    expect(s.plan(p, "codex", "guard").problem).toBeTruthy();
    expect(s.add(p, "codex", "guard").problem).toBeTruthy();
    expect(existsSync(join(p, ".codex"))).toBe(false);
    // The Settings rows: the two done signals, then Claude Code's guard and waiting, and (M78) its start block.
    expect(s.state(p).map((x) => `${x.tool}:${x.hook}`)).toEqual(["claude:done", "codex:done", "claude:guard", "claude:waiting", "claude:start"]);
  });
  test("adding keeps every other hook (the person's own PreToolUse too), adding twice adds once, and Remove takes out only Squibby's", () => {
    const data = tmp("data"), p = gitProject();
    mkdirSync(join(p, ".claude"));
    const theirs = { permissions: { allow: ["Bash(npm test)"] }, hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo hi" }] }], Notification: [{ hooks: [{ type: "command", command: "say hi" }] }] } };
    writeFileSync(join(p, HOOK_FILE.claude), JSON.stringify(theirs));
    const s = new DoneSignals(data);
    expect(s.add(p, "claude", "guard").on).toBe(true);
    expect(s.add(p, "claude", "waiting").on).toBe(true);
    expect(s.add(p, "claude", "done").on).toBe(true);
    s.add(p, "claude", "guard");
    const j = JSON.parse(readFileSync(join(p, HOOK_FILE.claude), "utf8"));
    expect(j.permissions).toEqual(theirs.permissions);
    expect(j.hooks.PreToolUse).toHaveLength(2);
    expect(j.hooks.PreToolUse[0]).toEqual(theirs.hooks.PreToolUse[0]);
    expect(j.hooks.Notification).toHaveLength(2);
    expect(j.hooks.Stop).toHaveLength(1);
    const st = s.state(p);
    expect(st.find((x) => x.hook === "guard")?.on).toBe(true);
    expect(st.find((x) => x.hook === "waiting")?.on).toBe(true);
    // Removing the guard leaves the waiting hook and the done signal, and the person's own entries.
    expect(s.remove(p, "claude", "guard").on).toBe(false);
    const j2 = JSON.parse(readFileSync(join(p, HOOK_FILE.claude), "utf8"));
    expect(j2.hooks.PreToolUse).toEqual(theirs.hooks.PreToolUse);
    expect(j2.hooks.Notification).toHaveLength(2);
    expect(j2.hooks.Stop).toHaveLength(1);
    s.remove(p, "claude", "waiting"); s.remove(p, "claude", "done");
    expect(JSON.parse(readFileSync(join(p, HOOK_FILE.claude), "utf8"))).toEqual(theirs);
  });
  test("a file Squibby made for the guard goes once empty, and the git folder is the same throughout", () => {
    const data = tmp("data"), p = gitProject();
    const before = print(join(p, ".git"));
    const s = new DoneSignals(data);
    s.add(p, "claude", "guard");
    expect(existsSync(join(p, HOOK_FILE.claude))).toBe(true);
    s.remove(p, "claude", "guard");
    expect(existsSync(join(p, ".claude"))).toBe(false);
    expect(print(join(p, ".git"))).toBe(before);
  });
  test("run for real: with no engine alive the hooks exit 0 at once and write nothing", () => {
    const data = tmp("data"), p = gitProject();
    const s = new DoneSignals(data);
    s.add(p, "claude", "guard"); s.add(p, "claude", "waiting");
    const j = JSON.parse(readFileSync(join(p, HOOK_FILE.claude), "utf8"));
    const guard = j.hooks.PreToolUse[0].hooks[0].command as string, waiting = j.hooks.Notification[0].hooks[0].command as string;
    const token = s.tokenFor(p, false)!;
    expect(guard).toBe(guardCommand(join(data, GUARD_DIR), token));
    expect(waiting).toBe(waitingCommand(join(data, GUARD_DIR), token));
    const t0 = Date.now();
    for (const [cmd, input] of [[guard, request("git reset --hard", p)], [waiting, JSON.stringify({ hook_event_name: "Notification", message: "Claude needs your permission SECRET-WORDS", notification_type: "permission_prompt" })]]) {
      const r = runHook(cmd, input, p);
      expect(r.exitCode).toBe(0);
      expect(r.stdout.toString()).toBe("");
    }
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(readdirSync(join(data, GUARD_DIR))).toEqual([]);
    expect(print(data)).not.toContain("SECRET-WORDS");
  });
  test("run for real: with the engine alive the guard hook writes its request, waits for the answer, cleans up and exits 0", async () => {
    const data = tmp("data"), p = gitProject();
    const s = new DoneSignals(data);
    s.add(p, "claude", "guard");
    const cmd = JSON.parse(readFileSync(join(p, HOOK_FILE.claude), "utf8")).hooks.PreToolUse[0].hooks[0].command as string;
    const dir = join(data, GUARD_DIR);
    writeFileSync(join(dir, GUARD_PID), String(process.pid));
    const child = Bun.spawn(["/bin/sh", "-c", cmd], { stdin: new TextEncoder().encode(request("git reset --hard", p)), cwd: p, stdout: "pipe" });
    const token = s.tokenFor(p, false)!;
    let req = "";
    await until(() => { req = readdirSync(dir).find((n) => n.startsWith(`${token}.`) && !n.endsWith(".tmp") && !n.endsWith(".ok")) ?? ""; return !!req; });
    expect(JSON.parse(readFileSync(join(dir, req), "utf8")).tool_input.command).toBe("git reset --hard");
    const t0 = Date.now();
    writeFileSync(join(dir, `${req}.ok`), "");
    expect(await child.exited).toBe(0);
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(await new Response(child.stdout).text()).toBe("");
    expect(readdirSync(dir)).toEqual([GUARD_PID]);
  });
  test("run for real: with no answer the guard hook still lets the command go after its wait", async () => {
    const data = tmp("data"), p = gitProject();
    const s = new DoneSignals(data);
    s.add(p, "claude", "guard");
    const cmd = JSON.parse(readFileSync(join(p, HOOK_FILE.claude), "utf8")).hooks.PreToolUse[0].hooks[0].command as string;
    const dir = join(data, GUARD_DIR);
    writeFileSync(join(dir, GUARD_PID), String(process.pid));
    const t0 = Date.now();
    const r = runHook(cmd, request("rm -rf dist", p), p);
    expect(r.exitCode).toBe(0);
    const took = Date.now() - t0;
    expect(took).toBeGreaterThan(4000);
    expect(took).toBeLessThan(9000);
    expect(readdirSync(dir)).toEqual([GUARD_PID]);
  }, 15_000);
});

describe("the guard answers", () => {
  type Made = { data: string; p: string; store: CheckpointStore; events: Record<string, unknown>[]; rows: { label: string; checkpoint: string }[]; g: HookGuard; dir: string };
  function setup(o: { destructive?: (c: string) => string | null; snapshotWaitMs?: number; slowMs?: number; waitingMinutes?: number } = {}): Made {
    const data = tmp("data"), p = gitProject();
    const s = new DoneSignals(data);
    s.add(p, "claude", "guard");
    const store = new CheckpointStore(join(data, "shadow"), p);
    const events: Record<string, unknown>[] = [], rows: { label: string; checkpoint: string }[] = [];
    const dir = join(data, GUARD_DIR);
    const g = new HookGuard(dir, {
      projectOf: (t) => s.projectOf(t), emit: (e) => events.push(e), row: (r) => rows.push(r),
      snapshot: async (_p, label) => { if (o.slowMs) await sleep(o.slowMs); return store.snapshot(label); },
      ...(o.destructive ? { destructive: o.destructive } : {}), ...(o.snapshotWaitMs ? { snapshotWaitMs: o.snapshotWaitMs } : {}), waitingMinutes: () => o.waitingMinutes ?? 15,
    });
    expect(g.start()).toBe(true);
    guards.push(g);
    return { data, p, store, events, rows, g, dir };
  }
  const drop = (m: Made, name: string, text: string) => { writeFileSync(join(m.dir, `${name}.tmp`), text); Bun.spawnSync(["mv", join(m.dir, `${name}.tmp`), join(m.dir, name)]); };
  const token = (m: Made) => new DoneSignals(m.data).tokenFor(m.p, false)!;

  test("the pid file says the engine is alive while it runs, and goes when it stops", () => {
    const m = setup();
    expect(readFileSync(join(m.dir, GUARD_PID), "utf8")).toBe(String(process.pid));
    m.g.stop();
    expect(existsSync(join(m.dir, GUARD_PID))).toBe(false);
  });
  test("a destructive command gets a snapshot, a History row and guard.saved, then the answer; the request is gone", async () => {
    const m = setup();
    const before = print(join(m.p, ".git"));
    const name = `${token(m)}.4242`;
    drop(m, name, request("git reset --hard", m.p));
    await until(() => existsSync(join(m.dir, `${name}.ok`)));
    await m.g.idle();
    expect(existsSync(join(m.dir, name))).toBe(false);
    const saved = m.events.find((e) => e.type === "guard.saved")!;
    expect(saved).toMatchObject({ project: m.p, command: "git reset --hard" });
    expect(String(saved.checkpoint)).toMatch(/^cp_/);
    expect(m.rows).toHaveLength(1);
    expect(m.rows[0].label).toBe(`${SAVED_LABEL}git reset --hard`);
    expect(m.rows[0].checkpoint).toBe(String(saved.checkpoint));
    expect((await m.store.list()).some((c) => c.id === saved.checkpoint && c.label === m.rows[0].label)).toBe(true);
    expect(print(join(m.p, ".git"))).toBe(before);
    // The event keeps to the protocol.
    expect(parseEvent(JSON.stringify({ v: PROTOCOL_VERSION, id: "e1", ...saved })).ok).toBe(true);
    // The request's own words (the description, the session) are nowhere in the data folder.
    expect(print(m.data)).not.toContain("toolu_1");
  });
  test("a harmless command gets the answer at once, with no snapshot and no row", async () => {
    const m = setup();
    const name = `${token(m)}.1`;
    drop(m, name, request("npm test", m.p));
    await until(() => existsSync(join(m.dir, `${name}.ok`)));
    await m.g.idle();
    expect(m.events).toEqual([]);
    expect(m.rows).toEqual([]);
    expect(await m.store.list()).toEqual([]);
  });
  test("a request that is not JSON, not Bash, or for an unknown project is answered and nothing else happens", async () => {
    const m = setup();
    for (const [name, text] of [[`${token(m)}.2`, "{ nope"], [`${token(m)}.3`, JSON.stringify({ tool_name: "Edit", tool_input: {} })], [`${"a".repeat(24)}.4`, request("git reset --hard", m.p)]]) {
      drop(m, name, text);
      await until(() => existsSync(join(m.dir, `${name}.ok`)));
    }
    await m.g.idle();
    expect(m.events).toEqual([]);
    expect(await m.store.list()).toEqual([]);
  });
  test("a snapshot that fails still answers, so the command is never blocked", async () => {
    const data = tmp("data"), p = gitProject();
    const s = new DoneSignals(data); s.add(p, "claude", "guard");
    const dir = join(data, GUARD_DIR);
    const events: Record<string, unknown>[] = [];
    const g = new HookGuard(dir, { projectOf: (t) => s.projectOf(t), emit: (e) => events.push(e), snapshot: () => Promise.reject(new Error("disk full")) });
    g.start(); guards.push(g);
    const name = `${s.tokenFor(p, false)!}.9`;
    writeFileSync(join(dir, `${name}.tmp`), request("rm -rf dist", p)); Bun.spawnSync(["mv", join(dir, `${name}.tmp`), join(dir, name)]);
    await until(() => existsSync(join(dir, `${name}.ok`)));
    await g.idle();
    expect(events).toEqual([]);
  });
  test("a slow snapshot lets the command go after the wait, and still finishes", async () => {
    const m = setup({ snapshotWaitMs: 300, slowMs: 900 });
    const name = `${token(m)}.5`;
    const t0 = Date.now();
    drop(m, name, request("git clean -fd", m.p));
    await until(() => existsSync(join(m.dir, `${name}.ok`)));
    expect(Date.now() - t0).toBeLessThan(850);
    await until(() => m.events.some((e) => e.type === "guard.saved"), 4000);
  });
  test("a waiting note says Claude is waiting with a short redacted message, clears on the next hook event, and keeps to the protocol", async () => {
    const m = setup();
    const name = `${token(m)}.7.note`;
    drop(m, name, JSON.stringify({ hook_event_name: "Notification", cwd: m.p, message: "Claude needs your permission to run a command sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789abcdefghij", title: "Permission needed", notification_type: "permission_prompt" }));
    await until(() => m.events.some((e) => e.type === "hook.waiting"));
    const w = m.events.find((e) => e.type === "hook.waiting")!;
    expect(w).toMatchObject({ project: m.p, waiting: true });
    expect(String(w.message)).toContain("Claude needs your permission");
    expect(String(w.message)).not.toContain("abcdefghijklmnop");
    expect(parseEvent(JSON.stringify({ v: PROTOCOL_VERSION, id: "e2", ...w })).ok).toBe(true);
    expect(existsSync(join(m.dir, name))).toBe(false);
    // Another type of notification is not "waiting".
    drop(m, `${token(m)}.8.note`, JSON.stringify({ message: "Signed in", notification_type: "auth_success" }));
    await sleep(150);
    expect(m.events.filter((e) => e.type === "hook.waiting")).toHaveLength(1);
    // The next guard request for the project clears it.
    drop(m, `${token(m)}.10`, request("ls", m.p));
    await until(() => m.events.some((e) => e.type === "hook.waiting" && e.waiting === false));
    expect(parseEvent(JSON.stringify({ v: PROTOCOL_VERSION, id: "e3", ...m.events.at(-1) })).ok).toBe(true);
    // activity() from the done signal clears it too; clearing twice says nothing twice.
    drop(m, `${token(m)}.11.note`, JSON.stringify({ message: "Waiting for your input", notification_type: "idle_prompt" }));
    await until(() => m.events.filter((e) => e.type === "hook.waiting" && e.waiting === true).length === 2);
    m.g.activity(m.p); m.g.activity(m.p);
    expect(m.events.filter((e) => e.type === "hook.waiting" && e.waiting === false)).toHaveLength(2);
  });
  test("stale requests left from a Claude Code that gave up are removed at start, never answered", () => {
    const data = tmp("data"), p = gitProject();
    const s = new DoneSignals(data); s.add(p, "claude", "guard");
    const dir = join(data, GUARD_DIR), name = `${s.tokenFor(p, false)!}.77`;
    writeFileSync(join(dir, name), request("git reset --hard", p));
    const g = new HookGuard(dir, { projectOf: (t) => s.projectOf(t), emit: () => {}, snapshot: () => Promise.reject(new Error("never")), now: () => Date.now() + 120_000 });
    g.start(); guards.push(g);
    expect(existsSync(join(dir, name))).toBe(false);
    expect(existsSync(join(dir, `${name}.ok`))).toBe(false);
  });
});

describe("the History rows and the week's count", () => {
  test("a saved copy is its own row, never a task, and the count comes from real rows of the last seven days", () => {
    const data = tmp("data");
    const log = new TaskLog(join(data, "tasks.db"));
    const p = "/Users/x/site";
    const now = new Date("2026-11-10T12:00:00Z");
    log.saved({ project: p, label: `${SAVED_LABEL}git reset --hard`, checkpoint: "cp_0005", at: new Date(now.getTime() - 3_600_000).toISOString() });
    log.saved({ project: p, label: `${SAVED_LABEL}rm -rf dist`, checkpoint: "cp_0002", at: new Date(now.getTime() - 9 * 86_400_000).toISOString() });
    const id = log.start({ project: p, agent: "a", mode: "drive", label: "fix the menu", startedAt: new Date(now.getTime() - 7_200_000).toISOString(), checkpoint: "cp_0003" });
    log.finish(id, "done", 0.2, new Date(now.getTime() - 7_000_000).toISOString(), { checkpoint: "cp_0003", changed: 2, proof: "passed" });
    expect(log.list(p).map((t) => t.label)).toEqual(["fix the menu"]);
    const saved = log.savedRows(p);
    expect(saved.map((r) => [r.command, r.checkpoint, r.undone])).toEqual([["git reset --hard", "cp_0005", false], ["rm -rf dist", "cp_0002", false]]);
    // Nothing caught yet: every count is zero.
    expect(log.caught(p, now)).toEqual({ since: new Date(now.getTime() - 7 * 86_400_000).toISOString(), falseDones: 0, keys: 0, weakened: 0, saved: 0, undone: 0 });
    // An Undo back to the saved copy marks it (and the task after it) as used.
    log.markUndone(p, 3, "cp_0009");
    expect(log.savedRows(p)[0].undone).toBe(true);
    log.addReview({ project: p, batch: "b1", at: now.toISOString(), files: ["a.ts"], count: 1, rating: "stop", touches: [], checks: "failed", summary: "x", kinds: ["checks_failed", "secret_in_code"] });
    log.addReview({ project: p, batch: "b2", at: now.toISOString(), files: ["a.test.ts"], count: 1, rating: "stop", touches: [], checks: "not_run", summary: "y", kinds: ["weakened_check", "claimed_passed"] });
    log.addReview({ project: p, batch: "b3", at: new Date(now.getTime() - 8 * 86_400_000).toISOString(), files: ["a.ts"], count: 1, rating: "stop", touches: [], checks: "failed", summary: "old", kinds: ["secret_in_code"] });
    expect(log.caught(p, now)).toMatchObject({ falseDones: 2, keys: 1, weakened: 1, saved: 1, undone: 1 });
    // Another project's rows never count.
    expect(log.caught("/Users/x/other", now)).toMatchObject({ falseDones: 0, keys: 0, weakened: 0, saved: 0, undone: 0 });
  });
});
