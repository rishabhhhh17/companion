import { describe, expect, test } from "bun:test";
import { classifyLook, summarize } from "./score.ts";
import { loadCases, runLookCase } from "./pipeline.ts";
import { CaseMeter } from "../lib/budget.ts";

// The Second Look eval (M14): AI answers with one seeded mistake, and clean ones. Dry: a stand in plays the case's expected
// model answer, so the wiring and the scorer are proven, and the maths checks (code, not the model) are proven for real.
const item = (claim: string, issue: string, by: "model" | "recomputed" = "model") => ({ kind: "other" as const, claim, issue, verify: "", by });
const seeded = { id: "s", label: "seeded" as const, about: ["Henderson"] };
const clean = { id: "c", label: "clean" as const, about: [] };

describe("how one answer is judged", () => {
  test("a seeded mistake: caught for the right reason, caught for another reason, missed confidently, or unsure", () => {
    expect(classifyLook(seeded, { verdict: "check", items: [item("Henderson v. Pacific", "may not exist")], checked: [], cantTell: [], costUsd: 0 })).toBe("caught");
    expect(classifyLook(seeded, { verdict: "check", items: [item("tone", "too formal")], checked: [], cantTell: [], costUsd: 0 })).toBe("caught_other");
    expect(classifyLook(seeded, { verdict: "solid", items: [], checked: ["all"], cantTell: [], costUsd: 0 })).toBe("confidently_wrong");
    expect(classifyLook(seeded, { verdict: "cant_tell", items: [], checked: [], cantTell: ["x"], costUsd: 0 })).toBe("unsure");
  });
  test("a clean answer: flagged is a false alarm; solid or an honest 'can't tell' is clean", () => {
    expect(classifyLook(clean, { verdict: "check", items: [item("a", "b")], checked: [], cantTell: [], costUsd: 0 })).toBe("false_alarm");
    expect(classifyLook(clean, { verdict: "solid", items: [], checked: ["x"], cantTell: [], costUsd: 0 })).toBe("clean");
    expect(classifyLook(clean, { verdict: "cant_tell", items: [], checked: [], cantTell: ["x"], costUsd: 0 })).toBe("clean");
  });
});

describe("the whole set, dry", () => {
  const cases = loadCases();
  test("30 cases: 15 seeded across numbers, code, citations, facts and logic, and 15 clean", () => {
    expect(cases).toHaveLength(30);
    expect(cases.filter((c) => c.label === "seeded")).toHaveLength(15);
    for (const k of ["number", "code", "citation", "fact", "logic"]) expect(cases.some((c) => c.label === "seeded" && c.kind === k), k).toBe(true);
    for (const c of cases) if (c.label === "seeded") expect(c.about.length, c.id).toBeGreaterThan(0);
  });
  test("every seeded mistake is caught and no clean answer is flagged; the number mistakes are caught by code, whatever the stand in says", async () => {
    const results = [];
    for (const c of cases) results.push(await runLookCase(c, { mode: "dry", meter: new CaseMeter(0.05), signal: new AbortController().signal }));
    const bad = results.filter((r) => !(r.outcome === "caught" || r.outcome === "clean"));
    expect(bad.map((r) => `${r.id}: ${r.outcome} ${r.notes.join(" ")}`)).toEqual([]);
    // The stand in calls every number case "solid": only the code can have caught them.
    for (const r of results.filter((x) => cases.find((c) => c.id === x.id)?.kind === "number" && cases.find((c) => c.id === x.id)?.label === "seeded")) expect(r.detail?.byCode, r.id).toBe(true);
    const s = summarize(results);
    expect([s.catchRate, s.falseAlarmRate, s.confidentlyWrong]).toEqual([1, 0, 0]);
  });
  test("a stand in that wrongly calls a seeded answer solid is scored confidently wrong, never caught", async () => {
    const c = cases.find((x) => x.id === "fake-case")!;
    const r = await runLookCase({ ...c, dry: { verdict: "solid", items: [], checked: ["everything"], cantTell: [] } }, { mode: "dry", meter: new CaseMeter(0.05), signal: new AbortController().signal });
    expect(r.outcome).toBe("confidently_wrong");
  });
});
