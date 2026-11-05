// M71: every state to one meaning and one colour (meaning.ts). The same news always has the same colour, nothing is left
// unmapped, and a practice that only waits is "Practice ready" in purple, never needs you (the founder, 5 Nov 2026).
import { describe, expect, test } from "bun:test";
import {
  CHARACTER_MEANING, COLOURS, FACT_MEANING, FIX_MEANING, heroMeaning, MEANING_COLOUR, MEANING_ICON, MEANINGS, PILL_MEANING, PLACE_COLOUR, PLACE_ICON, PLACES,
  PRACTICE_MEANING, PROBLEM_MEANING, REVIEW_MEANING, STATUS_MEANING, statusDot, TONE_MEANING, VERDICT_MEANING, type Meaning,
} from "./meaning.ts";
import { S } from "./strings.ts";

const CHARACTER = ["off", "idle", "listening", "thinking", "working", "checking", "needsYou", "done", "error"] as const;
const STATUS = ["works", "changed", "failing", "unchecked", "noProject"] as const;
const VERDICTS = ["proven", "passes", "partial", "unchecked", "noChange", "turn", "failed", "stopped", "limit", "needsYou", "error", "undone", "back"] as const;
const TONES = ["idle", "working", "needsYou", "done", "notDone", "partly", "plain"] as const;
const PRACTICE = ["start", "found", "fixing", "lesson", "proving", "done", "failed", "blocked"] as const;
const MODES = ["rest", "working", "question", "needs", "answer", "result", "blocked", "review"] as const;

describe("every state has one meaning, and every meaning one colour, one drawing and one tag", () => {
  test("no meaning is without its colour, its drawing or its words", () => {
    for (const m of MEANINGS) {
      expect(COLOURS, m).toContain(MEANING_COLOUR[m]);
      expect(typeof MEANING_ICON[m], m).toBe("string");
      expect(S.meaning.tag[m]?.length, m).toBeGreaterThan(0);
    }
    expect(Object.keys(MEANING_COLOUR).sort()).toEqual([...MEANINGS].sort());
  });
  test("no state is unmapped: the character, the project's status, a verdict, the hero's tone, a practice, a review, a fix, a fact", () => {
    const tables: [string, Record<string, Meaning>, readonly string[]][] = [
      ["character", CHARACTER_MEANING, CHARACTER], ["status", STATUS_MEANING, STATUS], ["verdict", VERDICT_MEANING, VERDICTS], ["tone", TONE_MEANING, TONES],
      ["practice", PRACTICE_MEANING, PRACTICE], ["pill", PILL_MEANING, ["passed", "look", "failed", "new"]], ["fix", FIX_MEANING, ["proven", "undone", "failed", "partly", "unchecked"]],
      ["review", REVIEW_MEANING, ["waiting", "look", "stop", "clean"]], ["problem", PROBLEM_MEANING, ["failedCheck", "keyInCode", "error", "notReadyOnline"]],
      ["fact", FACT_MEANING, ["note", "off", "notConnected", "questions", "pickProject", "changes", "passed", "failing", "changedSince", "notChecked", "ready", "working", "listening"]],
    ];
    for (const [name, table, states] of tables) {
      expect(Object.keys(table).sort(), name).toEqual([...states].sort());
      for (const s of states) expect(MEANINGS, `${name}.${s}`).toContain(table[s]);
    }
  });
  test("every hero mode and tone gives a meaning", () => {
    for (const mode of MODES) for (const tone of TONES) for (const status of STATUS) expect(MEANINGS).toContain(heroMeaning({ mode, tone, status }));
  });
});

describe("the same news has the same colour", () => {
  test("proven is green, a real problem red, changes to review orange, working blue, listening teal, a practice purple", () => {
    expect(MEANING_COLOUR.proven).toBe("green");
    expect(MEANING_COLOUR.problem).toBe("red");
    expect(MEANING_COLOUR.review).toBe("orange");
    expect(MEANING_COLOUR.working).toBe("blue");
    expect(MEANING_COLOUR.listening).toBe("teal");
    expect(MEANING_COLOUR.practice).toBe("purple");
  });
  test("only a proven result is green: a partial check, no change or a result not checked never is", () => {
    for (const v of VERDICTS) expect(MEANING_COLOUR[VERDICT_MEANING[v]] === "green", v).toBe(v === "proven" || v === "passes");
    expect(MEANING_COLOUR[FIX_MEANING.partly]).not.toBe("green");
  });
  test("a key in the code and a failed check are red; the project chip's dot follows its status", () => {
    expect(MEANING_COLOUR[PROBLEM_MEANING.keyInCode]).toBe("red");
    expect(MEANING_COLOUR[REVIEW_MEANING.stop]).toBe("red");
    expect(statusDot("works")).toBe("green");
    expect(statusDot("changed")).toBe("orange");
    expect(statusDot("failing")).toBe("red");
    expect(statusDot("unchecked")).toBe("grey");
  });
  test("History's tiles: green proven, red failed, grey stopped, orange undone", () => {
    expect(MEANING_COLOUR[FIX_MEANING.proven]).toBe("green");
    expect(MEANING_COLOUR[FIX_MEANING.failed]).toBe("red");
    expect(MEANING_COLOUR[VERDICT_MEANING.stopped]).toBe("grey");
    expect(MEANING_COLOUR[FIX_MEANING.undone]).toBe("orange");
  });
  test("each place has its own colour: Now blue, Learn purple, History orange, Memory pink, Settings grey", () => {
    expect(PLACE_COLOUR).toEqual({ now: "blue", learn: "purple", did: "orange", memory: "pink", settings: "grey" });
    for (const p of PLACES) expect(typeof PLACE_ICON[p]).toBe("string");
  });
});

describe("a practice that waits is Practice ready, in purple, never needs you", () => {
  test("the practice waiting on the person (the hero's needs you tone) maps to practice", () => {
    for (const mode of ["needs", "rest"] as const) {
      const m = heroMeaning({ mode, tone: "needsYou", status: "unchecked", practice: "start" });
      expect(m).toBe("practice");
      expect(MEANING_COLOUR[m]).toBe("purple");
      expect(S.meaning.tag[m]).toBe("Practice ready");
    }
    expect(heroMeaning({ mode: "needs", tone: "needsYou", status: "unchecked", practice: "found" })).toBe("practice");
  });
  test("no practice stage is a question, and no stage says Needs you", () => {
    for (const s of PRACTICE) {
      expect(PRACTICE_MEANING[s], s).not.toBe("question");
      expect(S.meaning.tag[PRACTICE_MEANING[s]].toLowerCase(), s).not.toContain("needs you");
    }
  });
  test("a real question still says it needs the person's OK", () => {
    expect(heroMeaning({ mode: "question", tone: "needsYou", status: "works" })).toBe("question");
    expect(S.meaning.tag.question).toBe("Needs your OK");
  });
  test("a practice being fixed is working, a proven one green", () => {
    expect(heroMeaning({ mode: "working", tone: "working", status: "unchecked", practice: "fixing" })).toBe("working");
    expect(PRACTICE_MEANING.done).toBe("proven");
  });
});

describe("Home's lead picks the meaning of what matters now", () => {
  test("at rest, from the last check; a result from its tone; a review from its rating", () => {
    expect(heroMeaning({ mode: "rest", tone: "idle", status: "works", atRest: true, restPill: "passed" })).toBe("proven");
    expect(heroMeaning({ mode: "rest", tone: "idle", status: "failing", atRest: true, restPill: "failed" })).toBe("problem");
    expect(heroMeaning({ mode: "rest", tone: "idle", status: "unchecked", atRest: true, restPill: "new" })).toBe("notChecked");
    expect(heroMeaning({ mode: "result", tone: "done", status: "works" })).toBe("proven");
    expect(heroMeaning({ mode: "result", tone: "notDone", status: "failing" })).toBe("problem");
    expect(heroMeaning({ mode: "review", tone: "needsYou", status: "works" })).toBe("review");
    expect(heroMeaning({ mode: "review", tone: "needsYou", status: "works", reviewStop: true })).toBe("problem");
    expect(heroMeaning({ mode: "working", tone: "working", status: "works" })).toBe("working");
  });
});
