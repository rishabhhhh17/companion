// M77b, what the 10 Nov 2026 real run found (docs/status/2026-11-10-real-run.md): the pages' side. Failed checks are one
// plain line with the test runner's output only behind Details, and the notes for other AI tools that changed while a task
// ran are named on its receipt and in its Undo question as staying.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initial, reduce, type Model } from "./model.ts";
import { reviewReduce } from "./review.ts";
import { S } from "./strings.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const ev = (m: Model, e: Record<string, unknown>) => reduce(m, { v: 1, id: "e", ...e } as never);
const fixture = (id: string) => JSON.parse(read("../../protocol/fixtures/events.jsonl").split("\n").find((l) => l.includes(`"id":"${id}"`))!);

describe("failed checks: the plain line, the output behind Details", () => {
  const e = fixture("m77b1");
  const card = () => reviewReduce(reviewReduce(null, { v: 1, id: "b", type: "review.batch", project: e.project, batch: e.batch, files: e.files, count: 1, capped: false, secretFiles: [], auto: false } as never), e as never);
  test("the shared fixture's review keeps the plain note and its output apart", () => {
    const r = card()!.result!;
    expect(r.checksNote).toBe("The tests did not pass. The test file test/price.test.js could not run, because of a problem in price.js, line 3.");
    expect(r.checksNote).not.toMatch(/failureType|exitCode|1\.\.3|# tests/);
    expect(r.checksDetail).toContain("failureType");
  });
  test("the output is kept only for checks that failed, with secrets hidden again", () => {
    const passed = reviewReduce(reviewReduce(null, { v: 1, id: "b", type: "review.batch", project: e.project, batch: e.batch, files: e.files, count: 1, capped: false, secretFiles: [], auto: false } as never), { ...e, checks: "passed", reasons: [], rating: "safe" } as never)!;
    expect(passed.result!.checksDetail).toBeUndefined();
    const key = "sk_live_51HabcdefghijklmnopQRSTUVwx";
    const leaky = reviewReduce(reviewReduce(null, { v: 1, id: "b", type: "review.batch", project: e.project, batch: e.batch, files: e.files, count: 1, capped: false, secretFiles: [], auto: false } as never), { ...e, checksDetail: `printed ${key}` } as never)!;
    expect(leaky.result!.checksDetail).not.toContain(key);
  });
  test("the card draws the output with the shared Details disclosure, under the plain note", () => {
    const src = read("./reviewCard.tsx");
    expect(src).toContain('import { CheckDetail } from "./checkDetail.tsx";');
    expect(src.match(/res\?\.checksDetail && <CheckDetail parts=\{\{ summary: "", place: "", raw: res\.checksDetail \}\} \/>/g)).toHaveLength(2);
  });
});

describe("the notes for other AI tools stay after Undo, and the receipt says so", () => {
  const rec = fixture("m77b2");
  test("the shared fixture's receipt keeps the two names; anything else is dropped", () => {
    expect(ev(initial(), rec).receipt?.notesStay).toEqual(["AGENTS.md", "CLAUDE.md"]);
    expect(ev(initial(), { ...rec, notesStay: ["../secret", "AGENTS.md"] }).receipt?.notesStay).toEqual(["AGENTS.md"]);
    expect(ev(initial(), { ...rec, notesStay: undefined }).receipt?.notesStay).toBeUndefined();
  });
  test("the words are plain, with no long dash", () => {
    expect(S.guard.notesStay(["AGENTS.md", "CLAUDE.md"])).toBe("Your notes for other AI tools (AGENTS.md, CLAUDE.md) stay.");
    expect(S.guard.notesStay(["AGENTS.md"])).toBe("Your notes for other AI tools (AGENTS.md) stay.");
    expect(S.guard.notesStay(["AGENTS.md"])).not.toMatch(/—|–/);
  });
  test("the receipt, its Undo question, the last fix's Undo on Now and the practice's Undo all say it", () => {
    const card = read("./card.tsx"), practice = read("./practicePanel.tsx");
    expect(card).toContain("{m.receipt.notesStay?.length ? <div className=\"line muted\">{S.guard.notesStay(m.receipt.notesStay)}</div> : null}");
    expect(card).toContain("{m.receipt.notesStay?.length ? <div>{S.guard.notesStay(m.receipt.notesStay)}</div> : null}<div className=\"muted\">{undoLimitsLine(m.receipt.notUndoable)}</div>");
    expect(card).toContain("m.receipt?.checkpoint === cp && m.receipt.notesStay?.length");
    expect(practice.match(/S\.guard\.notesStay\(r\.notesStay\)/g)).toHaveLength(2);
  });
});
