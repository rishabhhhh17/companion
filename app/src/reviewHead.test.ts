// M69 step 2, the review card's head (reviewHead.ts): plain words before code, the place pointed at, the other findings.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { REVIEW_REASONS } from "../../protocol/index.ts";
import { reviewReduce, silenceOffered, type ReviewCard } from "./review.ts";
import { reviewHead } from "./reviewHead.ts";
import { S } from "./strings.ts";

const P = "/Users/me/shop";
const B = "rv_4f2a9c01de";
const files = [{ file: "src/pay.ts", kind: "modified" }, { file: "src/cart.ts", kind: "modified" }, { file: "src/home.css", kind: "modified" }, { file: "src/utils/date.ts", kind: "deleted" }];
const batch = (o: Record<string, unknown> = {}) => ({ type: "review.batch", project: P, batch: B, files, count: 4, capped: false, secretFiles: [], auto: false, ...o });
const result = (o: Record<string, unknown> = {}) => ({ type: "review.result", project: P, batch: B, ok: true, rating: "stop", touches: ["payments"], summary: "s", notes: [],
  reasons: [{ kind: "secret_in_code", file: "src/pay.ts", line: 12, say: "A key or password is written into src/pay.ts at line 12." }, { kind: "removed_still_used", file: "src/cart.ts", line: 4, say: "date.ts was removed, but cart.ts still uses it." }],
  files, count: 4, capped: false, secretFiles: [], checks: "passed", checksNote: "Your project's tests passed on a test copy.", sendBack: "x", lane: "cheap", usdEstimate: 0.02, ...o });
const run = (events: Record<string, unknown>[]) => events.reduce<ReviewCard | null>((r, e) => reviewReduce(r, e as { type: string }), null);
const all = (h: NonNullable<ReturnType<typeof reviewHead>>) => [h.tag, h.headline, h.why, h.reassure, ...h.others.flatMap((o) => [o.title, o.line])].join("\n");

describe("the head of a review that found something", () => {
  const h = reviewHead(run([batch(), result()]))!;
  test("Fix this first, 1 of the findings, the plain problem then why it matters", () => {
    expect(h.tone).toBe("stop");
    expect(h.tag).toBe("Fix this first · 1 of 2");
    expect(h.headline).toBe(S.homeNow.reviewHead.secret_in_code[0]);
    expect(h.why).toBe(S.homeNow.reviewHead.secret_in_code[1]);
    expect(h.count).toBe(2);
  });
  test("points at the file and the line, never its text", () => {
    expect(h.pointed).toEqual({ file: "src/pay.ts", line: 12 });
  });
  test("the other findings are one line cards: THEN for each, FINE for the files nobody flagged", () => {
    expect(h.others.map((o) => o.tag)).toEqual(["then", "fine"]);
    expect(h.others[0].title).toBe("date.ts was removed, but cart.ts still uses it.");
    expect(h.others[1].title).toBe("2 other files changed");
    expect(h.others[1].line).toBe("Your project's tests passed on a test copy.");
  });
  test("files are never called fine when the checks failed", () => {
    expect(reviewHead(run([batch(), result({ checks: "failed" })]))!.others.map((o) => o.tag)).toEqual(["then"]);
  });
  test("worth a look is amber and says so", () => {
    const w = reviewHead(run([batch(), result({ rating: "worth_a_look", reasons: [{ kind: "touches_risky", say: "Sign in changed." }] })]))!;
    expect(w.tone).toBe("look");
    expect(w.tag).toBe(S.homeNow.reviewTag.look);
  });
  test("a safe review, or one not run yet, keeps its own short card", () => {
    expect(reviewHead(run([batch(), result({ rating: "safe", reasons: [] })]))).toBeNull();
    expect(reviewHead(run([batch()]))).toBeNull();
    expect(reviewHead(null)).toBeNull();
  });
});

describe("the instant key warning, before any review", () => {
  const h = reviewHead(run([batch({ keys: [{ file: "src/pay.ts", line: 12 }, { file: "src/admin.ts", line: 3 }] })]))!;
  test("Fix this first, pointing at the first key; the second is a THEN card", () => {
    expect(h.tag).toBe("Fix this first · 1 of 2");
    expect(h.pointed).toEqual({ file: "src/pay.ts", line: 12 });
    expect(h.others).toHaveLength(1);
    expect(h.others[0].at).toEqual({ file: "src/admin.ts", line: 3 });
  });
  test("nobody looked at the other files yet, so none is called fine", () => {
    expect(h.others.every((o) => o.tag === "then")).toBe(true);
  });
});

describe("M69 step 3: the pointed line shows real code, masked", () => {
  const L = [{ n: 11, text: "export async function pay(cart) {" }, { n: 12, text: '  const key = "sk_live_\u2026";' }, { n: 13, text: "  return stripe(key).charge(cart.total);" }];
  test("the key warning carries the engine's three lines with the place", () => {
    const h = reviewHead(run([batch({ keys: [{ file: "src/pay.ts", line: 12, lines: L }] })]))!;
    expect(h.pointed).toEqual({ file: "src/pay.ts", line: 12, lines: L });
  });
  test("a payments key says what it can do in plain words, never 'a key' (the person's key is their shortcut)", () => {
    const h = reviewHead(run([batch({ keys: [{ file: "src/pay.ts", line: 12, lines: L }] })]))!;
    expect(h.headline).toBe(S.homeNow.reviewHead.secret_in_code_pay[0]);
    expect(h.why).toMatch(/spend your money/);
    const plain = reviewHead(run([batch({ keys: [{ file: "src/pay.ts", line: 12 }] })]))!;
    expect(plain.headline).toBe(S.homeNow.reviewHead.secret_in_code[0]);
    expect(`${plain.headline} ${h.headline}`).not.toMatch(/\bkey\b/i);
  });
  test("a review's own reason lines are used too, and a value that still looks secret never reaches the head", () => {
    const leak = [{ n: 12, text: 'const key = "sk_live_51HabcdefghijklmnopQRSTU";' }];
    const h = reviewHead(run([batch(), result({ reasons: [{ kind: "secret_in_code", file: "src/pay.ts", line: 12, say: "s", lines: leak }] })]))!;
    expect(JSON.stringify(h)).not.toContain("51Habcdef");
    expect(h.pointed?.lines?.[0].n).toBe(12);
  });
  test("lines that break the protocol are dropped, the place stays", () => {
    const h = reviewHead(run([batch({ keys: [{ file: "src/pay.ts", line: 12, lines: [{ n: 0, text: 1 }] }] })]));
    expect(h?.pointed).toEqual({ file: "src/pay.ts", line: 12 });
  });
});

describe("honest words", () => {
  test("every reason kind has a fixed headline and why", () => {
    for (const k of REVIEW_REASONS) {
      expect(S.homeNow.reviewHead[k]?.[0]?.length).toBeGreaterThan(0);
      expect(S.homeNow.reviewHead[k]?.[1]?.length).toBeGreaterThan(0);
    }
  });
  test("never who changed a file, never a cost (F29), never an em dash", () => {
    const h = reviewHead(run([batch(), result()]))!;
    expect(all(h)).not.toMatch(/changed by|Lovable|Bolt|Replit|cents|\$|—/);
    for (const [a, b] of Object.values(S.homeNow.reviewHead)) expect(`${a} ${b}`).not.toMatch(/changed by|—/);
  });
  test("Keep it anyway still never silences a key in the code (correction 4)", () => {
    const r = run([batch(), result()])!;
    expect(silenceOffered(r, 0)).toBe(false);
    const card = readFileSync(new URL("./reviewCard.tsx", import.meta.url), "utf8");
    expect(card).toContain("silenceOffered(r, i)");
  });
});
