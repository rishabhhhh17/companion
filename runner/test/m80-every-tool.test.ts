// M80 (the safety net in every AI tool): the done signal and the saved copy before a destructive command, for Codex, Cursor,
// the VS Code agent (GitHub Copilot) and Antigravity as well as Claude Code. Each tool's own hook file and shape, what each
// hook prints and how it ends when run for real with sh (a closed Squibby never blocks any tool), the request shapes the
// guard reads, and Remove taking out only Squibby's lines. Every folder is a temporary fixture; nothing runs git or a model.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DONE_TOOLS, DoneSignals, GUARD_DIR, GUARD_PID, HOOK_FILE, TOOL_HOOKS, eventOf, guardCommand } from "../src/donesignal.ts";
import { parseRequest } from "../src/guard.ts";
import { ignoredPath } from "../src/review/batcher.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (label: string) => { const d = mkdtempSync(join(tmpdir(), `companion-test-m80-${label}-`)); made.push(d); return d; };
const runHook = (cmd: string, input: string, cwd: string) => Bun.spawnSync(["/bin/sh", "-c", cmd], { stdin: new TextEncoder().encode(input), cwd });
const read = (f: string) => JSON.parse(readFileSync(f, "utf8"));
const commandsIn = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.flatMap(commandsIn);
  if (v && typeof v === "object") return Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => (k === "command" && typeof x === "string" ? [x] : commandsIn(x)));
  return [];
};

describe("every tool's own file, event and shape", () => {
  test("the tools and their files", () => {
    expect([...DONE_TOOLS]).toEqual(["claude", "codex", "cursor", "copilot", "antigravity", "gemini", "windsurf"]);
    expect(HOOK_FILE.cursor).toBe(".cursor/hooks.json");
    expect(HOOK_FILE.copilot).toBe(".github/hooks/companion.json");
    expect(HOOK_FILE.antigravity).toBe(".agents/hooks.json");
    for (const t of ["codex", "cursor", "copilot", "antigravity", "gemini", "windsurf"] as const) expect([...TOOL_HOOKS[t]]).toEqual(["done", "guard"]);
    expect(eventOf("cursor", "guard")).toBe("beforeShellExecution");
    expect(eventOf("cursor", "done")).toBe("stop");
    expect(eventOf("codex", "guard")).toBe("PreToolUse");
    expect(eventOf("antigravity", "guard")).toBe("PreToolUse");
  });

  test("Codex: a PreToolUse entry on Bash, the same shape as Claude Code's", () => {
    const data = tmp("data"), p = tmp("proj"), s = new DoneSignals(data);
    s.add(p, "codex", "guard");
    const j = read(join(p, ".codex/hooks.json"));
    expect(j.hooks.PreToolUse[0].matcher).toBe("Bash");
    expect(j.hooks.PreToolUse[0].hooks[0]).toMatchObject({ type: "command", timeout: 10 });
    expect(s.plan(p, "codex", "guard").on).toBe(true);
  });

  test("Cursor: version 1, flat entries under beforeShellExecution and stop", () => {
    const data = tmp("data"), p = tmp("proj"), s = new DoneSignals(data);
    s.add(p, "cursor", "guard"); s.add(p, "cursor", "done");
    const j = read(join(p, ".cursor/hooks.json"));
    expect(j.version).toBe(1);
    expect(j.hooks.beforeShellExecution).toHaveLength(1);
    expect(j.hooks.beforeShellExecution[0]).toMatchObject({ timeout: 10 });
    expect(typeof j.hooks.beforeShellExecution[0].command).toBe("string");
    expect(typeof j.hooks.stop[0].command).toBe("string");
    expect(s.plan(p, "cursor", "guard").on && s.plan(p, "cursor", "done").on).toBe(true);
  });

  test("the VS Code agent: its own file in .github/hooks, PreToolUse and Stop, timeoutSec", () => {
    const data = tmp("data"), p = tmp("proj"), s = new DoneSignals(data);
    s.add(p, "copilot", "guard"); s.add(p, "copilot", "done");
    const j = read(join(p, ".github/hooks/companion.json"));
    expect(j.version).toBe(1);
    expect(j.hooks.PreToolUse[0]).toMatchObject({ type: "command", timeoutSec: 10 });
    expect(j.hooks.Stop[0]).toMatchObject({ type: "command" });
  });

  test("Antigravity: named hooks at the top, PreToolUse on run_command, Stop with no matcher", () => {
    const data = tmp("data"), p = tmp("proj"), s = new DoneSignals(data);
    mkdirSync(join(p, ".agents"));
    writeFileSync(join(p, ".agents/hooks.json"), JSON.stringify({ "my-linter": { PostToolUse: [{ matcher: "run_command", hooks: [{ type: "command", command: "./lint.sh" }] }] } }, null, 2));
    s.add(p, "antigravity", "guard"); s.add(p, "antigravity", "done");
    const j = read(join(p, ".agents/hooks.json"));
    expect(Object.keys(j)).toEqual(["my-linter", "companion-guard", "companion-done"]);
    expect(j["companion-guard"].PreToolUse[0].matcher).toBe("run_command");
    expect(j["companion-guard"].PreToolUse[0].hooks[0]).toMatchObject({ type: "command", timeout: 10 });
    expect(j["companion-done"].Stop[0]).toMatchObject({ type: "command" });
    expect(s.plan(p, "antigravity", "guard").on).toBe(true);
  });

  test("the plan shows the exact lines in each tool's own shape and writes nothing", () => {
    const data = tmp("data"), p = tmp("proj"), s = new DoneSignals(data);
    for (const t of ["codex", "cursor", "copilot", "antigravity"] as const) {
      const g = s.plan(p, t, "guard");
      expect(g.on).toBe(false);
      expect(commandsIn(JSON.parse(g.adds)).length).toBe(1);
      expect(s.plan(p, t, "waiting").problem).toBeTruthy();
    }
    expect(existsSync(join(p, ".cursor")) || existsSync(join(p, ".github")) || existsSync(join(p, ".agents"))).toBe(false);
  });
});

describe("each hook's ending when run for real: a closed Squibby never blocks", () => {
  // The guard folder has no live pid, so every hook ends at once with its tool's own "go on".
  const ends = (tool: "claude" | "codex" | "cursor" | "copilot" | "antigravity") => {
    const data = tmp("data"), p = tmp("proj");
    mkdirSync(join(data, GUARD_DIR), { recursive: true });
    const r = runHook(guardCommand(join(data, GUARD_DIR), "0123456789abcdef01234567", tool), "{}", p);
    return { code: r.exitCode, out: r.stdout.toString() };
  };
  test("Claude Code, Codex and the VS Code agent: exit 0, nothing printed", () => {
    for (const t of ["claude", "codex", "copilot"] as const) expect(ends(t)).toEqual({ code: 0, out: "" });
  });
  test("Cursor: exit 1, which Cursor documents as the hook failing open (the command goes on as Cursor decided)", () => {
    expect(ends("cursor")).toEqual({ code: 1, out: "" });
  });
  test("Antigravity: prints allow (never auto_approve) and exits 0", () => {
    const r = ends("antigravity");
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toEqual({ decision: "allow" });
  });
  test("with a live engine the request lands in the guard folder and the answer lets it go", async () => {
    const data = tmp("data"), p = tmp("proj"), g = join(data, GUARD_DIR);
    mkdirSync(g, { recursive: true });
    writeFileSync(join(g, GUARD_PID), String(process.pid));
    const cmd = guardCommand(g, "0123456789abcdef01234567", "antigravity");
    const child = Bun.spawn(["/bin/sh", "-c", cmd], { stdin: new TextEncoder().encode('{"toolCall":{"name":"run_command","args":{"CommandLine":"ls"}}}'), cwd: p, stdout: "pipe" });
    let req = "";
    for (let i = 0; i < 100 && !req; i++) { await Bun.sleep(20); req = readdirSync(g).find((n) => n.startsWith("0123456789abcdef01234567.") && !n.endsWith(".tmp")) ?? ""; }
    expect(req).toBeTruthy();
    writeFileSync(join(g, `${req}.ok`), "");
    expect(await child.exited).toBe(0);
    expect(JSON.parse(await new Response(child.stdout).text())).toEqual({ decision: "allow" });
  });
});

describe("the request shapes the guard reads", () => {
  test("Claude Code and Codex: tool_name Bash, tool_input.command, cwd", () => {
    expect(parseRequest(JSON.stringify({ tool_name: "Bash", tool_input: { command: "git reset --hard" }, cwd: "/p" }))).toEqual({ command: "git reset --hard", cwd: "/p" });
  });
  test("Cursor: command and cwd at the top", () => {
    expect(parseRequest(JSON.stringify({ hook_event_name: "beforeShellExecution", command: "rm -rf dist", cwd: "/p", workspace_roots: ["/p"] }))).toEqual({ command: "rm -rf dist", cwd: "/p" });
  });
  test("the VS Code agent: run_in_terminal in either field style, toolArgs as an object or as JSON text", () => {
    expect(parseRequest(JSON.stringify({ tool_name: "run_in_terminal", tool_input: { command: "git clean -fd" }, cwd: "/p" }))).toEqual({ command: "git clean -fd", cwd: "/p" });
    expect(parseRequest(JSON.stringify({ toolName: "bash", toolArgs: JSON.stringify({ command: "git clean -fd" }), cwd: "/p" }))).toEqual({ command: "git clean -fd", cwd: "/p" });
    expect(parseRequest(JSON.stringify({ toolName: "run_in_terminal", toolArgs: { command: "ls" } }))).toEqual({ command: "ls" });
  });
  test("Antigravity: run_command with CommandLine and Cwd, or the first workspace path", () => {
    expect(parseRequest(JSON.stringify({ toolCall: { name: "run_command", args: { CommandLine: "git reset --hard", Cwd: "/p/src" } }, workspacePaths: ["/p"] }))).toEqual({ command: "git reset --hard", cwd: "/p/src" });
    expect(parseRequest(JSON.stringify({ toolCall: { name: "run_command", args: { CommandLine: "ls" } }, workspacePaths: ["/p"] }))).toEqual({ command: "ls", cwd: "/p" });
  });
  test("anything that is not a shell command is nothing", () => {
    expect(parseRequest(JSON.stringify({ toolCall: { name: "view_file", args: { AbsolutePath: "/p/a" } } }))).toBeNull();
    expect(parseRequest(JSON.stringify({ tool_name: "read_file", tool_input: { command: "x" } }))).toBeNull();
    expect(parseRequest(JSON.stringify({ toolName: "edit", toolArgs: "{not json" }))).toBeNull();
    expect(parseRequest(JSON.stringify({ command: "" }))).toBeNull();
  });
});

describe("Remove takes out only Squibby's lines", () => {
  test("Cursor: the person's own hook and version stay", () => {
    const data = tmp("data"), p = tmp("proj"), s = new DoneSignals(data);
    mkdirSync(join(p, ".cursor"));
    writeFileSync(join(p, ".cursor/hooks.json"), JSON.stringify({ version: 1, hooks: { beforeShellExecution: [{ command: "./mine.sh" }] } }, null, 2));
    s.add(p, "cursor", "guard");
    s.remove(p, "cursor", "guard");
    expect(read(join(p, ".cursor/hooks.json"))).toEqual({ version: 1, hooks: { beforeShellExecution: [{ command: "./mine.sh" }] } });
  });
  test("a file and folders Squibby made go once they hold nothing else, and a folder the person had stays", () => {
    const data = tmp("data"), p = tmp("proj"), s = new DoneSignals(data);
    mkdirSync(join(p, ".github"));
    s.add(p, "copilot", "guard"); s.add(p, "copilot", "done");
    s.remove(p, "copilot", "guard"); s.remove(p, "copilot", "done");
    expect(existsSync(join(p, ".github/hooks"))).toBe(false);
    expect(existsSync(join(p, ".github"))).toBe(true);
    s.add(p, "cursor", "guard"); s.remove(p, "cursor", "guard");
    expect(existsSync(join(p, ".cursor"))).toBe(false);
  });
  test("Antigravity: only the companion keys go", () => {
    const data = tmp("data"), p = tmp("proj"), s = new DoneSignals(data);
    mkdirSync(join(p, ".agents"));
    const theirs = { "my-linter": { PostToolUse: [{ matcher: "run_command", hooks: [{ type: "command", command: "./lint.sh" }] }] } };
    writeFileSync(join(p, ".agents/hooks.json"), JSON.stringify(theirs));
    s.add(p, "antigravity", "guard"); s.add(p, "antigravity", "done");
    s.remove(p, "antigravity", "guard"); s.remove(p, "antigravity", "done");
    expect(read(join(p, ".agents/hooks.json"))).toEqual(theirs);
  });
  test("a file that is not plain JSON is refused and left exactly as it was", () => {
    const data = tmp("data"), p = tmp("proj"), s = new DoneSignals(data);
    mkdirSync(join(p, ".cursor"));
    writeFileSync(join(p, ".cursor/hooks.json"), "{ // mine\n}");
    expect(s.add(p, "cursor", "guard").problem).toBeTruthy();
    expect(readFileSync(join(p, ".cursor/hooks.json"), "utf8")).toBe("{ // mine\n}");
  });
});

test("the review never counts the new tools' own hook files as a change, and the person's workflows still count", () => {
  for (const f of [".cursor/hooks.json", ".agents/hooks.json", ".github/hooks/companion.json"]) expect(ignoredPath(f)).toBe(true);
  expect(ignoredPath(".github/workflows/ci.yml")).toBe(false);
  expect(ignoredPath(".github/hooks/theirs.json")).toBe(false);
});

describe("M81: Gemini CLI and Windsurf (Devin)", () => {
  test("Gemini CLI: .gemini/settings.json, BeforeTool on run_shell_command in milliseconds, AfterAgent; the person's own settings stay", () => {
    const data = tmp("data"), p = tmp("proj"), s = new DoneSignals(data);
    mkdirSync(join(p, ".gemini"));
    writeFileSync(join(p, ".gemini/settings.json"), JSON.stringify({ theme: "Dracula", hooks: { BeforeTool: [{ matcher: "write_file", hooks: [{ type: "command", command: "./mine.sh" }] }] } }, null, 2));
    expect(eventOf("gemini", "guard")).toBe("BeforeTool");
    expect(eventOf("gemini", "done")).toBe("AfterAgent");
    s.add(p, "gemini", "guard"); s.add(p, "gemini", "done");
    const j = read(join(p, ".gemini/settings.json"));
    expect(j.theme).toBe("Dracula");
    expect(j.hooks.BeforeTool).toHaveLength(2);
    expect(j.hooks.BeforeTool[1].matcher).toBe("run_shell_command");
    expect(j.hooks.BeforeTool[1].hooks[0]).toMatchObject({ name: "companion-guard", type: "command", timeout: 10000 });
    expect(j.hooks.AfterAgent[0].hooks[0]).toMatchObject({ name: "companion-done", type: "command" });
    s.remove(p, "gemini", "guard"); s.remove(p, "gemini", "done");
    expect(read(join(p, ".gemini/settings.json"))).toEqual({ theme: "Dracula", hooks: { BeforeTool: [{ matcher: "write_file", hooks: [{ type: "command", command: "./mine.sh" }] }] } });
  });
  test("Windsurf (Devin): .devin/hooks.v1.json holds the events at the top, PreToolUse on exec in seconds, Stop", () => {
    const data = tmp("data"), p = tmp("proj"), s = new DoneSignals(data);
    expect(HOOK_FILE.windsurf).toBe(".devin/hooks.v1.json");
    s.add(p, "windsurf", "guard"); s.add(p, "windsurf", "done");
    const j = read(join(p, ".devin/hooks.v1.json"));
    expect(Object.keys(j)).toEqual(["PreToolUse", "Stop"]);
    expect(j.PreToolUse[0].matcher).toBe("exec");
    expect(j.PreToolUse[0].hooks[0]).toMatchObject({ type: "command", timeout: 10 });
    expect(s.plan(p, "windsurf", "guard").on).toBe(true);
    s.remove(p, "windsurf", "guard"); s.remove(p, "windsurf", "done");
    expect(existsSync(join(p, ".devin"))).toBe(false);
  });
  test("both hooks end with exit 0 and print nothing when Squibby is closed", () => {
    for (const t of ["gemini", "windsurf"] as const) {
      const data = tmp("data"), p = tmp("proj");
      mkdirSync(join(data, GUARD_DIR), { recursive: true });
      const r = runHook(guardCommand(join(data, GUARD_DIR), "0123456789abcdef01234567", t), "{}", p);
      expect({ code: r.exitCode, out: r.stdout.toString() }).toEqual({ code: 0, out: "" });
    }
  });
  test("the guard reads Gemini CLI's run_shell_command and Devin's exec", () => {
    expect(parseRequest(JSON.stringify({ hook_event_name: "BeforeTool", tool_name: "run_shell_command", tool_input: { command: "git reset --hard", description: "x" }, cwd: "/p" }))).toEqual({ command: "git reset --hard", cwd: "/p" });
    expect(parseRequest(JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "exec", tool_input: { command: "rm -rf dist" }, session_id: "s" }))).toEqual({ command: "rm -rf dist" });
  });
  test("the review never counts their folders as a change", () => {
    for (const f of [".gemini/settings.json", ".devin/hooks.v1.json"]) expect(ignoredPath(f)).toBe(true);
  });
});
