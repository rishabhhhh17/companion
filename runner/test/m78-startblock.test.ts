// M78: the start block Claude Code is handed as a session starts, the shared AGENTS.md block capped the same way, and the
// tried and failed line. Temporary folders only; nothing reads the person's code.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStore } from "../src/memory/store.ts";
import { syncAgentsFiles, MORE_NOTES } from "../src/memory/agentsmd.ts";
import { FAILED_MAX, kindOf, pickNotes, sharedLinesOf, START_CHARS, START_LINES, START_TITLE, startBlock, triedLine, TRIED_SOURCE } from "../src/memory/startblock.ts";
import { sharedForClaude } from "../src/memory/sessionstart.ts";

const made: string[] = [];
const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "m78sb-"))); made.push(d); return d; };
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const day = (n: number) => new Date(2026, 10, n, 10);
function rig() {
  const project = tmp(), data = tmp(), m = new MemoryStore({ project, profileDir: data });
  return { project, data, m };
}
const rules = (project: string, text: string) => { mkdirSync(join(project, ".companion"), { recursive: true }); writeFileSync(join(project, ".companion", "rules.txt"), text); };

describe("what goes into the start block", () => {
  test("house rules first, then decisions, tried and failed and the person's own lines; lines from the code stay out", () => {
    const { project, m } = rig();
    rules(project, "# mine\nnever edit pricing.txt\n");
    m.add("project", "Built with React, Vite", "package.json", day(1));
    m.add("project", "Start it with: npm run dev", "package.json", day(1));
    m.add("project", "Decided: payments go through Stripe, because the client already has an account", 'you said "we decided"', day(2));
    m.add("project", "Tried and failed: Fix the total. The checks still failed on The tests: total is 12", TRIED_SOURCE.unproven, day(3));
    m.add("project", "Never touch the legacy folder", 'you said "never touch the legacy folder"', day(4));
    m.add("project", "Goal: a shop for mugs", "your approved plan", day(5));
    m.add("profile", "Prefers short answers", 'you said "shorter"', day(5));
    const b = startBlock(pickNotes(project, m), { search: "/bin/sh '/x/search.sh' 0123456789abcdef01234567" });
    const lines = b.text.trimEnd().split("\n");
    expect(lines[0]).toBe(START_TITLE);
    expect(lines.slice(1, -1)).toEqual([
      "- House rule: never edit pricing.txt",
      "- Never touch the legacy folder",
      "- Decided: payments go through Stripe, because the client already has an account",
      "- Tried and failed: Fix the total. The checks still failed on The tests: total is 12",
      "- Goal: a shop for mugs",
    ]);
    expect(lines.at(-1)).toContain("/bin/sh '/x/search.sh' 0123456789abcdef01234567");
    // The code's own facts and the person's profile are never in it.
    expect(b.text).not.toContain("Built with"); expect(b.text).not.toContain("npm run dev"); expect(b.text).not.toContain("short answers");
    // Each line keeps its source and its id for Forget (a house rule has none: it is changed in Settings).
    expect(b.lines.map((l) => [l.kind, l.source, !!l.id])).toEqual([["rule", "your house rules", false], ["rule", 'you said "never touch the legacy folder"', true], ["decision", 'you said "we decided"', true], ["failed", TRIED_SOURCE.unproven, true], ["note", "your approved plan", true]]);
  });
  test("at most START_LINES lines in all and under START_CHARS characters, the search line always last", () => {
    const { project, m } = rig();
    for (let i = 0; i < 60; i++) m.add("project", `Decided: rule number ${i} stays, because reason ${i} ${"x".repeat(150)}`, "you wrote it", day(1));
    const b = startBlock(pickNotes(project, m), { search: "/bin/sh s.sh 0123456789abcdef01234567" });
    const lines = b.text.trimEnd().split("\n");
    expect(lines.length).toBeLessThanOrEqual(START_LINES);
    expect(b.text.length).toBeLessThanOrEqual(START_CHARS);
    expect(lines.at(-1)).toStartWith("More notes: run /bin/sh s.sh");
    // The newest decisions come first.
    expect(lines[1]).toContain("rule number 59");
  });
  test("at most a few tried and failed lines, newest first", () => {
    const { project, m } = rig();
    for (let i = 1; i <= 12; i++) m.add("project", `Tried and failed: attempt ${i}. The checks still failed on The tests`, TRIED_SOURCE.loop, day(i));
    const b = startBlock(pickNotes(project, m));
    expect(b.lines.length).toBe(FAILED_MAX);
    expect(b.lines[0].text).toContain("attempt 12");
    // Search still has every one of them.
    expect(pickNotes(project, m, { allFailed: true }).length).toBe(12);
  });
  test("the same notes give the same bytes, so the start of every session is the same until a note changes", () => {
    const { project, m } = rig();
    m.add("project", "Decided: no dark mode, because the client said so", "you wrote it", day(1));
    const a = startBlock(pickNotes(project, m), { search: "s" }).text, b = startBlock(pickNotes(project, m), { search: "s" }).text;
    expect(a).toBe(b);
  });
  test("a line the filter refuses today is left out even when it is in the file", () => {
    const { project, m } = rig();
    m.add("project", "Decided: ship on Friday, because the launch is then", "you wrote it", day(1));
    writeFileSync(join(project, ".companion", "project.md"), readFileSync(join(project, ".companion", "project.md"), "utf8") + "- The owner has depression\n- api key sk-ant-api03-abcdefghijklmnopqrstuvwxyz012345\n");
    const b = startBlock(pickNotes(project, m));
    expect(b.text).not.toContain("depression"); expect(b.text).not.toContain("sk-ant");
  });
  test("nothing at all to say and no search: an empty block", () => {
    const { project, m } = rig();
    m.add("project", "Built with React", "package.json", day(1));
    expect(startBlock(pickNotes(project, m)).text).toBe("");
  });
  test("lines Claude Code already reads from the shared AGENTS.md block are not said twice", () => {
    const { project, m } = rig();
    rules(project, "never edit pricing.txt\n");
    m.add("project", "Decided: payments go through Stripe, because it is simplest", "you wrote it", day(1));
    syncAgentsFiles(project, m, { approved: true });
    const shared = sharedForClaude(project);
    expect(shared.has("never edit pricing.txt")).toBe(true);
    const b = startBlock(pickNotes(project, m), { shared, search: "s" });
    expect(b.lines).toEqual([]);
    expect(b.text.trimEnd().split("\n")).toEqual([START_TITLE, expect.stringContaining("More notes: run s")]);
    // A CLAUDE.md that does not import AGENTS.md: Claude Code does not read it, so the block says it all.
    writeFileSync(join(project, "CLAUDE.md"), "Be careful.\n");
    expect(sharedForClaude(project).size).toBe(0);
  });
  test("kinds", () => {
    expect(kindOf({ text: "Decided: x, because y", source: "you wrote it" })).toBe("decision");
    expect(kindOf({ text: "Tried and failed: x", source: "a" })).toBe("failed");
    expect(kindOf({ text: "Never touch the db folder", source: "you said" })).toBe("rule");
    expect(kindOf({ text: "Deploys to Vercel", source: "vercel.json" })).toBe("code");
    expect(kindOf({ text: "About: a shop", source: "README.md" })).toBe("code");
    expect(kindOf({ text: "Goal: a shop", source: "your approved plan" })).toBe("note");
  });
});

describe("the shared AGENTS.md block is capped the same way", () => {
  test("at most 30 lines inside the markers, the rest left in .companion/project.md and said so", () => {
    const { project, m } = rig();
    rules(project, Array.from({ length: 5 }, (_, i) => `never edit secret${i}.txt`).join("\n") + "\n");
    for (let i = 0; i < 50; i++) m.add("project", `Decided: choice ${i}, because reason ${i}`, "you wrote it", day(1));
    syncAgentsFiles(project, m, { approved: true });
    const a = readFileSync(join(project, "AGENTS.md"), "utf8");
    const inside = /<!-- companion:begin[^\n]*-->\n([\s\S]*?)\n<!-- companion:end -->/.exec(a)![1].split("\n");
    expect(inside.length).toBeLessThanOrEqual(30);
    expect(inside.at(-1)).toBe(MORE_NOTES);
    for (let i = 0; i < 5; i++) expect(a).toContain(`never edit secret${i}.txt`);
    expect(sharedLinesOf(a).has(MORE_NOTES)).toBe(false);
  });
  test("a small project keeps every line and no extra line", () => {
    const { project, m } = rig();
    m.add("project", "Built with React, Vite", "package.json", day(1));
    syncAgentsFiles(project, m, { approved: true });
    const a = readFileSync(join(project, "AGENTS.md"), "utf8");
    expect(a).toContain("- Built with React, Vite"); expect(a).not.toContain(MORE_NOTES);
  });
});

describe("tried and failed", () => {
  test("what was tried and the check that still failed, one line", () => {
    expect(triedLine("Fix the checkout total", { label: "The tests", detail: "total is 12, expected 13\nat price.test.js:4" })).toBe("Tried and failed: Fix the checkout total. The checks still failed on The tests: total is 12, expected 13.");
  });
  test("a key in the failure is hidden, and the line stays within the filter's length", () => {
    const l = triedLine("Connect the payments " + "x".repeat(200), { label: "The page check", detail: "Error with key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789 " + "y".repeat(300) })!;
    expect(l).not.toContain("sk-ant-api03"); expect(l.length).toBeLessThanOrEqual(300);
  });
  test("nothing to say, or words memory never keeps: no line", () => {
    expect(triedLine("", { label: "The tests", detail: "x" })).toBeNull();
    expect(triedLine("Fix my diabetes tracker", { label: "The tests", detail: "x" })).toBeNull();
  });
});
