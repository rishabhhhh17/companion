// M101: Put these files back, rendered and clicked through. Only on a review that ran; the press looks first and nothing is
// put back before the yes; the confirm step names the files, the later edits and the settings files; a commit shows the
// command with Copy and nothing runs it; History's row offers it, greys it with why once the copy is gone.
import { describe, expect, test } from "bun:test";
import { PROJECT, act, app, fireEvent, hasButton, press, renderHome, runner, screen, settle } from "./render.tsx";
import { S } from "../src/strings.ts";
import { _resetForTests, startSettings } from "../src/settingsStore.ts";

const B = "rv_4f2a9c01de";
const batch = { type: "review.batch", project: PROJECT, batch: B, files: [{ file: "src/pay.ts", kind: "modified" }, { file: "src/App.tsx", kind: "modified" }], count: 2, capped: false, secretFiles: [], auto: false };
const result = { type: "review.result", project: PROJECT, batch: B, ok: true, rating: "worth_a_look", touches: ["payments"], summary: "The payment page now starts a Stripe checkout.", notes: [], reasons: [],
  files: batch.files, count: 2, capped: false, secretFiles: [], checks: "not_run", sendBack: "A review of the changes found this.", lane: "none", usdEstimate: 0 };
const plan = { type: "review.undoPlan", project: PROJECT, batch: B, ok: true, files: ["src/App.tsx"], count: 1, later: ["src/pay.ts"], env: [".env"], cannot: [], committed: true };
const sent = (t: string) => app.sent().filter((c) => c.type === t);

describe("on the review card", () => {
  test("not there while the changes wait to be reviewed", async () => {
    await renderHome();
    await runner(batch);
    expect(hasButton(S.reviewUndo.button)).toBe(false);
  });

  test("the press looks first, the confirm step names everything, and Keep them sends nothing", async () => {
    await renderHome();
    await runner(batch, result);
    await press(S.reviewUndo.button);
    expect(sent("review.undoPlan")).toEqual([expect.objectContaining({ project: PROJECT, batch: B })]);
    expect(sent("review.undo")).toEqual([]);
    expect(document.body.textContent).toContain(S.reviewUndo.looking);
    await runner(plan);
    const text = document.body.textContent ?? "";
    expect(text).toContain(S.reviewUndo.sure(1));
    expect(text).toContain("src/App.tsx");
    expect(text).toContain(S.reviewUndo.later(1));
    expect(text).toContain(S.reviewUndo.env(".env"));
    expect(text).toContain(S.reviewUndo.commitBefore);
    expect(text).toContain(S.fix.undoLimits);
    await press(S.reviewUndo.no);
    expect(sent("review.undo")).toEqual([]);
    expect(hasButton(S.reviewUndo.button)).toBe(true);
  });

  test("Put those back too goes with the yes; the result shows the command with Copy, and nothing runs it", async () => {
    await renderHome();
    await runner(batch, result);
    await press(S.reviewUndo.button);
    await runner(plan);
    const box = screen.getByRole("checkbox", { name: S.reviewUndo.laterToo });
    await act(async () => { fireEvent.click(box); });
    expect((box as HTMLInputElement).checked).toBe(true);
    expect(document.body.textContent).toContain(S.reviewUndo.laterOn);
    await press(S.reviewUndo.yes);
    expect(sent("review.undo")).toEqual([expect.objectContaining({ batch: B, confirm: true, overwrite: ["src/pay.ts"] })]);
    expect(document.body.textContent).toContain(S.reviewUndo.working);
    await runner({ type: "review.undone", project: PROJECT, batch: B, ok: true, reverted: ["src/App.tsx", "src/pay.ts"], kept: [], saved: ["src/pay.ts"], env: [".env"], cannot: [], committed: true, safety: "cp_0061" });
    const text = document.body.textContent ?? "";
    expect(text).toContain(S.reviewUndo.done(2));
    expect(text).toContain(S.reviewUndo.doneSaved);
    expect(text).toContain(S.reviewUndo.command);
    await press(S.reviewUndo.copy);
    expect(app.invoked("copy_text").map((c) => (c.args as { text?: string }).text)).toContain(S.reviewUndo.command);
    // Only shown: no command of any kind was sent to run it.
    expect(app.sentTypes().some((t) => /shell|exec|git/i.test(t))).toBe(false);
    await press(S.reviewUndo.close);
    await settle();
    expect(hasButton(S.reviewUndo.button)).toBe(false);
  });

  test("a refusal says why with a next step, and the button stays to try again", async () => {
    await renderHome();
    await runner(batch, result);
    await press(S.reviewUndo.button);
    await runner({ type: "review.undoPlan", project: PROJECT, batch: B, ok: false, why: "writing" });
    expect(document.body.textContent).toContain(S.reviewUndo.why.writing);
    expect(hasButton(S.reviewUndo.button)).toBe(true);
  });
});

describe("in History", () => {
  const at = new Date(Date.now() - 120_000).toISOString();
  const row = (id: number, b: string, undo?: string) => ({ id, at, count: 1, files: ["src/App.tsx"], rating: "safe", touches: [], checks: "not_run", did: "looks_fine", summary: `Change ${id}`, batch: b, ...(undo ? { undo } : {}) });
  const list = { type: "tasks.list", project: PROJECT, tasks: [], reviews: [row(1, "rv_00000000a1", "ok"), row(2, "rv_00000000a2", "gone"), row(3, "rv_00000000a3", "done")] };
  test("offered while the copy is kept, greyed with why once it is gone, and said as put back once done", async () => {
    await renderHome();
    await press("History");
    await runner(list);
    const ok = screen.getByRole("button", { name: `${S.reviewUndo.button}: ${S.review.rating.safe}: Change 1` }) as HTMLButtonElement;
    expect(ok.disabled).toBe(false);
    const gone = screen.getByRole("button", { name: `${S.reviewUndo.button}: ${S.reviewUndo.goneLine}` }) as HTMLButtonElement;
    expect(gone.disabled).toBe(true);
    expect(document.body.textContent).toContain(S.reviewUndo.goneLine);
    expect(document.body.textContent).toContain(S.reviewUndo.doneMark);
    await press(`${S.reviewUndo.button}: ${S.review.rating.safe}: Change 1`);
    expect(sent("review.undoPlan")).toEqual([expect.objectContaining({ batch: "rv_00000000a1" })]);
    await runner({ type: "review.undoPlan", project: PROJECT, batch: "rv_00000000a1", ok: true, files: ["src/App.tsx"], count: 1, later: [], env: [], cannot: [], committed: false });
    expect(document.body.textContent).toContain(S.reviewUndo.sure(1));
    await press(S.reviewUndo.yes);
    expect(sent("review.undo")).toEqual([expect.objectContaining({ batch: "rv_00000000a1", confirm: true })]);
  });
});

describe("the review's own words step aside once it is answered (the M101 review)", () => {
  const found = { ...result, rating: "worth_a_look", reasons: [{ kind: "removed_still_used", file: "src/App.tsx", line: 12, say: "src/utils/date.ts was removed, but src/App.tsx still uses it at line 12." }] };
  const card = () => document.getElementById("home-review") ?? document.querySelector("section.review");
  const quiet = async () => { await renderHome({ settings: { "review.whenNothing": "closeQuietly" } }); await act(async () => { _resetForTests(); startSettings(); }); await settle(); };
  test("(the control) a safe card set to close quietly does close by itself when nothing is open", async () => {
    const { CLOSE_QUIETLY_MS } = await import("../src/review.ts");
    await quiet();
    await runner(batch, { ...result, rating: "safe" });
    await settle(CLOSE_QUIETLY_MS + 400);
    expect(sent("review.dismiss")).toEqual([expect.objectContaining({ batch: B, how: "quiet" })]);
  });
  test("a safe card set to close quietly stays while its Put these files back is open", async () => {
    const { CLOSE_QUIETLY_MS } = await import("../src/review.ts");
    await quiet();
    await runner(batch, { ...result, rating: "safe" });
    await press(S.reviewUndo.button);
    await runner({ ...plan, later: [], env: [], committed: false });
    await settle(CLOSE_QUIETLY_MS + 400);
    expect(document.body.textContent).toContain(S.reviewUndo.sure(1));
    expect(hasButton(S.reviewUndo.yes)).toBe(true);
    expect(sent("review.dismiss")).toEqual([]);
  });

  test("once the files are back, the findings, the pointer and the waiting item are gone, and one line says why", async () => {
    await renderHome();
    await runner(batch, found);
    expect(card()?.querySelector(".code-point")).not.toBeNull();
    await press(S.reviewUndo.button);
    await runner({ ...plan, later: [], env: [], committed: false });
    await press(S.reviewUndo.yes);
    await runner({ type: "review.undone", project: PROJECT, batch: B, ok: true, reverted: ["src/App.tsx"], kept: [], saved: [], env: [], cannot: [], committed: false, safety: "cp_0061" });
    const c = card()!;
    expect(c.textContent).toContain(S.reviewUndo.done(1));
    expect(c.textContent).toContain(S.reviewUndo.noLongerApplies);
    expect(c.querySelector(".code-point")).toBeNull();
    expect(c.querySelector(".finding-ready-line, .finding-ready")).toBeNull();
    expect(c.querySelector(".finding-lead-parts")).toBeNull();
    expect(document.querySelector(".rv-others")).toBeNull();
    expect(document.querySelector(".side-review")).toBeNull();
  });

  test("Fix it's reassurance never sits under Put these files back", async () => {
    await renderHome();
    await runner(batch, found);
    const btn = screen.getByRole("button", { name: S.reviewUndo.button });
    const reassure = card()!.querySelector(".rv-reassure");
    if (reassure) expect(reassure.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Refused: the reason and the button, with no Fix it line next to them.
    await press(S.reviewUndo.button);
    await runner({ type: "review.undoPlan", project: PROJECT, batch: B, ok: false, why: "busy" });
    const again = screen.getByRole("button", { name: S.reviewUndo.button });
    const r2 = card()!.querySelector(".rv-reassure");
    if (r2) expect(r2.compareDocumentPosition(again) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test("when every file was changed again since, Put them back waits for Put those back too", async () => {
    await renderHome();
    await runner(batch, result);
    await press(S.reviewUndo.button);
    await runner({ ...plan, files: [], count: 0, later: ["src/pay.ts"], env: [], committed: false });
    expect(document.body.textContent).toContain(S.reviewUndo.onlyLater);
    expect(document.body.textContent).not.toContain("0 files");
    const yes = screen.getByRole("button", { name: S.reviewUndo.yes }) as HTMLButtonElement;
    expect(yes.disabled).toBe(true);
    await act(async () => { fireEvent.click(screen.getByRole("checkbox", { name: S.reviewUndo.laterToo })); });
    expect((screen.getByRole("button", { name: S.reviewUndo.yes }) as HTMLButtonElement).disabled).toBe(false);
    await press(S.reviewUndo.yes);
    expect(sent("review.undo")).toEqual([expect.objectContaining({ batch: B, overwrite: ["src/pay.ts"] })]);
  });

  test("a put back from History closes the Home card of the same change", async () => {
    await renderHome();
    await runner(batch, found);
    await press("History");
    const at = new Date(Date.now() - 60_000).toISOString();
    await runner({ type: "tasks.list", project: PROJECT, tasks: [], reviews: [{ id: 9, at, count: 2, files: ["src/App.tsx"], rating: "worth_a_look", touches: [], checks: "not_run", did: "open", summary: "Change 9", batch: B, undo: "ok" }] });
    await press(`${S.reviewUndo.button}: ${S.review.rating.worth_a_look}: Change 9`);
    await runner({ ...plan, later: [], env: [], committed: false });
    await press(S.reviewUndo.yes);
    await runner({ type: "review.undone", project: PROJECT, batch: B, ok: true, reverted: ["src/App.tsx"], kept: [], saved: [], env: [], cannot: [], committed: false, safety: "cp_0062" });
    expect(document.querySelector(".side-review")).toBeNull();
    await press("Now");
    expect(hasButton(S.reviewUndo.button)).toBe(false);
  });
});

describe("History's row after the M101 review", () => {
  test("a row with Put back shows one press on the right; a greyed one says why instead of looking pressable", async () => {
    const at = new Date(Date.now() - 120_000).toISOString();
    const row = (id: number, b: string, undo: string) => ({ id, at, count: 1, files: ["src/App.tsx"], rating: "safe", touches: [], checks: "not_run", did: "looks_fine", summary: `Change ${id}`, batch: b, undo });
    await renderHome();
    await press("History");
    await runner({ type: "tasks.list", project: PROJECT, tasks: [], reviews: [row(1, "rv_00000000b1", "ok"), row(2, "rv_00000000b2", "gone"), row(3, "rv_00000000b3", "done")] });
    const ok = screen.getByRole("button", { name: `${S.reviewUndo.button}: ${S.review.rating.safe}: Change 1` });
    const li = ok.closest("li")!;
    expect(li.textContent).not.toContain(S.history.reviewMark);
    const gone = screen.getByRole("button", { name: `${S.reviewUndo.button}: ${S.reviewUndo.goneLine}` });
    expect(gone.getAttribute("data-c")).toBeNull();
    expect(document.body.textContent).toContain(S.reviewUndo.doneMark);
    expect(S.reviewUndo.doneMark).not.toBe(S.reviewUndo.rowButton);
  });
});
