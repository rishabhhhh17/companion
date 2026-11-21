// M108: house rules at session start in Codex, Gemini CLI and Antigravity. The start hook in each tool's own file and shape,
// its command run for real with /bin/sh (it prints exactly the start block, never reads its input), Remove, and the start
// files written only for the tools whose hook is set up. Temporary folders only; no model and no AI tool is run.
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { MemoryStore } from "../src/memory/store.ts";
import { DoneSignals, HOOK_FILE, START_DIR, START_TOOLS, TOOL_HOOKS, eventOf, startCommand, startFileName } from "../src/donesignal.ts";
import { SessionStartNotes, startPayload } from "../src/memory/sessionstart.ts";
import { START_LINES } from "../src/memory/startblock.ts";

const made: string[] = [];
const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "m108-"))); made.push(d); return d; };
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const NOW = new Date(2026, 10, 21, 10);
function rig(lines = 3) {
  const project = tmp(), data = tmp(), m = new MemoryStore({ project, profileDir: data });
  m.add("project", "Decided: payments go through Stripe, because the client already has an account", "you wrote it", NOW);
  m.add("project", "Tried and failed: Fix the checkout total. The checks still failed on The tests", "a fix that was not proven", NOW);
  for (let i = 0; i < lines; i++) m.add("project", `Decided: rule number ${i} stays, because the team agreed on ${i}`, "you wrote it", NOW);
  const signals = new DoneSignals(data), notes = new SessionStartNotes({ data, signals, memoryDir: data });
  return { project, data, m, signals, notes };
}
// Runs a hook's command the way a tool does: /bin/sh -c, with the tool's own input on stdin (here, words that look like chat).
const CHAT = JSON.stringify({ session_id: "s1", source: "startup", transcript_path: "/x/t.jsonl", prompt: "my secret chat words" });
const run = (cmd: string) => spawnSync("/bin/sh", ["-c", cmd], { input: CHAT, encoding: "utf8", env: { PATH: "/usr/bin:/bin" }, timeout: 10_000 });
const read = (f: string) => JSON.parse(readFileSync(f, "utf8"));
const commandOf = (j: Record<string, unknown>, tool: "codex" | "gemini" | "antigravity"): string => {
  if (tool === "antigravity") return ((j["companion-start"] as Record<string, { command: string }[]>).SessionStart[0]!).command;
  return ((j.hooks as Record<string, { hooks: { command: string }[] }[]>).SessionStart[0]!).hooks[0]!.command;
};

describe("which tools get the start block", () => {
  test("Claude Code, Codex, Gemini CLI and Antigravity have it; Cursor, Copilot and Windsurf stay parked", () => {
    expect([...START_TOOLS]).toEqual(["claude", "codex", "antigravity", "gemini"]);
    for (const t of ["cursor", "copilot", "windsurf", "copilotcli", "opencode", "amp", "cline", "kiro", "zed", "any"] as const) expect(TOOL_HOOKS[t].includes("start")).toBe(false);
    expect(eventOf("codex", "start")).toBe("SessionStart");
    expect(eventOf("gemini", "start")).toBe("SessionStart");
    expect(eventOf("antigravity", "start")).toBe("SessionStart");
  });
  test("each tool's own file and shape: Codex like Claude Code with compact; Gemini CLI named, in milliseconds; Antigravity a named hook of its own", () => {
    const { project, signals } = rig();
    for (const t of ["codex", "gemini", "antigravity"] as const) signals.add(project, t, "start");
    const codex = read(join(project, HOOK_FILE.codex)).hooks.SessionStart[0];
    expect(codex.matcher).toBe("startup|clear|compact");
    expect(codex.hooks[0]).toMatchObject({ type: "command", timeout: 5 });
    const gemini = read(join(project, HOOK_FILE.gemini)).hooks.SessionStart[0];
    // Gemini CLI matches lifecycle events by exact string, so no matcher: startup, resume and clear all print it.
    expect(gemini.matcher).toBeUndefined();
    expect(gemini.hooks[0]).toMatchObject({ name: "companion-start", type: "command", timeout: 5000 });
    const ag = read(join(project, HOOK_FILE.antigravity))["companion-start"].SessionStart[0];
    expect(ag).toMatchObject({ type: "command", timeout: 5 });
    expect(ag.matcher).toBeUndefined();
  });
});

describe("the hook prints exactly the start block", () => {
  test("Codex prints the block as plain text, byte for byte, and the same file Claude Code prints", () => {
    const { project, data, m, signals, notes } = rig();
    signals.add(project, "codex", "start");
    const view = notes.refresh(project, m);
    const token = signals.tokenFor(project, false)!;
    expect(view.hook).toBe(true);
    const out = run(commandOf(read(join(project, HOOK_FILE.codex)), "codex"));
    expect(out.status).toBe(0);
    expect(out.stdout).toBe(view.text);
    expect(out.stdout).toBe(readFileSync(join(data, START_DIR, `${token}.md`), "utf8"));
    expect(startCommand(join(data, START_DIR), token, "codex")).toBe(startCommand(join(data, START_DIR), token));
  });
  test("Gemini CLI prints its JSON, whose additionalContext is exactly the block", () => {
    const { project, m, signals, notes } = rig();
    signals.add(project, "gemini", "start");
    const view = notes.refresh(project, m);
    const out = run(commandOf(read(join(project, HOOK_FILE.gemini)), "gemini"));
    expect(out.status).toBe(0);
    const j = JSON.parse(out.stdout);
    expect(Object.keys(j)).toEqual(["hookSpecificOutput"]);
    expect(j.hookSpecificOutput.additionalContext).toBe(view.text);
    expect(out.stdout).toBe(startPayload("gemini", view.text));
  });
  test("Antigravity prints its injectSteps, whose system message is exactly the block", () => {
    const { project, m, signals, notes } = rig();
    signals.add(project, "antigravity", "start");
    const view = notes.refresh(project, m);
    const out = run(commandOf(read(join(project, HOOK_FILE.antigravity)), "antigravity"));
    expect(out.status).toBe(0);
    const j = JSON.parse(out.stdout);
    expect(j.injectSteps).toHaveLength(1);
    expect(j.injectSteps[0].systemMessage.systemMessage).toBe(view.text);
  });
  test("the block is 30 lines at most in every tool, even with many more notes", () => {
    const { project, data, m, signals, notes } = rig(60);
    for (const t of ["codex", "gemini", "antigravity"] as const) signals.add(project, t, "start");
    notes.refresh(project, m);
    const token = signals.tokenFor(project, false)!;
    const plain = readFileSync(join(data, START_DIR, startFileName(token, "codex")), "utf8");
    expect(plain.trimEnd().split("\n").length).toBeLessThanOrEqual(START_LINES);
    for (const t of ["gemini", "antigravity"] as const) {
      const j = read(join(data, START_DIR, startFileName(token, t)));
      const text: string = t === "gemini" ? j.hookSpecificOutput.additionalContext : j.injectSteps[0].systemMessage.systemMessage;
      expect(text.trimEnd().split("\n").length).toBeLessThanOrEqual(START_LINES);
    }
  });
  test("it never reads chat: the command reads only its own file, never its input, and prints nothing of it", () => {
    const { project, data, m, signals, notes } = rig();
    for (const t of ["codex", "gemini", "antigravity"] as const) signals.add(project, t, "start");
    notes.refresh(project, m);
    const token = signals.tokenFor(project, false)!;
    for (const t of ["claude", "codex", "gemini", "antigravity"] as const) {
      const c = startCommand(join(data, START_DIR), token, t);
      // No read of stdin, the transcript or anything but the one file in Squibby's own start folder.
      expect(c).not.toMatch(/cat\s*>|cat\s*$|\bread\b|transcript|\$\(cat|<&0|\/dev\/stdin/);
      expect(c).toContain(`/bin/cat -- "$f"`);
      expect(c.endsWith("exit 0")).toBe(true);
    }
    for (const t of ["codex", "gemini", "antigravity"] as const) {
      const out = run(commandOf(read(join(project, HOOK_FILE[t])), t));
      expect(out.stdout).not.toContain("secret chat words");
    }
  });
  test("with no notes yet, or Squibby's folder gone, every tool's hook prints nothing and still ends with 0", () => {
    const project = tmp(), data = tmp(), m = new MemoryStore({ project, profileDir: data });
    const signals = new DoneSignals(data), notes = new SessionStartNotes({ data, signals, memoryDir: data });
    for (const t of ["codex", "gemini", "antigravity"] as const) signals.add(project, t, "start");
    expect(notes.refresh(project, m).text).toBe("");
    for (const t of ["codex", "gemini", "antigravity"] as const) {
      const out = run(commandOf(read(join(project, HOOK_FILE[t])), t));
      expect(out.status).toBe(0);
      expect(out.stdout).toBe("");
    }
    rmSync(join(data, START_DIR), { recursive: true, force: true });
    expect(run(commandOf(read(join(project, HOOK_FILE.gemini)), "gemini")).stdout).toBe("");
  });
});

describe("the files follow the hooks", () => {
  test("only the tools that are set up get a file; removing one leaves the others' files", () => {
    const { project, data, m, signals, notes } = rig();
    signals.add(project, "gemini", "start");
    notes.refresh(project, m);
    const token = signals.tokenFor(project, false)!;
    const names = () => readdirSync(join(data, START_DIR)).sort();
    expect(names()).toEqual([startFileName(token, "gemini")]);
    signals.add(project, "claude", "start");
    signals.add(project, "antigravity", "start");
    notes.refresh(project, m);
    expect(names()).toEqual([`${token}.antigravity.json`, `${token}.gemini.json`, `${token}.md`]);
    signals.remove(project, "claude", "start");
    notes.refresh(project, m);
    expect(names()).toEqual([`${token}.antigravity.json`, `${token}.gemini.json`]);
    expect(existsSync(notes.index.fileOf(token))).toBe(true);
    signals.remove(project, "gemini", "start");
    signals.remove(project, "antigravity", "start");
    notes.refresh(project, m);
    expect(names()).toEqual([]);
    expect(existsSync(notes.index.fileOf(token))).toBe(false);
  });
  test("Codex shares Claude Code's plain file: either one on keeps it", () => {
    const { project, data, m, signals, notes } = rig();
    signals.add(project, "claude", "start"); signals.add(project, "codex", "start");
    notes.refresh(project, m);
    const token = signals.tokenFor(project, false)!;
    signals.remove(project, "claude", "start");
    notes.refresh(project, m);
    expect(existsSync(join(data, START_DIR, `${token}.md`))).toBe(true);
  });
  test("Gemini CLI and Antigravity are handed the lines of the shared AGENTS.md block too, since they may not read AGENTS.md", () => {
    const { project, data, m, signals, notes } = rig();
    const shared = "Decided: payments go through Stripe, because the client already has an account";
    writeFileSync(join(project, "AGENTS.md"), `# Rules\n<!-- companion:begin -->\n- ${shared}\n<!-- companion:end -->\n`);
    for (const t of ["claude", "codex", "gemini"] as const) signals.add(project, t, "start");
    const view = notes.refresh(project, m);
    const token = signals.tokenFor(project, false)!;
    // Claude Code and Codex read AGENTS.md themselves, so the line is not said twice.
    expect(view.text).not.toContain(shared);
    expect(readFileSync(join(data, START_DIR, `${token}.md`), "utf8")).not.toContain(shared);
    expect(read(join(data, START_DIR, `${token}.gemini.json`)).hookSpecificOutput.additionalContext).toContain(shared);
  });
  // M108 review: the Memory page shows what each tool is handed, not only Claude Code's view. One view per tool set up,
  // each exactly the text in that tool's file (before its JSON), and the rows are every line any of them is handed.
  test("the Memory view carries what each tool set up is handed, exactly its file, with AGENTS.md's shared lines", () => {
    const { project, data, m, signals, notes } = rig();
    const shared = "Decided: payments go through Stripe, because the client already has an account";
    writeFileSync(join(project, "AGENTS.md"), `# Rules\n<!-- companion:begin -->\n- ${shared}\n<!-- companion:end -->\n`);
    writeFileSync(join(project, "CLAUDE.md"), "@AGENTS.md\n");
    const token = () => signals.tokenFor(project, false)!;
    const fileText = (t: "claude" | "codex" | "gemini" | "antigravity") => {
      const f = join(data, START_DIR, startFileName(token(), t));
      if (t === "gemini") return read(f).hookSpecificOutput.additionalContext as string;
      if (t === "antigravity") return read(f).injectSteps[0].systemMessage.systemMessage as string;
      return readFileSync(f, "utf8");
    };
    // Gemini CLI alone: the page must show the shared line, since Gemini CLI is handed it.
    signals.add(project, "gemini", "start");
    let view = notes.refresh(project, m);
    expect(view.forms).toEqual([{ tool: "gemini", text: fileText("gemini") }]);
    expect(view.forms[0]!.text).toContain(shared);
    expect(view.lines.map((l) => l.text)).toContain(shared);
    // Codex alone: its own filtered block.
    signals.remove(project, "gemini", "start"); signals.add(project, "codex", "start");
    view = notes.refresh(project, m);
    expect(view.forms).toEqual([{ tool: "codex", text: fileText("codex") }]);
    expect(view.forms[0]!.text).not.toContain(shared);
    // Every tool: one view each, in the tools' order, each its own file's text; the rows are every line any is handed.
    for (const t of ["claude", "gemini", "antigravity"] as const) signals.add(project, t, "start");
    view = notes.refresh(project, m);
    expect(view.forms.map((f) => f.tool)).toEqual(["claude", "codex", "antigravity", "gemini"]);
    for (const f of view.forms) expect(f.text).toBe(fileText(f.tool as "claude"));
    expect(view.text).toBe(fileText("claude"));
    const handed = new Set(view.forms.flatMap((f) => f.text.split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2))));
    expect(new Set(view.lines.map((l) => l.text))).toEqual(handed);
  });
  test("with no tool set up, the view has no per tool forms", () => {
    const { project, m, notes } = rig();
    expect(notes.refresh(project, m).forms).toEqual([]);
  });
  test("at the engine's start, a tool's file whose hook is gone is removed; another tool's that is still on stays", () => {
    const { project, data, m, signals, notes } = rig();
    signals.add(project, "gemini", "start"); signals.add(project, "antigravity", "start");
    notes.refresh(project, m);
    const token = signals.tokenFor(project, false)!;
    // Gemini CLI's line taken out by hand.
    writeFileSync(join(project, HOOK_FILE.gemini), "{}\n");
    writeFileSync(join(data, START_DIR, "not-ours.json"), "x");
    notes.sweep();
    expect(existsSync(join(data, START_DIR, `${token}.gemini.json`))).toBe(false);
    expect(existsSync(join(data, START_DIR, `${token}.antigravity.json`))).toBe(true);
    expect(existsSync(join(data, START_DIR, "not-ours.json"))).toBe(true);
  });
});

describe("Remove takes it out", () => {
  test("each tool's start line goes, and only it: the person's own lines and Squibby's other kinds stay", () => {
    const { project, signals } = rig();
    for (const t of ["codex", "gemini", "antigravity"] as const) { signals.add(project, t, "done"); signals.add(project, t, "start"); }
    for (const t of ["codex", "gemini", "antigravity"] as const) {
      expect(signals.plan(project, t, "start").on).toBe(true);
      signals.remove(project, t, "start");
      expect(signals.plan(project, t, "start").on).toBe(false);
      expect(signals.plan(project, t, "done").on).toBe(true);
    }
    expect(read(join(project, HOOK_FILE.codex)).hooks.SessionStart).toBeUndefined();
    expect(read(join(project, HOOK_FILE.gemini)).hooks.SessionStart).toBeUndefined();
    expect(read(join(project, HOOK_FILE.antigravity))["companion-start"]).toBeUndefined();
  });
  test("a file Squibby made for the start line alone goes with it, folders and all", () => {
    const { project, signals } = rig();
    for (const t of ["codex", "gemini", "antigravity"] as const) signals.add(project, t, "start");
    for (const t of ["codex", "gemini", "antigravity"] as const) signals.remove(project, t, "start");
    for (const t of ["codex", "gemini", "antigravity"] as const) expect(existsSync(join(project, HOOK_FILE[t]))).toBe(false);
    // The tool folders Squibby made for them go too (the project's own .companion notes folder is not a hook folder).
    for (const d of [".codex", ".gemini", ".agents"]) expect(existsSync(join(project, d))).toBe(false);
  });
  test("the person's own SessionStart line in Gemini CLI's file is kept through add and remove", () => {
    const { project, signals } = rig();
    const mine = { hooks: [{ name: "mine", type: "command", command: "echo hi" }] };
    spawnSync("/bin/mkdir", ["-p", join(project, ".gemini")]);
    writeFileSync(join(project, HOOK_FILE.gemini), JSON.stringify({ theme: "dark", hooks: { SessionStart: [mine] } }));
    signals.add(project, "gemini", "start");
    expect(read(join(project, HOOK_FILE.gemini)).hooks.SessionStart).toHaveLength(2);
    signals.remove(project, "gemini", "start");
    expect(read(join(project, HOOK_FILE.gemini))).toEqual({ theme: "dark", hooks: { SessionStart: [mine] } });
  });
  test("the card shows the exact lines before the yes, for every tool, with nothing written yet", () => {
    const { project, signals } = rig();
    for (const t of ["codex", "gemini", "antigravity"] as const) {
      const p = signals.plan(project, t, "start");
      expect(p.on).toBe(false);
      expect(p.problem).toBeUndefined();
      expect(p.adds).toContain("SessionStart");
      expect(p.adds).toContain("/bin/cat --");
      expect(existsSync(join(project, HOOK_FILE[t]))).toBe(false);
    }
    expect(signals.state(project).filter((r) => r.hook === "start").map((r) => r.tool)).toEqual(["claude", "codex", "antigravity", "gemini"]);
  });
});

// M108 review: the shared fixture for memory.state.start.forms, read by the runner, the pages and the shell.
describe("the forms on the wire", () => {
  const fx = () => JSON.parse(readFileSync(new URL("../../protocol/fixtures/events.jsonl", import.meta.url), "utf8").split("\n").find((l) => l.includes('"id":"m108e1"'))!);
  test("the fixture parses, and a form that is not a tool and its text is refused", async () => {
    const { parseEvent } = await import("../../protocol/index.ts");
    const e = fx();
    expect(parseEvent(JSON.stringify(e)).ok).toBe(true);
    expect(e.start.forms.map((f: { tool: string }) => f.tool)).toEqual(["claude", "gemini"]);
    expect(parseEvent(JSON.stringify({ ...e, start: { ...e.start, forms: [{ tool: "nobody", text: "x" }] } })).ok).toBe(false);
    expect(parseEvent(JSON.stringify({ ...e, start: { ...e.start, forms: [{ tool: "gemini" }] } })).ok).toBe(false);
    expect(parseEvent(JSON.stringify({ ...e, start: { ...e.start, forms: "x" } })).ok).toBe(false);
  });
  test("the engine's own view has the fixture's shape", () => {
    const { project, m, signals, notes } = rig();
    signals.add(project, "gemini", "start");
    const v = notes.refresh(project, m);
    expect(Object.keys(v).sort()).toEqual(Object.keys(fx().start).sort());
    expect(Object.keys(v.forms[0]!).sort()).toEqual(["text", "tool"]);
  });
});
