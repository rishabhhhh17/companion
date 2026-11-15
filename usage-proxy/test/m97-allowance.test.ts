// M97: the measuring tool for the Pro model allowance. The founder chose "measure, then decide" (15 Nov 2026): the number
// in plans.ts does not change; this only says how many fixes an allowance covers, from costs measured elsewhere (M100).
// Fixture costs only. Nothing here calls a model.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PLANS, allowanceReport, costsFrom } from "../src/plans.ts";

describe("how many fixes an allowance covers", () => {
  test("from measured costs: the typical (median) and the dearest fix, a month and a day", () => {
    const r = allowanceReport(PLANS.pro, [0.4, 0.9, 0.5, 0.3, 0.6])!;
    expect(r).toMatchObject({ plan: "pro", runs: 5, medianUsd: 0.5, highestUsd: 0.9, perMonthTypical: 10, perMonthDearest: 5, perDayTypical: 1, perDayDearest: 0 });
  });
  test("the median of an even count is the middle two averaged, and money is kept to the cent", () => {
    const r = allowanceReport(PLANS.pro, [0.2, 0.3, 0.42, 0.5])!;
    expect(r.medianUsd).toBe(0.36);
    expect(r.perMonthTypical).toBe(13);
  });
  test("costs that are not a real amount are left out; none left means no report", () => {
    expect(allowanceReport(PLANS.pro, [])).toBeNull();
    expect(allowanceReport(PLANS.pro, [0, -1, Number.NaN, Number.POSITIVE_INFINITY])).toBeNull();
    expect(allowanceReport(PLANS.pro, [0, 0.5, -2])?.runs).toBe(1);
  });
  test("plain sentences, with no dashes, that say the number is the founder's to set", () => {
    const r = allowanceReport(PLANS.pro, [0.4, 0.9, 0.5, 0.3, 0.6])!;
    expect(r.lines).toEqual([
      "pro: 5 measured fixes. A typical one cost $0.50 and the dearest $0.90.",
      "The monthly allowance of $5.00 covers about 10 typical fixes, or 5 of the dearest.",
      "The daily allowance of $0.75 covers about 1 typical fix a day, or none of the dearest: a fix that costs more than that cannot finish in one day.",
      "Nothing was changed. The allowance is the founder's call (M97, M100).",
    ]);
    for (const l of r.lines) expect(l).not.toMatch(/[\u2013\u2014]/);
  });
  test("a fix that fits the daily allowance says so without the warning", () => {
    const r = allowanceReport(PLANS.pro, [0.2, 0.25])!;
    expect(r.lines[2]).toBe("The daily allowance of $0.75 covers about 3 typical fixes a day, or 3 of the dearest.");
  });
  test("an allowance smaller than a typical fix says so plainly", () => {
    const r = allowanceReport(PLANS.free, [2.5, 3])!;
    expect(r.lines[1]).toBe("The monthly allowance of $2.00 is less than a typical fix.");
    expect(r.lines[2]).toBe("The daily allowance of $0.20 is less than a typical fix, so a typical fix cannot finish in one day.");
  });
  test("reading measured costs: a list of amounts, or of records with costUsd, from a file", () => {
    expect(costsFrom([0.1, 0.2])).toEqual([0.1, 0.2]);
    expect(costsFrom({ costsUsd: [0.3] })).toEqual([0.3]);
    expect(costsFrom([{ costUsd: 0.4 }, { costUsd: "x" }, { other: 1 }, 0.5])).toEqual([0.4, 0.5]);
    expect(costsFrom("nope")).toEqual([]);
    expect(costsFrom(null)).toEqual([]);
    // M100 review: what measure-fixes --out saves reads straight in.
    expect(costsFrom({ standIn: false, fixes: [{ id: "add", costUsd: 0.1 }, { id: "x", costUsd: 0.2 }] })).toEqual([0.1, 0.2]);
    expect(costsFrom({ standIn: false, costsUsd: [0.1], fixes: [{ costUsd: 0.1 }] })).toEqual([0.1]);
  });
  test("the script reads a file of fixture costs and prints the report, changing nothing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "m97-allowance-"));
    const file = join(dir, "costs.json");
    writeFileSync(file, JSON.stringify([{ costUsd: 0.4 }, { costUsd: 0.9 }, { costUsd: 0.5 }]));
    const p = Bun.spawnSync(["bun", new URL("../scripts/allowance.ts", import.meta.url).pathname, file], { stdout: "pipe", stderr: "pipe" });
    expect(p.exitCode).toBe(0);
    const out = p.stdout.toString();
    expect(out).toContain("pro: 3 measured fixes.");
    expect(out).toContain("Pro is $15 a month or $144 a year (app/src/prices.json).");
    const bad = Bun.spawnSync(["bun", new URL("../scripts/allowance.ts", import.meta.url).pathname, join(dir, "missing.json")], { stdout: "pipe", stderr: "pipe" });
    expect(bad.exitCode).toBe(1);
    expect(bad.stderr.toString()).toContain("Could not read");
  });
  test("M100 review: measure-fixes' saved file goes through costsFrom, and the script refuses stand in numbers", async () => {
    const { costsFile } = await import("../../runner/scripts/measure-fixes.ts");
    const fixes = [{ id: "add", proven: true, costUsd: 0.4, requests: 4, ended: "done" }, { id: "round", proven: false, costUsd: 0.9, requests: 9, ended: "budget" }];
    expect(costsFrom(costsFile(fixes, false))).toEqual([0.4, 0.9]);
    const dir = mkdtempSync(join(tmpdir(), "m100-allowance-"));
    const script = new URL("../scripts/allowance.ts", import.meta.url).pathname;
    const real = join(dir, "real.json"), fake = join(dir, "fake.json");
    writeFileSync(real, JSON.stringify(costsFile(fixes, false)));
    writeFileSync(fake, JSON.stringify(costsFile(fixes, true)));
    const ok = Bun.spawnSync(["bun", script, real], { stdout: "pipe", stderr: "pipe" });
    expect(ok.exitCode).toBe(0);
    expect(ok.stdout.toString()).toContain("pro: 2 measured fixes.");
    const no = Bun.spawnSync(["bun", script, fake], { stdout: "pipe", stderr: "pipe" });
    expect(no.exitCode).toBe(1);
    expect(no.stderr.toString()).toMatch(/stand in/);
  });
});
