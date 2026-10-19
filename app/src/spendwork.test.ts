// Area 1 of the settings plan, on the pages' side: the budgets and the models a task, a plan, a Rescue and a Research
// question are started with (read from Settings when they start), the model rows offered only once their real smoke test
// has passed, and the words that must stay true when the engine's settings change (the loop card, a cut plan).
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseCommand, serialize } from "../../protocol/index.ts";
import { defOf, PAGE_STORAGE_MARK, REGISTRY } from "../../protocol/settings.ts";
import { canonicalModel, MODEL_CHOICES, MODELS, priceRatio } from "../../runner/src/models.ts";
import { askResearch, budgetFor, DEFAULT_BUDGET_USD, DEFAULT_MODEL, diagnose, DIAGNOSE_MODEL, DRIVE_BUDGET_USD, fixError, planDrive, startPractice, startTask } from "./commands.ts";
import { modelFor, offeredOptions, shownSettings } from "./modelChoice.ts";
import { initial, planCutWords, reduce, stuckHelpWords, type Model } from "./model.ts";
import { S } from "./strings.ts";
import { _resetForTests, takeSnapshot } from "./settingsStore.ts";

afterEach(() => _resetForTests());
const snap = (values: Record<string, unknown>) => takeSnapshot({ values, usual: {}, project: "/p", migrated: [PAGE_STORAGE_MARK], problems: [], changed: [] });
const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const c = (x: unknown) => x as Record<string, unknown>;

describe("the budgets a page starts work with", () => {
  test("with nothing changed they are exactly today's: $3 a task, $5 a plan, $5 a Rescue, $2 a Research question", () => {
    expect(c(startTask("/p", "Add a page")).budgetUsd).toBe(3);
    expect(c(planDrive("/p", "a shop")).budgetUsd).toBe(5);
    expect(c(diagnose("/p")).budgetUsd).toBe(5);
    expect(c(askResearch("/p", "How do I take payments?")).budgetUsd).toBe(2);
    expect([DEFAULT_BUDGET_USD, DRIVE_BUDGET_USD]).toEqual([3, 5]);
  });
  test("each reads its own setting when the work starts", () => {
    snap({ "budget.task": 12.5, "budget.plan": 20, "budget.rescue": 0.5, "budget.research": 50 });
    expect(c(startTask("/p", "Add a page")).budgetUsd).toBe(12.5);
    expect(c(fixError("/p", "TypeError: x is not a function")).budgetUsd).toBe(12.5);
    expect(c(planDrive("/p", "a shop")).budgetUsd).toBe(20);
    expect(c(diagnose("/p")).budgetUsd).toBe(0.5);
    expect(c(askResearch("/p", "How do I take payments?")).budgetUsd).toBe(50);
    snap({});
    expect(c(startTask("/p", "Add a page")).budgetUsd).toBe(3);
  });
  test("a value outside the rules is never sent: the usual budget is used", () => {
    snap({ "budget.task": 999, "budget.plan": -1, "budget.rescue": "5", "budget.research": Number.NaN });
    expect(budgetFor("budget.task")).toBe(3);
    expect(c(planDrive("/p", "a shop")).budgetUsd).toBe(5);
    expect(c(diagnose("/p")).budgetUsd).toBe(5);
    expect(c(askResearch("/p", "q")).budgetUsd).toBe(2);
  });
  test("the practice task stays at $0.60 on the usual model, whatever Settings say", () => {
    snap({ "budget.task": 40, "model.work": "careful" });
    expect(c(startPractice("/p"))).toMatchObject({ budgetUsd: 0.6, model: DEFAULT_MODEL });
  });
  test("every command is still valid protocol", () => {
    snap({ "budget.task": 50, "budget.plan": 0.5 });
    for (const x of [startTask("/p", "x"), planDrive("/p", "g"), diagnose("/p"), askResearch("/p", "q")!]) expect(parseCommand(serialize(x)).ok).toBe(true);
  });
});

describe("the models a page starts work with", () => {
  test("with nothing changed they are exactly today's", () => {
    expect(c(startTask("/p", "x")).model).toBe(MODELS.agent);
    expect(c(planDrive("/p", "g")).model).toBe(MODELS.agent);
    expect(c(askResearch("/p", "q")).model).toBe(MODELS.agent);
    expect(c(diagnose("/p")).model).toBe(MODELS.diagnose);
    expect([DEFAULT_MODEL, DIAGNOSE_MODEL]).toEqual([MODELS.agent, MODELS.diagnose]);
  });
  test("a choice whose real smoke test has not passed still sends today's model", () => {
    snap({ "model.work": "careful", "model.rescue": "recommended" });
    expect(c(startTask("/p", "x")).model).toBe(MODELS.agent);
    expect(c(diagnose("/p")).model).toBe(MODELS.diagnose);
  });
  test("once it has passed, the choice is what is sent, by option, never a stored model id", () => {
    const passed = [MODEL_CHOICES.work.careful.smoke, MODEL_CHOICES.rescue.recommended.smoke];
    expect(modelFor("model.work", "careful", passed)).toBe("claude-opus-5-5");
    expect(modelFor("model.work", "recommended", passed)).toBe(MODELS.agent);
    expect(modelFor("model.rescue", "recommended", passed)).toBe("claude-sonnet-5-5");
    expect(modelFor("model.work", "claude-opus-5-5", passed)).toBe(MODELS.agent);
  });
  test("tasks, plans and Research read Claude for tasks; Rescue reads Claude for Rescue", () => {
    const src = readFileSync(new URL("./commands.ts", import.meta.url), "utf8");
    for (const f of ["startTask", "planDrive", "askResearch"]) expect(src, f).toMatch(new RegExp(`export const ${f} = [\\s\\S]{0,500}?model: workModel\\(\\)`));
    expect(src).toMatch(/export const diagnose = [^\n]*model: rescueModel\(\)/);
  });
});

describe("the model rows in Settings", () => {
  test("are hidden while only the usual option can be offered (nobody has run the smoke test yet)", () => {
    const shown = shownSettings().map((d) => d.key);
    for (const k of ["model.work", "model.rescue", "model.quick"]) expect(shown, k).not.toContain(k);
    expect(shown).toContain("budget.task");
    expect(shown.length).toBe(REGISTRY.settings.length - 3);
    expect(offeredOptions("model.work")).toEqual(["recommended"]);
    expect(offeredOptions("budget.task")).toBeNull();
  });
  test("appear with both options once an option's smoke case has passed", () => {
    const passed = [MODEL_CHOICES.work.careful.smoke];
    expect(shownSettings(REGISTRY.settings, passed).map((d) => d.key)).toContain("model.work");
    expect(shownSettings(REGISTRY.settings, passed).map((d) => d.key)).not.toContain("model.rescue");
    expect(offeredOptions("model.work", passed)).toEqual(["recommended", "careful"]);
  });
  // The words are written by hand in strings.ts, apart from the map the pages send (MODEL_CHOICES). A model upgrade in the
  // map (say the fast lane moving to a new Haiku) that leaves the old name or the old cost on screen fails here.
  test("each option's words name the model it sends, and no other, and say its cost against the usual option truly", () => {
    const name = (id: string) => {
      const m = /^claude-([a-z]+)-(\d+)(?:-(\d+))?$/.exec(canonicalModel(id));
      if (!m) throw new Error(`no display name for ${id}`);
      return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ""}`;
    };
    expect(name("claude-haiku-4-5-20251001")).toBe("Haiku 4.5");
    for (const [key, job] of [["model.work", "work"], ["model.rescue", "rescue"], ["model.quick", "quick"]] as const) {
      const choices = MODEL_CHOICES[job] as Record<string, { model: string }>;
      const usual = choices[String(defOf(key)!.default)].model;
      for (const [id, c] of Object.entries(choices)) {
        const words = (S.set[key].options as Record<string, string>)[id], own = name(c.model);
        expect(words, `${key} ${id}`).toContain(own);
        for (const family of ["Opus", "Sonnet", "Haiku", "Fable"]) if (!own.startsWith(family)) expect(words, `${key} ${id}`).not.toContain(family);
        const said = /about twice the cost/.test(words) ? 2 : /about half the cost/.test(words) ? 0.5 : 1;
        expect(priceRatio(c.model, usual), `${key} ${id}: "${words}"`).toBe(said);
      }
    }
  });
  test("the Settings page draws and searches only the rows shown, and only the options offered", () => {
    const page = readFileSync(new URL("./settingsPage.tsx", import.meta.url), "utf8");
    expect(page).toMatch(/searchSettings\(q, shownSettings\(\)\.filter\(\(x\) => shownNow\(x\.key, setting\)\)\)/);
    expect(page).toMatch(/offeredOptions\(d\.key\)/);
  });
});

describe("words that stay true when the engine's settings change", () => {
  const stuck = (extra: Record<string, unknown> = {}) => run([ev({ type: "loop.stuck", agent: "a", index: 0, title: "Fix the form", failure: { label: "Running the tests", detail: "1 failed" }, options: [{ id: "different", label: "Try a different approach" }, { id: "stop", label: "Stop here" }], ...extra })]);
  test("the loop card says exactly what it said before with the usual three identical failures", () => {
    expect(stuckHelpWords(stuck())).toBe(S.stuckHelp);
    expect(S.stuckHelp).toBe("The same check has failed three times in a row, so more tries are unlikely to help.");
  });
  test("with another number of checks, or failures that were not all the same, it says so", () => {
    expect(stuckHelpWords(stuck({ tries: 5, same: true }))).toBe("The same check has failed five times in a row, so more tries are unlikely to help.");
    expect(stuckHelpWords(stuck({ tries: 1, same: true }))).toBe(S.stuckHelpOne);
    expect(stuckHelpWords(stuck({ tries: 3, same: false }))).toBe("The checks have failed three times in a row, not always in the same way.");
    expect(stuckHelpWords(stuck({ tries: 4, same: false }))).toBe("The checks have failed four times in a row, not always in the same way.");
  });
  test("a cut plan says how many steps it was cut to, which is 12 as before", () => {
    const plan = (n: number) => run([ev({ type: "plan.ready", agent: "a", steps: Array.from({ length: n }, (_, i) => ({ id: i + 1, title: `S${i + 1}` })), truncated: true, estimateUsd: 1 })]);
    expect(planCutWords(plan(12))).toBe("The plan was cut to 12 steps.");
    expect(planCutWords(plan(3))).toBe("The plan was cut to 3 steps.");
    expect(planCutWords(run([ev({ type: "plan.ready", agent: "a", steps: [{ id: 1, title: "x" }], truncated: false, estimateUsd: 1 })]))).toBeNull();
  });
  test("the card draws these words, not the fixed ones", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).toContain("{stuckHelpWords(m)}");
    expect(card).toContain("planCutWords(m)");
    expect(card).not.toContain("{S.stuckHelp}");
    expect(card).not.toContain("{S.planTooLong}");
  });
});
