// M115 (docs/milestones/M115-every-tool-and-jump.md): every AI tool Squibby can reach, and Go to the session that needs you.
// Copilot CLI's own hook file beside the VS Code agent's; OpenCode, Amp, Cline and Kiro through one small file of Squibby's
// own each; Zed, Junie, the JetBrains AI Assistant and Xcode through the folder (nothing written in the project); the open
// tag any tool can run. Then where a session runs, read from the process table at the moment its hook runs, and the exact
// commands Go to runs. Every folder is a temporary fixture, the hook commands are run for real with sh, and no model, key,
// git or real app is touched (Go to's commands are only built and handed to a stand in).
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCommand, parseEvent, PROTOCOL_VERSION, DONE_SIGNAL_TOOLS, HOOK_KINDS as PROTOCOL_HOOK_KINDS } from "../../protocol/index.ts";
import list from "../../protocol/aitools.json";
import { DONE_DIR, DONE_TOOLS, DoneSignals, GUARD_PID, HOOK_FILE, HOOK_KINDS, OWN_FILE_TOOLS, OWN_TAG, TOOL_HOOKS, WATCH_TOOLS, canBlock, eventOf, ownFileBody } from "../src/donesignal.ts";
import { HookGuard } from "../src/guard.ts";
import { HOOKLESS_TOOLS, LiveFeed } from "../src/livefeed.ts";
import { SessionWhere, appNameOf, jumpPlan, parsePs, readPs, runArgv, tabScript, whereOf, isEditorApp, type Where } from "../src/jump.ts";

const made: string[] = [];
const signals: DoneSignals[] = [];
const guards: HookGuard[] = [];
afterEach(() => {
  while (signals.length) signals.pop()!.stop();
  while (guards.length) guards.pop()!.stop();
  while (made.length) rmSync(made.pop()!, { recursive: true, force: true });
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tmp = (label: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-test-m115-${label}-`))); made.push(d); return d; };
const until = async (pred: () => boolean, ms = 4000) => { for (let i = 0; i < ms / 20 && !pred(); i++) await sleep(20); expect(pred()).toBe(true); };
const read = (f: string) => JSON.parse(readFileSync(f, "utf8"));
const runHook = (cmd: string, input: string, cwd: string) => Bun.spawnSync(["/bin/sh", "-c", cmd], { stdin: new TextEncoder().encode(input), cwd });
/** The hook run while this process's own guard answers it (spawnSync would hold the guard up). */
async function runHookLive(cmd: string, input: string, cwd: string): Promise<{ exitCode: number | null; stdout: string }> {
  const p = Bun.spawn(["/bin/sh", "-c", cmd], { stdin: new TextEncoder().encode(input), cwd, stdout: "pipe" });
  const stdout = await new Response(p.stdout).text();
  return { exitCode: await p.exited, stdout };
}

describe("the one list of tools", () => {
  test("the new tools, each with what Squibby can do with it", () => {
    for (const t of ["copilotcli", "opencode", "amp", "cline", "kiro", "zed", "junie", "jetbrains", "xcode", "any"]) expect(DONE_TOOLS as readonly string[]).toContain(t);
    // The older seven keep their order at the start (their markers and Settings rows are unchanged).
    expect(DONE_TOOLS.slice(0, 7)).toEqual(["claude", "codex", "cursor", "copilot", "antigravity", "gemini", "windsurf"]);
    expect([...TOOL_HOOKS.copilotcli]).toEqual(["done", "guard"]);
    for (const t of ["opencode", "amp", "cline", "kiro"] as const) expect([...TOOL_HOOKS[t]]).toEqual(["done"]);
    for (const t of ["zed", "junie", "jetbrains", "xcode"] as const) expect([...TOOL_HOOKS[t]]).toEqual(["watch"]);
    expect([...TOOL_HOOKS.any]).toEqual([]);
    expect([...OWN_FILE_TOOLS]).toEqual(["opencode", "amp", "cline", "kiro"]);
    expect([...WATCH_TOOLS]).toEqual(["zed", "junie", "jetbrains", "xcode"]);
    expect(HOOK_KINDS as readonly string[]).toContain("watch");
    expect(PROTOCOL_HOOK_KINDS as readonly string[]).toContain("watch");
    expect([...DONE_SIGNAL_TOOLS]).toEqual([...DONE_TOOLS]);
    // The shared list (the shell and the pages read it): every tool once, Claude Desktop through Claude Code.
    const ids = (list as { tools: { id: string; via?: string }[] }).tools.map((t) => t.id);
    for (const t of DONE_TOOLS.filter((x) => x !== "any")) expect(ids).toContain(t);
    expect((list as { tools: { id: string; via?: string }[] }).tools.find((t) => t.id === "claudedesktop")?.via).toBe("claude");
    expect(new Set(ids).size).toBe(ids.length);
  });
  test("each tool's file", () => {
    expect(HOOK_FILE.copilotcli).toBe(".github/hooks/companion-cli.json");
    expect(HOOK_FILE.opencode).toBe(".opencode/plugins/companion.js");
    expect(HOOK_FILE.amp).toBe(".amp/plugins/companion.ts");
    expect(HOOK_FILE.cline).toBe(".clinerules/hooks/TaskComplete");
    expect(HOOK_FILE.kiro).toBe(".kiro/hooks/companion-done.kiro.hook");
    for (const t of [...WATCH_TOOLS, "any"] as const) expect(HOOK_FILE[t]).toBe("");
    expect(eventOf("copilotcli", "done")).toBe("agentStop");
    expect(eventOf("copilotcli", "guard")).toBe("preToolUse");
    // Copilot CLI's preToolUse can deny only; it is never sent an ask.
    expect(canBlock("copilotcli")).toBe(true);
  });
});

describe("Copilot CLI: its own file, beside the VS Code agent's", () => {
  test("version 1, camelCase events, bash entries with timeoutSec", () => {
    const data = tmp("data"), p = tmp("proj"), s = new DoneSignals(data);
    s.add(p, "copilotcli", "done"); s.add(p, "copilotcli", "guard");
    const j = read(join(p, ".github/hooks/companion-cli.json"));
    expect(j.version).toBe(1);
    expect(Object.keys(j.hooks).sort()).toEqual(["agentStop", "preToolUse"]);
    expect(j.hooks.agentStop[0]).toMatchObject({ type: "command" });
    expect(typeof j.hooks.agentStop[0].bash).toBe("string");
    expect(j.hooks.agentStop[0].bash).toContain(`${join(data, DONE_DIR)}/`);
    expect(j.hooks.agentStop[0].bash).toContain(".copilotcli'");
    expect(j.hooks.preToolUse[0]).toMatchObject({ type: "command", timeoutSec: 10 });
    expect(j.hooks.preToolUse[0].command).toBeUndefined();
    expect(s.plan(p, "copilotcli", "done").on && s.plan(p, "copilotcli", "guard").on).toBe(true);
  });
  test("the VS Code agent's file and Copilot CLI's stay apart; Remove takes only its own and the file it made", () => {
    const data = tmp("data"), p = tmp("proj"), s = new DoneSignals(data);
    s.add(p, "copilot", "done"); s.add(p, "copilotcli", "done");
    expect(existsSync(join(p, ".github/hooks/companion.json"))).toBe(true);
    s.remove(p, "copilotcli", "done");
    expect(existsSync(join(p, ".github/hooks/companion-cli.json"))).toBe(false);
    expect(s.plan(p, "copilot", "done").on).toBe(true);
    expect(existsSync(join(p, ".github/hooks"))).toBe(true);
  });
  test("a person's own lines in the file stay", () => {
    const data = tmp("data"), p = tmp("proj"), s = new DoneSignals(data);
    mkdirSync(join(p, ".github/hooks"), { recursive: true });
    writeFileSync(join(p, ".github/hooks/companion-cli.json"), JSON.stringify({ version: 1, hooks: { sessionStart: [{ type: "command", bash: "echo hi" }] } }));
    s.add(p, "copilotcli", "done");
    s.remove(p, "copilotcli", "done");
    expect(read(join(p, ".github/hooks/companion-cli.json"))).toEqual({ version: 1, hooks: { sessionStart: [{ type: "command", bash: "echo hi" }] } });
  });
  test("its guard, run for real, goes on with no output while Squibby is closed and hands its request over while open", async () => {
    const data = tmp("data"), p = tmp("proj"), s = new DoneSignals(data);
    s.add(p, "copilotcli", "guard");
    const cmd = read(join(p, ".github/hooks/companion-cli.json")).hooks.preToolUse[0].bash as string;
    const input = JSON.stringify({ timestamp: 1, cwd: p, toolName: "bash", toolArgs: JSON.stringify({ command: "npm test" }) });
    const closed = runHook(cmd, input, p);
    expect(closed.exitCode).toBe(0);
    expect(closed.stdout.toString()).toBe("");
    const ran: string[] = [];
    const g = new HookGuard(s.guardFolder, { projectOf: (t) => s.projectOf(t), snapshot: async () => ({ id: "c1" }) as never, emit: () => {}, ran: (_p, tool, text) => { if (tool) ran.push(`${tool}:${text.length > 0}`); } });
    guards.push(g); g.start();
    const open = await runHookLive(cmd, input, p);
    expect(open.exitCode).toBe(0);
    expect(open.stdout).toBe("");
    await until(() => ran.length === 1);
    expect(ran).toEqual(["copilotcli:true"]);
  });
});

describe("own files: OpenCode, Amp, Cline and Kiro", () => {
  test("each file is written whole, names only the marker, and reads nothing", () => {
    const marker = "/Users/me/data/runner/done/0123456789abcdef01234567.opencode";
    for (const t of OWN_FILE_TOOLS) {
      const body = ownFileBody(t, marker.replace(".opencode", `.${t}`));
      expect(body).toContain(OWN_TAG);
      expect(body).toContain(`.${t}`);
      // Never the tool's input, its words or its environment.
      expect(body).not.toMatch(/process\.env|stdin|readFileSync|JSON\.stringify\(event/);
    }
    expect(ownFileBody("opencode", marker)).toContain('"session.idle"');
    expect(ownFileBody("amp", marker.replace(".opencode", ".amp"))).toContain('"agent.end"');
    expect(ownFileBody("cline", marker.replace(".opencode", ".cline"))).toMatch(/^#!\/bin\/sh\n/);
    const kiro = JSON.parse(ownFileBody("kiro", marker.replace(".opencode", ".kiro")));
    expect(kiro).toMatchObject({ enabled: true, when: { type: "agentStop" }, then: { type: "runCommand" } });
    expect(kiro.then.command).toStartWith("/usr/bin/touch -- ");
  });
  test("add, check and Remove; Remove takes away the folders Squibby made", () => {
    const data = tmp("data"), p = tmp("proj"), s = new DoneSignals(data);
    for (const t of OWN_FILE_TOOLS) {
      const before = s.plan(p, t, "done");
      expect(before.on).toBe(false);
      expect(before.creates).toBe(true);
      expect(before.adds).toContain(OWN_TAG);
      const after = s.add(p, t, "done");
      expect(after.on).toBe(true);
      expect(after.problem).toBeUndefined();
      expect(readFileSync(join(p, HOOK_FILE[t]), "utf8")).toBe(after.adds);
    }
    // Cline runs its hook as a program.
    expect(statSync(join(p, HOOK_FILE.cline)).mode & 0o111).not.toBe(0);
    for (const t of OWN_FILE_TOOLS) expect(s.remove(p, t, "done").on).toBe(false);
    expect(readdirSync(p)).toEqual([]);
  });
  test("a file of the person's own with that name is never touched", () => {
    const data = tmp("data"), p = tmp("proj"), s = new DoneSignals(data);
    mkdirSync(join(p, ".clinerules/hooks"), { recursive: true });
    writeFileSync(join(p, HOOK_FILE.cline), "#!/bin/sh\necho mine\n");
    const r = s.add(p, "cline", "done");
    expect(r.on).toBe(false);
    expect(r.problem).toBeTruthy();
    expect(readFileSync(join(p, HOOK_FILE.cline), "utf8")).toBe("#!/bin/sh\necho mine\n");
    s.remove(p, "cline", "done");
    expect(readFileSync(join(p, HOOK_FILE.cline), "utf8")).toBe("#!/bin/sh\necho mine\n");
    // A folder the person had stays when Squibby's file goes.
    mkdirSync(join(p, ".opencode/plugins"), { recursive: true });
    s.add(p, "opencode", "done"); s.remove(p, "opencode", "done");
    expect(existsSync(join(p, ".opencode/plugins"))).toBe(true);
  });
  test("an older file of Squibby's (another token) is stale and replaced on the next yes", () => {
    const data = tmp("data"), p = tmp("proj"), s = new DoneSignals(data);
    s.add(p, "kiro", "done");
    const f = join(p, HOOK_FILE.kiro);
    writeFileSync(f, readFileSync(f, "utf8").replace(/[0-9a-f]{24}/, "ffffffffffffffffffffffff"));
    expect(s.plan(p, "kiro", "done").on).toBe(true);
    expect(s.plan(p, "kiro", "done").stale).toBe(true);
    s.add(p, "kiro", "done");
    expect(s.plan(p, "kiro", "done").stale).toBeUndefined();
  });
  test("Cline's script, run for real, touches its marker and lets the task end", async () => {
    const data = tmp("data"), p = tmp("proj"), done: string[] = [];
    const s = new DoneSignals(data, { onDone: (_p, tool) => done.push(String(tool)) });
    signals.push(s); s.start(); s.add(p, "cline", "done");
    const out = Bun.spawnSync([join(p, HOOK_FILE.cline)], { stdin: new TextEncoder().encode('{"taskComplete":{}}'), cwd: p });
    expect(out.exitCode).toBe(0);
    expect(JSON.parse(out.stdout.toString())).toEqual({ cancel: false });
    await until(() => done.length === 1);
    expect(done).toEqual(["cline"]);
  });
  test("OpenCode's and Amp's plugins, loaded under Bun with a stand in, touch the marker only on their done event", async () => {
    const data = tmp("data"), p = tmp("proj"), done: string[] = [];
    const s = new DoneSignals(data, { onDone: (_p, tool) => done.push(String(tool)) });
    signals.push(s); s.start(); s.add(p, "opencode", "done"); s.add(p, "amp", "done");
    const oc = await import(join(p, HOOK_FILE.opencode));
    const hooks = await (Object.values(oc)[0] as (ctx: unknown) => Promise<{ event: (e: unknown) => Promise<void> }>)({});
    await hooks.event({ event: { type: "message.updated", properties: { text: "secret" } } });
    await sleep(100);
    expect(done).toEqual([]);
    await hooks.event({ event: { type: "session.idle" } });
    await until(() => done.length === 1);
    const handlers: Record<string, () => void> = {};
    const amp = await import(join(p, HOOK_FILE.amp));
    amp.default({ on: (name: string, f: () => void) => { handlers[name] = f; } });
    expect(Object.keys(handlers)).toEqual(["agent.end"]);
    handlers["agent.end"]!();
    await until(() => done.length === 2);
    expect(done).toEqual(["opencode", "amp"]);
  });
});

describe("watch: the tools with no hooks", () => {
  test("nothing is written in the project; the yes is kept in Squibby's own index", () => {
    const data = tmp("data"), p = tmp("proj"), s = new DoneSignals(data);
    for (const t of WATCH_TOOLS) {
      const plan = s.plan(p, t, "watch");
      expect(plan).toMatchObject({ on: false, creates: false, adds: "", rel: "" });
      expect(s.add(p, t, "watch").on).toBe(true);
    }
    expect(readdirSync(p)).toEqual([]);
    expect(new DoneSignals(data).plan(p, "zed", "watch").on).toBe(true);
    expect(s.watching(p)).toEqual(["zed", "junie", "jetbrains", "xcode"]);
    s.remove(p, "junie", "watch");
    expect(s.watching(p)).toEqual(["zed", "jetbrains", "xcode"]);
    // Only the watch tools can be watched; watch is no kind of any other tool.
    expect(s.add(p, "claude", "watch").problem).toBeTruthy();
    expect(s.add(p, "zed", "done").problem).toBeTruthy();
  });
  test("the live feed fills in from the folder only for a project with a watched tool, credited to it when it is the only one", async () => {
    const data = tmp("data"), p = tmp("proj"), q = tmp("other"), s = new DoneSignals(data);
    const said: unknown[] = [];
    const feed = new LiveFeed({ emit: (e) => said.push(e), hookless: (x) => HOOKLESS_TOOLS.some((t) => (["done", "guard"] as const).some((h) => s.plan(x, t, h).on)) || s.watching(x).length > 0, credit: (x) => { const w = s.watching(x); return w.length === 1 ? w[0]! : null; } });
    s.add(p, "zed", "watch");
    feed.folder(q, "a.ts");
    feed.folder(p, "b.ts");
    await until(() => said.length > 0);
    const sessions = (said.at(-1) as { sessions: { project: string; tool?: string; via: string }[] }).sessions;
    expect(sessions.map((x) => [x.project, x.tool, x.via])).toEqual([[p, "zed", "folder"]]);
    feed.stop();
  });
});

describe("the open tag: any tool can say it is done", () => {
  test("the one line names this project's token; its marker starts the review, credited to another tool", async () => {
    const data = tmp("data"), p = tmp("proj"), done: [string, string | null][] = [];
    const s = new DoneSignals(data, { onDone: (x, tool) => done.push([x, tool]) });
    signals.push(s); s.start();
    const line = s.anyLine(p);
    expect(line).toBe(`/usr/bin/touch -- '${join(data, DONE_DIR)}/${s.tokenFor(p, false)}.any'`);
    expect(s.state(p).some((r) => r.tool === "any")).toBe(false);
    expect(runHook(line, "", p).exitCode).toBe(0);
    await until(() => done.length === 1);
    expect(done).toEqual([[p, "any"]]);
  });
});

// A process table as `/bin/ps -axo pid=,ppid=,tty=,comm=` prints it on a Mac (the hook's sh, its tool, the shell, the app).
const TABLE = [
  "    1     0 ??       /sbin/launchd",
  "  700     1 ??       /Applications/iTerm.app/Contents/MacOS/iTerm2",
  "  701   700 ttys004  /usr/bin/login",
  "  702   701 ttys004  -zsh",
  "  703   702 ttys004  /Users/me/.local/bin/claude",
  "  704   703 ttys004  /bin/sh",
  "  800     1 ??       /System/Applications/Utilities/Terminal.app/Contents/MacOS/Terminal",
  "  801   800 ttys001  /usr/bin/login",
  "  802   801 ttys001  -zsh",
  "  803   802 ttys001  /bin/sh",
  "  900     1 ??       /Applications/Visual Studio Code.app/Contents/MacOS/Electron",
  "  901   900 ??       /Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper (Plugin).app/Contents/MacOS/Code Helper (Plugin)",
  "  902   901 ttys007  /bin/zsh",
  "  903   902 ttys007  /bin/sh",
  " 1000     1 ??       /Applications/Claude.app/Contents/MacOS/Claude",
  " 1001  1000 ??       /Applications/Claude.app/Contents/Helpers/disclaimer",
  " 1002  1001 ??       /Users/me/Library/Application Support/Claude/claude-code/2.1.326/c4434d650cb3/claude.app/Contents/MacOS/claude",
  " 1003  1002 ??       /bin/sh",
  " 1100     1 ??       tmux",
  " 1101  1100 ttys009  -zsh",
  " 1102  1101 ttys009  /bin/sh",
  " 1200  1201 ttys002  /bin/sh",
  " 1201  1200 ttys002  /bin/sh",
].join("\n");

describe("where a session runs, from the process table", () => {
  const t = parsePs(TABLE);
  test("the table is read as pid, parent, terminal and program", () => {
    expect(t.get(704)).toEqual({ pid: 704, ppid: 703, tty: "ttys004", comm: "/bin/sh" });
    expect(t.get(901)?.comm).toBe("/Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper (Plugin).app/Contents/MacOS/Code Helper (Plugin)");
    expect(parsePs("junk\n  x y z\n").size).toBe(0);
  });
  test("iTerm and Terminal: the app and the tab's terminal", () => {
    expect(whereOf(t, 704)).toEqual({ app: "/Applications/iTerm.app", name: "iTerm", tty: "ttys004", tab: true });
    expect(whereOf(t, 803)).toEqual({ app: "/System/Applications/Utilities/Terminal.app", name: "Terminal", tty: "ttys001", tab: true });
  });
  test("VS Code's own terminal: the outer app, never its helper; no tab to find there", () => {
    expect(whereOf(t, 903)).toEqual({ app: "/Applications/Visual Studio Code.app", name: "Visual Studio Code", tty: "ttys007", tab: false });
  });
  test("Claude Desktop's Code tab: the Claude app, not the copy of Claude Code inside its data folder", () => {
    expect(whereOf(t, 1003)).toEqual({ app: "/Applications/Claude.app", name: "Claude", tab: false });
  });
  test("tmux (no app above), a loop in the table and a pid that is gone: nothing", () => {
    expect(whereOf(t, 1102)).toBeNull();
    expect(whereOf(t, 1200)).toBeNull();
    expect(whereOf(t, 99999)).toBeNull();
  });
  test("an app's name is its bundle's name; editors are told apart", () => {
    expect(appNameOf("/Applications/Cursor.app")).toBe("Cursor");
    expect(isEditorApp("/Applications/Visual Studio Code.app")).toBe(true);
    expect(isEditorApp("/Applications/Cursor.app")).toBe(true);
    expect(isEditorApp("/Applications/IntelliJ IDEA.app")).toBe(true);
    expect(isEditorApp("/Users/me/Applications/WebStorm.app")).toBe(true);
    expect(isEditorApp("/Applications/iTerm.app")).toBe(false);
    expect(isEditorApp("/Applications/Claude.app")).toBe(false);
  });
});

describe("Go to: the exact commands, only on a press", () => {
  const iterm: Where = { app: "/Applications/iTerm.app", name: "iTerm", tty: "ttys004", tab: true };
  test("iTerm with a tab: open the app, then select the tab with that terminal", () => {
    const plan = jumpPlan(iterm, "/Users/me/shop", { tab: true });
    expect(plan[0]).toEqual(["/usr/bin/open", "-a", "/Applications/iTerm.app"]);
    expect(plan[1]![0]).toBe("/usr/bin/osascript");
    expect(plan[1]).toEqual(["/usr/bin/osascript", "-e", tabScript("iterm", "ttys004")!]);
    expect(tabScript("iterm", "ttys004")).toContain('"/dev/ttys004"');
    expect(tabScript("terminal", "ttys001")).toContain('"/dev/ttys001"');
    expect(plan).toHaveLength(2);
  });
  test("with tab finding off, only the app (no Automation question)", () => {
    expect(jumpPlan(iterm, "/Users/me/shop", { tab: false })).toEqual([["/usr/bin/open", "-a", "/Applications/iTerm.app"]]);
  });
  test("an editor opens on the project, so its window for that folder comes forward", () => {
    expect(jumpPlan({ app: "/Applications/Cursor.app", name: "Cursor", tab: false }, "/Users/me/shop", { tab: true })).toEqual([["/usr/bin/open", "-a", "/Applications/Cursor.app", "/Users/me/shop"]]);
  });
  test("no session seen yet: the tool's own app on the project, else nothing", () => {
    expect(jumpPlan(null, "/Users/me/shop", { tab: true, bundle: "com.todesktop.230313mzl4w4u92" })).toEqual([["/usr/bin/open", "-b", "com.todesktop.230313mzl4w4u92", "/Users/me/shop"]]);
    expect(jumpPlan(null, "/Users/me/shop", { tab: true })).toEqual([]);
  });
  test("a terminal name that is not a terminal is never put in a script", () => {
    expect(tabScript("iterm", 'ttys004" & do shell script "x')).toBeNull();
    expect(tabScript("terminal", "console")).toBeNull();
    expect(jumpPlan({ ...iterm, tty: "../x" }, "/p", { tab: true })).toEqual([["/usr/bin/open", "-a", "/Applications/iTerm.app"]]);
    // A path that is not an app bundle is never opened.
    expect(jumpPlan({ app: "/bin/sh", name: "sh", tab: false }, "/p", { tab: true })).toEqual([]);
    expect(jumpPlan({ app: "/Applications/x.app/../../bin", name: "x", tab: false }, "/p", { tab: true })).toEqual([]);
  });
});

describe("the engine keeps where each session runs, in memory only", () => {
  // M115 review: seen and jump are asynchronous (awaited here), and each fresh read says tool.where again, so a page opened
  // since hears it within WHERE_FRESH_MS while the tool works (it was said only on a change before).
  test("seen reads the table once in a while, says tool.where on each read, and Go to runs the plan", async () => {
    const said: Record<string, unknown>[] = [], ran: string[][] = [];
    let reads = 0, now = 1000;
    const w = new SessionWhere({ ps: () => { reads++; return TABLE; }, emit: (e) => said.push(e), now: () => now, run: (argv) => { ran.push(argv); return true; }, tab: () => true, bundleOf: () => null });
    await w.seen("/Users/me/shop", "claude", 704);
    await w.seen("/Users/me/shop", "claude", 704);
    expect(reads).toBe(1);
    expect(said).toEqual([{ type: "tool.where", project: "/Users/me/shop", tool: "claude", app: "iTerm", tab: true }]);
    // A permission request always looks again (the person may have moved the session).
    await w.seen("/Users/me/shop", "claude", 803, true);
    expect(reads).toBe(2);
    expect(said.at(-1)).toEqual({ type: "tool.where", project: "/Users/me/shop", tool: "claude", app: "Terminal", tab: true });
    now += 60_000;
    await w.seen("/Users/me/shop", "claude", 803);
    expect(reads).toBe(3);
    expect(said).toHaveLength(3);
    expect(said[2]).toEqual(said[1]);
    const r = await w.jump("/Users/me/shop", "claude");
    expect(r).toEqual({ ok: true, app: "Terminal" });
    expect(ran[0]).toEqual(["/usr/bin/open", "-a", "/System/Applications/Utilities/Terminal.app"]);
    expect(ran[1]![0]).toBe("/usr/bin/osascript");
  });
  test("Go to with nothing seen and no app says so, and runs nothing", async () => {
    const ran: string[][] = [];
    const w = new SessionWhere({ ps: () => "", emit: () => {}, run: (a) => { ran.push(a); return true; }, tab: () => true, bundleOf: () => null });
    expect(await w.jump("/Users/me/shop", "claude")).toEqual({ ok: false, why: "unknown" });
    expect(ran).toEqual([]);
  });
  test("a ps that fails or a dead pid leaves what was known, and never throws", async () => {
    const said: unknown[] = [];
    const w = new SessionWhere({ ps: () => { throw new Error("no ps"); }, emit: (e) => said.push(e), run: () => true, tab: () => true, bundleOf: () => null });
    expect(() => w.seen("/p", "claude", 1)).not.toThrow();
    await w.seen("/p", "claude", 1);
    await new SessionWhere({ ps: () => Promise.reject(new Error("no ps")), emit: (e) => said.push(e) }).seen("/p", "claude", 1);
    expect(said).toEqual([]);
  });
  test("the guard tells it about each request's process before it answers", async () => {
    const data = tmp("data"), p = tmp("proj"), s = new DoneSignals(data);
    s.add(p, "claude", "guard");
    const seen: [string, string | null, number][] = [];
    const g = new HookGuard(s.guardFolder, { projectOf: (t) => s.projectOf(t), snapshot: async () => ({ id: "c1" }) as never, emit: () => {}, seen: (x, tool, pid) => seen.push([x, tool, pid]) });
    guards.push(g); g.start();
    const token = s.tokenFor(p, false)!;
    writeFileSync(join(s.guardFolder, `${token}.4242.claude.ask`), JSON.stringify({ tool_name: "Bash", tool_input: { command: "ls" } }));
    await g.take(`${token}.4242.claude.ask`);
    expect(seen[0]).toEqual([p, "claude", 4242]);
    expect(existsSync(join(s.guardFolder, GUARD_PID))).toBe(true);
  });
});

describe("M115 review: Go to never holds the engine up", () => {
  test("a slow table read and a slow Go to never hold up a hook's answer", async () => {
    const data = tmp("data"), p = tmp("proj"), s = new DoneSignals(data);
    s.add(p, "claude", "guard");
    let psDone = false, runDone = false;
    const w = new SessionWhere({
      ps: () => new Promise((r) => setTimeout(() => { psDone = true; r(TABLE); }, 400)),
      run: () => new Promise((r) => setTimeout(() => { runDone = true; r(true); }, 400)),
      emit: () => {}, tab: () => true, bundleOf: () => "dev.zed.Zed",
    });
    const g = new HookGuard(s.guardFolder, { projectOf: (t) => s.projectOf(t), snapshot: async () => ({ id: "c1" }) as never, emit: () => {}, seen: (x, tool, pid, always) => { void w.seen(x, tool, pid, always); } });
    guards.push(g); g.start();
    const token = s.tokenFor(p, false)!;
    // Go to is pressed (the Mac is slow, or asks its Automation question), then a hook asks before it ends.
    const jumping = w.jump(p, "zed");
    const name = `${token}.4242.claude.ask`;
    writeFileSync(join(s.guardFolder, name), JSON.stringify({ tool_name: "Bash", tool_input: { command: "ls" } }));
    const t0 = performance.now();
    await g.take(name);
    expect(existsSync(join(s.guardFolder, `${name}.ok`))).toBe(true);
    expect(performance.now() - t0).toBeLessThan(300);
    expect(psDone).toBe(false);
    expect(runDone).toBe(false);
    expect(await jumping).toEqual({ ok: true });
    expect(runDone).toBe(true);
  });
  test("the real ps read and command run are asynchronous, end on their own time, and say how they went", async () => {
    const t0 = performance.now();
    const slow = runArgv(["/bin/sleep", "0.3"]);
    expect(performance.now() - t0).toBeLessThan(100);
    expect(await slow).toBe(true);
    expect(await runArgv(["/bin/sh", "-c", "exit 3"])).toBe(false);
    expect(await runArgv(["/nonexistent/program"])).toBe(false);
    const t1 = performance.now();
    expect(await runArgv(["/bin/sleep", "5"], 200)).toBe(false);
    expect(performance.now() - t1).toBeLessThan(2000);
    const table = parsePs(await readPs());
    expect(table.get(process.pid)?.ppid).toBe(process.ppid);
  });
});

describe("protocol", () => {
  const env = { v: PROTOCOL_VERSION, id: "t1" };
  test("tool.jump names no app or folder of its own; donesignal.anyLine; watch rows", () => {
    expect(parseCommand(JSON.stringify({ ...env, type: "tool.jump", project: "/Users/me/shop", tool: "claude" })).ok).toBe(true);
    expect(parseCommand(JSON.stringify({ ...env, type: "tool.jump", project: "/Users/me/shop", tool: "nope" })).ok).toBe(false);
    expect(parseCommand(JSON.stringify({ ...env, type: "tool.jump", project: "/Users/me/shop" })).ok).toBe(false);
    expect(parseCommand(JSON.stringify({ ...env, type: "donesignal.anyLine", project: "/Users/me/shop" })).ok).toBe(true);
    expect(parseCommand(JSON.stringify({ ...env, type: "donesignal.add", project: "/p", tool: "zed", confirm: true, hook: "watch" })).ok).toBe(true);
  });
  test("tool.where, tool.jumped and donesignal.anyLine events", () => {
    expect(parseEvent(JSON.stringify({ ...env, type: "tool.where", project: "/p", tool: "claude", app: "iTerm", tab: true })).ok).toBe(true);
    expect(parseEvent(JSON.stringify({ ...env, type: "tool.where", project: "/p", tool: "claude", app: "x".repeat(81), tab: true })).ok).toBe(false);
    expect(parseEvent(JSON.stringify({ ...env, type: "tool.jumped", project: "/p", tool: "claude", ok: true, app: "iTerm" })).ok).toBe(true);
    expect(parseEvent(JSON.stringify({ ...env, type: "tool.jumped", project: "/p", tool: "claude", ok: false, why: "unknown" })).ok).toBe(true);
    expect(parseEvent(JSON.stringify({ ...env, type: "tool.jumped", project: "/p", tool: "claude", ok: false, why: "nope" })).ok).toBe(false);
    expect(parseEvent(JSON.stringify({ ...env, type: "donesignal.anyLine", project: "/p", line: "/usr/bin/touch -- '/x/done/0123456789abcdef01234567.any'" })).ok).toBe(true);
  });
  test("the shared fixtures parse", () => {
    const cmds = readFileSync(join(import.meta.dir, "../../protocol/fixtures/commands.jsonl"), "utf8").split("\n").filter((l) => l.includes('"id":"m115c'));
    const evs = readFileSync(join(import.meta.dir, "../../protocol/fixtures/events.jsonl"), "utf8").split("\n").filter((l) => l.includes('"id":"m115e'));
    expect(cmds.length).toBeGreaterThanOrEqual(4);
    expect(evs.length).toBeGreaterThanOrEqual(4);
    for (const l of cmds) expect(parseCommand(l).ok).toBe(true);
    for (const l of evs) expect(parseEvent(l).ok).toBe(true);
  });
});
