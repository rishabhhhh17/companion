// M69, the system: the example chips in the ask box (the YC benchmark spec 3.1, Replit's first box). Three at most, drawn
// only from what Squibby knows about this project right now, never invented text about it. A chip puts its words in the box;
// it never sends them.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { askChips, ASK_CHIPS_MAX, type ChipFacts } from "./askChips.ts";
import { S } from "./strings.ts";
import { copyable } from "./copytext.ts";

const P = "/Users/demo/my-shop";
const none: ChipFacts = { project: P };
const all: ChipFacts = {
  project: P,
  keyWarned: true,
  reviewOpen: true,
  errorExplained: true,
  checkFound: true,
  watchFailing: ["site_up"],
  changedSinceCheck: true,
  needsInstall: true,
};

describe("the ask box's example chips", () => {
  test("nothing known about the project means no chips, never made up ones", () => {
    expect(askChips(none)).toEqual([]);
    expect(askChips({ project: "" , ...{ keyWarned: true, changedSinceCheck: true } })).toEqual([]);
  });
  test("at most three, the most pressing first, with no two the same", () => {
    const c = askChips(all);
    expect(c.length).toBe(ASK_CHIPS_MAX);
    expect(ASK_CHIPS_MAX).toBe(3);
    expect(new Set(c.map((x) => x.words)).size).toBe(c.length);
    expect(new Set(c.map((x) => x.id)).size).toBe(c.length);
    expect(c[0].id).toBe("key");
  });
  test("each fact gives its own words", () => {
    expect(askChips({ project: P, keyWarned: true })).toEqual([{ id: "key", words: S.askChips.key }]);
    expect(askChips({ project: P, reviewOpen: true })).toEqual([{ id: "review", words: S.askChips.review }]);
    expect(askChips({ project: P, errorExplained: true })).toEqual([{ id: "error", words: S.askChips.error }]);
    expect(askChips({ project: P, checkFound: true })).toEqual([{ id: "found", words: S.askChips.found }]);
    expect(askChips({ project: P, changedSinceCheck: true })).toEqual([{ id: "since", words: S.askChips.since }]);
    expect(askChips({ project: P, needsInstall: true })).toEqual([{ id: "install", words: S.askChips.install }]);
    for (const k of ["site_up", "deploy_status", "ci_status", "project_checks"] as const) {
      expect(askChips({ project: P, watchFailing: [k] })).toEqual([{ id: `watch:${k}`, words: S.askChips.watch[k] }]);
    }
  });
  test("a key warning says what a key is, and the review's own chip then steps aside (one chip per card)", () => {
    expect(askChips({ project: P, keyWarned: true, reviewOpen: true }).map((c) => c.id)).toEqual(["key"]);
  });
  test("two failing watches give one chip each, still capped at three", () => {
    const c = askChips({ project: P, watchFailing: ["site_up", "ci_status", "deploy_status", "project_checks"] });
    expect(c.map((x) => x.id)).toEqual(["watch:site_up", "watch:ci_status", "watch:deploy_status"]);
  });
  test("every chip's words can be put in the box (copyable), are short, plain, and honest about who changed what", () => {
    const words = [S.askChips.key, S.askChips.review, S.askChips.error, S.askChips.found, S.askChips.since, S.askChips.install, ...Object.values(S.askChips.watch)];
    for (const w of words) {
      expect(copyable(w), w).toBe(w);
      expect(w.length, w).toBeLessThanOrEqual(34);
      expect(w, w).not.toMatch(/—|changed by|cents|\$|your key/i);
      expect(w, w).not.toMatch(/Lovable|Bolt|Replit|Cursor/);
    }
  });
  test("Home draws them in the ask box, and a press fills the box and never sends", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    const at = card.indexOf('className="ask-chip"');
    expect(at).toBeGreaterThan(0);
    const line = card.slice(card.lastIndexOf("\n", at), card.indexOf("\n", at));
    expect(line).toContain("fillBox(c.words)");
    expect(line).not.toMatch(/submit\(|send\(/);
  });
});
