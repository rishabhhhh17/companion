// The aim eval's command line (runner/scripts/eval-aim.ts), its refusal to spend, and how one ask is run and scored. The
// script itself renders pages in the hidden browser, so the parts that decide whether anything is spent and how an answer
// counts live in aim.ts and are tested here, with stand ins for the lanes (no browser, no Claude, no network).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HarnessRefusal, SpendStop } from "../../runner/scripts/realrun-harness.ts";
import { MODELS } from "../../runner/src/models.ts";
import { CannotSpend, realHarness, type EvalHarness } from "../lib/harness.ts";
import { explainFailure, runSet } from "../lib/runset.ts";
import { aimHarness, parseAimArgs, runAimAsk, summarizeAim, type AimAsk } from "./aim.ts";

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
  test("the lane and the models can come from the settings the app reads, and a flag wins over them", () => {
    const env = { COMPANION_AIM: "computer_use", COMPANION_VISION_MODEL: "claude-haiku-5-5", COMPANION_AIM_MODEL: "claude-opus-5-5" };
    const a = parseAimArgs([], env);
    expect(a.lane).toBe("computer_use");
    expect(a.args.models).toMatchObject({ vision: "claude-haiku-5-5", aim: "claude-opus-5-5" });
    expect(parseAimArgs(["--lane", "default", "--vision-model", "claude-sonnet-5-5"], env)).toMatchObject({ lane: "default", args: { models: { vision: "claude-sonnet-5-5" } } });
    expect(parseAimArgs([])).toMatchObject({ lane: "default", args: { models: { vision: MODELS.vision, aim: MODELS.aim } } });
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
  test("--spend asks for the real harness with the eval's own caps; with no key in the Keychain item it is refused", async () => {
    let caps: unknown;
    expect(await aimHarness(parseAimArgs(["--spend", "--total", "2"]), async (c) => { caps = c; return stub; })).toBe(stub);
    expect(caps).toEqual({ perCaseUsd: 0.05, totalUsd: 2 });
    const noKey = (c: { perCaseUsd: number; totalUsd: number }) => realHarness(c, { readKey: async () => null, keyRef: { service: "companion-test-aim", account: "anthropic" }, claudeBinary: () => "/bundled/claude", tmpRoot: tmpdir() });
    await expect(aimHarness(parseAimArgs(["--spend"]), noKey)).rejects.toBeInstanceOf(CannotSpend);
  });
  test("that refusal ends the script with code 2 and plain words, before any page is rendered", () => {
    const exit = process.exit, error = console.error;
    let code: number | undefined, said = "";
    process.exit = ((c?: number) => { code = c; throw new Error("exit"); }) as never;
    console.error = (m: string) => { said += m; };
    try { expect(() => explainFailure(new CannotSpend("No API key in the Keychain item. Nothing was spent."))).toThrow("exit"); }
    finally { process.exit = exit; console.error = error; }
    expect(code).toBe(2);
    expect(said).toContain("No API key");
  });
  test("the script reads its command line and gets its harness only through these, before the browser starts, and scores each ask with runAimAsk", () => {
    const src = readFileSync(join(import.meta.dir, "..", "..", "runner", "scripts", "eval-aim.ts"), "utf8");
    expect(src).toContain("parseAimArgs(");
    expect(src).toContain("aimHarness(");
    expect(src).toContain("runAimAsk(");
    expect(src).not.toMatch(/realHarness|parseArgs\(|\.locate\(/);
    expect(src.indexOf("aimHarness(")).toBeLessThan(src.indexOf("chromium.launch("));
  });
});

describe("one pointing ask", () => {
  const save = { t: "Save", id: null, x: 100, y: 100, w: 60, h: 30 };
  const other = { t: "Cancel", id: null, x: 200, y: 100, w: 60, h: 30 };
  const ask = (n: number): AimAsk => ({ id: `page:Save${n}`, page: "page", png: "AAAA", els: [save, other], target: save, targets: [save], question: "Where do I save?", set: "hard" });
  const point = (x: number, y: number) => ({ x, y, targetText: "Save", confidence: 0.9, caption: "Click Save" });
  const lanes = (answers: (() => Promise<any>)[]): EvalHarness => {
    let i = 0;
    return { name: "stub", agent: () => { throw new Error("unused"); }, reviewer: () => { throw new Error("unused"); }, ask: () => async () => ({ text: "", costUsd: 0 }), vision: () => ({ locate: () => answers[i++]() }) };
  };
  const run = (h: EvalHarness, n: number, extra: string[] = []) => {
    const aim = parseAimArgs(["--spend", "--out", join(tmpdir(), `companion-test-aim-${process.pid}-${Math.random().toString(36).slice(2)}.json`), ...extra]);
    return runSet({ set: "show-me-how", setDir: tmpdir(), cases: Array.from({ length: n }, (_, k) => ask(k)), args: aim.args, models: {}, summarize: summarizeAim, log: () => {}, harness: h, endRunOnCaseStop: true,
      run: (a, ctx) => runAimAsk(a, ctx, { model: aim.args.models.vision, lane: aim.lane, aimModel: aim.args.models.aim }) });
  };

  test("a hit is scored where the person would click: snapped, raw only, missed, or no answer", async () => {
    const { results } = await run(lanes([
      async () => ({ point: point(1, 1), targets: [point(1, 1), point(110, 110)], costUsd: 0.01 }),
      async () => ({ point: point(101, 101), costUsd: 0.01 }),
      async () => ({ point: point(230, 110), costUsd: 0.01 }),
      async () => ({ point: null, costUsd: 0.01 }),
    ]), 4);
    expect(results.cases.map((c) => c.outcome)).toEqual(["snapped", "snapped", "missed", "no_answer"]);
  });

  test("a lane error is counted apart, never as a miss or no answer, and the run goes on", async () => {
    const { results } = await run(lanes([async () => { throw new Error("the pointing request was refused (529)"); }, async () => ({ point: point(110, 110), costUsd: 0.01 })]), 2);
    expect(results.cases.map((c) => c.outcome)).toEqual(["error", "snapped"]);
    expect(results.cases[0].notes[0]).toMatch(/529/);
    const s = results.summary as ReturnType<typeof summarizeAim>;
    expect(s).toMatchObject({ asked: 1, hard: { asked: 1, snapped: 1 } });
    expect(s.counts.error).toBe(1);
  });

  for (const [what, stop, outcome] of [["a harness refusal", new HarnessRefusal("Stopped at system/init: tools this check does not expect: Bash"), "refused"], ["a spending stop", new SpendStop("this case's spending stop of $0.05 was reached (spent about $0.07)", "case"), "stopped"]] as const) {
    test(`${what} ends the run with its reason; it is never "no answer"`, async () => {
      let asked = 0;
      const h = lanes([async () => { asked++; return { point: point(110, 110), costUsd: 0.01 }; }, async () => { asked++; throw stop; }, async () => { asked++; return { point: null, costUsd: 0 }; }]);
      const { results } = await run(h, 3);
      expect(results.cases.map((c) => c.outcome)).toEqual(["snapped", outcome, "not_started"]);
      expect(results.cases[1].notes[0]).toContain(stop.message);
      expect(results.stopped).toBeTruthy();
      expect(asked).toBe(2);
      expect((results.summary as ReturnType<typeof summarizeAim>).counts.no_answer).toBe(0);
    });
  }
});
