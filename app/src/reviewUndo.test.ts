// M101: Put these files back, as the page sees it (reviewUndo.ts). Offered only on a review that ran; the confirm step names
// the files, the later edits (kept unless Put those back too), the settings files and a commit; the yes carries the person's
// choice; a missing copy greys History's button; Stop everything closes an open question.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCommand, parseEvent, serialize } from "../../protocol/index.ts";
import { reviewUndo, reviewUndoPlan } from "./commands.ts";
import { initial, reduce, type Model } from "./model.ts";
import { reviewRowsOf } from "./reviewHistory.ts";
import { confirmLines, doneLines, nameList, reviewUndoReduce, undoCommand, undoOffered, whyLine, type ReviewUndo } from "./reviewUndo.ts";
import { closesQuietly, type ReviewCard } from "./review.ts";
import { S } from "./strings.ts";

const B = "rv_4f2a9c01de";
const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", project: "/p", batch: B, ...o });
const run = (events: Record<string, unknown>[], from: ReviewUndo | null = null) => events.reduce<ReviewUndo | null>((u, e) => reviewUndoReduce(u, e), from);
const asked = { type: "ui.reviewUndoAsked", project: "/p", batch: B, where: "card" };
const PLAN = ev({ type: "review.undoPlan", ok: true, files: ["src/App.tsx", "src/pay.ts"], count: 2, later: ["src/Header.tsx"], env: [".env"], cannot: [], committed: true });
const card = (o: Partial<ReviewCard> = {}): ReviewCard => ({ project: "/p", batch: B, stage: "reviewed", files: [], count: 1, capped: false, secretFiles: [], auto: false, proof: false, asked: false, fix: null, note: null,
  result: { rating: "safe", touches: [], summary: "", notes: [], reasons: [], checks: "not_run", sendBack: "x", lane: "none", usdEstimate: 0 }, ...o });

describe("the commands", () => {
  test("they are valid protocol; the yes always carries confirm, and the later files only when asked", () => {
    expect(parseCommand(serialize(reviewUndoPlan("/p", B))).ok).toBe(true);
    expect(parseCommand(serialize(reviewUndo("/p", B))).ok).toBe(true);
    expect(reviewUndo("/p", B)).toMatchObject({ type: "review.undo", confirm: true });
    expect(reviewUndo("/p", B)).not.toHaveProperty("overwrite");
    expect(reviewUndo("/p", B, ["a.ts"])).toMatchObject({ overwrite: ["a.ts"] });
  });
});

describe("when it is offered", () => {
  test("only once the review ran: never while the changes wait, while it runs, after Fix it started, or in the practice", () => {
    expect(undoOffered(card())).toBe(true);
    expect(undoOffered(card({ stage: "ready", result: null }))).toBe(false);
    expect(undoOffered(card({ stage: "reviewing", result: null }))).toBe(false);
    expect(undoOffered(card({ fix: "sent" }))).toBe(false);
    expect(undoOffered(card(), true)).toBe(false);
    expect(undoOffered(null)).toBe(false);
  });
});

describe("the quiet close (review.whenNothing)", () => {
  test("a safe card never closes by itself while its Put these files back is open, at any stage", () => {
    expect(closesQuietly(card(), "closeQuietly")).toBe(true);
    for (const events of [[asked], [asked, PLAN], [asked, PLAN, { type: "ui.reviewUndoSent" }], [asked, ev({ type: "review.undoPlan", ok: false, why: "busy" })]]) {
      expect(closesQuietly(card(), "closeQuietly", run(events))).toBe(false);
    }
    // Another batch's flow (a History row) does not hold this card open.
    expect(closesQuietly(card(), "closeQuietly", run([{ ...asked, batch: "rv_0000000001" }]))).toBe(true);
  });
});

describe("only files changed again since", () => {
  const ONLY_LATER = ev({ type: "review.undoPlan", ok: true, files: [], count: 0, later: ["src/Header.tsx"], env: [], cannot: [], committed: false });
  test("never asks to put 0 files back: the yes waits for Put those back too, and the line says why", () => {
    const u = run([asked, ONLY_LATER])!;
    expect(u.stage).toBe("confirm");
    const l = confirmLines(u.plan!, false);
    expect(l.sure).toBe(S.reviewUndo.onlyLater);
    expect(l.sure).not.toContain("0 files");
    expect(l.canYes).toBe(false);
    expect(undoCommand(u)).toBeNull();
    const on = run([{ type: "ui.reviewUndoOverwrite", on: true }], u)!;
    expect(confirmLines(on.plan!, true)).toMatchObject({ sure: S.reviewUndo.sure(1), canYes: true });
    expect(undoCommand(on)).toMatchObject({ overwrite: ["src/Header.tsx"] });
    // The usual case can always say yes.
    expect(confirmLines(run([asked, PLAN])!.plan!, false).canYes).toBe(true);
  });
});

describe("the flow", () => {
  test("the press looks first; the confirm step names the files, the later edits, the settings files and the commit", () => {
    const u = run([asked, PLAN])!;
    expect(u.stage).toBe("confirm");
    const l = confirmLines(u.plan!, false);
    expect(l.sure).toBe(S.reviewUndo.sure(2));
    expect(l.later).toBe(S.reviewUndo.later(1));
    expect(l.laterOn).toBeNull();
    expect(l.env).toContain(".env");
    expect(l.commit).toBe(S.reviewUndo.commitBefore);
    // Keep mine is the usual: the yes names no later file.
    expect(undoCommand(u)).not.toHaveProperty("overwrite");
  });
  test("Put those back too adds the later files to the yes, and says the person's versions are kept first", () => {
    const u = run([asked, PLAN, { type: "ui.reviewUndoOverwrite", on: true }])!;
    expect(u.overwrite).toBe(true);
    expect(confirmLines(u.plan!, true)).toMatchObject({ sure: S.reviewUndo.sure(3), laterOn: S.reviewUndo.laterOn });
    expect(undoCommand(u)).toMatchObject({ type: "review.undo", batch: B, confirm: true, overwrite: ["src/Header.tsx"] });
    expect(run([{ type: "ui.reviewUndoOverwrite", on: false }], u)!.overwrite).toBe(false);
  });
  test("the yes, then the result; the kept files and the commit are said", () => {
    const u = run([asked, PLAN, { type: "ui.reviewUndoSent" }, ev({ type: "review.undone", ok: true, reverted: ["src/App.tsx", "src/pay.ts"], kept: ["src/Header.tsx"], saved: [], env: [".env"], cannot: [], committed: true, safety: "cp_0061" })])!;
    expect(u.stage).toBe("done");
    expect(doneLines(u.done!)).toEqual([S.reviewUndo.done(2), S.reviewUndo.doneKept("src/Header.tsx"), S.reviewUndo.env(".env")]);
    expect(u.done!.committed).toBe(true);
  });
  test("each refusal is said in plain words, with a next step", () => {
    for (const why of ["open", "writing", "busy", "gone", "done", "nothing", "failed"]) {
      const u = run([asked, ev({ type: "review.undoPlan", ok: false, why })])!;
      expect(u).toMatchObject({ stage: "refused", why });
      expect(whyLine(u.why)).toBe(S.reviewUndo.why[why]);
    }
    expect(whyLine(undefined)).toBe(S.reviewUndo.why.failed);
    expect(S.reviewUndo.why.writing).toContain("Stop it first");
  });
  test("an answer for another batch or project, or a plan that breaks the protocol, is not taken as this one", () => {
    expect(run([asked, { ...PLAN, batch: "rv_0000000000" }])!.stage).toBe("looking");
    expect(run([asked, { ...PLAN, project: "/other" }])!.stage).toBe("looking");
    expect(run([asked, { ...PLAN, files: ["/etc/passwd"] }])).toMatchObject({ stage: "refused", why: "failed" });
    expect(run([asked, { ...PLAN, files: ["../up.ts"] }])).toMatchObject({ stage: "refused", why: "failed" });
  });
  test("Stop everything closes an open question; a put back already sent waits for its answer", () => {
    expect(run([asked, PLAN, { type: "app.stop_everything" }])).toBeNull();
    expect(run([asked, PLAN, { type: "ui.reviewUndoSent" }, { type: "app.stop_everything" }])!.stage).toBe("working");
    // A second press elsewhere never drops a put back that is running.
    expect(run([asked, PLAN, { type: "ui.reviewUndoSent" }, { ...asked, batch: "rv_0000000001" }])!.batch).toBe(B);
  });
  test("five names at most", () => {
    expect(nameList(["a", "b"])).toBe("a, b");
    expect(nameList(["a", "b", "c", "d", "e", "f", "g"])).toBe(`a, b, c, d, e ${S.history.reviewMore(2)}`);
  });
});

describe("History's rows", () => {
  const row = { id: 1, at: "2026-11-16T09:00:00.000Z", count: 1, files: ["a.ts"], rating: "safe", touches: [], checks: "not_run", did: "open", summary: "" };
  test("the batch and its state come through; a missing copy is gone (the button is greyed), a broken one is left out", () => {
    expect(reviewRowsOf([{ ...row, batch: B, undo: "ok" }])[0]).toMatchObject({ batch: B, undo: "ok" });
    expect(reviewRowsOf([{ ...row, batch: B, undo: "gone" }])[0]).toMatchObject({ undo: "gone" });
    expect(reviewRowsOf([{ ...row, batch: "nope", undo: "ok" }])[0]).not.toHaveProperty("batch");
    expect(reviewRowsOf([{ ...row, batch: B, undo: "maybe" }])[0]).not.toHaveProperty("undo");
  });
  test("through the model: a put back marks its History row done", () => {
    let m: Model = reduce(initial(), { v: 1, id: "t", type: "tasks.list", project: "/p", tasks: [], reviews: [{ ...row, batch: B, undo: "ok" }] } as never);
    m = reduce(m, { ...asked, where: "history" } as never);
    m = reduce(m, PLAN as never);
    expect(m.reviewUndo?.stage).toBe("confirm");
    m = reduce(m, { type: "ui.reviewUndoSent" } as never);
    m = reduce(m, ev({ type: "review.undone", ok: true, reverted: ["a.ts"] }) as never);
    expect(m.reviewUndo?.stage).toBe("done");
    expect(m.reviewHistory?.[0].undo).toBe("done");
  });
  const result = { type: "review.result", project: "/p", batch: B, ok: true, rating: "worth_a_look", touches: [], summary: "x", notes: [], reasons: [], files: [], count: 1, capped: false, secretFiles: [], checks: "not_run", sendBack: "x", lane: "none", usdEstimate: 0 };
  const home = () => [{ type: "review.batch", project: "/p", batch: B, files: [{ file: "a.ts", kind: "modified" }], count: 1, capped: false, secretFiles: [], auto: false }, result].reduce<Model>((m, e) => reduce(m, ev(e) as never), initial());
  test("a put back from History closes the Home card of the same batch: its findings no longer apply", () => {
    let m = home();
    expect(m.review?.batch).toBe(B);
    for (const e of [{ ...asked, where: "history" }, PLAN, { type: "ui.reviewUndoSent" }, ev({ type: "review.undone", ok: true, reverted: ["a.ts"] })]) m = reduce(m, e as never);
    expect(m.review ?? null).toBeNull();
    // A refusal leaves the card as it was.
    let k = home();
    for (const e of [{ ...asked, where: "history" }, PLAN, { type: "ui.reviewUndoSent" }, ev({ type: "review.undone", ok: false, why: "busy", reverted: [] })]) k = reduce(k, e as never);
    expect(k.review?.batch).toBe(B);
  });
  test("a put back from the card itself keeps the card, to show its result until Close", () => {
    let m = home();
    for (const e of [asked, PLAN, { type: "ui.reviewUndoSent" }, ev({ type: "review.undone", ok: true, reverted: ["a.ts"] })]) m = reduce(m, e as never);
    expect(m.review?.batch).toBe(B);
    expect(m.reviewUndo?.stage).toBe("done");
  });
});

describe("the commit's command", () => {
  test("the page shows the engine's own fixed text, which nothing runs", async () => {
    const { UNDO_COMMIT_COMMAND } = await import("../../runner/src/review/gitcommit.ts");
    expect(S.reviewUndo.command).toBe(UNDO_COMMIT_COMMAND);
  });
});

describe("the shared fixtures", () => {
  test("parse here and drive the flow", () => {
    const lines = readFileSync(join(import.meta.dir, "../../protocol/fixtures/events.jsonl"), "utf8").split("\n").filter((l) => l.includes('"m101e'));
    expect(lines.length).toBe(4);
    for (const l of lines) expect(parseEvent(l).ok).toBe(true);
    const [plan, refused, done, gone] = lines.map((l) => JSON.parse(l));
    expect(run([{ ...asked, project: "p_9f2c" }, plan])!.plan).toMatchObject({ count: 2, later: ["src/Header.tsx"], committed: true });
    expect(run([{ ...asked, project: "p_9f2c" }, refused])!.why).toBe("writing");
    expect(run([{ ...asked, project: "p_9f2c" }, plan, { type: "ui.reviewUndoSent" }, done])!.stage).toBe("done");
    expect(run([{ ...asked, project: "p_9f2c" }, plan, { type: "ui.reviewUndoSent" }, gone])!.why).toBe("gone");
  });
});
