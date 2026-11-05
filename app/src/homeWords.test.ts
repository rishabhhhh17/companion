// M65 step 6 (the review of the Instrument look): Instrument's words on Home differ from Friendly's in three places, and
// Friendly must keep today's words exactly (the brief: Friendly is the look from before, unchanged). The page never reads
// the style: where the words differ, both are on the page, and a token shows one (ui/home.css .say-friendly, .say-instrument).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { characterWords, initial, type Model } from "./model.ts";
import { jobNowSays, jobNowWords, reviewLead } from "./homeHero.ts";
import { S } from "./strings.ts";
import type { ReviewCard } from "./review.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const P = "/Users/me/shop";
const rc = (o: Partial<ReviewCard> = {}): ReviewCard => ({ project: P, batch: "rv_0123456789", stage: "ready", files: [], count: 4, capped: false, secretFiles: [], auto: false, proof: false, asked: false, fix: null, note: null, result: null, ...o });
const stopResult = (reasons: { kind: string; say: string }[], fixed?: number[]) =>
  ({ rating: "stop", touches: [], summary: "", notes: [], reasons, checks: "notRun", sendBack: "", lane: "quick", usdEstimate: 0, ...(fixed ? { fixed } : {}) }) as never;

describe("Friendly keeps Fix this first as Home's headline on a stop", () => {
  test("a key in the code: Instrument names the file; Friendly says Fix this first over the key line, as before M65", () => {
    const l = reviewLead(rc({ keys: [{ file: "src/pay.ts", line: 12 }] }), P)!;
    expect(l.headline).toBe("A key was written into pay.ts");
    expect(l.friendly).toEqual({ headline: S.review.rating.stop, line: S.review.keyWarning });
    expect(S.review.rating.stop).toBe("Fix this first");
  });
  test("a review rated stop: Instrument names the problem; Friendly says Fix this first", () => {
    const l = reviewLead(rc({ stage: "reviewed", result: stopResult([{ kind: "secret", say: "A key is in pay.ts." }]) }), P)!;
    expect(l.headline).toBe("A key is in pay.ts");
    expect(l.friendly).toEqual({ headline: S.review.rating.stop, line: S.review.lead(4) });
  });
  test("where the words are the same in both looks, there is no second set", () => {
    expect(reviewLead(rc(), P)!.friendly).toBeUndefined();
    expect(reviewLead(rc({ stage: "reviewed", result: { ...(stopResult([{ kind: "x", say: "y" }]) as object), rating: "worth_a_look" } as never }), P)!.friendly).toBeUndefined();
  });
  test("the page puts both on Home and a token shows one: Friendly's by default, Instrument's in Instrument", () => {
    const card = read("./card.tsx"), home = read("./ui/home.css"), tokens = read("./ui/tokens.css");
    expect(card).toContain("<Said text={leadHeadline} friendly={heroShown.friendly?.headline} />");   // M71: a practice's headline without "Practice:"
    expect(card).toContain("<Said text={heroShown.line} friendly={heroShown.friendly?.line} />");
    expect(home).toContain(".say-friendly { display: var(--say-friendly-show, inline); }");
    expect(home).toContain(".say-instrument { display: var(--say-instrument-show, none); }");
    const instrument = /\n:root\[data-style="instrument"\] \{([^}]*)\}/.exec(tokens)?.[1] ?? "";
    expect(instrument).toContain("--say-friendly-show: none;");
    expect(instrument).toContain("--say-instrument-show: inline;");
    const parts = read("./ui/parts.tsx");
    expect(parts).toMatch(/export function Said\(/);
  });
  test("the review card's key line: Friendly shows the key warning as before; Instrument the move to make", () => {
    const view = read("./reviewCard.tsx");
    expect(view).toContain("<Said text={S.review.keyMove} friendly={S.review.keyWarning} />");
  });
});

describe("a stop's headline names a problem that still holds", () => {
  test("a reason marked fixed since is skipped; the first one still open leads", () => {
    const r = rc({ stage: "reviewed", result: stopResult([{ kind: "secret", say: "A key is in pay.ts" }, { kind: "open_data", say: "Anyone can read the orders table" }], [0]) });
    expect(reviewLead(r, P)!.headline).toBe("Anyone can read the orders table");
  });
  test("with every reason fixed but the rating still stop, it says the rating's words", () => {
    const r = rc({ stage: "reviewed", result: stopResult([{ kind: "secret", say: "A key is in pay.ts" }], [0]) });
    expect(reviewLead(r, P)!.headline).toBe(S.review.rating.stop);
  });
});

describe("the working card's line before its first step says what is going on, never a problem that is not there", () => {
  const task = { agent: "a", label: "add a dark mode toggle", lines: [], costUsd: 0 };
  test("it falls back to the character's own words, as before M65 (Listening, Checking your project, Working)", () => {
    const m = { ...initial(), task, character: "working" } as unknown as Model;
    expect(jobNowWords(m, null, [])).toBe(characterWords(m));
    expect(jobNowWords(m, null, [])).toBe("Working");
    const listening = { ...m, voice: { stage: "listening" } } as unknown as Model;
    expect(jobNowWords(listening, null, [])).toBe("Listening");
    expect(S.home).not.toHaveProperty("lookingForProblem");
  });
  test("Instrument says Getting started where Friendly says Working (the status line over it already says Working)", () => {
    expect(jobNowSays("Working")).toEqual({ text: S.home.gettingStarted, friendly: "Working" });
    expect(S.home.gettingStarted).toBe("Getting started");
    expect(jobNowSays("Listening")).toEqual({ text: "Listening" });
    expect(jobNowSays("Building the code")).toEqual({ text: "Building the code" });
    // M69: the work card's run list says each step on its own row (runList.ts), so this line is no longer drawn there.
  });
});
