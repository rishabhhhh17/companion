// M106, Claude Code's background jobs (docs/milestones/M106-background-jobs.md): the pages' side. A batch from a job's own
// folder carries the job's name (review.batch and review.result `job`), its headline says which job, and the overlap note
// is said in one plain line per file. A job card offers neither Fix it nor Put these files back (they would act on the
// project, not the job). Pure; the shared fixtures m106e1 and m106e2.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseEvent } from "../../protocol/index.ts";
import { reviewLead } from "./homeHero.ts";
import { reviewHead } from "./reviewHead.ts";
import { canFix, changedLead, jobFile, overlapLines, reviewReduce } from "./review.ts";
import { helloFact } from "./notchHello.ts";
import { undoOffered } from "./reviewUndo.ts";
import { placeOf } from "./settingsPages.ts";
import { S } from "./strings.ts";

const P = "/Users/me/shop";
const lines = readFileSync(new URL("../../protocol/fixtures/events.jsonl", import.meta.url), "utf8").split("\n");
const fixture = (id: string) => ({ ...JSON.parse(lines.find((l) => l.includes(`"id":"${id}"`))!), project: P });

describe("the protocol", () => {
  test("the fixtures keep to it; a job's name and the overlap note are checked", () => {
    for (const id of ["m106e1", "m106e2"]) expect(parseEvent(JSON.stringify(fixture(id))), id).toMatchObject({ ok: true });
    for (const job of ["", ".hidden", "../x", "a b", "a/b", "x".repeat(65), 7]) expect(parseEvent(JSON.stringify({ ...fixture("m106e1"), job })).ok, String(job)).toBe(false);
    for (const overlap of [[], [{ file: "/etc/passwd", jobs: ["a"] }], [{ file: "src/a.ts", jobs: [] }], [{ file: "src/a.ts", jobs: ["../b"] }], [{ file: "src/a.ts", jobs: ["b"], text: "x" }],
      Array.from({ length: 6 }, (_, i) => ({ file: `f${i}.ts`, jobs: ["b"] }))]) expect(parseEvent(JSON.stringify({ ...fixture("m106e2"), overlap })).ok, JSON.stringify(overlap)).toBe(false);
  });
});

describe("the card carries the job", () => {
  test("review.batch and review.result name the job; an unknown shape is left out", () => {
    const b = reviewReduce(null, fixture("m106e1"));
    expect(b?.job).toBe("fix-login");
    const r = reviewReduce(b, fixture("m106e2"));
    expect(r?.job).toBe("fix-login");
    expect(r?.result?.overlap).toEqual([{ file: "src/login.tsx", jobs: ["new-header"] }]);
    expect(reviewReduce(null, { ...fixture("m106e1"), job: "../evil" })?.job).toBeUndefined();
    const { job: _j, ...plain } = fixture("m106e1");
    expect(reviewReduce(null, plain)?.job).toBeUndefined();
  });
  test("a batch of the project's own folder after a job's says no job", () => {
    const b = reviewReduce(null, fixture("m106e1"));
    const { job: _j, ...plain } = fixture("m106e1");
    expect(reviewReduce(b, { ...plain, batch: "rv_6a1b2c3d4f" })?.job).toBeUndefined();
  });
  test("the headline says which job, in plain words", () => {
    const b = reviewReduce(null, fixture("m106e1"))!;
    expect(changedLead(b)).toBe(S.review.jobLead("fix-login", 2));
    expect(S.review.jobLead("fix-login", 2)).toBe("2 files changed in Claude's background job “fix-login”.");
    expect(S.review.jobLead("x", 1)).toBe("1 file changed in Claude's background job “x”.");
    expect(reviewLead(b, P)?.headline).toBe(S.review.jobLead("fix-login", 2));
    const { job: _j, ...plain } = fixture("m106e1");
    expect(changedLead(reviewReduce(null, plain)!)).toBe(S.review.lead(2));
  });
  test("a job's review that found something still leads Now, though it offers no Fix it", () => {
    const r = reviewReduce(reviewReduce(null, fixture("m106e1")), fixture("m106e2"))!;
    expect(reviewLead(r, P)).toMatchObject({ headline: S.review.rating.worth_a_look, line: S.review.jobLead("fix-login", 2) });
    // The line under the presses speaks of Copy for my AI, never of a fix the card does not offer.
    // Review findings: it names the job it hands the review to.
    expect(reviewHead(r)?.reassure).toBe(S.review.jobReassure("fix-login"));
    expect(S.review.jobReassure("fix-login")).toBe("Copy for my AI gives this review to “fix-login”. Nothing is merged, and your project's history is not touched.");
  });
  test("a job card offers no Fix it and no Put these files back; Copy for my AI stays", () => {
    const r = reviewReduce(reviewReduce(null, fixture("m106e1")), fixture("m106e2"))!;
    expect(r.result?.rating).toBe("worth_a_look");
    expect(canFix(r)).toBe(false);
    expect(undoOffered(r)).toBe(false);
    const { job: _a, ...b0 } = fixture("m106e1"), { job: _b, overlap: _o, ...r0 } = fixture("m106e2");
    const plain = reviewReduce(reviewReduce(null, b0), r0)!;
    expect(canFix(plain)).toBe(true);
    expect(undoOffered(plain)).toBe(true);
  });
});

describe("the overlap note", () => {
  test("one plain line per file, naming both jobs, and what to do", () => {
    // Review findings: the file's own name in the line (the whole path in its title), and past two jobs, a count.
    const r = reviewReduce(reviewReduce(null, fixture("m106e1")), fixture("m106e2"))!;
    expect(overlapLines(r)).toEqual([{ file: "src/login.tsx", text: "Two background jobs changed login.tsx (“fix-login” and “new-header”). Merge one, then check again." }]);
    const more = reviewReduce(reviewReduce(null, fixture("m106e1")), { ...fixture("m106e2"), overlap: [{ file: "a.ts", jobs: ["b", "c"] }] })!;
    expect(overlapLines(more).map((l) => l.text)).toEqual(["Three background jobs changed a.ts (“fix-login” and 2 other jobs). Merge one, then check again."]);
    const deep = "packages/web-app/src/features/authentication/components/SignInWithEmailAndPasswordForm.tsx";
    const worst = reviewReduce(reviewReduce(null, fixture("m106e1")), { ...fixture("m106e2"), overlap: [{ file: deep, jobs: ["b"] }] })!;
    expect(overlapLines(worst)).toEqual([{ file: deep, text: "Two background jobs changed SignInWithEmailAndPasswordForm.tsx (“fix-login” and “b”). Merge one, then check again." }]);
    const { overlap: _o, ...none } = fixture("m106e2");
    expect(overlapLines(reviewReduce(reviewReduce(null, fixture("m106e1")), none)!)).toEqual([]);
    for (const l of [...overlapLines(more), ...overlapLines(worst)]) expect(l.text).not.toMatch(/—|–/);
  });
  test("the setting reads in Settings with a short line, and no dash", () => {
    const set = S.set as Record<string, { label: string; help: string }>, short = S.short as Record<string, string>;
    expect(short["review.jobs"]).toBeTruthy();
    expect(placeOf("review.jobs")).toMatchObject({ topic: "more.fixing.review" });
    expect(set["review.jobs"].label).toBe("Review Claude's background jobs");
    expect(set["review.jobs"].help).not.toMatch(/—|–/);
  });
});

describe("review findings: the job stays named, in the job's own folder", () => {
  test("a file of a job's batch is opened and pointed at in the job's own folder", () => {
    const b = reviewReduce(null, fixture("m106e1"))!;
    expect(jobFile(b, "src/login.tsx")).toBe(".claude/worktrees/fix-login/src/login.tsx");
    const { job: _j, ...plain } = fixture("m106e1");
    expect(jobFile(reviewReduce(null, plain)!, "src/login.tsx")).toBe("src/login.tsx");
  });
  test("the key warning on a job's card names the job under its headline", () => {
    const b = reviewReduce(null, { ...fixture("m106e1"), keys: [{ file: "src/login.tsx", line: 3 }] })!;
    expect(reviewLead(b, P)?.line).toBe(S.review.jobRiskyLine("fix-login", 2, 1));
    expect(S.review.jobRiskyLine("fix-login", 2, 1)).toBe("In Claude's background job “fix-login”. 2 files changed. One looks risky.");
  });
  test("the words after a review say where, and how many other jobs wait", () => {
    expect(S.review.jobWhere("x")).toBe("In Claude's background job “x”.");
    expect(S.review.jobsWaiting(1)).toBe("1 more background job waits for a review.");
    expect(S.review.jobsWaiting(2)).toBe("2 more background jobs wait for a review.");
    const b = reviewReduce(null, { ...fixture("m106e1"), waiting: 2 })!;
    expect(b.waiting).toBe(2);
    expect(reviewReduce(null, { ...fixture("m106e1"), waiting: -1 })!.waiting).toBeUndefined();
    expect(reviewReduce(reviewReduce(null, { ...fixture("m106e1"), waiting: 2 }), fixture("m106e2"))!.waiting).toBe(2);
    expect(parseEvent(JSON.stringify({ ...fixture("m106e1"), waiting: 2 })).ok).toBe(true);
    expect(parseEvent(JSON.stringify({ ...fixture("m106e1"), waiting: "2" })).ok).toBe(false);
  });
  test("the hello says the changes are in a background job", () => {
    const m = { runnerUp: true, approvals: [], folder: P, review: reviewReduce(null, fixture("m106e1")) } as never;
    expect(helloFact(m, Date.now())).toBe(S.hello.jobChanges("shop", 2));
    expect(S.hello.jobChanges("shop", 2)).toBe("shop has 2 changes to review in a background job");
  });
});
