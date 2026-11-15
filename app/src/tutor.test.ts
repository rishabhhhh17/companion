// M95, a light tutor, the pages' side: What you have learned and Practise next, as pure functions of the signals the
// engine sent (protocol fixture m95e1, which the runner and the shell read too). No model, no engine. Plain words, and no
// streak, level, points or praise (rule 16); every line shows its source and can be forgotten (rule 15).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { LEARNED_KINDS, PRACTICE_LEARNED, type LearnedSignal } from "../../protocol/index.ts";
import { S } from "./strings.ts";
import { CATALOG, type RowState } from "./practice.ts";
import { learnedFrom, learnedLines, practiceNotesDue, practiseNext, timesWords } from "./tutor.ts";

const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const fixture = (id: string) => JSON.parse(read("../../protocol/fixtures/events.jsonl").split("\n").find((l) => l.includes(`"id":"${id}"`))!);
const sig = (kind: LearnedSignal["kind"], source: LearnedSignal["source"], date: string, missed = false): LearnedSignal => ({ kind, source, date, ...(missed ? { missed: true as const } : {}) });
const rows = (states: Record<string, RowState> = {}) => CATALOG.map((e) => ({ id: e.id, state: states[e.id] ?? ("notStarted" as RowState) }));
const ALL_DONE = Object.fromEntries(CATALOG.map((e) => [e.id, "done" as RowState]));
const flat = (o: unknown): string[] => (typeof o === "string" ? [o] : typeof o === "function" ? [String((o as (...a: unknown[]) => string)("a key written into the code", 2))] : o && typeof o === "object" ? Object.values(o).flatMap(flat) : []);

describe("reading what the engine sent", () => {
  test("the fixture reads; anything that is not a kind, a source and a day drops the whole list, never a made up line", () => {
    expect(learnedFrom(fixture("m95e1"))).toEqual({ on: true, paused: false, signals: fixture("m95e1").signals });
    expect(learnedFrom(fixture("m95e2"))).toEqual({ on: false, paused: false, signals: [] });
    const bad = fixture("m95e1"); bad.signals[0].words = "hello";
    expect(learnedFrom(bad)).toBeNull();
    const mood = fixture("m95e1"); mood.signals[0].kind = "mood";
    expect(learnedFrom(mood)).toBeNull();
    expect(learnedFrom({ type: "tutor.learned", on: "yes", paused: false, signals: [] })).toBeNull();
    expect(learnedFrom({ type: "other" })).toBeNull();
  });
});

describe("What you have learned", () => {
  test("one line per kind handled, in plain words with how many times, newest first; missed answers are not a line", () => {
    const lines = learnedLines([
      sig("key_in_code", "practice", "2026-11-10"), sig("key_in_code", "review", "2026-11-12"),
      sig("renamed_file", "check", "2026-11-13", true), sig("open_table", "yourTurn", "2026-11-14"),
    ]);
    // Found and moved is said only for what the checks proved (a practice, a Your turn change): the review is not counted in it.
    expect(lines.map((l) => l.text)).toEqual([
      `${S.tutor.kinds.open_table.title}: ${S.tutor.kinds.open_table.handled}, once`,
      "A key written into the code: found and moved to settings, once",
    ]);
    expect(lines[1].sources).toEqual([{ source: "review", date: "2026-11-12", n: 1 }, { source: "practice", date: "2026-11-10", n: 1 }]);
    expect(lines[1].from).toBe(`${S.tutor.from}: ${S.tutor.sources.review}, 12 Nov; ${S.tutor.sources.practice}, 10 Nov`);
  });
  test("the same source twice is said once with its newest day, and nothing at all is an empty list", () => {
    const l = learnedLines([sig("missing_setting", "check", "2026-11-01"), sig("missing_setting", "check", "2026-11-09"), sig("missing_setting", "check", "2026-11-05")]);
    expect(l[0].text.endsWith(", 3 times")).toBe(true);
    expect(l[0].sources).toEqual([{ source: "check", date: "2026-11-09", n: 3 }]);
    expect(learnedLines([])).toEqual([]);
    expect(learnedLines([sig("renamed_file", "check", "2026-11-13", true)])).toEqual([]);
  });
  test("each line is worded from its source: a review or a check answer never claims the person found or moved anything", () => {
    expect(learnedLines([sig("key_in_code", "review", "2026-11-12"), sig("key_in_code", "review", "2026-11-13")]).map((l) => l.text))
      .toEqual(["A key written into the code: a review found it and a later change took it out, twice"]);
    expect(learnedLines([sig("key_in_code", "check", "2026-11-12")]).map((l) => l.text)).toEqual(["Check question answered: why a key in the code is a problem, once"]);
    // A check answer and a review together: the review wording, the stronger of the two.
    expect(learnedLines([sig("weakened_check", "check", "2026-11-12"), sig("weakened_check", "review", "2026-11-10")])[0].text).toBe(`${S.tutor.kinds.weakened_check.title}: a review found it and a later change took it out, once`);
    expect(learnedLines([sig("other", "check", "2026-11-12")])[0].text).toBe("Check question answered: why a fix worked, once");
    for (const k of LEARNED_KINDS) for (const src of ["check", "review"] as const) expect(learnedLines([sig(k, src, "2026-11-12")])[0].text).not.toContain(S.tutor.kinds[k].handled);
    expect(S.tutor.sources.review).not.toMatch(/kept|fix/i);
  });
  test("how many times, in words", () => {
    expect([1, 2, 3, 11].map(timesWords)).toEqual(["once", "twice", "3 times", "11 times"]);
  });
});

describe("Practise next: one suggestion, from the signals, the practice record and the lessons", () => {
  test("the why of a missed answer is plain", () => {
    expect(S.tutor.why.missed(S.tutor.kinds.renamed_file.about)).toBe("You picked a different reason on a check question about a file that was moved or renamed. This practice goes through it step by step.");
  });
  test("a practice that needs Node is passed over while Node is missing; with only those left, the row says it needs Node", () => {
    const nodeRows = (ids: string[], states: Record<string, RowState> = {}) => rows(states).map((r) => ({ ...r, needsNode: ids.includes(r.id) }));
    expect(practiseNext([sig("renamed_file", "check", "2026-11-13", true)], nodeRows(["import"]), [])).toMatchObject({ id: CATALOG.find((e) => e.id !== "import")!.id });
    expect(practiseNext([], nodeRows([CATALOG[0].id]), [])).toMatchObject({ id: CATALOG[1].id });
    const others = Object.fromEntries(CATALOG.filter((e) => e.id !== "signup").map((e) => [e.id, "done" as RowState]));
    expect(practiseNext([], nodeRows(["signup"], others), [])).toEqual({ kind: "practice", id: "signup", about: "failing_request", why: S.practiceNeedsNode, needsNode: true });
  });
  test("a missed check question leads, when a practice not done goes through that kind, and it can be forgotten", () => {
    const s = practiseNext([sig("renamed_file", "check", "2026-11-13", true)], rows(), []);
    expect(s).toEqual({ kind: "practice", id: "import", about: "renamed_file", why: S.tutor.why.missed(S.tutor.kinds.renamed_file.about), forget: "renamed_file" });
  });
  test("the newest missed kind wins; a missed kind with its practice done, or with no practice, is passed over", () => {
    const sigs = [sig("key_in_code", "check", "2026-11-01", true), sig("open_table", "check", "2026-11-09", true), sig("weakened_check", "check", "2026-11-12", true)];
    expect(practiseNext(sigs, rows(), [])).toMatchObject({ id: "open-table", about: "open_table", forget: "open_table" });
    expect(practiseNext(sigs, rows({ "open-table": "done" }), [])).toMatchObject({ id: "key", about: "key_in_code" });
  });
  test("with nothing missed: the first practice, in the list's order, of a kind not met yet", () => {
    const first = CATALOG[0];
    expect(practiseNext([], rows(), [])).toEqual({ kind: "practice", id: first.id, about: PRACTICE_LEARNED[first.id], why: S.tutor.why.notMet(S.tutor.kinds[PRACTICE_LEARNED[first.id]].about) });
    // Met in a review already: the next kind not met comes first.
    const next = practiseNext([sig(PRACTICE_LEARNED[first.id], "review", "2026-11-10")], rows(), []);
    expect(next).toMatchObject({ id: CATALOG[1].id, why: S.tutor.why.notMet(S.tutor.kinds[PRACTICE_LEARNED[CATALOG[1].id]].about) });
  });
  test("every kind met, some practice not done: the first not done, said as met in your own work", () => {
    const sigs = CATALOG.map((e) => sig(PRACTICE_LEARNED[e.id], "review", "2026-11-10"));
    const s = practiseNext(sigs, rows({ [CATALOG[0].id]: "done" }), []);
    expect(s).toMatchObject({ id: CATALOG[1].id, why: S.tutor.why.again(S.tutor.kinds[PRACTICE_LEARNED[CATALOG[1].id]].about) });
    expect(s).not.toHaveProperty("forget");
  });
  test("a practice under way is still the suggestion (Continue opens it)", () => {
    expect(practiseNext([], rows({ [CATALOG[0].id]: "inProgress" }), [])).toMatchObject({ id: CATALOG[0].id });
  });
  test("every practice done: a lesson made from the project that was not tried, else nothing", () => {
    const lesson = { id: "l1", title: "Add a setting on Vercel", app: "Vercel", goal: "", status: "draft" as const, steps: 3, saved: false };
    expect(practiseNext([], rows(ALL_DONE), [lesson])).toEqual({ kind: "lesson", id: "l1", title: "Add a setting on Vercel", why: S.tutor.why.lesson });
    expect(practiseNext([], rows(ALL_DONE), [{ ...lesson, status: "tried" }])).toBeNull();
    expect(practiseNext([], rows(ALL_DONE), null)).toBeNull();
  });
  test("pure: the same signals always give the same suggestion, and the input is not changed", () => {
    const sigs = Object.freeze([sig("renamed_file", "check", "2026-11-13", true)]) as LearnedSignal[];
    expect(practiseNext(sigs, rows(), [])).toEqual(practiseNext(sigs, rows(), []));
  });
});

describe("practices already finished are told to the engine once", () => {
  test("only done ones with no practice signal, and never one already sent this session", () => {
    const rec = { rows: [{ id: "key", there: true, done: "2026-11-02" }, { id: "route", there: true, done: "2026-11-03" }, { id: "import", there: true }], damaged: false };
    expect(practiceNotesDue({ on: true, paused: false, signals: [sig("key_in_code", "practice", "2026-11-02")] }, rec, new Set())).toEqual(["route"]);
    expect(practiceNotesDue({ on: true, paused: false, signals: [] }, rec, new Set(["route"]))).toEqual(["key"]);
    // A key found in a review is not the practice: the practice still counts.
    expect(practiceNotesDue({ on: true, paused: false, signals: [sig("key_in_code", "review", "2026-11-02")] }, rec, new Set())).toEqual(["key", "route"]);
    expect(practiceNotesDue({ on: false, paused: false, signals: [] }, rec, new Set())).toEqual([]);
    expect(practiceNotesDue({ on: true, paused: true, signals: [] }, rec, new Set())).toEqual([]);
    expect(practiceNotesDue(null, rec, new Set())).toEqual([]);
  });
});

describe("the words", () => {
  test("every kind has its words, and no words are about health, money, moods, streaks, levels, points or praise", () => {
    for (const k of LEARNED_KINDS) expect(S.tutor.kinds[k].title.length).toBeGreaterThan(0);
    for (const t of flat(S.tutor)) {
      expect(/streak|level|points?\b|score|badge|great|well done|awesome|nice work|amazing|proud|congrat|!|health|money|mood|feel/i.test(t), t).toBe(false);
      expect(/[–—]/.test(t), t).toBe(false);
    }
  });
});
