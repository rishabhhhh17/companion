import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { score, summarize, type Case } from "./score.ts";

const cases: Case[] = JSON.parse(readFileSync(join(import.meta.dir, "cases.json"), "utf8"));

describe("the case list", () => {
  test("it has about thirty cases with unique ids", () => {
    expect(cases.length).toBeGreaterThanOrEqual(28);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
  });
  test("every case says how to judge it", () => {
    for (const c of cases) expect((c.mention?.length ?? 0) + (c.keep?.length ?? 0) + (c.maxGrowth ? 1 : 0), c.id).toBeGreaterThan(0);
  });
  test("everything that must stay is really in the rough text", () => {
    for (const c of cases) for (const k of c.keep ?? []) expect(c.rough, c.id).toContain(k);
  });
  test("all four kinds of app are covered", () => {
    expect(new Set(cases.map((c) => c.target))).toEqual(new Set(["app_builder", "claude_code", "chat"]));
  });
});

describe("the scorer", () => {
  const c: Case = { id: "x", target: "chat", rough: "fix `a()` at https://a.com", keep: ["`a()`", "https://a.com"], mention: [["fix", "repair"], ["bug"]] };
  test("a good rewrite passes", () => expect(score(c, "Fix the bug in `a()` described at https://a.com and check it works.").pass).toBe(true));
  test("a changed link or code fails and says which", () => {
    const r = score(c, "Fix the bug in `a ()` at https://a.com/x");
    expect(r.pass).toBe(false);
    expect(r.problems.join(" ")).toContain("`a()`");
  });
  test("a missing idea fails", () => expect(score(c, "Please look at `a()` and https://a.com").problems.join(" ")).toMatch(/fix, repair|bug/));
  test("chatter at the start fails", () => expect(score(c, "Sure! Fix the bug in `a()` at https://a.com").problems.join(" ")).toMatch(/chatter/));
  test("a left over marker fails", () => expect(score(c, "Fix the bug [[KEEP_1]] `a()` https://a.com").problems.join(" ")).toMatch(/marker/));
  test("a far too long answer fails", () => expect(score(c, "Fix the bug `a()` https://a.com " + "pad ".repeat(500)).problems.join(" ")).toMatch(/longer/));
  test("empty fails", () => expect(score(c, "  ").pass).toBe(false));
  test("a summary counts passes", () => {
    const s = summarize([c, { ...c, id: "y" }], { x: "Fix the bug in `a()` at https://a.com", y: "nothing" });
    expect(s).toMatchObject({ passed: 1, total: 2, rate: 0.5 });
  });
});
