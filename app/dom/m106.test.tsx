// M106, Claude Code's background jobs (docs/milestones/M106-background-jobs.md), rendered: the card's headline says which
// job, the overlap note is one plain line, Fix it and Put these files back are not offered on a job's card, and Copy for my
// AI and Looks fine still are. The worst case (a long job name, a deep file, three jobs) wraps instead of spilling.
import { describe, expect, test } from "bun:test";
import { PROJECT, hasButton, press, renderHome, runner, app } from "./render.tsx";
import { S } from "../src/strings.ts";

const B = "rv_6a1b2c3d4e";
const files = [{ file: "src/login.tsx", kind: "modified" }, { file: "src/header.tsx", kind: "added" }];
const batch = { type: "review.batch", project: PROJECT, batch: B, files, count: 2, capped: false, secretFiles: [], auto: false, job: "fix-login" };
const result = { type: "review.result", project: PROJECT, batch: B, ok: true, rating: "worth_a_look", touches: ["sign_in"], summary: "The sign in page now shows a remember me box.", notes: [],
  reasons: [{ kind: "model_concern", file: "src/login.tsx", line: 4, say: "The remember me box keeps people signed in for a year.", lines: [{ n: 4, text: "const remember = true;" }] }],
  files, count: 2, capped: false, secretFiles: [], checks: "passed", sendBack: "A review of the changes found this.", lane: "none", usdEstimate: 0, job: "fix-login",
  overlap: [{ file: "src/login.tsx", jobs: ["new-header"] }] };
const text = () => document.body.textContent ?? "";

describe("a background job's card", () => {
  test("before the review, the headline names the job and Review them is there", async () => {
    await renderHome();
    await runner(batch);
    expect(text()).toContain(S.review.jobLead("fix-login", 2));
    expect(text()).not.toContain(S.review.lead(2));
    expect(hasButton(S.review.reviewNow)).toBe(true);
  });
  test("after it, the overlap line shows, Fix it and Put back are not offered, Looks fine works", async () => {
    await renderHome();
    await runner(batch, result);
    expect(text()).toContain(S.review.jobOverlap("src/login.tsx", ["fix-login", "new-header"]));
    expect(hasButton(S.review.fix)).toBe(false);
    expect(hasButton(S.reviewUndo.button)).toBe(false);
    expect(document.querySelector(".rv-overlap")?.getAttribute("title")).toBe("src/login.tsx");
    // Review findings: the headline is the finding now, so the card still says which job, and hands the review to it by name.
    expect(text()).toContain(S.review.jobWhere("fix-login"));
    expect(text()).toContain(S.review.jobReassure("fix-login"));
  });
  test("a card of the project's own folder still offers Fix it and Put back, with no overlap line", async () => {
    await renderHome();
    const { job: _a, ...b0 } = batch, { job: _b, overlap: _o, ...r0 } = result;
    await runner(b0, r0);
    expect(text()).not.toContain("background job");
    expect(hasButton(S.review.fix)).toBe(true);
    expect(hasButton(S.reviewUndo.button)).toBe(true);
    expect(document.querySelector(".rv-overlap")).toBeNull();
  });
  test("Skip this on a job's waiting card sends the dismiss for that batch", async () => {
    await renderHome();
    await runner(batch);
    await press(S.review.skipThis);
    expect(app.sent().filter((c) => c.type === "review.dismiss")).toEqual([expect.objectContaining({ project: PROJECT, batch: B })]);
  });
  test("review findings: a key warning on a job's card offers no Fix it, keeps Copy for my AI, and names the job", async () => {
    await renderHome({ settings: { "review.keyWarning": true } });
    await runner({ ...batch, keys: [{ file: "src/login.tsx", line: 3 }] });
    expect(hasButton(S.review.fix)).toBe(false);
    expect(hasButton(S.fixRun.copyForAi)).toBe(true);
    expect(text()).toContain(S.review.jobRiskyLine("fix-login", 2, 1));
    expect(text()).not.toContain(S.homeNow.reassure);
    // The project's own key warning still has its Fix it.
    const { job: _j, ...own } = batch;
    await renderHome({ settings: { "review.keyWarning": true } });
    await runner({ ...own, batch: "rv_6a1b2c3d4f", keys: [{ file: "src/login.tsx", line: 3 }] });
    expect(hasButton(S.review.fix)).toBe(true);
  });
  test("review findings: Walk me through it opens and points at the file in the job's own folder", async () => {
    await renderHome();
    await runner(batch, result);
    await press(S.tour.button);
    await press(S.tour.open);
    expect(app.invoked("open_in_editor").at(-1)?.args).toMatchObject({ project: PROJECT, file: ".claude/worktrees/fix-login/src/login.tsx", line: 4 });
    await press(S.tour.circle);
    const p = app.invoked("point_problem").at(-1)?.args as { project: string; problem: { file: string; line: number } };
    expect(p.project).toBe(PROJECT);
    expect(p.problem).toMatchObject({ file: ".claude/worktrees/fix-login/src/login.tsx", line: 4 });
  });
  test("review findings: the card says how many other jobs wait behind it, and the result's count replaces it", async () => {
    await renderHome();
    await runner({ ...batch, waiting: 2 });
    expect(text()).toContain(S.review.jobsWaiting(2));
    await runner({ ...result, waiting: 1 });
    expect(text()).toContain(S.review.jobsWaiting(1));
    expect(text()).not.toContain(S.review.jobsWaiting(2));
    await runner({ ...result, waiting: 0 });
    expect(document.querySelector(".rv-waiting")).toBeNull();
  });
  test("review findings: a safe job review still says which job, under the review's own summary", async () => {
    await renderHome();
    const one = [{ file: "a.ts", kind: "modified" }];
    await runner({ ...batch, job: "x", files: one, count: 1 }, { ...result, job: "x", rating: "safe", touches: [], reasons: [], files: one, count: 1, summary: "1 file changed: a.ts.", overlap: undefined });
    expect(text()).toContain(S.review.jobWhere("x"));
  });
});
