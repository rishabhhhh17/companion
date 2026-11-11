// Must fix 30 (M59): the one command list (protocol/commands.json) and everything that reads it agree: the protocol's own
// checks, the plan's gates, the review's own work, the groups catalog, the pages' commands and the shell (its own tests
// in app/src-tauri/src/runner.rs read the same file).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COMMAND_NAMES, COMMAND_ROWS, PAGE_COMMANDS, PROJECT_BOUND, rowOf } from "../../protocol/commands.ts";
import groups from "../../protocol/groups.json";
import { COMMAND_TYPES, parseCommand, parseShellCommand } from "../../protocol/index.ts";
import { FIX_GATED, NEVER_GATED, PRO_ONLY } from "../src/plan.ts";
import { LIGHT_WORK, OWN_WORK } from "../src/review/service.ts";

const ROOT = join(import.meta.dir, "../..");
/** Whether the protocol's checks refuse this command without a project (it names one). */
const namesProject = (t: string) => {
  // Fills in every other text field the checks ask for first, until they either take it or ask for "project".
  const c: Record<string, unknown> = { v: 1, id: "x", type: t };
  for (let i = 0; i < 12; i++) {
    const r = parseCommand(JSON.stringify(c));
    if (r.ok) return false;
    const f = /field "([A-Za-z]+)"/.exec(r.error)?.[1];
    if (!f) return false;
    if (f === "project") return true;
    c[f] = "x";
  }
  return false;
};

describe("one row per command", () => {
  test("the rows are exactly the commands the protocol's checks know", () => {
    expect(([...COMMAND_NAMES] as string[]).sort()).toEqual([...COMMAND_TYPES].sort());
  });
  test("every row has a known gate and only known fields", () => {
    for (const [t, r] of Object.entries(COMMAND_ROWS)) {
      expect({ t, gate: ["fix", "pro", "never"].includes(r.gate) }).toEqual({ t, gate: true });
      for (const k of Object.keys(r)) expect({ t, k, known: ["gate", "page", "project", "own"].includes(k) }).toEqual({ t, k, known: true });
      if (r.own !== undefined) expect(["edits", "light"]).toContain(r.own);
    }
  });
  test("an unknown command has no row", () => {
    expect(rowOf("future.thing")).toBeUndefined();
    expect(rowOf("constructor")).toBeUndefined();
  });
});

describe("what the readers take from it", () => {
  test("the plan's three lists split every command once", () => {
    const all = [...FIX_GATED, ...PRO_ONLY, ...NEVER_GATED];
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual([...COMMAND_NAMES].sort());
    // Stopping, Undo and approvals are never gated (rule 11, rule 13).
    for (const t of ["agent.interrupt", "agent.interruptAll", "checkpoint.restore", "checkpoint.putBack", "approval.resolve"]) expect(NEVER_GATED).toContain(t);
  });
  test("the review's light work is its own work, and both are commands", () => {
    for (const t of LIGHT_WORK) expect(OWN_WORK.has(t)).toBe(true);
    for (const t of OWN_WORK) expect(rowOf(t)).toBeDefined();
    // Squibby's own edits are never blamed on the other AI: a task, a plan and Undo are its own work that edits.
    for (const t of ["agent.start", "agent.send", "drive.approve", "checkpoint.restore"]) expect(rowOf(t)?.own).toBe("edits");
  });
  test("every command the groups catalog names is a row", () => {
    for (const tool of groups.tools as { id: string; runner: string[] }[]) for (const t of tool.runner) expect({ tool: tool.id, t, row: !!rowOf(t) }).toEqual({ tool: tool.id, t, row: true });
  });
});

describe("the folder rule (a page could otherwise name any folder on the Mac)", () => {
  test("every page command that names a project is project bound", () => {
    const named = PAGE_COMMANDS.filter(namesProject);
    expect(named.length).toBeGreaterThan(30);
    for (const t of named) expect({ t, bound: PROJECT_BOUND.includes(t) }).toEqual({ t, bound: true });
  });
  test("a project bound command names a project, so the shell can check it", () => {
    // tasks.list and memory.list may name the stand in folder; all of them carry the field the shell reads.
    for (const t of PROJECT_BOUND) expect({ t, names: namesProject(t) }).toEqual({ t, names: true });
  });
});

describe("the pages", () => {
  test("every command the pages build is a page command, a shell command, or a setting the shell sends itself", () => {
    const src = readFileSync(join(ROOT, "app/src/commands.ts"), "utf8");
    const built = [...new Set([...src.matchAll(/type: "([a-z]+(?:\.[A-Za-z]+)+)"/g)].map((m) => m[1]!))];
    expect(built.length).toBeGreaterThan(50);
    // Settings (settings.rs, T16): the page asks the shell, which checks the value and sends the engine's own command.
    const shellSends = new Set(["memory.pause", "metrics.set", "spending.set"]);
    for (const t of built) {
      const shell = parseShellCommand(JSON.stringify({ v: 1, id: "x", type: t })).ok || /^project\.new$/.test(t);
      const ok = rowOf(t)?.page === true || shell || shellSends.has(t);
      expect({ t, ok }).toEqual({ t, ok: true });
      if (shellSends.has(t)) expect(rowOf(t)?.page).toBeUndefined();
    }
  });
});
