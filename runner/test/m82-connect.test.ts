// M82, Part 1: Connect your AI tools. The page's one yes sends one donesignal.add per hook of the tool (app/src/aiTools.ts
// connectCommands), and Disconnect one remove per hook that is on. Here those exact commands are run against the engine's
// own DoneSignals (as main.ts does), in temporary folders: Connect adds exactly that tool's hooks and nothing for any other
// tool, Disconnect takes them out again, and a file that is not plain JSON is refused for both and left as it was. No git,
// no model.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DONE_TOOLS, DoneSignals, HOOK_FILE, TOOL_HOOKS, type DonePlan } from "../src/donesignal.ts";
import { CONNECT_HOOKS, connectCommands, disconnectCommands } from "../../app/src/aiTools.ts";
import { doneStateFrom } from "../../app/src/doneSignal.ts";
import { parseCommand } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (label: string) => { const d = mkdtempSync(join(tmpdir(), `companion-test-m82-${label}-`)); made.push(d); return d; };

/** The engine's donesignal.state for a project, as the page reads it (main.ts doneState). */
const stateOf = (s: DoneSignals, p: string) => doneStateFrom({ type: "donesignal.state", project: p, tools: s.state(p).map((t: DonePlan) => ({ tool: t.tool, hook: t.hook, on: t.on, file: t.rel, adds: t.adds, creates: t.creates, ...(t.problem ? { problem: t.problem } : {}) })) }, p);
/** Runs a page command the way main.ts does. */
const run = (s: DoneSignals, c: Record<string, unknown>) => {
  expect(parseCommand(JSON.stringify(c)).ok).toBe(true);
  if (c.type === "donesignal.add") return s.add(c.project as string, c.tool as never, (c.hook as never) ?? "done");
  if (c.type === "donesignal.remove") return s.remove(c.project as string, c.tool as never, (c.hook as never) ?? "done");
  throw new Error(`unexpected ${String(c.type)}`);
};
const onHooks = (s: DoneSignals, p: string) => s.state(p).filter((r) => r.on).map((r) => `${r.tool}:${r.hook}`);

describe("Connect and Disconnect, through the engine's own hooks", () => {
  test("each tool's Connect set is hooks that tool has; Claude Code's adds the waiting signal, never the start block", () => {
    for (const t of DONE_TOOLS) for (const h of CONNECT_HOOKS[t]) expect(TOOL_HOOKS[t]).toContain(h);
    expect([...CONNECT_HOOKS.claude]).toEqual(["done", "guard", "waiting"]);
    for (const t of DONE_TOOLS.filter((x) => x !== "claude")) expect([...CONNECT_HOOKS[t]]).toEqual(["done", "guard"]);
  });

  test("Connect adds exactly that tool's hooks, and Disconnect takes them out again", () => {
    for (const tool of DONE_TOOLS) {
      const data = tmp("data"), p = tmp("proj"), s = new DoneSignals(data);
      const cmds = connectCommands(p, stateOf(s, p), tool);
      expect(cmds.map((c) => (c as { hook?: string }).hook ?? "done")).toEqual([...CONNECT_HOOKS[tool]]);
      // Nothing is written before the commands run (the yes).
      expect(existsSync(join(p, HOOK_FILE[tool]))).toBe(false);
      for (const c of cmds) run(s, c as never);
      expect(onHooks(s, p).sort()).toEqual(CONNECT_HOOKS[tool].map((h) => `${tool}:${h}`).sort());
      // Connected: a second Connect has nothing left to send.
      expect(connectCommands(p, stateOf(s, p), tool)).toEqual([]);
      for (const c of disconnectCommands(p, stateOf(s, p), tool)) run(s, c as never);
      expect(onHooks(s, p)).toEqual([]);
      // A file only Squibby made is gone again.
      expect(existsSync(join(p, HOOK_FILE[tool]))).toBe(false);
    }
  });

  test("Disconnect leaves Claude Code's start block, which is not part of Connect, and everyone else's lines", () => {
    const data = tmp("data"), p = tmp("proj"), s = new DoneSignals(data);
    mkdirSync(join(p, ".claude"), { recursive: true });
    writeFileSync(join(p, ".claude/settings.local.json"), JSON.stringify({ permissions: { allow: ["Bash(ls)"] }, hooks: { Stop: [{ hooks: [{ type: "command", command: "say done" }] }] } }));
    s.add(p, "claude", "start");
    for (const c of connectCommands(p, stateOf(s, p), "claude")) run(s, c as never);
    expect(onHooks(s, p).sort()).toEqual(["claude:done", "claude:guard", "claude:start", "claude:waiting"]);
    for (const c of disconnectCommands(p, stateOf(s, p), "claude")) run(s, c as never);
    expect(onHooks(s, p)).toEqual(["claude:start"]);
    const j = JSON.parse(readFileSync(join(p, ".claude/settings.local.json"), "utf8"));
    expect(j.permissions).toEqual({ allow: ["Bash(ls)"] });
    expect(j.hooks.Stop).toEqual([{ hooks: [{ type: "command", command: "say done" }] }]);
  });

  test("a file that is not plain JSON is refused for both, and left exactly as it was", () => {
    const data = tmp("data"), p = tmp("proj"), s = new DoneSignals(data);
    mkdirSync(join(p, ".cursor"), { recursive: true });
    const bad = "{ // a comment Cursor allows\n \"version\": 1 }\n";
    writeFileSync(join(p, ".cursor/hooks.json"), bad);
    const st = stateOf(s, p);
    expect(st?.tools.find((r) => r.tool === "cursor")?.problem).toContain("nothing was written");
    // The page sends nothing for it, either way.
    expect(connectCommands(p, st, "cursor")).toEqual([]);
    expect(disconnectCommands(p, st, "cursor")).toEqual([]);
    // And the engine refuses even if asked straight.
    for (const h of CONNECT_HOOKS.cursor) { expect(s.add(p, "cursor", h).problem).toContain("nothing was written"); expect(s.remove(p, "cursor", h).problem).toContain("nothing was written"); }
    expect(readFileSync(join(p, ".cursor/hooks.json"), "utf8")).toBe(bad);
    // Other tools in the same project still connect.
    for (const c of connectCommands(p, st, "codex")) run(s, c as never);
    expect(onHooks(s, p).sort()).toEqual(["codex:done", "codex:guard"]);
  });

  test("no project, no commands", () => {
    expect(connectCommands("", null, "claude")).toEqual([]);
    expect(disconnectCommands("", null, "claude")).toEqual([]);
  });
});
