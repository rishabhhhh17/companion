// M82: Connect your AI tools (aiTools.ts) and hand Squibby the job (handoff.ts). Pure, no engine, no shell.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import list from "../../protocol/aitools.json";
import { CONNECT_HOOKS, anyConnected, connectAsk, connectCommands, connection, connectProblem, disconnectCommands, findTools, foundFrom, hasApp } from "./aiTools.ts";
import { DONE_TOOLS, doneStateFrom } from "./doneSignal.ts";
import { S } from "./strings.ts";

const none = { apps: [], programs: [], folders: [] };
const row = (tool: string, hook: string, on: boolean, extra: Record<string, unknown> = {}) => ({ tool, hook, on, file: tool === "claude" ? ".claude/settings.local.json" : ".cursor/hooks.json", adds: `{"${hook}":1}`, creates: !on, ...extra });
const state = (tools: unknown[]) => doneStateFrom({ type: "donesignal.state", project: "/p", tools }, "/p");

describe("finding the tools", () => {
  test("the one list is the done signal's tools, in its order", () => {
    expect(list.tools.map((t) => t.id)).toEqual([...DONE_TOOLS]);
  });
  test("nothing found: every tool is not on this Mac", () => {
    expect(findTools(none)).toEqual({ here: [], notHere: [...DONE_TOOLS] });
  });
  test("an app, a program or a project folder each counts, each tool once, in the list's order", () => {
    const f = findTools({ apps: ["com.todesktop.230313mzl4w4u92", "com.example.unknown"], programs: ["claude", "gemini", "rm"], folders: [".codex", ".claude"] });
    expect(f.here).toEqual(["claude", "codex", "cursor", "gemini"]);
    expect(f.notHere).toEqual(["copilot", "antigravity", "windsurf"]);
    expect(new Set([...f.here, ...f.notHere]).size).toBe(DONE_TOOLS.length);
    // Windsurf by its Devin program, Antigravity by its agy program, VS Code by its app.
    expect(findTools({ apps: ["com.microsoft.VSCode"], programs: ["devin", "agy"], folders: [] }).here).toEqual(["copilot", "antigravity", "windsurf"]);
  });
  test("whatever the shell answers, only plain lists of words are read", () => {
    expect(foundFrom(null)).toEqual(none);
    expect(foundFrom({ apps: "x", programs: [1, "claude"], folders: [{}] })).toEqual({ apps: [], programs: ["claude"], folders: [] });
  });
  test("Put it in is offered only for a tool whose app is on this Mac", () => {
    expect(hasApp({ ...none, apps: ["com.todesktop.230313mzl4w4u92"] }, "cursor")).toBe(true);
    expect(hasApp({ ...none, programs: ["gemini"] }, "gemini")).toBe(false);
    expect(hasApp(null, "cursor")).toBe(false);
  });
  test("the shell and the pages read the same list; the shell never runs a program or reads a file to find them", () => {
    const rs = readFileSync(new URL("../src-tauri/src/aitools.rs", import.meta.url), "utf8");
    expect(rs).toContain('include_str!("../../../protocol/aitools.json")');
    const finding = rs.slice(0, rs.indexOf("// ---------- Part 2"));
    for (const never of ["Command::new", "read_to_string", "File::open", "fs::read(", "read_dir"]) expect(finding).not.toContain(never);
  });
});

describe("Connect and Disconnect", () => {
  test("Claude Code connects its done signal, saved copy and waiting signal; the others their done signal and saved copy", () => {
    expect([...CONNECT_HOOKS.claude]).toEqual(["done", "guard", "waiting"]);
    expect([...CONNECT_HOOKS.cursor]).toEqual(["done", "guard"]);
  });
  test("one card shows every file and line still to add, and nothing is sent until its yes", () => {
    const st = state([row("claude", "done", false), row("claude", "guard", true), row("claude", "waiting", false), row("claude", "start", false)]);
    const ask = connectAsk(st, "claude")!;
    expect(ask.title).toBe("Connect Claude Code?");
    expect(ask.parts.map((p) => p.hook)).toEqual(["done", "waiting"]);
    expect(ask.parts[0]!.where).toBe(S.doneSignal.askWhere(".claude/settings.local.json", true));
    expect(ask.parts[0]!.what).toBe('{"done":1}');
    expect(ask.notes).toContain(S.doneSignal.askGit);
    // The yes sends the adds for the hooks not on yet, each with the person's confirm, in order; the start block never.
    const cmds = connectCommands("/p", st, "claude") as unknown as Record<string, unknown>[];
    expect(cmds.map((c) => [c.type, c.tool, c.hook ?? "done", c.confirm])).toEqual([["donesignal.add", "claude", "done", true], ["donesignal.add", "claude", "waiting", true]]);
  });
  test("connected only when every hook is on; Disconnect removes just those", () => {
    const st = state([row("cursor", "done", true), row("cursor", "guard", true), row("claude", "done", true), row("claude", "guard", false), row("claude", "waiting", false)]);
    expect(connection(st, "cursor")).toBe("on");
    expect(connection(st, "claude")).toBe("partly");
    expect(connection(st, "codex")).toBe("off");
    expect(anyConnected(st)).toBe(true);
    expect(anyConnected(state([row("claude", "done", true)]))).toBe(false);
    expect(connectAsk(st, "cursor")).toBeNull();
    const off = disconnectCommands("/p", st, "cursor") as unknown as Record<string, unknown>[];
    expect(off.map((c) => [c.type, c.tool, c.hook ?? "done"])).toEqual([["donesignal.remove", "cursor", "done"], ["donesignal.remove", "cursor", "guard"]]);
  });
  test("a file that is not plain JSON: no card, nothing sent either way, and the problem is said", () => {
    const st = state([row("cursor", "done", false, { problem: ".cursor/hooks.json is not in a form Squibby can change safely, so nothing was written. Nothing in it was changed." }), row("cursor", "guard", true)]);
    expect(connectProblem(st, "cursor")).toContain("nothing was written");
    expect(connectAsk(st, "cursor")).toBeNull();
    expect(connectCommands("/p", st, "cursor")).toEqual([]);
    expect(disconnectCommands("/p", st, "cursor")).toEqual([]);
  });
  test("plain words, no em dashes", () => {
    const all = JSON.stringify(S.m82) + Object.values(S.m82.put).map((f) => f("Cursor")).join(" ") + Object.values(S.m82.partLabel).map((f) => f("Cursor")).join(" ");
    expect(all).not.toContain("—");
    expect(S.m82.connectTitle("Cursor")).toBe("Connect Cursor?");
  });
});

// ---------- Part 2: hand Squibby the job ----------
import { IDLE, PUT_STAGES, effectsFor, offeredTools, putCopied, reduce, toolFor, type Action, type Handoff } from "./handoff.ts";

const P = "/Users/me/shop";
const run = (h: Handoff, ...as: Action[]) => as.reduce(reduce, h);
const ask = (tool: "claude" | "cursor" | "codex", improve = true): Action => ({ type: "ask", tool, words: "  make the header blue  ", req: "r1", improve });
const done = (req = "r1", text = "Make the site header blue. Keep the logo as it is.") => ({ type: "event" as const, project: P, e: { type: "assist.prompt.done", req, text, diff: [["=", "Make "], ["+", "the site"]], usdEstimate: 0, handback: "paste" } });
const ev = (e: Record<string, unknown>, project = P): Action => ({ type: "event", project, e });

describe("the hand off card's states", () => {
  test("writing the prompt, then ready for the tool with the clearer prompt and what changed", () => {
    const w = run(IDLE, ask("cursor"));
    expect(w).toEqual({ stage: "writing", tool: "cursor", words: "make the header blue", req: "r1" });
    // Another request's answer is not this card's.
    expect(run(w, done("other"))).toBe(w);
    const r = run(w, done());
    expect(r).toMatchObject({ stage: "ready", tool: "cursor", prompt: "Make the site header blue. Keep the logo as it is.", own: false });
    expect((r as { diff: unknown[] }).diff).toEqual([["=", "Make "], ["+", "the site"]]);
    expect(run(r, { type: "edit", prompt: "Make it red" })).toMatchObject({ stage: "ready", prompt: "Make it red" });
    expect(run(r, { type: "pick", tool: "codex" })).toMatchObject({ stage: "ready", tool: "codex" });
  });
  test("no clearer prompt (an error, Prompt help off) or Write a clear prompt first off: the person's own words, said so", () => {
    expect(run(IDLE, ask("cursor"), ev({ type: "assist.error", req: "r1", reason: "x" }))).toMatchObject({ stage: "ready", prompt: "make the header blue", own: true });
    expect(run(IDLE, ask("cursor", false))).toMatchObject({ stage: "ready", prompt: "make the header blue", own: true });
    expect(run(IDLE, { type: "ask", tool: "cursor", words: "   ", req: "r", improve: true })).toBe(IDLE);
  });
  test("another tool: Put it in, then waiting for the tool; Copy goes to waiting too; then reviewed", () => {
    const r = run(IDLE, ask("cursor"), done());
    const p = run(r, { type: "putIn" });
    expect(p).toMatchObject({ stage: "putIn", tool: "cursor" });
    const w = run(p, { type: "putResult", stage: "typed" });
    expect(w).toMatchObject({ stage: "waiting", put: "typed", signal: false });
    expect(putCopied("typed")).toBe(false);
    // A missing box: the prompt was copied, and the card offers Show me where to paste.
    const nb = run(p, { type: "putResult", stage: "noBox" });
    expect(nb).toMatchObject({ stage: "waiting", put: "noBox" });
    expect(putCopied("noBox") && putCopied("notOpen") && putCopied("failed") && putCopied("copiedByHand")).toBe(true);
    expect(run(r, { type: "copied" })).toMatchObject({ stage: "waiting", put: "copiedByHand" });
    expect(run(w, { type: "signal", on: true })).toMatchObject({ signal: true });
    // The review of this project begins: the usual review card takes over.
    expect(run(w, ev({ type: "review.batch", project: "/other" }))).toBe(w);
    expect(run(w, ev({ type: "review.batch", project: P }))).toEqual({ stage: "reviewed", tool: "cursor" });
    expect(run(w, ev({ type: "review.started", project: P, batch: "b", proof: false }))).toEqual({ stage: "reviewed", tool: "cursor" });
  });
  test("Stop everything ends the writing, the putting in and the wait", () => {
    const stop = ev({ type: "app.stop_everything" });
    expect(run(IDLE, ask("cursor"), stop)).toEqual({ stage: "stopped", tool: "cursor" });
    expect(run(IDLE, ask("cursor"), done(), { type: "putIn" }, stop)).toEqual({ stage: "stopped", tool: "cursor" });
    expect(run(IDLE, ask("cursor"), done(), { type: "copied" }, stop)).toEqual({ stage: "stopped", tool: "cursor" });
    expect(run(IDLE, ask("cursor"), done(), { type: "putIn" }, { type: "putResult", stage: "stopped" })).toEqual({ stage: "stopped", tool: "cursor" });
    // A review after Stop changes nothing.
    expect(run(IDLE, ask("cursor"), done(), { type: "copied" }, stop, ev({ type: "review.batch", project: P }))).toEqual({ stage: "stopped", tool: "cursor" });
    expect(run(IDLE, ask("cursor"), stop, { type: "close" })).toBe(IDLE);
  });
});

describe("what each press sends", () => {
  test("Have my AI do it asks Prompt help's own rewrite through the shell, and nothing else", () => {
    expect(effectsFor(IDLE, ask("cursor"), P)).toEqual([{ kind: "prompt", tool: "cursor", text: "make the header blue", req: "r1" }]);
    expect(effectsFor(IDLE, ask("cursor", false), P)).toEqual([]);
    expect(effectsFor(IDLE, ask("cursor"), "")).toEqual([]);
  });
  test("Claude Code goes through agent.start with the prompt as it stands", () => {
    const r = run(IDLE, ask("claude"), done(), { type: "edit", prompt: " Make the header blue, please " });
    const f = effectsFor(r, { type: "run" }, P);
    expect(f.map((x) => (x.kind === "task" ? [x.cmd.type, (x.cmd as { project?: string }).project, (x.cmd as { prompt?: string }).prompt] : x.kind))).toEqual([["agent.start", P, "Make the header blue, please"]]);
    expect(run(r, { type: "run" })).toBe(IDLE);
    // Claude Code is never put in or copied: it is Squibby's own engine.
    expect(run(r, { type: "putIn" })).toBe(r);
    expect(run(r, { type: "copied" })).toBe(r);
  });
  test("any other tool never sends a task to the engine, whatever is pressed", () => {
    for (const tool of ["codex", "cursor", "copilot", "antigravity", "gemini", "windsurf"] as const) {
      const steps: Action[] = [{ type: "ask", tool, words: "do it", req: "r1", improve: true }, done(), { type: "edit", prompt: "Do it well" }, { type: "run" }, { type: "putIn" }, { type: "putResult", stage: "noBox" }, { type: "copied" }, ev({ type: "review.batch", project: P }), { type: "close" }];
      let h: Handoff = IDLE;
      const sent: string[] = [];
      for (const a of steps) { sent.push(...effectsFor(h, a, P).map((f) => f.kind)); h = reduce(h, a); }
      expect(sent).toEqual(["prompt"]);
      expect(run(IDLE, { type: "ask", tool, words: "x", req: "r", improve: false }, { type: "run" })).toMatchObject({ stage: "ready", tool });
    }
  });
  test("the shell sends the prompt request for the project open in Home only, never one a page names", () => {
    const rs = readFileSync(new URL("../src-tauri/src/shell_tools.rs", import.meta.url), "utf8");
    const body = rs.slice(rs.indexOf("fn handoff_prompt("), rs.indexOf("\n}\n", rs.indexOf("fn handoff_prompt(")));
    expect(body).toContain("settings::only_card(window.label())?");
    expect(body).toContain("let project = current_project();");
    expect(body.slice(0, body.indexOf(")"))).not.toContain("project");
    expect(body).toContain('"type": "assist.prompt"');
  });
  test("the tool last used here is picked again while it can be; Claude Code is always offered first", () => {
    expect(offeredTools(["cursor", "claude", "codex"])).toEqual(["claude", "cursor", "codex"]);
    expect(toolFor("cursor", ["claude", "cursor"])).toBe("cursor");
    expect(toolFor("windsurf", ["claude", "cursor"])).toBe("claude");
    expect(toolFor(null, ["claude"])).toBe("claude");
  });
  test("every answer of Put it in has its words, and they are the shell's own stages", () => {
    const rs = readFileSync(new URL("../src-tauri/src/aitools.rs", import.meta.url), "utf8");
    const line = rs.slice(rs.indexOf("pub const STAGES"), rs.indexOf("];", rs.indexOf("pub const STAGES")));
    const shell = [...line.matchAll(/"(\w+)"/g)].map((m) => m[1]);
    expect([...shell, "failed"].sort()).toEqual([...PUT_STAGES].sort());
    for (const s of PUT_STAGES) expect(S.m82.put[s]("Cursor").length).toBeGreaterThan(5);
    // Only a paste that happened says it is in; Return is always the person's.
    expect(S.m82.put.typed("Cursor")).toContain("press Return there");
  });
});
