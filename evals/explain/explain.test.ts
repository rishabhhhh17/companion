// The Explain set, dry: each fix case's known good change made through Companion's runner, so Explain is asked exactly as
// after a real task. The stand in sends back the case's reference explanation and a stand in grader judges it by the
// case's key words. Proves the request is built from the real change, every reference explanation meets the rubric's
// rules, and the scorer rejects explanations that break them. It does not measure the fast model: that is --spend.
import { describe, expect, test } from "bun:test";
import { CaseMeter } from "../lib/budget.ts";
import { DEFAULT_MODELS, type TextAsk } from "../lib/harness.ts";
import { loadCases, runExplainCase, type LoadedExplainCase } from "./pipeline.ts";
import { ruleChecks, summarize } from "./score.ts";

const cases = loadCases();
const run = (c: LoadedExplainCase, extra: { explainer?: TextAsk; grader?: TextAsk } = {}) => runExplainCase(c, { mode: "dry", meter: new CaseMeter(1), models: { ...DEFAULT_MODELS }, ...extra });
const early = <T>(f: () => Promise<T>) => { const p = f(); p.catch(() => {}); return () => p; };
const reply = (o: unknown): TextAsk => async () => ({ text: typeof o === "string" ? o : JSON.stringify(o), costUsd: 0 });

describe("the case list", () => {
  test("every fix case with a change to explain has an Explain case", () => {
    expect(cases.length).toBe(24);
    expect(new Set(cases.map((c) => c.id)).size).toBe(24);
  });
  test("every reference explanation meets the rubric's rules and names its key ideas", () => {
    for (const c of cases) {
      const r = ruleChecks(JSON.stringify(c.good));
      expect(r.problems, c.id).toEqual([]);
      for (const g of c.mention) expect(g.some((w) => c.good.why.join(" ").toLowerCase().includes(w.toLowerCase())), `${c.id}: ${g.join("/")}`).toBe(true);
    }
  });
});

describe("dry: every case through the runner", () => {
  const seen = new Map<string, { text: string; system: string }[]>();
  const runs = new Map(cases.map((c) => [c.id, early(() => { const asks: { text: string; system: string }[] = []; seen.set(c.id, asks); return run(c, { explainer: async (req) => { asks.push(req); return { text: JSON.stringify(c.good), costUsd: 0 }; } }); })]));
  for (const c of cases) {
    test(c.id, async () => {
      const r = await runs.get(c.id)!();
      expect(r.notes).toEqual([]);
      expect(r.outcome).toBe("pass");
      expect(r.detail?.shown).toBe(true);
      // Explain is built from the real change: the lines the fix added are in what the fast model was shown.
      const req = seen.get(c.id)![0];
      const added = c.change.fix.flatMap((s) => ("edit" in s ? [s.new] : "write" in s ? [s.content] : [])).join("\n").split("\n").map((l) => l.trim()).filter((l) => l.length > 6 && !/^(#|\/\/)/.test(l));
      if (!c.change.fix.every((s) => "edit" in s && /^\.env/.test(s.edit))) expect(added.some((l) => req.text.includes(l)), c.id).toBe(true);
    }, 60_000);
  }
  test("settings files are named but never shown to the fast model", async () => {
    await runs.get("vite-env-prefix")!();
    const req = seen.get("vite-env-prefix")![0];
    expect(req.text).toContain(".env (a settings or key file, not shown)");
    expect(req.text).not.toContain("not-a-real-password");
    expect(req.text).not.toContain("https://api.weather.example");
  }, 60_000);
});

describe("explanations that break the rubric fail", () => {
  const c = cases.find((x) => x.id === "rescue-bad-json-config")!;
  const jargon = early(() => run(c, { explainer: reply({ ...c.good, why: ["JSON.parse threw a SyntaxError because of a trailing comma in config.json.", "Removing it lets the parser read the object."] }) }));
  test("code words and a file name are not plain", async () => {
    const r = await jargon();
    expect(r.outcome).toBe("fail");
    expect(r.notes.join(" ")).toMatch(/file name|code style|programming word/);
  }, 60_000);
  const three = early(() => run(c, { explainer: reply({ ...c.good, why: [...c.good.why, "Also, it is nice."] }) }));
  test("three lines are not two", async () => { expect((await three()).detail?.twoLines).toBe(false); }, 60_000);
  const noQuestion = early(() => run(c, { explainer: reply({ why: c.good.why }) }));
  test("no question fails the question part", async () => { expect((await noQuestion()).outcome).toBe("fail"); }, 60_000);
  const chatter = early(() => run(c, { explainer: reply("Sure! I fixed the JSON for you.") }));
  test("chatter instead of the reply format is no explanation", async () => { expect((await chatter()).outcome).toBe("no_explanation"); }, 60_000);
  const wrong = early(() => run(c, { grader: reply({ correct: false, questionRight: true, plain: true, why: "the port was never the problem" }) }));
  test("a grader that finds it untrue fails it, with the grader's reason", async () => {
    const r = await wrong();
    expect(r.outcome).toBe("fail");
    expect(r.notes.join(" ")).toContain("the port was never the problem");
  }, 60_000);
  const mute = early(() => run(c, { grader: reply("I would say it is fine.") }));
  test("a grader with no usable grade is not graded, never a pass", async () => { expect((await mute()).outcome).toBe("not_graded"); }, 60_000);

  test("the summary counts each part", async () => {
    const s = summarize([await jargon(), await three(), await wrong()]);
    expect(s.passRate).toBe(0);
    expect(s.twoLines).toBeCloseTo(2 / 3);
  }, 60_000);
});
