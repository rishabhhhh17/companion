// M57 features 1, 5 and 6 and UI 12 on the pages (docs/milestones/M57-review-every-day.md): review rows in History with
// their own mark, the instant key warning on the card, Home's top and the notch's panel, Where was I's Review the changes,
// and the review settings on the Fixing page. Honest words throughout: nothing says "your AI did it".
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initial, reduce } from "./model.ts";
import { reviewDismiss } from "./commands.ts";
import { dismissHow, keyWarned, reviewReduce, reviewStamp, type ReviewCard } from "./review.ts";
import { reviewRowLook, reviewRowsOf } from "./reviewHistory.ts";
import { reviewLead } from "./homeHero.ts";
import { numbersLines } from "./settings.ts";
import { mainKeys, moreKeys, PAGES, placeOf } from "./settingsPages.ts";
import { searchSettingsFor } from "./settingsSearch.ts";
import { S } from "./strings.ts";

const P = "/Users/me/shop";
const B = "rv_4f2a9c01de";
const batch = (over: Record<string, unknown> = {}) => ({ type: "review.batch", project: P, batch: B, files: [{ file: "src/pay.ts", kind: "modified" }], count: 1, capped: false, secretFiles: [], auto: false, ...over });
const ok = (over: Record<string, unknown> = {}) => ({
  type: "review.result", project: P, batch: B, ok: true, rating: "worth_a_look", touches: ["payments"], summary: "The pay page changed.", notes: [], reasons: [{ kind: "touches_risky", say: "It touches payments." }],
  files: [{ file: "src/pay.ts", kind: "modified" }], count: 1, capped: false, secretFiles: [], checks: "not_run", sendBack: "A review found this.", lane: "none", usdEstimate: 0, ...over,
});
const run = (events: Record<string, unknown>[], from: ReviewCard | null = null) => events.reduce<ReviewCard | null>((r, e) => reviewReduce(r, e as { type: string }), from);
const NOT_HONEST = /your AI|AI tool (changed|did|made|wrote)|from your AI/i;

describe("feature 5: the instant key warning", () => {
  test("the card keeps where a key was written, by file and line only, and only valid places", () => {
    const r = run([batch({ keys: [{ file: "src/pay.ts", line: 12 }] })])!;
    expect(r.keys).toEqual([{ file: "src/pay.ts", line: 12 }]);
    expect(keyWarned(r)).toBe(true);
    expect(run([batch({ keys: [{ file: "src/pay.ts", line: 0 }] })])!.keys).toBeUndefined();
    expect(run([batch({ keys: [{ file: "/etc/passwd", line: 1 }] })])!.keys).toBeUndefined();
    expect(run([batch({ keys: "src/pay.ts" })])!.keys).toBeUndefined();
    expect(keyWarned(run([batch()]))).toBe(false);
  });
  test("a batch that grew without the key loses the warning; once reviewed, the review's own words take over", () => {
    const grown = run([batch({ keys: [{ file: "src/pay.ts", line: 12 }] }), batch({ batch: "rv_aaaaaaaaaa", count: 2 })])!;
    expect(grown.keys).toBeUndefined();
    const reviewed = run([batch({ keys: [{ file: "src/pay.ts", line: 12 }] }), ok({ rating: "stop" })])!;
    expect(keyWarned(reviewed)).toBe(false);
  });
  test("it is a stop: the stamp says Not fixed yet, and Home's top names the file, still offering Review the changes", () => {
    const r = run([batch({ keys: [{ file: "src/pay.ts", line: 12 }] })])!;
    expect(reviewStamp(r)).toBe("notFixed");
    const lead = reviewLead(r, P)!;
    // M65 step 4: in Instrument the headline is the problem itself, the line says how much changed, once; Fix this first is
    // the status. Friendly keeps Fix this first over the key line (M65 step 6).
    expect(lead).toEqual({ headline: "A key was written into pay.ts", line: S.review.riskyLine(r.count, 1), main: "review", stop: true, friendly: { headline: S.review.rating.stop, line: S.review.keyWarning } });
    expect(S.review.riskyLine(4, 1)).toBe("4 files changed. One looks risky.");
    expect(S.review.riskyLine(4, 2)).toBe("4 files changed. 2 look risky.");
    expect(S.review.keyHeadline(["src/pay.ts", "src/cart.ts"])).toBe("Keys were written into 2 files");
    expect(S.review.keyWarning).toBe("A change wrote what looks like a key into the code.");
    expect(S.panel.reviewKey).toBe(S.review.keyWarning);
    expect(S.review.keyWarning).not.toMatch(NOT_HONEST);
  });
  test("the card draws the warning with its places and Fix this first; the notch's panel says the quiet line", () => {
    const view = readFileSync(new URL("./reviewCard.tsx", import.meta.url), "utf8");
    expect(view).toContain("keyWarned(r)");
    expect(view).toContain("S.review.keyWarning");
    expect(view).toContain("S.review.rating.stop");
    const panel = readFileSync(new URL("./islandPanel.tsx", import.meta.url), "utf8");
    expect(panel).toContain("S.panel.reviewKey");
    const island = readFileSync(new URL("./island.tsx", import.meta.url), "utf8");
    expect(island).toMatch(/reviewKey/);
  });
  test("its setting says it runs without asking, with only the key rule, on this Mac and with no model", () => {
    const w = S.set["review.keyWarning"];
    expect(w.label).toBeTruthy();
    expect(w.help).toMatch(/without asking/i);
    // Off until the founder says yes (M57 plan): the help line says so, and the registry's usual value agrees.
    expect(w.help).toMatch(/^Off unless you turn it on\./);
    expect(w.help).toMatch(/no model/i);
    expect(w.help).toMatch(/this Mac/);
    expect(w.help).not.toMatch(NOT_HONEST);
  });
});

describe("feature 1: a closed review says how, and History shows each review with its own mark", () => {
  test("Looks fine, or Copy for my AI then closed; a batch skipped before any review says nothing", () => {
    expect(dismissHow(run([batch()]))).toBeUndefined();
    const reviewed = run([batch(), ok()])!;
    expect(dismissHow(reviewed)).toBe("looksFine");
    const sent = run([{ type: "ui.reviewSentBack", batch: B }], reviewed)!;
    expect(sent.sentBack).toBe(true);
    expect(dismissHow(sent)).toBe("sentBack");
    expect(run([{ type: "ui.reviewSentBack", batch: "rv_bbbbbbbbbb" }], reviewed)!.sentBack).toBeUndefined();
    expect(reviewDismiss(P, B, "sentBack")).toMatchObject({ type: "review.dismiss", project: P, batch: B, how: "sentBack" });
    expect(reviewDismiss(P, B)).not.toHaveProperty("how");
  });
  const row = { id: 7, at: "2026-11-04T09:30:00Z", count: 3, files: ["src/pay.ts", "src/utils/date.ts", ".env"], rating: "stop", touches: ["payments", "secrets"], checks: "passed", did: "fix", summary: "The payment page now starts a checkout." };
  test("the rows are read only when they keep to the protocol, and at most 50", () => {
    expect(reviewRowsOf([row])).toHaveLength(1);
    expect(reviewRowsOf([{ ...row, rating: "fine" }])).toEqual([]);
    expect(reviewRowsOf([{ ...row, did: "ignored" }])).toEqual([]);
    expect(reviewRowsOf([{ ...row, files: [{ file: "a", text: "x" }] }])).toEqual([]);
    expect(reviewRowsOf("x")).toEqual([]);
    expect(reviewRowsOf(Array.from({ length: 80 }, (_, i) => ({ ...row, id: i })))).toHaveLength(50);
  });
  test("each row has its mark, the rating in words, what was done, and the files by name; never streak or blame words", () => {
    const now = Date.parse("2026-11-04T10:00:00Z");
    const l = reviewRowLook(reviewRowsOf([row])[0], now);
    expect(l.mark).toBe(S.history.reviewMark);
    expect(l.name).toBe(`${S.review.rating.stop}: ${row.summary}`);
    expect(l.meta).toContain(S.history.reviewDid.fix);
    expect(l.meta).toContain("3 files");
    expect(l.icon).toBe("halt");
    for (const d of ["open", "looks_fine", "sent_back", "fix", "no_longer_applies"]) {
      const w = reviewRowLook({ ...reviewRowsOf([row])[0], did: d as never }, now);
      expect(w.meta).not.toMatch(NOT_HONEST);
      expect(w.meta).not.toMatch(/streak|in a row|keep it up|great job/i);
    }
  });
  test("the model keeps the rows from tasks.list, and History draws them in its one list (M72: one list per screen)", () => {
    let m = initial();
    m = reduce(m, { type: "tasks.list", project: P, tasks: [], reviews: [row] } as never);
    expect(m.reviewHistory).toHaveLength(1);
    m = reduce(m, { type: "tasks.list", project: P, tasks: [] } as never);
    expect(m.reviewHistory).toEqual([]);
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).toContain("reviewRowLook(");
    expect(card).toContain("byTime(shown, filtering ? [] : reviews).map(");
    expect(card).not.toContain("S.history.reviewsTitle");
  });
  test("Copy for my AI is counted as a beta number, and the numbers say counts only", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).toContain('count("review_send_back")');
    const l = numbersLines({ enabled: true, totals: { review_batch: 9, review_run: 4, review_stop: 1, review_worth_a_look: 1, review_safe: 2, review_fix: 1, review_send_back: 1, review_looks_fine: 2, where_opened: 3, daily_limit: 0 }, rates: {} });
    expect(l).toContain("Changes ready to review: 9, reviews run: 4");
    expect(l).toContain("Reviews that said Looks safe: 2, Worth a look: 1, Fix this first: 1");
    expect(l).toContain("After a review: Fix it 1, Copy for my AI 1, Looks fine 2");
    expect(l).toContain("Where you left off shown: 3, daily limit reached: 0");
    expect(l.join(" ")).not.toMatch(/streak|in a row/i);
  });
});

describe("feature 6: Where was I's next step is Review the changes", () => {
  test("the model keeps it, and its button's words are plain", () => {
    const m = reduce(initial(), { type: "where.ready", project: P, lines: ["Since then: 12 files changed. Not reviewed yet."], next: { action: "review" } } as never);
    expect(m.recap).toEqual({ lines: ["Since then: 12 files changed. Not reviewed yet."], next: { action: "review" } });
    expect(S.recapNext.review).toBe("Review the changes");
    expect(S.recapSource).toMatch(/changes to your project/);
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).toMatch(/n\.action === "review"/);
  });
});

describe("UI 12: the review settings where people look", () => {
  test("a group on the Fixing page with review.mode in view, and the rest under its More", () => {
    // M74: how strict and the key warning came up beside the mode, with this project's own choice.
    expect(PAGES.fixing.groups[0]).toEqual({ id: "fixing.review", items: ["review.mode", "review.modeHere", "review.strictness", "review.keyWarning"] });
    expect(mainKeys("fixing")[0]).toBe("review.mode");
    const more = PAGES.fixing.more.find((t) => t.id === "more.fixing.review")!;
    expect(more.items).toEqual(["review.quietSeconds", "review.autoQuietSeconds", "review.ignore", "review.stopKinds", "review.whenNothing", "review.maxFiles", "review.keepDays"]);
    for (const k of ["review.mode", "review.quietSeconds", "review.autoQuietSeconds", "review.strictness", "review.keyWarning", "review.keepDays"]) {
      expect(moreKeys("general"), k).not.toContain(k);
      expect(placeOf(k)!.page === "fixing" || placeOf(k)!.topic === "more.fixing.review", k).toBe(true);
    }
    expect(S.setGroupTitles["fixing.review"]).toBe("Reviews of changes to your project");
    expect(S.setGroupTitles["more.fixing.review"]).toBe("Reviews of changes");
    expect(S.setGroupTitles["fixing.review"]).not.toMatch(NOT_HONEST);
  });
  test("search finds it by the names of the tools people use", () => {
    for (const w of ["Cursor", "Codex", "Claude Code", "CodeRabbit"]) {
      expect(searchSettingsFor(w).some((r) => "key" in r.hit && r.hit.key === "review.mode"), w).toBe(true);
    }
  });
  test("how long History keeps reviews is said in days, with no other place for them", () => {
    const k = S.set["review.keepDays"];
    expect(k.options).toEqual({ "30": "30 days", "90": "90 days", "180": "180 days", "365": "A year" });
    expect(k.help).toMatch(/Delete everything/);
    expect(k.help).toMatch(/never/i);
  });
});
