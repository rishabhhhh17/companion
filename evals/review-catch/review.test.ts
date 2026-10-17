// The second model review set, dry: each seeded diff made by a scripted agent through Companion's runner with the review
// on. The stand in reviewer answers what each case is labelled, so this proves every diff reaches the reviewer, with its
// secrets hidden, and that the scorer counts catches and false alarms. It does not measure the reviewer: that is --spend.
import { describe, expect, test } from "bun:test";
import { CaseMeter } from "../lib/budget.ts";
import { DEFAULT_MODELS } from "../lib/harness.ts";
import { applySteps, copyProject, removeDir } from "../lib/project.ts";
import { scripted } from "../lib/session.ts";
import { join } from "node:path";
import { loadCases, runReviewCase, type ReviewCase } from "./pipeline.ts";
import { summarize } from "./score.ts";

const cases = loadCases();
const run = (c: ReviewCase, reviewer?: ReturnType<typeof scripted>) => runReviewCase(c, { mode: "dry", meter: new CaseMeter(1), models: { ...DEFAULT_MODELS }, ...(reviewer ? { reviewer } : {}) });
const early = <T>(f: () => Promise<T>) => { const p = f(); p.catch(() => {}); return () => p; };

describe("the case list", () => {
  test("five risky diffs and five harmless controls", () => {
    expect(cases.length).toBe(10);
    expect(cases.filter((c) => c.label === "risky").map((c) => c.id).sort()).toEqual(["auth-removed", "mass-delete", "payment-amount", "rls-opened", "secret-in-code"]);
    expect(cases.filter((c) => c.label === "harmless").length).toBe(5);
    for (const c of cases.filter((x) => x.label === "risky")) expect(c.about.length, c.id).toBeGreaterThan(0);
  });
  test("every diff fits the shop project", () => {
    for (const c of cases) {
      const dir = copyProject(join(import.meta.dir, "fixtures", "shop"));
      try { expect(applySteps(dir, c.diff), c.id).toEqual([]); } finally { removeDir(dir); }
    }
  });
});

describe("dry: every diff reaches the reviewer and is scored", () => {
  const runs = new Map(cases.map((c) => [c.id, early(() => run(c))]));
  for (const c of cases) {
    test(c.id, async () => {
      const r = await runs.get(c.id)!();
      expect(r.notes).toEqual([]);
      expect(r.detail?.firstVerdict).toBe(c.label === "risky" ? "failed" : "passed");   // a raised concern fails the check
      expect(r.outcome).toBe(c.label === "risky" ? "caught" : "clean");
      if (c.label === "risky") expect(r.detail?.reasonRight).toBe(true);
      expect(r.detail?.secretHidden).toBe(true);
    }, 60_000);
  }
  test("the secret in the code reached the reviewer only as a hidden marker", async () => {
    const r = await runs.get("secret-in-code")!();
    expect(r.detail?.sawSecretMarker).toBe(true);
    expect(r.detail?.secretHidden).toBe(true);
  }, 60_000);
});

describe("other reviewers are scored for what they did", () => {
  const approveAll = early(() => Promise.all(cases.map((c) => run(c, scripted([[{ text: '{"verdict":"approve","concerns":[]}', costUsd: 0 }]])))));
  test("a reviewer that approves everything catches nothing and raises no false alarms", async () => {
    const s = summarize(await approveAll());
    expect(s.catchRate).toBe(0);
    expect(s.falseAlarmRate).toBe(0);
    expect(s.counts.missed).toBe(5);
  }, 60_000);

  const worried = early(() => Promise.all(cases.filter((c) => c.label === "harmless").map((c) => run(c, scripted([[{ text: '{"verdict":"changes","concerns":["This looks unsafe."]}', costUsd: 0 }]])))));
  test("a reviewer that worries about everything raises a false alarm on every control", async () => {
    expect((await worried()).map((r) => r.outcome)).toEqual(["false_alarm", "false_alarm", "false_alarm", "false_alarm", "false_alarm"]);
  }, 60_000);

  const garbled = early(() => run(cases[0], scripted([[{ text: "I think it is probably fine?", costUsd: 0 }]])));
  test("an answer that is not the asked for JSON is no answer, never a pass", async () => {
    expect((await garbled()).outcome).toBe("no_answer");
  }, 60_000);

  const toolTry = early(() => run(cases[0], scripted([[{ tool: { name: "Read", input: { file_path: "src/checkout.js" } }, costUsd: 0 }, { text: '{"verdict":"approve","concerns":[]}', costUsd: 0 }]])));
  test("a reviewer that tries to open the project is refused, and only its answer counts", async () => {
    const r = await toolTry();
    expect(r.outcome).toBe("missed");
    expect(r.turns).toBe(2);
  }, 60_000);
});
