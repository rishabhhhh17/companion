// M115 (docs/milestones/M115-every-tool-and-jump.md): every tool Squibby can reach, and Go to the session that needs you, as
// words and steps. Pure: Your AI tools lists each tool with one plain line of what it does with it (Claude Desktop through
// Claude Code, the watch tools with nothing written in the project), the open tag's line, and the model keeps where each
// session runs (tool.where) so the notch can offer Go to. Every press is one command; Go to names no app or folder.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initial, reduce, type Model } from "./model.ts";
import { CONNECT_HOOKS, LIST, anyLineFrom, watchNote, connectAsk, connectCommands, connection, findTools, supportsLine, toolName, VIA_TOOLS } from "./aiTools.ts";
import { DONE_TOOLS, doneAsk, doneStateFrom, removedLine, type DoneState } from "./doneSignal.ts";
import { askAnyLine, jumpTo } from "./commands.ts";
import { goToFor, goToLabel, inToolButton, jumpLine, jumpSaidNow, JUMP_SAID_MS, whereFor } from "./goTo.ts";
import { S } from "./strings.ts";
import { DONE_SIGNAL_TOOLS, parseCommand } from "../../protocol/index.ts";

const fx = readFileSync(new URL("../../protocol/fixtures/events.jsonl", import.meta.url), "utf8").split("\n").filter((l) => l.includes('"id":"m115e')).map((l) => JSON.parse(l) as Record<string, unknown>);
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const P = "/Users/me/shop";
const row = (tool: string, hook: string, on: boolean, extra: Record<string, unknown> = {}) => ({ tool, hook, on, file: hook === "watch" ? "" : `.x/${tool}`, adds: hook === "watch" ? "" : "{}", creates: !on, ...extra });
const state = (rows: Record<string, unknown>[]): DoneState => doneStateFrom({ type: "donesignal.state", project: P, tools: rows }, P)!;

describe("the one list", () => {
  test("the pages know every tool the engine does, in its order", () => {
    expect([...DONE_TOOLS]).toEqual([...DONE_SIGNAL_TOOLS]);
    for (const t of DONE_TOOLS) expect(Object.hasOwn(CONNECT_HOOKS, t)).toBe(true);
    expect([...CONNECT_HOOKS.copilotcli]).toEqual(["done", "guard"]);
    for (const t of ["opencode", "amp", "cline", "kiro"] as const) expect([...CONNECT_HOOKS[t]]).toEqual(["done"]);
    for (const t of ["zed", "junie", "jetbrains", "xcode"] as const) expect([...CONNECT_HOOKS[t]]).toEqual(["watch"]);
    expect([...CONNECT_HOOKS.any]).toEqual([]);
  });
  test("every tool has its name and one plain line of what it does with Squibby", () => {
    for (const t of DONE_TOOLS.filter((x) => x !== "any")) {
      expect(toolName(t).length).toBeGreaterThan(0);
      const line = supportsLine(t);
      expect(line.length).toBeGreaterThan(20);
      expect(line).not.toMatch(/—|–/);
      expect(line.endsWith(".")).toBe(true);
    }
    expect(supportsLine("zed")).toBe(S.m115.supports.watch);
    expect(supportsLine("opencode")).toBe(S.m115.supports.done);
    expect(supportsLine("copilotcli")).toBe(S.m115.supports.doneGuard);
    expect(supportsLine("claude")).not.toBe(supportsLine("codex"));
  });
  test("Claude Desktop is listed through Claude Code, never as a tool of its own", () => {
    expect(VIA_TOOLS).toEqual([{ id: "claudedesktop", via: "claude", name: S.m115.via.claudedesktop }]);
    expect(LIST.some((t) => t.id === "claudedesktop")).toBe(true);
    const f = findTools({ apps: ["com.anthropic.claudefordesktop", "dev.zed.Zed"], programs: ["opencode"], folders: [".idea"] });
    expect(f.here).toEqual(["opencode", "zed", "jetbrains"]);
    expect(f.via).toEqual([{ id: "claudedesktop", via: "claude", name: S.m115.via.claudedesktop }]);
    expect(f.notHere).not.toContain("any");
    expect(f.here).not.toContain("any");
    expect(findTools({ apps: [], programs: [], folders: [] }).via).toEqual([]);
  });
});

describe("connecting the new tools", () => {
  test("a watch tool: one part that writes nothing, and the yes sends one watch add", () => {
    const st = state([row("zed", "watch", false)]);
    expect(connection(st, "zed")).toBe("off");
    const ask = connectAsk(st, "zed")!;
    expect(ask.parts).toEqual([{ hook: "watch", label: S.m82.partLabel.watch("Zed"), where: S.m115.watchWhere, what: "" }]);
    expect(ask.notes[0]).toBe(S.m115.watchWhat("Zed"));
    const cmds = connectCommands(P, st, "zed");
    expect(cmds).toMatchObject([{ type: "donesignal.add", project: P, tool: "zed", confirm: true, hook: "watch" }]);
    for (const c of cmds) expect(parseCommand(JSON.stringify(c)).ok).toBe(true);
    expect(connection(state([row("zed", "watch", true)]), "zed")).toBe("on");
  });
  test("an own file tool: its card names the file and the tool's own note", () => {
    const st = state([row("opencode", "done", false, { file: ".opencode/plugins/companion.js", adds: "// companion-done-signal" })]);
    const ask = connectAsk(st, "opencode")!;
    expect(ask.parts[0]!.where).toBe(S.doneSignal.askWhere(".opencode/plugins/companion.js", true));
    expect(ask.notes).toContain(S.doneSignal.askTool.opencode);
  });
  test("a row the person already had (not Squibby's) is said, and nothing is sent", () => {
    const st = state([row("cline", "done", false, { problem: "theirs" })]);
    expect(connectCommands(P, st, "cline")).toEqual([]);
  });
  test("Settings' own card and Remove for a watch row", () => {
    const st = state([row("xcode", "watch", false)]);
    const card = doneAsk(st.tools[0]!);
    expect(card.title).toBe(S.m115.watchTitle("Xcode"));
    expect(card.where).toBe(S.m115.watchWhere);
    expect(card.what).toBe("");
    expect(removedLine({ tool: "xcode", hook: "watch" })).toBe(S.m115.watchRemoved("Xcode"));
  });
  test("the open tag's line is taken only for this project and only as the touch line", () => {
    const e = fx.find((x) => x.type === "donesignal.anyLine")!;
    expect(anyLineFrom(e, "/Users/me/shop")).toBe(e.line as string);
    expect(anyLineFrom(e, "/Users/me/other")).toBeNull();
    expect(anyLineFrom({ ...e, line: "rm -rf /" }, "/Users/me/shop")).toBeNull();
    expect(parseCommand(JSON.stringify(askAnyLine(P))).ok).toBe(true);
  });
});

describe("where each session runs", () => {
  test("the model keeps the app's name per project and tool, and drops it when the engine goes", () => {
    const m = run(fx.filter((e) => e.type === "tool.where"));
    expect(whereFor(m, "/Users/me/shop", "claude")).toEqual({ app: "iTerm", tab: true });
    expect(whereFor(m, "/Users/me/site", "codex")).toEqual({ app: "Visual Studio Code", tab: false });
    expect(whereFor(m, "/Users/me/shop", "codex")).toBeNull();
    expect(whereFor(reduce(m, { type: "app.runner_down" } as never), "/Users/me/shop", "claude")).toBeNull();
    // A newer one replaces the older.
    const moved = reduce(m, { type: "tool.where", project: "/Users/me/shop", tool: "claude", app: "Terminal", tab: true } as never);
    expect(whereFor(moved, "/Users/me/shop", "claude")).toEqual({ app: "Terminal", tab: true });
  });
  test("a broken where is never kept", () => {
    for (const bad of [{ app: "" }, { app: "x".repeat(81) }, { tool: "nope" }, { tab: "yes" }, { app: "a\nb" }]) {
      expect(whereFor(run([{ ...fx[0]!, ...bad }]), "/Users/me/shop", "claude")).toBeNull();
    }
  });
  test("Go to's words, and Answer in the tool going to its tab", () => {
    expect(goToLabel({ app: "iTerm", tab: true })).toBe(S.m115.goTo("iTerm"));
    expect(inToolButton("Claude Code", null)).toEqual({ text: S.m114.inTool("Claude Code"), say: S.m114.inToolSay("Claude Code"), jump: false });
    expect(inToolButton("Claude Code", { app: "iTerm", tab: true })).toEqual({ text: S.m115.answerIn("iTerm"), say: S.m115.answerInSay("Claude Code", "iTerm"), jump: true });
    expect(parseCommand(JSON.stringify(jumpTo(P, "claude"))).ok).toBe(true);
    expect(jumpTo(P, "claude")).toMatchObject({ type: "tool.jump", project: P, tool: "claude" });
    expect(Object.keys(jumpTo(P, "claude")).sort()).toEqual(["id", "project", "tool", "type", "v"]);
  });
  test("what Go to said: nothing on success, a plain next step otherwise", () => {
    const ok = fx.find((e) => e.type === "tool.jumped" && e.ok === true)!;
    const no = fx.find((e) => e.type === "tool.jumped" && e.ok === false)!;
    expect(jumpLine(ok as never)).toBeNull();
    expect(jumpLine(no as never)).toBe(S.m115.jumpUnknown("Gemini CLI"));
    expect(jumpLine({ type: "tool.jumped", project: P, tool: "claude", ok: false, why: "failed" } as never)).toBe(S.m115.jumpFailed("Claude Code"));
    for (const l of [S.m115.jumpUnknown("Gemini CLI"), S.m115.jumpFailed("Claude Code")]) expect(l).not.toMatch(/—|–/);
  });
});

describe("M115 review", () => {
  test("Go to with no session seen yet: only a tool that is an app of its own, opened on the project", () => {
    const m = initial();
    expect(goToFor(m, P, "zed")).toEqual({ text: S.m115.goTo("Zed"), say: S.m115.goToOpenSay("Zed") });
    expect(goToFor(m, P, "cursor")).toEqual({ text: S.m115.goTo("Cursor"), say: S.m115.goToOpenSay("Cursor") });
    // A terminal tool, or one with many apps (the JetBrains IDEs), has nothing to guess.
    for (const t of ["claude", "codex", "gemini", "jetbrains", "junie", "opencode"] as const) expect(goToFor(m, P, t)).toBeNull();
    // Once a session was seen, its app wins.
    const seen = reduce(m, { type: "tool.where", project: P, tool: "zed", app: "Zed Preview", tab: false } as never);
    expect(goToFor(seen, P, "zed")).toEqual({ text: S.m115.goTo("Zed Preview"), say: S.m115.goToSay("Zed", "Zed Preview") });
  });
  test("a Go to that did not go is said for a few seconds, then not", () => {
    const m = reduce(initial(), { type: "tool.jumped", project: P, tool: "claude", ok: false, why: "failed" } as never);
    const at = m.jumpSaid!.at;
    expect(jumpSaidNow(m, at)).toEqual({ project: P, tool: "claude", text: S.m115.jumpFailed("Claude Code") });
    expect(jumpSaidNow(m, at + JUMP_SAID_MS - 1)).not.toBeNull();
    expect(jumpSaidNow(m, at + JUMP_SAID_MS)).toBeNull();
    // A later Go to that went clears it.
    expect(jumpSaidNow(reduce(m, { type: "tool.jumped", project: P, tool: "claude", ok: true } as never), at)).toBeNull();
  });
  test("a watch tool says it shows nothing while reviews are Off or Fix is off", () => {
    expect(watchNote("zed", "ask", true)).toBeNull();
    expect(watchNote("zed", "automatic", undefined)).toBeNull();
    expect(watchNote("zed", "off", true)).toBe(S.m115.watchOff.reviews);
    expect(watchNote("xcode", "ask", false)).toBe(S.m115.watchOff.flow);
    // Only the watch tools: a tool with hooks starts its review from its own done signal.
    expect(watchNote("claude", "off", false)).toBeNull();
    for (const l of Object.values(S.m115.watchOff)) expect(l).not.toMatch(/—|–/);
  });
});
