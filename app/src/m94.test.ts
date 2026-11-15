// M94: What Squibby saved you, the pages' side. Pure, no engine, no model. The week is the protocol's own fixture (m94e1),
// which the runner and the shell read too. Counts of real events only: never a guess, never an amount (F29, M69), no
// streak or praise (rule 16).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { SPARED_KEYS, type WeekView } from "../../protocol/index.ts";
import { S } from "./strings.ts";
import { weekEmpty, weekFrom, weekPage } from "./weekSummary.ts";
import { numbersJson, numbersOf, sparedRows } from "./yourNumbers.ts";
import { shareFromWeek } from "./shareReceipt.ts";

const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const fixture = (id: string) => JSON.parse(read("../../protocol/fixtures/events.jsonl").split("\n").find((l) => l.includes(`"id":"${id}"`))!);
const WEEK = (): WeekView => weekFrom(fixture("m94e1"), "p_9f2c")!;
const NO_DASH = /[–—]/;
const flat = (o: unknown): string[] => (typeof o === "string" ? [o] : typeof o === "function" ? [String((o as (...a: number[]) => string)(2, 1))] : o && typeof o === "object" ? Object.values(o).flatMap(flat) : []);

describe("the counts the engine sent", () => {
  test("the week reads What Squibby saved you; a count that is not a count drops the whole part, never a made up zero", () => {
    expect(WEEK().spared).toEqual({ loopsStopped: 2, paused: 1, pausedStopped: 1, foundNoModel: 1, wrongCaught: 2, liveAsks: 1 });
    for (const [k, v] of [["loopsStopped", -1], ["paused", 1.5], ["liveAsks", "2"]] as const) {
      const e = fixture("m94e1"); e.week.spared[k] = v;
      const w = weekFrom(e, "p_9f2c")!;
      expect(w, `${k}`).not.toBeNull();
      expect(w.spared, `${k}`).toBeUndefined();
    }
    const more = fixture("m94e1"); more.week.spared.pausedStopped = 4;
    expect(weekFrom(more, "p_9f2c")!.spared).toBeUndefined();
    const extra = fixture("m94e1"); extra.week.spared.usdSaved = 3;
    expect(weekFrom(extra, "p_9f2c")!.spared).toBeUndefined();
    // An older engine sends none: the part is not counted, never zero.
    expect(weekFrom(fixture("m79e2"), "p_9f2c")!.spared).toBeUndefined();
  });
  test("the rows: every count with its label, and Not counted when the engine sent none", () => {
    const rows = sparedRows(numbersOf(WEEK(), 1));
    // The stopped pauses are part of the paused row, never a row of their own (they are a part of it, not another saving).
    expect(rows.map((r) => [r.id, r.value])).toEqual([["loopsStopped", "2"], ["paused", "1"], ["foundNoModel", "1"], ["wrongCaught", "2"], ["liveAsks", "1"]]);
    expect(rows.map((r) => r.label)).toEqual([S.m94.rows.loopsStopped, `${S.m94.rows.paused} (1 stopped or undone by you)`, S.m94.rows.foundNoModel, S.m94.rows.wrongCaught, S.m94.rows.liveAsks]);
    const w = WEEK(); w.spared = { ...w.spared!, paused: 2, pausedStopped: 0 };
    expect(sparedRows(numbersOf(w, 1)).find((r) => r.id === "paused")).toEqual({ id: "paused", label: S.m94.rows.paused, value: "2" });
    // A label is a label: no question mark in the middle of it.
    for (const r of rows) expect(r.label, r.id).not.toContain("?");
    const old = sparedRows(numbersOf(weekFrom(fixture("m79e2"), "p_9f2c")!, 1));
    expect(old).toEqual([]);
  });
  test("Send these numbers gains the same counts only, in a fixed order, after the M88 counts", () => {
    const json = numbersJson(numbersOf(WEEK(), 2));
    const o = JSON.parse(json);
    expect(Object.keys(o)).toEqual(["numbers", "from", "to", "changesReviewed", "filesReviewed", "caught", "fixesProven", "undos", "savedCopies", "savedCopiesUsed", "jobsHanded", "aiToolsConnected", "daysUsed", "spared"]);
    expect(Object.keys(o.spared)).toEqual([...SPARED_KEYS]);
    const walk = (v: unknown, path: string): void => {
      if (v && typeof v === "object") { for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`); return; }
      if (path === ".from" || path === ".to") expect(v as string).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      else expect(Number.isInteger(v) && (v as number) >= 0, path).toBe(true);
    };
    walk(o, "");
    expect(json).not.toMatch(/usd|cost|token|\$|cents/i);
    // The shell's check (numbersmail.rs) knows exactly these keys, so the two agree.
    const rs = read("../src-tauri/src/numbersmail.rs");
    expect(rs).toContain(`const SPARED: [&str; 6] = [${SPARED_KEYS.map((k) => `"${k}"`).join(", ")}];`);
    // With no counts from the engine, nothing is added to what is sent.
    expect(Object.keys(JSON.parse(numbersJson(numbersOf(weekFrom(fixture("m79e2"), "p_9f2c")!, 2))))).not.toContain("spared");
  });
});

describe("This week's one line", () => {
  test("only the parts above zero, in plain words, one to a line", () => {
    expect(weekPage(WEEK()).spared).toEqual(["2 fix loops stopped", "1 task paused for using far more than usual (1 stopped or undone by you)", "1 broken task found using only your checks", "2 wrong changes caught and then fixed or undone", "1 ask before a live system"]);
    const w = WEEK(); w.spared = { loopsStopped: 1, paused: 0, pausedStopped: 0, foundNoModel: 0, wrongCaught: 0, liveAsks: 0 };
    expect(weekPage(w).spared).toEqual(["1 fix loop stopped"]);
    w.spared = { loopsStopped: 0, paused: 2, pausedStopped: 0, foundNoModel: 0, wrongCaught: 0, liveAsks: 3 };
    expect(weekPage(w).spared).toEqual(["2 tasks paused for using far more than usual", "3 asks before a live system"]);
  });
  test("a week whose only events are what was saved is not an empty week", () => {
    const none = { reviews: 0, files: 0, proven: 0, undone: 0, saved: 0, savedUsed: 0, caught: { keys: 0, weakened: 0, falseDones: 0, packages: 0 } };
    const zero = { loopsStopped: 0, paused: 0, pausedStopped: 0, foundNoModel: 0, wrongCaught: 0, liveAsks: 0 };
    for (const k of ["loopsStopped", "paused", "foundNoModel", "wrongCaught", "liveAsks"] as const) {
      const w: WeekView = { ...WEEK(), ...none, spared: { ...zero, [k]: 1 } };
      expect(weekEmpty(w), k).toBe(false);
      expect(weekPage(w).empty, k).toBe(false);
    }
    expect(weekEmpty({ ...WEEK(), ...none, spared: zero })).toBe(true);
    // Share what my AI did does not carry this part, so it never says nothing happened, nor shares a blank summary.
    const only: WeekView = { ...WEEK(), ...none, spared: { ...zero, loopsStopped: 1 } };
    expect(shareFromWeek(only, "/Users/me/shop", null, new Date("2026-11-15T10:00:00Z")).summary).toEqual([S.m79.week.caughtNone]);
    expect(weekEmpty({ ...WEEK(), ...none, spared: undefined })).toBe(true);
  });
  test("nothing at all is said when every count is zero or none was sent", () => {
    const w = WEEK(); w.spared = { loopsStopped: 0, paused: 0, pausedStopped: 0, foundNoModel: 0, wrongCaught: 0, liveAsks: 0 };
    expect(weekPage(w).spared).toEqual([]);
    expect(weekPage(weekFrom(fixture("m79e2"), "p_9f2c")!).spared).toEqual([]);
  });
  test("This week and Your numbers draw it, and the words have no amount, no estimate, no streak and no praise", () => {
    expect(read("./weekSummary.tsx")).toContain("page.spared");
    const part = read("./m88Panels.tsx");
    expect(part).toContain("sparedRows(n)");
    expect(part).toContain("S.m94.title");
    for (const t of flat(S.m94)) {
      expect(/streak|great|well done|awesome|nice work|score|\$|usd|cents|\d+(\.\d+)? ?(tokens|minutes|hours)/i.test(t), t).toBe(false);
      expect(NO_DASH.test(t), t).toBe(false);
    }
    // Said plainly that nothing is guessed.
    expect(S.m94.lead).toContain("no estimate of time, tokens or money saved");
    // The part does not claim to count apart from the table above: it says which events show up in both.
    expect(S.m94.lead).not.toContain("one time each.");
    expect(S.m94.savedAbove).toContain("counted here too");
  });
});
