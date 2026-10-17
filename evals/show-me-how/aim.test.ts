// The aim eval's command line (runner/scripts/eval-aim.ts) and its refusal to spend. The script itself renders pages in
// the hidden browser, so the parts that decide whether anything is spent live in aim.ts and are tested here.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HarnessMissing, type EvalHarness } from "../lib/harness.ts";
import { explainFailure } from "../lib/runset.ts";
import { aimHarness, parseAimArgs } from "./aim.ts";

describe("the aim eval's command line", () => {
  test("with no flags it is dry, on every page, every ask", () => {
    const a = parseAimArgs([]);
    expect(a.args.spend).toBe(false);
    expect(a).toMatchObject({ which: "all", real: false, lane: "default", count: Infinity });
    expect(a.args).toMatchObject({ perCaseUsd: 0.05, totalUsd: 6 });
  });
  test("a number after a flag that takes one is that flag's value, never the count", () => {
    const a = parseAimArgs(["--spend", "--total", "6"]);
    expect(a.args).toMatchObject({ spend: true, totalUsd: 6 });
    expect(a.count).toBe(Infinity);
    expect(parseAimArgs(["--set", "hard", "--total", "6"]).args.totalUsd).toBe(6);
    expect(parseAimArgs(["--per-case", "1", "--total", "6"]).args).toMatchObject({ perCaseUsd: 1, totalUsd: 6 });
  });
  test("the count: --count n, or a number on its own", () => {
    expect(parseAimArgs(["--count", "3"]).count).toBe(3);
    expect(parseAimArgs(["--count=4"]).count).toBe(4);
    expect(parseAimArgs(["6", "--total", "6"])).toMatchObject({ count: 6 });
    expect(parseAimArgs(["--set", "hard", "12"])).toMatchObject({ which: "hard", count: 12 });
    expect(parseAimArgs(["--spend", "5"])).toMatchObject({ count: 5 });
    expect(parseAimArgs(["--real", "5"])).toMatchObject({ real: true, count: 5 });
    for (const bad of [["--count", "0"], ["--count", "lots"], ["--count"], ["2", "3"]]) expect(() => parseAimArgs(bad), bad.join(" ")).toThrow(/count/);
  });
  test("the set and the lane are checked", () => {
    expect(parseAimArgs(["--set", "basic"]).which).toBe("basic");
    expect(parseAimArgs(["--lane", "computer_use"]).lane).toBe("computer_use");
    expect(() => parseAimArgs(["--set", "everything"])).toThrow(/basic, hard or all/);
    expect(() => parseAimArgs(["--lane", "other"])).toThrow(/default or computer_use/);
    expect(() => parseAimArgs(["--spend=false"])).toThrow(/--spend on its own/);
  });
});

describe("the aim eval spends only with --spend, and only through the real harness", () => {
  const stub: EvalHarness = { name: "stub", agent: () => { throw new Error("unused"); }, reviewer: () => { throw new Error("unused"); }, ask: () => async () => ({ text: "", costUsd: 0 }), vision: () => ({ locate: async () => ({ point: null, costUsd: 0 }) }) };
  test("a dry run never asks for a harness", async () => {
    let asked = 0;
    expect(await aimHarness(parseAimArgs([]), async () => { asked++; return stub; })).toBeUndefined();
    expect(asked).toBe(0);
  });
  test("--spend asks for the real harness, which is refused while it is not plugged in", async () => {
    expect(await aimHarness(parseAimArgs(["--spend"]), async () => stub)).toBe(stub);
    await expect(aimHarness(parseAimArgs(["--spend"]))).rejects.toBeInstanceOf(HarnessMissing);
  });
  test("that refusal ends the script with code 2 and plain words, before any page is rendered", () => {
    const exit = process.exit, error = console.error;
    let code: number | undefined, said = "";
    process.exit = ((c?: number) => { code = c; throw new Error("exit"); }) as never;
    console.error = (m: string) => { said += m; };
    try { expect(() => explainFailure(new HarnessMissing("Spending is not possible from this branch yet."))).toThrow("exit"); }
    finally { process.exit = exit; console.error = error; }
    expect(code).toBe(2);
    expect(said).toContain("Spending is not possible");
  });
  test("the script reads its command line and gets its harness only through these, before the browser starts", () => {
    const src = readFileSync(join(import.meta.dir, "..", "..", "runner", "scripts", "eval-aim.ts"), "utf8");
    expect(src).toContain("parseAimArgs(");
    expect(src).toContain("aimHarness(");
    expect(src).not.toMatch(/realHarness|parseArgs\(/);
    expect(src.indexOf("aimHarness(")).toBeLessThan(src.indexOf("chromium.launch("));
  });
});
