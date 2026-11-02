// M52 (F30): the review card on Home, from the engine's review events. The risky parts are tested first (rule 17): the
// card follows only its own batch, closes when the changes went away, the copied text never carries a secret, Fix it is
// offered only after a review that ran, and every command names the project and the batch.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { REVIEW_CHECKS, REVIEW_RATINGS, REVIEW_TOUCHES } from "../../protocol/index.ts";
import { initial, reduce } from "./model.ts";
import { S } from "./strings.ts";
import { canFix, checksLook, ratingLook, reviewReduce, reviewShown, reviewStamp, sendBackCopy, type ReviewCard } from "./review.ts";
import { reviewDismiss, reviewFix, reviewNow } from "./commands.ts";

const P = "/Users/me/shop";
const batch = (over: Record<string, unknown> = {}) => ({ type: "review.batch", project: P, batch: "rv_4f2a9c01de", files: [{ file: "src/pay.ts", kind: "modified" }, { file: ".env", kind: "modified" }], count: 2, capped: false, secretFiles: [".env"], auto: false, ...over });
const ok = (over: Record<string, unknown> = {}) => ({
  type: "review.result", project: P, batch: "rv_4f2a9c01de", ok: true, rating: "stop", touches: ["payments", "secrets"], summary: "The payment page now starts a checkout.",
  notes: ["Try a test payment once."], reasons: [{ kind: "secret_in_code", file: "src/pay.ts", line: 2, say: "A key is written into src/pay.ts at line 2." }],
  files: [{ file: "src/pay.ts", kind: "modified" }, { file: ".env", kind: "modified" }], count: 2, capped: false, secretFiles: [".env"], checks: "failed",
  checksNote: "Build did not pass.", sendBack: "A review of the changes you just made found this.", lane: "strong", usdEstimate: 0.021, ...over,
});
const fixtures = (name: string) => readFileSync(new URL(`../../protocol/fixtures/${name}`, import.meta.url), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
const run = (events: Record<string, unknown>[], from: ReviewCard | null = null) => events.reduce<ReviewCard | null>((r, e) => reviewReduce(r, e as { type: string }), from);

describe("the card follows the engine's batches", () => {
  test("a batch with changes opens the card, ready to review, with its files and the names of the settings files only", () => {
    const r = run([batch()])!;
    expect(r.stage).toBe("ready");
    expect(r.batch).toBe("rv_4f2a9c01de");
    expect(r.project).toBe(P);
    expect(r.files.map((f) => f.file)).toEqual(["src/pay.ts", ".env"]);
    expect(r.secretFiles).toEqual([".env"]);
    expect(r.result).toBeNull();
  });
  test("count 0 for the card's batch closes it; for another batch it changes nothing", () => {
    expect(run([batch(), batch({ count: 0, files: [], secretFiles: [] })])).toBeNull();
    const r = run([batch(), batch({ batch: "rv_000000000a", count: 0, files: [] })]);
    expect(r?.batch).toBe("rv_4f2a9c01de");
    expect(run([batch({ count: 0, files: [] })])).toBeNull();
  });
  test("a batch that grew comes under a new id and takes the card's place, a safe review shown before included", () => {
    expect(run([batch(), batch({ batch: "rv_aaaaaaaaaa", count: 3, files: [{ file: "a.ts", kind: "added" }] })])!.batch).toBe("rv_aaaaaaaaaa");
    const r = run([batch(), ok({ rating: "safe", reasons: [] }), batch({ batch: "rv_aaaaaaaaaa", count: 3, files: [{ file: "a.ts", kind: "added" }] })])!;
    expect(r.batch).toBe("rv_aaaaaaaaaa");
    expect(r.stage).toBe("ready");
    expect(r.result).toBeNull();
  });
  // Review round 1: a stop the person had not read yet was silently replaced by the next batch, which the engine measures
  // from where the stop ended, so the warning was lost.
  test("a stop or worth a look not yet closed stays; newer changes wait behind it and take its place once it is closed", () => {
    for (const rating of ["stop", "worth_a_look"]) {
      const newer = batch({ batch: "rv_cccccccccc", count: 1, files: [{ file: "src/b.ts", kind: "modified" }], secretFiles: [], auto: true });
      let r = run([batch(), ok({ rating }), newer])!;
      expect(r.batch, rating).toBe("rv_4f2a9c01de");
      expect(r.result?.rating).toBe(rating);
      expect(r.later?.batch).toBe("rv_cccccccccc");
      expect(r.later?.stage).toBe("ready");
      // An automatic review of the newer changes is kept with them, not shown over the warning.
      r = run([{ type: "review.started", project: P, batch: "rv_cccccccccc", proof: true }, ok({ batch: "rv_cccccccccc", rating: "safe", reasons: [], files: [{ file: "src/b.ts", kind: "modified" }], count: 1, secretFiles: [] })], r)!;
      expect(r.result?.rating).toBe(rating);
      expect(r.later?.stage).toBe("reviewed");
      expect(r.later?.result?.rating).toBe("safe");
      // Looks fine on the warning: the newer changes are the card now, with their own review.
      const next = run([{ type: "ui.reviewDismissed", batch: "rv_4f2a9c01de" }], r)!;
      expect(next.batch).toBe("rv_cccccccccc");
      expect(next.result?.rating).toBe("safe");
      expect(next.later ?? null).toBeNull();
    }
  });
  test("newer changes that went away again leave only the warning", () => {
    const r = run([batch(), ok(), batch({ batch: "rv_cccccccccc", count: 1, files: [{ file: "src/b.ts", kind: "modified" }] }), batch({ batch: "rv_cccccccccc", count: 0, files: [] })])!;
    expect(r.batch).toBe("rv_4f2a9c01de");
    expect(r.later ?? null).toBeNull();
    // and a late started for some other batch does not open a waiting card
    expect(run([{ type: "review.started", project: P, batch: "rv_dddddddddd", proof: false }], r)!.later ?? null).toBeNull();
  });
  test("started and the result follow only the card's own batch; a late one for an older batch is left out", () => {
    let r = run([batch(), { type: "review.started", project: P, batch: "rv_4f2a9c01de", proof: true }])!;
    expect(r.stage).toBe("reviewing");
    expect(r.proof).toBe(true);
    r = run([ok()], r)!;
    expect(r.stage).toBe("reviewed");
    expect(r.result?.rating).toBe("stop");
    const newer = run([batch({ batch: "rv_bbbbbbbbbb" })])!;
    expect(run([ok()], newer)).toEqual(newer);
    expect(run([{ type: "review.started", project: P, batch: "rv_4f2a9c01de", proof: false }], newer)).toEqual(newer);
  });
  test("a review that started or ended with no card yet (automatic, or Home opened late) still shows", () => {
    expect(run([{ type: "review.started", project: P, batch: "rv_4f2a9c01de", proof: true }])?.stage).toBe("reviewing");
    const r = run([ok()])!;
    expect(r.stage).toBe("reviewed");
    expect(r.files.length).toBe(2);
  });
  test("a review that did not run says why on its card and keeps what was there", () => {
    const stopped = run([batch(), { type: "review.started", project: P, batch: "rv_4f2a9c01de", proof: false }, { type: "review.result", project: P, batch: "rv_4f2a9c01de", ok: false, reason: "The review was stopped.", usdEstimate: 0 }])!;
    expect(stopped.stage).toBe("ready");
    expect(stopped.note).toBe("The review was stopped.");
    const kept = run([batch(), ok(), { type: "review.result", project: P, batch: "rv_4f2a9c01de", ok: false, reason: "A review is already running.", usdEstimate: 0 }])!;
    expect(kept.stage).toBe("reviewed");
    expect(kept.result?.rating).toBe("stop");
    expect(kept.note).toBe("A review is already running.");
    // No batch named (Review now with nothing changed): said on the card there is; with no card, nothing opens.
    expect(run([batch(), { type: "review.result", project: P, ok: false, reason: "Nothing has changed since the last review.", usdEstimate: 0 }])!.note).toBe("Nothing has changed since the last review.");
    expect(run([{ type: "review.result", project: P, ok: false, reason: "Nothing has changed since the last review.", usdEstimate: 0 }])).toBeNull();
  });
  test("an event that does not keep to the protocol changes nothing", () => {
    const r = run([batch()])!;
    for (const bad of [batch({ batch: "" }), batch({ project: 3 }), batch({ files: "x" }), batch({ batch: "../etc" }), ok({ rating: "great" }), ok({ checks: "maybe" }), { type: "review.started", project: P }]) expect(run([bad], r)).toEqual(r);
  });
  test("the engine's own fixtures all read, and an unknown rating, touch or check never reaches the card", () => {
    let r: ReviewCard | null = null;
    for (const e of fixtures("events.jsonl").filter((x) => String(x.type).startsWith("review."))) r = reviewReduce(r, e);
    // The last fixture line is a review that did not run with no batch: the card from before keeps its review.
    expect(r?.stage).toBe("reviewed");
    expect(r?.note).toBe("Nothing has changed since the last review.");
    for (const x of [r?.result?.rating]) expect(REVIEW_RATINGS).toContain(x as never);
    for (const t of r?.result?.touches ?? []) expect(REVIEW_TOUCHES).toContain(t);
    expect(REVIEW_CHECKS).toContain(r?.result?.checks as never);
  });
  test("files are capped at 50 and reasons at 20, whatever the event carries", () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ file: `f${i}.ts`, kind: "added" }));
    expect(run([batch({ files: many, count: 80, capped: true })])!.files.length).toBe(50);
    const reasons = Array.from({ length: 40 }, () => ({ kind: "touches_risky", say: "It touches sign in." }));
    expect(run([ok({ reasons })])!.result!.reasons.length).toBe(20);
  });
});

describe("what the person does on the card", () => {
  test("Review them is said as asked until the engine starts, and Stop everything or a stopped engine lets go of it", () => {
    let r = run([batch(), { type: "ui.reviewAsked", batch: "rv_4f2a9c01de" }])!;
    expect(r.asked).toBe(true);
    expect(run([{ type: "review.started", project: P, batch: "rv_4f2a9c01de", proof: false }], r)!.asked).toBe(false);
    expect(run([{ type: "app.stop_everything" }], r)!.asked).toBe(false);
    r = run([{ type: "ui.reviewFixAsked", batch: "rv_4f2a9c01de" }], run([ok()], r))!;
    expect(r.fix).toBe("confirm");
    expect(run([{ type: "app.stop_everything" }], r)!.fix).toBeNull();
  });
  test("Fix it asks first, and only after a review that ran", () => {
    expect(run([batch(), { type: "ui.reviewFixAsked", batch: "rv_4f2a9c01de" }])!.fix).toBeNull();
    const r = run([batch(), ok(), { type: "ui.reviewFixAsked", batch: "rv_4f2a9c01de" }])!;
    expect(r.fix).toBe("confirm");
    expect(run([{ type: "ui.reviewFixCancelled" }], r)!.fix).toBeNull();
    expect(run([{ type: "ui.reviewFixSent", batch: "rv_4f2a9c01de" }], r)!.fix).toBe("sent");
    expect(run([{ type: "ui.reviewFixSent", batch: "rv_other0000" }], r)!.fix).toBe("confirm");
  });
  test("once Fix it's task starts, the task's own card takes over; a refusal says why on the review card", () => {
    const sent = run([batch(), ok(), { type: "ui.reviewFixAsked", batch: "rv_4f2a9c01de" }, { type: "ui.reviewFixSent", batch: "rv_4f2a9c01de" }])!;
    expect(run([{ type: "agent.state", agent: "builder-1", state: "thinking" }], sent)).toBeNull();
    const refused = run([{ type: "protocol.error", reason: "Review these changes first, then press Fix it.", failed: "review.fix" }], sent)!;
    expect(refused.fix).toBeNull();
    expect(refused.note).toBe("Review these changes first, then press Fix it.");
    // At the plan's limit the limit card says it; the review card only stops waiting.
    expect(run([{ type: "plan.limit", reason: "fixes", command: "review.fix" }], sent)!.fix).toBeNull();
    // Another command's error is not the fix's.
    expect(run([{ type: "protocol.error", reason: "x", failed: "agent.start" }], sent)!.fix).toBe("sent");
    // An agent at work for something else does not close a card nobody pressed Fix it on.
    expect(run([{ type: "agent.state", agent: "builder-1", state: "working" }], run([batch(), ok()]))?.stage).toBe("reviewed");
  });
  test("Looks fine closes the card; another folder or a new engine closes it too", () => {
    const r = run([batch(), ok()]);
    expect(run([{ type: "ui.reviewDismissed", batch: "rv_4f2a9c01de" }], r)).toBeNull();
    expect(run([{ type: "ui.reviewDismissed", batch: "rv_other0000" }], r)).toEqual(r);
    expect(run([{ type: "ui.projectChanged", project: "/Users/me/other" }], r)).toBeNull();
    expect(run([{ type: "ui.projectChanged", project: P }], r)).toEqual(r);
    expect(run([{ type: "runner.hello" }], r)).toBeNull();
    expect(run([{ type: "app.runner_down" }], r)).toBeNull();
  });
});

describe("the page's model", () => {
  test("the review lives on the model, and a refused Fix it is said on its card, not as Home's error", () => {
    let m = initial();
    for (const e of [batch(), ok(), { type: "ui.reviewFixAsked", batch: "rv_4f2a9c01de" }, { type: "ui.reviewFixSent", batch: "rv_4f2a9c01de" }]) m = reduce(m, e as never);
    expect(m.review?.fix).toBe("sent");
    m = reduce(m, { type: "protocol.error", reason: "Fixing is not available here.", failed: "review.fix" } as never);
    expect(m.error).toBeNull();
    expect(m.review?.note).toBe("Fixing is not available here.");
    // With no card, a refusal is Home's error as before.
    expect(reduce(initial(), { type: "protocol.error", reason: "Fixing is not available here.", failed: "review.fix" } as never).error).toBeTruthy();
  });
  test("shown only for the open folder, with reviews on and Flow on", () => {
    const r = run([batch()]);
    expect(reviewShown(r, P, "ask", true)).toBe(true);
    expect(reviewShown(r, `${P}/`, "automatic", true)).toBe(true);
    expect(reviewShown(r, "/Users/me/other", "ask", true)).toBe(false);
    expect(reviewShown(r, P, "off", true)).toBe(false);
    expect(reviewShown(r, P, "ask", false)).toBe(false);
    expect(reviewShown(null, P, "ask", true)).toBe(false);
    expect(reviewShown(r, "", "ask", true)).toBe(false);
  });
});

describe("the words and marks", () => {
  test("each rating has its words and its own drawing, never colour alone", () => {
    const icons = new Set<string>();
    for (const k of REVIEW_RATINGS) {
      const l = ratingLook(k);
      expect(l.words).toBe(S.review.rating[k]);
      icons.add(l.icon);
    }
    expect(icons.size).toBe(3);
    expect(ratingLook("safe").tone).toBe("good");
    expect(ratingLook("worth_a_look").tone).toBe("mixed");
    expect(ratingLook("stop").tone).toBe("bad");
  });
  test("every touch, check and reason has plain words, sentence case, no em dash", () => {
    for (const t of REVIEW_TOUCHES) expect(S.review.touches[t]).toBeTruthy();
    for (const c of REVIEW_CHECKS) expect(checksLook(c).label).toBeTruthy();
    const all = JSON.stringify(S.review) + JSON.stringify(S.set["review.mode"]) + JSON.stringify(S.set["review.quietSeconds"]);
    expect(all).not.toMatch(/—|[A-Z]{3,}/);
  });
  test("checks: passed and failed are marks, not run and could not tell are dashed", () => {
    expect(checksLook("passed").kind).toBe("pass");
    expect(checksLook("failed").kind).toBe("fail");
    expect(checksLook("not_run").kind).toBe("notRun");
    expect(checksLook("unknown").kind).toBe("notRun");
  });
  test("the text Send back copies is hidden again for anything that looks like a key, and is nothing with no review", () => {
    const r = run([batch(), ok({ sendBack: "Rating: stop.\nThe key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH is in src/pay.ts." })])!;
    const t = sendBackCopy(r);
    expect(t).toContain("Rating: stop.");
    expect(t).not.toContain("sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH");
    expect(sendBackCopy(run([batch()]))).toBe("");
    expect(sendBackCopy(null)).toBe("");
  });
  test("Fix it is offered after a review that ran and found something, never on a safe one or while waiting", () => {
    expect(canFix(run([batch(), ok()]))).toBe(true);
    expect(canFix(run([batch(), ok({ rating: "worth_a_look" })]))).toBe(true);
    expect(canFix(run([batch(), ok({ rating: "safe", reasons: [] })]))).toBe(false);
    expect(canFix(run([batch()]))).toBe(false);
    expect(canFix(run([batch(), ok(), { type: "ui.reviewFixAsked", batch: "rv_4f2a9c01de" }, { type: "ui.reviewFixSent", batch: "rv_4f2a9c01de" }]))).toBe(false);
  });
  test("the list on the left stamps the review: new while ready, working while it runs, needs you on a stop or worth a look", () => {
    expect(reviewStamp(run([batch()])!)).toBe("new");
    expect(reviewStamp(run([batch(), { type: "review.started", project: P, batch: "rv_4f2a9c01de", proof: false }])!)).toBe("working");
    expect(reviewStamp(run([batch(), ok()])!)).toBe("needsYou");
    expect(reviewStamp(run([batch(), ok({ rating: "worth_a_look" })])!)).toBe("needsYou");
    expect(reviewStamp(run([batch(), ok({ rating: "safe", reasons: [] })])!)).toBe("new");
  });
});

describe("the commands", () => {
  test("each names the project and the batch; Fix it carries the task's agent, model and budget", () => {
    const now = reviewNow(P, "rv_4f2a9c01de", true);
    expect(now).toMatchObject({ v: 1, type: "review.now", project: P, batch: "rv_4f2a9c01de", proof: true });
    expect(reviewNow(P)).not.toHaveProperty("batch");
    expect(reviewNow(P, "rv_4f2a9c01de")).not.toHaveProperty("proof");
    expect(reviewDismiss(P, "rv_4f2a9c01de")).toMatchObject({ v: 1, type: "review.dismiss", project: P, batch: "rv_4f2a9c01de" });
    const fix = reviewFix(P, "rv_4f2a9c01de") as Record<string, unknown>;
    expect(fix).toMatchObject({ v: 1, type: "review.fix", project: P, batch: "rv_4f2a9c01de", agent: "builder-1" });
    expect(typeof fix.model).toBe("string");
    expect(fix.budgetUsd).toBeGreaterThan(0);
    for (const c of [now, fix]) expect(typeof (c as { id?: unknown }).id).toBe("string");
  });
});

describe("the card on Home", () => {
  const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
  const view = readFileSync(new URL("./reviewCard.tsx", import.meta.url), "utf8");
  const side = readFileSync(new URL("./homeSide.tsx", import.meta.url), "utf8");
  test("Home draws it on Now, for the open folder, with reviews and Flow on", () => {
    expect(card).toContain('show("review")');
    expect(card).toMatch(/reviewShown\(m\.review, project, reviewMode, groups\.on\("review"\)\)/);
  });
  test("Fix it opens a question that says a safety copy is kept first, and its yes is the one gel button", () => {
    expect(view).toContain("<ConfirmStep");
    expect(view).toContain("S.review.fixSure");
    expect(view).toMatch(/className="btn primary gel"[^\n]*onFix/);
    expect(S.review.fixSure).toMatch(/safety copy/);
    expect(S.review.fixSure).toMatch(/Undo/);
  });
  test("Send back copies, and says it is copied", () => {
    expect(view).toContain("sendBackCopy(r)");
    expect(S.review.copied).toMatch(/Copied/);
  });
  test("the list on the left has a review item with its stamp, which opens Now", () => {
    expect(side).toContain("S.review.sideItem");
    expect(side).toContain("<Stamp kind={reviewStamp(review)} dot />");
  });
  test("files in mono, through the changes card", () => {
    expect(view).toContain("<ChangesCard");
  });
});
