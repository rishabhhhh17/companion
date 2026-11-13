// M85 (research feature 3): before a command that touches a live system, the person's own AI tool asks them first, with
// Squibby's plain reason. Each tool's guard hook runs for real with sh (as m80-every-tool.test.ts does) against a real
// HookGuard watching a temporary guard folder; the snapshot is a stand in. Nothing runs the commands, git or a model.
// Ask is the person deciding in their own tool: Squibby never answers deny, block, approve or auto_approve.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canAsk, DoneSignals, DONE_TOOLS, GUARD_ASK, GUARD_DIR, GUARD_PID, HOOK_FILE, guardCommand, type DoneTool } from "../src/donesignal.ts";
import { HookGuard } from "../src/guard.ts";
import { TaskLog } from "../src/tasklog.ts";

const made: string[] = [];
const guards: HookGuard[] = [];
afterEach(() => { while (guards.length) guards.pop()!.stop(); while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (label: string) => { const d = mkdtempSync(join(tmpdir(), `companion-test-m85-${label}-`)); made.push(d); return d; };
const TOKEN = "0123456789abcdef01234567";

/** The request each tool's hook gets for a shell command, in its own shape. */
const requestOf = (tool: DoneTool, command: string, cwd: string): string => {
  if (tool === "cursor") return JSON.stringify({ command, cwd, hook_event_name: "beforeShellExecution" });
  if (tool === "antigravity") return JSON.stringify({ toolCall: { name: "run_command", args: { CommandLine: command, Cwd: cwd } } });
  if (tool === "copilot") return JSON.stringify({ toolName: "run_in_terminal", toolArgs: { command }, cwd });
  if (tool === "gemini") return JSON.stringify({ hook_event_name: "BeforeTool", tool_name: "run_shell_command", tool_input: { command }, cwd });
  if (tool === "windsurf") return JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "exec", tool_input: { command }, cwd });
  return JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command }, cwd });
};

/** A live engine: a real HookGuard on a temporary guard folder, with the pid file the hooks check first. */
function engine(o: { askLive?: boolean; live?: (c: string) => string | null } = {}) {
  const data = tmp("data"), project = tmp("proj"), g = join(data, GUARD_DIR);
  mkdirSync(g, { recursive: true });
  const events: Record<string, unknown>[] = [], rows: { command: string; reason: string }[] = [], saved: string[] = [];
  const guard = new HookGuard(g, {
    projectOf: (t) => (t === TOKEN ? project : null),
    snapshot: async (_p, label) => { saved.push(label); return { id: "cp_test" }; },
    emit: (e) => events.push(e),
    askLive: () => o.askLive ?? true,
    ...(o.live ? { live: (c: string) => o.live!(c) } : {}),
    asked: (r) => rows.push({ command: r.command, reason: r.reason }),
  });
  expect(guard.start()).toBe(true);
  guards.push(guard);
  return { g, project, events, rows, saved, guard };
}
async function run(tool: DoneTool, command: string, e: ReturnType<typeof engine>) {
  const child = Bun.spawn(["/bin/sh", "-c", guardCommand(e.g, TOKEN, tool)], { stdin: new TextEncoder().encode(requestOf(tool, command, e.project)), cwd: e.project, stdout: "pipe", stderr: "pipe" });
  const code = await child.exited;
  await e.guard.idle();
  return { code, out: await new Response(child.stdout).text(), err: await new Response(child.stderr).text() };
}

const LIVE = "supabase db reset --linked";

describe("which tools can ask, from each tool's own hook docs", () => {
  test("Claude Code, Cursor, the VS Code agent and Antigravity ask; Codex, Gemini CLI and Windsurf keep going on", () => {
    expect(DONE_TOOLS.filter(canAsk)).toEqual(["claude", "cursor", "copilot", "antigravity"]);
    // Never a block or an approval for the person in any ask.
    for (const f of Object.values(GUARD_ASK)) expect(f).not.toMatch(/deny|block|approve|"allow"/);
  });
});

describe("a live command: each tool's own ask, run for real", () => {
  test("Claude Code: hookSpecificOutput.permissionDecision ask, with the reason, exit 0", async () => {
    const e = engine();
    const r = await run("claude", LIVE, e);
    expect(r.code).toBe(0);
    const j = JSON.parse(r.out);
    expect(j.hookSpecificOutput.hookEventName).toBe("PreToolUse");
    expect(j.hookSpecificOutput.permissionDecision).toBe("ask");
    expect(j.hookSpecificOutput.permissionDecisionReason).toContain("live Supabase database");
    expect(j.hookSpecificOutput.permissionDecisionReason).toContain("can't bring it back");
  });
  test("Cursor: permission ask with user_message and agent_message, exit 0 (not its fail open exit 1)", async () => {
    const e = engine();
    const r = await run("cursor", "vercel --prod", e);
    expect(r.code).toBe(0);
    const j = JSON.parse(r.out);
    expect(j.permission).toBe("ask");
    expect(j.user_message).toContain("live");
    expect(j.agent_message).toBe(j.user_message);
  });
  test("the VS Code agent: permissionDecision ask at the top, exit 0", async () => {
    const e = engine();
    const r = await run("copilot", "terraform destroy", e);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toEqual({ permissionDecision: "ask", permissionDecisionReason: expect.stringContaining("terraform destroy") });
  });
  test("Antigravity: decision ask with the reason (never auto_approve), exit 0", async () => {
    const e = engine();
    const r = await run("antigravity", "git push --force origin main", e);
    expect(r.code).toBe(0);
    const j = JSON.parse(r.out);
    expect(j.decision).toBe("ask");
    expect(j.reason).toContain("rewrites the history");
  });
  test("Codex, Gemini CLI and Windsurf: today's go on, nothing printed, no ask said or kept", async () => {
    for (const t of ["codex", "gemini", "windsurf"] as const) {
      const e = engine();
      const r = await run(t, LIVE, e);
      expect({ tool: t, code: r.code, out: r.out }).toEqual({ tool: t, code: 0, out: "" });
      expect(e.events.filter((x) => x.type === "guard.asked")).toEqual([]);
      expect(e.rows).toEqual([]);
    }
  });
  test("the ask is said once and kept in History with its reason and a short command", async () => {
    const e = engine();
    await run("claude", LIVE, e);
    expect(e.events.filter((x) => x.type === "guard.asked")).toEqual([{ type: "guard.asked", project: e.project, command: LIVE, reason: expect.stringContaining("live Supabase") }]);
    expect(e.rows).toEqual([{ command: LIVE, reason: expect.stringContaining("live Supabase") }]);
  });
  test("a live command that is also destructive is saved first, then asked about", async () => {
    const e = engine();
    const r = await run("claude", "git push --force", e);
    expect(JSON.parse(r.out).hookSpecificOutput.permissionDecision).toBe("ask");
    expect(e.saved).toEqual(["Before Claude ran: git push --force"]);
  });
});

describe("M85 review: an ask is never lost behind a slow snapshot", () => {
  test("the answer file holds the reason at once; the ask is said and kept only after it is written; the snapshot finishes on its own", async () => {
    const data = tmp("slow"), project = tmp("slowproj"), g = join(data, GUARD_DIR);
    mkdirSync(g, { recursive: true });
    const name = `${TOKEN}.4242.ask`, ok = join(g, `${name}.ok`);
    const said: { type: unknown; answered: boolean }[] = [], rows: boolean[] = [];
    let finish!: () => void;
    const guard = new HookGuard(g, {
      projectOf: () => project,
      // A big project: the snapshot takes far longer than the hook waits.
      snapshot: () => new Promise((r) => { finish = () => r({ id: "cp_slow" }); }),
      emit: (e) => said.push({ type: e.type, answered: existsSync(ok) }),
      asked: () => rows.push(existsSync(ok)),
      snapshotWaitMs: 60_000,
      watch: (() => ({ close() {}, on() {} })) as never,
    });
    expect(guard.start()).toBe(true);
    guards.push(guard);
    writeFileSync(join(g, name), JSON.stringify({ tool_name: "Bash", tool_input: { command: "git push --force" }, cwd: project }));
    const taking = guard.take(name);
    const end = Date.now() + 1000;
    while (!existsSync(ok) && Date.now() < end) await new Promise((r) => setTimeout(r, 5));
    expect(existsSync(ok)).toBe(true);
    expect(JSON.parse(readFileSync(ok, "utf8"))).toContain("rewrites the history");
    expect(said.filter((x) => x.type === "guard.asked")).toEqual([{ type: "guard.asked", answered: true }]);
    expect(rows).toEqual([true]);
    finish();
    await taking;
    expect(said.map((x) => x.type)).toEqual(["guard.asked", "guard.saved"]);
  });
});

describe("what never asks", () => {
  test("a harmless command: each ask tool's own usual ending, unchanged", async () => {
    const want: Record<string, { code: number; out: string }> = { claude: { code: 0, out: "" }, copilot: { code: 0, out: "" }, cursor: { code: 1, out: "" }, antigravity: { code: 0, out: '{"decision":"allow"}' } };
    for (const t of ["claude", "copilot", "cursor", "antigravity"] as const) {
      const e = engine();
      const r = await run(t, "npm test", e);
      expect({ code: r.code, out: r.out }).toEqual(want[t]);
    }
  });
  test("Ask before live systems turned off: the command goes on as before, nothing kept", async () => {
    const e = engine({ askLive: false });
    const r = await run("claude", LIVE, e);
    expect({ code: r.code, out: r.out }).toEqual({ code: 0, out: "" });
    expect(e.rows).toEqual([]);
  });
  test("a closed Squibby: every tool's usual ending, never an ask", () => {
    for (const t of ["claude", "cursor", "copilot", "antigravity"] as const) {
      const data = tmp("data"), p = tmp("proj");
      mkdirSync(join(data, GUARD_DIR), { recursive: true });
      const r = Bun.spawnSync(["/bin/sh", "-c", guardCommand(join(data, GUARD_DIR), TOKEN, t)], { stdin: new TextEncoder().encode(requestOf(t, LIVE, p)), cwd: p });
      expect(r.stdout.toString()).not.toContain("ask");
    }
  });
});

describe("the reason reaches the tool exactly, whatever it holds", () => {
  test("quotes, a percent sign, backslashes and a single quote survive as JSON; a key is hidden", async () => {
    const tricky = `It's "live" at 100% \\ here; $(whoami) \`id\` sk-ant-api03-${"A".repeat(30)}`;
    const e = engine({ live: () => tricky });
    const r = await run("claude", "anything", e);
    const said = JSON.parse(r.out).hookSpecificOutput.permissionDecisionReason as string;
    expect(said).toContain(`It's "live" at 100% \\ here; $(whoami) \`id\``);
    expect(said).not.toContain("A".repeat(30));
    expect(said.length).toBeLessThanOrEqual(300);
  });
  test("the request and answer files are gone after the hook ends", async () => {
    const e = engine();
    await run("cursor", LIVE, e);
    expect(readdirSync(e.g).filter((n) => n !== GUARD_PID)).toEqual([]);
  });
});

describe("a guard written before it could ask", () => {
  test("is shown as older, and turning it on again writes today's line in place of the old one", () => {
    const data = tmp("data"), p = tmp("proj");
    const ds = new DoneSignals(data);
    ds.add(p, "claude", "guard");
    const file = join(p, HOOK_FILE.claude);
    const j = JSON.parse(readFileSync(file, "utf8"));
    // Yesterday's guard: the same entry with the old ending (no ask, request named <token>.<pid>).
    const token = ds.tokenFor(p)!;
    j.hooks.PreToolUse[0].hooks[0].command = j.hooks.PreToolUse[0].hooks[0].command.replace(`${token}.$$.ask`, `${token}.$$`).replace(/if \[ -s "\$r\.ok" \][^]*?fi; /, "");
    writeFileSync(file, JSON.stringify(j, null, 2));
    expect(ds.plan(p, "claude", "guard")).toMatchObject({ on: true, stale: true });
    ds.add(p, "claude", "guard");
    const now = JSON.parse(readFileSync(file, "utf8"));
    expect(now.hooks.PreToolUse).toHaveLength(1);
    expect(now.hooks.PreToolUse[0].hooks[0].command).toContain(".ask");
    expect(ds.plan(p, "claude", "guard").stale).toBeUndefined();
  });
  test("an old request name (no .ask) is still answered, never with an ask", async () => {
    const e = engine();
    const old = guardCommand(e.g, TOKEN, "codex");
    const child = Bun.spawn(["/bin/sh", "-c", old], { stdin: new TextEncoder().encode(requestOf("claude", LIVE, e.project)), cwd: e.project, stdout: "pipe" });
    expect(await child.exited).toBe(0);
    expect(await new Response(child.stdout).text()).toBe("");
  });
});

test("History keeps asks apart from tasks, newest first, with who asked and the answer", () => {
  const dir = tmp("log");
  const log = new TaskLog(join(dir, "tasks.db"));
  log.asked({ project: "/p", command: "vercel --prod", reason: "This puts a new version of your site live.", at: "2026-11-14T10:00:00.000Z", by: "tool" });
  log.asked({ project: "/p", command: "Read: /Users/demo/a.md", reason: "This reads a file outside your project folder.", at: "2026-11-14T10:05:00.000Z", by: "squibby", answer: "always" });
  expect(log.askedRows("/p")).toEqual([
    { id: 2, at: "2026-11-14T10:05:00.000Z", command: "Read: /Users/demo/a.md", reason: "This reads a file outside your project folder.", by: "squibby", answer: "always" },
    { id: 1, at: "2026-11-14T10:00:00.000Z", command: "vercel --prod", reason: "This puts a new version of your site live.", by: "tool" },
  ]);
  expect(log.list("/p")).toEqual([]);
  expect(existsSync(join(dir, "tasks.db"))).toBe(true);
});
