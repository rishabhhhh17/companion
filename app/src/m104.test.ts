// M104, fixed and proven, finding by finding: the pages' side. A review's Fix it receipt carries each problem checked again
// by the rules; one still there makes the result Not fixed yet everywhere (the receipt, History), never proven. Pure.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { recheckedOf, recheckRows, recheckSummary, stillOf } from "./fixRecheck.ts";
import { historyFacts, initial, receiptVerdict, reduce } from "./model.ts";
import { verdictOf } from "./verdict.ts";
import { S } from "./strings.ts";

const fixture = (id: string) => JSON.parse(readFileSync(new URL("../../protocol/fixtures/events.jsonl", import.meta.url), "utf8").split("\n").find((l) => l.includes(`"id":"${id}"`))!);
const KEY = "sk_live_51HabcdefghijklmnopQRSTUVwx";
const started = () => reduce({ ...initial(), folder: "/p" }, { v: 1, id: "s", type: "checkpoint.created", project: "/p", agent: "builder-1", checkpoint: "cp_0104", label: "Before: fix", files: 3, skipped: [] } as never);

describe("the receipt's rechecked part", () => {
  test("kept only of its known shape, each sentence masked again", () => {
    expect(recheckedOf(fixture("m104e1").rechecked)?.findings.length).toBe(3);
    expect(recheckedOf({ batch: "rv_0a1b2c3d4e", findings: [{ say: `A key ${KEY} is here.`, outcome: "still" }] })!.findings[0].say).not.toContain(KEY);
    for (const bad of [null, {}, { batch: "x", findings: [{ say: "a", outcome: "gone" }] }, { batch: "rv_0a1b2c3d4e", findings: [{ say: "a", outcome: "maybe" }] }]) expect(recheckedOf(bad)).toBeNull();
  });
  test("still there first, then the ones to look at, then those gone; and one line over them", () => {
    const r = recheckedOf({ batch: "rv_0a1b2c3d4e", findings: [{ say: "a", outcome: "gone" }, { say: "b", outcome: "unsure" }, { say: "c", outcome: "still" }] })!;
    expect(recheckRows(r).map((x) => x.say)).toEqual(["c", "b", "a"]);
    expect(recheckSummary(r)).toBe(S.fixRecheck.summaryStill(1, 3));
    expect(recheckSummary(recheckedOf(fixture("m104e1").rechecked)!)).toBe(S.fixRecheck.summaryUnsure(1));
    expect(recheckSummary(recheckedOf({ batch: "rv_0a1b2c3d4e", findings: [{ say: "a", outcome: "gone" }] })!)).toBe(S.fixRecheck.summaryGone(1));
    expect(stillOf(r)).toBe(1);
  });
});

describe("one still there is never proven", () => {
  test("the verdict: checks passed and a problem still there says Not fixed yet, with how many", () => {
    const base = { proof: "passed" as const, ended: "done" as const, undone: false, changed: 1, missing: [] };
    expect(verdictOf(base)).toMatchObject({ kind: "proven", proven: true });
    expect(verdictOf({ ...base, stillThere: 1 })).toMatchObject({ kind: "failed", proven: false, headline: S.verdict.failed, line: S.verdict.stillThere(1), offer: "undo" });
    expect(verdictOf({ ...base, stillThere: 2 }).line).toBe(S.verdict.stillThere(2));
    // After an Undo the files are back: the result is the Undo, not the problem.
    expect(verdictOf({ ...base, stillThere: 1, undone: true }).kind).toBe("undone");
  });
  test("the receipt: all gone stays proven; one still there is not", () => {
    const gone = reduce(started(), fixture("m104e1"));
    expect(gone.receipt?.rechecked?.findings.length).toBe(3);
    expect(receiptVerdict(gone)?.proven).toBe(true);
    const still = reduce(started(), { ...fixture("m104e2"), checkpoint: "cp_0104" });
    expect(receiptVerdict(still)).toMatchObject({ proven: false, line: S.verdict.stillThere(1) });
  });
  test("History says the same", () => {
    const row = fixture("m104e3").tasks[0];
    expect(verdictOf(historyFacts(row)).proven).toBe(false);
    expect(verdictOf(historyFacts({ ...row, still: undefined })).proven).toBe(true);
  });
});

describe("Try again", () => {
  test("waits once pressed, and a refusal stops it waiting and says why", () => {
    const m = reduce(started(), { ...fixture("m104e2"), checkpoint: "cp_0104" });
    const t = reduce(m, { type: "ui.recheckRetry", batch: "rv_0a1b2c3d4e" } as never);
    expect(t.receipt?.retrying).toBe(true);
    expect(reduce(m, { type: "ui.recheckRetry", batch: "rv_ffffffffff" } as never).receipt?.retrying).toBeUndefined();
    const no = reduce(t, { v: 1, id: "x", type: "protocol.error", failed: "review.fix", reason: "Review these changes first, then press Fix it." } as never);
    expect(no.receipt?.retrying).toBe(false);
    expect(no.notice).toBe("Review these changes first, then press Fix it.");
    expect(reduce(t, { type: "ui.recheckRetryFailed", reason: "Not sent." } as never).receipt?.retrying).toBe(false);
  });
});
