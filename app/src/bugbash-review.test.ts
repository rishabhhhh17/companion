// Bug bash (M67 step 1), the Review every change flow: reducer probes. Each test states what the docs promise.
import { describe, expect, test } from "bun:test";
import { reviewReduce, silenceOffered, type ReviewCard } from "./review.ts";
import { reviewHead } from "./reviewHead.ts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReviewCardView } from "./reviewCard.tsx";
import { S } from "./strings.ts";

const P = "/Users/me/shop";
const A = "rv_aaaaaaaaaa", B = "rv_bbbbbbbbbb", C = "rv_cccccccccc";
const batch = (id: string, over: Record<string, unknown> = {}) => ({ type: "review.batch", project: P, batch: id, files: [{ file: "src/a.ts", kind: "modified" }], count: 1, capped: false, secretFiles: [], auto: true, ...over });
const result = (id: string, rating: string, reasons: Record<string, unknown>[], over: Record<string, unknown> = {}) => ({
  type: "review.result", project: P, batch: id, ok: true, rating, touches: [], summary: "s", notes: [], reasons,
  files: [{ file: "src/a.ts", kind: "modified" }], count: 1, capped: false, secretFiles: [], checks: "not_run", sendBack: "x", lane: "none", usdEstimate: 0, ...over,
});
const run = (events: Record<string, unknown>[], from: ReviewCard | null = null) => events.reduce<ReviewCard | null>((r, e) => reviewReduce(r, e as { type: string }), from);
const KEY = [{ kind: "secret_in_code", file: "src/a.ts", line: 2, say: "A key is written into src/a.ts at line 2." }];
const LOOK = [{ kind: "files_removed", say: "1 file was removed." }];

describe("a review that found something is never replaced before it is closed", () => {
  test("a second review that found something, waiting behind the first, is not replaced by a third batch", () => {
    const r = run([
      batch(A), { type: "review.started", project: P, batch: A, proof: false }, result(A, "stop", KEY),
      batch(B), { type: "review.started", project: P, batch: B, proof: false }, result(B, "worth_a_look", LOOK),
      batch(C),
    ])!;
    expect(r.batch).toBe(A);
    // B found something and was never shown; it must still be there to show once A is closed.
    const after = reviewReduce(r, { type: "ui.reviewDismissed", batch: A })!;
    expect(after.batch).toBe(B);
  });
});

describe("Don't flag again", () => {
  test("is not offered on a Fix this first card (the doc: on a worth a look reason)", () => {
    const r = run([batch(A), result(A, "stop", [...KEY, { kind: "touches_risky", say: "It touches payments." }])])!;
    expect(silenceOffered(r, 1)).toBe(false);
  });
});

describe("the key warning while its review runs", () => {
  test("the leading card still says the review is running", () => {
    const r = run([batch(A, { keys: [{ file: "src/a.ts", line: 2 }] }), { type: "ui.reviewAsked", batch: A, fixAfter: true }, { type: "review.started", project: P, batch: A, proof: true }])!;
    expect(r.stage).toBe("reviewing");
    expect(reviewHead(r)).not.toBeNull();   // the lead view is drawn (ReviewLeadView)
    const noop = () => {};
    // React writes the apostrophe as &#x27;; read it back as the person sees it.
    const html = renderToStaticMarkup(createElement(ReviewCardView, { r, onReview: noop, onDismiss: noop, onAskFix: noop, onFix: noop, onCancelFix: noop, onReviewFix: noop })).replaceAll("&#x27;", "'");
    console.log("buttons:", (html.match(/<button[^>]*>[^<]*/g) ?? []).length, "| says reviewing:", html.includes(S.review.reviewingChecks));
    expect(html).toContain(S.review.reviewingChecks);
    // Nothing waits on a press while it runs, so the card does not say it does.
    expect(html).not.toContain(S.homeNow.reassureLook);
  });
});

describe("changed while closed, with the key warning", () => {
  test("the card says the changes were made while Squibby was closed", () => {
    const r = run([batch(A, { away: "closed", auto: false, keys: [{ file: "src/a.ts", line: 2 }] })])!;
    const noop = () => {};
    const html = renderToStaticMarkup(createElement(ReviewCardView, { r, onReview: noop, onDismiss: noop, onAskFix: noop, onFix: noop, onCancelFix: noop, onReviewFix: noop }));
    const plain = run([batch(A, { away: "closed", auto: false })])!;
    const htmlPlain = renderToStaticMarkup(createElement(ReviewCardView, { r: plain, onReview: noop, onDismiss: noop, onAskFix: noop, onFix: noop, onCancelFix: noop }));
    console.log("plain card says away:", htmlPlain.includes(S.review.away.closed), "| key warned card says away:", html.includes(S.review.away.closed));
    expect(html).toContain(S.review.away.closed);
  });
});
