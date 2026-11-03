import { describe, expect, test } from "bun:test";
import { parseCommand, serialize } from "../../protocol/index.ts";
import { AGENT, answerApproval, startTask, stopAgent, undo, listTasks, warmEngine } from "./commands.ts";
import { stateLabel } from "./model.ts";

describe("commands from the pages are valid protocol", () => {
  for (const [name, c] of [["start", startTask("/p", "Add a page")], ["allow", answerApproval("ap_1", true)], ["deny", answerApproval("ap_1", false)], ["undo", undo("/p", "cp_0001")], ["stop", stopAgent()], ["timeline", listTasks("/p")]] as const) {
    test(name, () => expect(parseCommand(serialize(c)).ok).toBe(true));
  }
  test("a task starts with a spending limit and the drive mode", () => {
    const c = startTask("/p", "x") as any;
    expect(c.budgetUsd).toBeGreaterThan(0);
    expect(c.mode).toBe("drive");
  });
  test("every command has its own id", () => {
    expect(startTask("/p", "a").id).not.toBe(startTask("/p", "a").id);
  });
  test("approval answers are 'once', never a blanket yes", () => expect((answerApproval("a", true) as any).scope).toBe("once"));
});

describe("labels", () => {
  test("every state has plain words", () => {
    for (const s of ["off", "idle", "listening", "thinking", "working", "checking", "needsYou", "done", "error"] as const) expect(stateLabel(s).length).toBeGreaterThan(2);
  });
});

describe("the zero cost warm up", () => {
  test("is valid protocol, names no folder, and asks for nothing to be run or sent", () => {
    const c = warmEngine() as Record<string, unknown>;
    expect(parseCommand(serialize(warmEngine())).ok).toBe(true);
    expect(Object.keys(c).sort()).toEqual(["id", "type", "v"]);
    expect(c.type).toBe("engine.warm");
  });
  test("Home asks for it when it opens and when the ask box gets the keyboard, at most once a minute from the page", () => {
    const card = require("node:fs").readFileSync(new URL("./card.tsx", import.meta.url), "utf8") as string;
    const opened = card.slice(card.indexOf('listen("opened"'), card.indexOf("touch();", card.indexOf('listen("opened"')));
    expect(opened).toContain("warmSoon()");
    expect(card).toMatch(/<textarea ref=\{box\}[\s\S]*?onFocus=\{\(\) => warmSoon\(\)\}/);
    expect(card).toMatch(/const warmSoon = \(\) => \{[^\n]*60_000[^\n]*sendQuiet\(warmEngine\(\)\)/);
  });
});

// Make something with no project open (F23, M14 Part 1): the ask box asks the shell for a new folder, never the engine.
describe("making something in a new folder", () => {
  test("a build asks for a plan's budget, a look up for research's, and both are the shell's own command", async () => {
    const { newFolderTask, budgetFor } = await import("./commands.ts");
    const { parseShellCommand, parseCommand } = await import("../../protocol/index.ts");
    const b = newFolderTask("build", "  Make me a website for my bakery  ") as Record<string, unknown>;
    const r = newFolderTask("research", "Who competes with Acme?", true) as Record<string, unknown>;
    for (const c of [b, r]) {
      expect(parseShellCommand(JSON.stringify(c)).ok).toBe(true);
      expect(parseCommand(JSON.stringify(c)).ok).toBe(false);   // the engine never takes it
      expect(c.project).toBeUndefined();   // it names no folder: the shell makes one
      expect(c.agent).toBe(AGENT);
    }
    expect([b.kind, b.request, b.budgetUsd, b.offTheRecord]).toEqual(["build", "Make me a website for my bakery", budgetFor("budget.plan"), undefined]);
    expect([r.kind, r.request, r.budgetUsd, r.offTheRecord]).toEqual(["research", "Who competes with Acme?", budgetFor("budget.research"), true]);
  });
  test("nothing is asked for without words, and a request is cut to the longest one the shell takes", async () => {
    const { newFolderTask } = await import("./commands.ts");
    const { parseShellCommand, MAX_REQUEST_CHARS } = await import("../../protocol/index.ts");
    expect(newFolderTask("build", "  \n ")).toBeNull();
    const long = newFolderTask("build", "\u{1F370}".repeat(MAX_REQUEST_CHARS + 5)) as Record<string, unknown>;
    expect(Array.from(String(long.request)).length).toBe(MAX_REQUEST_CHARS);
    expect(parseShellCommand(JSON.stringify(long)).ok).toBe(true);
  });
  test("Home sends it only when ticked, from Start, Plan it and Look it up, and only to the shell; with no project it asks", async () => {
    const card = await Bun.file(new URL("./card.tsx", import.meta.url)).text();
    // The ranked UI audit (2 Nov 2026, item 2): no project open no longer makes a new folder by itself; the words wait and
    // the person picks their project or a new one (homeHero.ts askRoute, auditFirstHalf.test.ts).
    expect(card).toContain("const inNewFolder = newFolder;");
    const body = (name: string) => { const s = card.slice(card.indexOf(`const ${name} = () => {`)); return s.slice(0, s.indexOf("\n  };\n")); };
    expect(body("submit")).toContain('if (route === "newFolder") { startNew("build"); return; }');
    expect(body("submit")).toContain('if (route === "chooseProject") { setNoProjectFor("build"); return; }');
    expect(body("plan")).toContain('if (goal && inNewFolder) { startNew("build"); return; }');
    expect(body("research")).toContain('if (inNewFolder) { startNew("research"); return; }');
    const start = card.slice(card.indexOf("const startNew = "), card.indexOf("const submit = () => {"));
    expect(start).toContain('invoke("start_in_new_folder", { cmd: c })');
    expect(start).not.toContain("send(");   // never the engine's own line
    expect(start).toContain("putBack");   // a refusal puts the words back
    expect(start.indexOf("if (isBusy(m))")).toBeLessThan(start.indexOf("invoke(\"start_in_new_folder\""));   // never while something works here
    expect(start.indexOf("attachedNow.current.length > 0")).toBeLessThan(start.indexOf("invoke(\"start_in_new_folder\""));   // added files are never dropped silently
  });
  test("its words are in the strings file", async () => {
    const { S } = await import("./strings.ts");
    for (const s of [S.newFolder.tick, S.newFolder.noProject, S.newFolder.made("Website for my bakery"), S.newFolder.busy, S.newFolder.noFiles]) { expect(s.length).toBeGreaterThan(5); expect(s).not.toContain("\u2014"); }
  });
});
