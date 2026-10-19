// The settings registry (protocol/settings.json, T16): one list of every setting, read by the shell, the pages and the
// engine. These check the list itself and the one set of rules for what a value may be. The same cases file is run by the
// shell's own tests (app/src-tauri/src/settings.rs), so the shell and these rules agree on every case in it.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { checkRegistry, defaultOf, defOf, fromPageStorage, MIGRATION_MAPS, REGISTRY, looksSecret, validate, validateKey, type Def, type Registry } from "../../protocol/settings.ts";

const cases = readFileSync(new URL("../../protocol/fixtures/settings-cases.jsonl", import.meta.url), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
// Area 1 (spending and how work runs), each with exactly today's behaviour as its usual value.
const AREA_1: Record<string, unknown> = {
  "budget.task": 3, "budget.plan": 5, "budget.rescue": 5, "budget.research": 2,
  "model.work": "recommended", "model.rescue": "careful", "model.quick": "fast",
  "work.tries": 3, "work.askOnAnyFailure": false, "drive.maxSteps": 12, "work.tryAgain": "carry_on", "approval.waitMinutes": 30,
};

describe("the shipped list of settings", () => {
  test("it is valid: every default passes its own rules, ranges and steps fit, options are unique, sections and stores exist", () => {
    expect(checkRegistry(REGISTRY)).toEqual([]);
  });
  test("sections are in page order and every setting names one of them", () => {
    expect(REGISTRY.sections[0]).toBe("keys");
    expect(REGISTRY.sections).toEqual(["keys", "talking", "home", "pointing", "spending", "work", "checks", "memory", "otherApps", "sharing", "display", "updates", "numbers"]);
    for (const d of REGISTRY.settings) expect(REGISTRY.sections).toContain(d.section);
  });
  test("every setting the core registers is there, with today's behaviour as its usual value", () => {
    const want: Record<string, unknown> = {
      "talk.speak": false, "talk.speakReplies": false, "talk.autoSend": false, "character.comeTo": true, "sharing.hide": true, "calls.quiet": true,
      "showme.allScreens": false, "fun.reactions": true, "teach.yourTurn": false, "display.textSize": "standard", "updates.daily": true,
      "spend.dailyLimit": 10, "explain.on": true, "memory.paused": false, "numbers.on": false, "work.maxTurns": 80, "keys.hotkeys": null, "talk.voice": null,
      ...AREA_1,
    };
    for (const [k, v] of Object.entries(want)) expect(defaultOf(k), k).toEqual(v);
    expect(REGISTRY.settings.map((d) => d.key).sort()).toEqual(Object.keys(want).sort());
  });
  test("the worked example: most turns in one task, read when a task starts, for the engine only", () => {
    expect(defOf("work.maxTurns")).toMatchObject({ kind: "number", min: 20, max: 200, step: 10, unit: "count", scope: "app", applies: ["runner"], store: "settings", live: false });
  });
  test("area 1: the budgets, models, tries, plan steps, Try again and how long a question waits, with their ranges", () => {
    for (const k of ["budget.task", "budget.plan", "budget.rescue", "budget.research"]) expect(defOf(k), k).toMatchObject({ kind: "number", min: 0.5, max: 50, step: 0.5, unit: "dollars", scope: "app", applies: ["pages"], store: "settings", live: false, section: "spending", floor: "budgetDay" });
    expect(defOf("model.work")).toMatchObject({ kind: "choice", options: ["recommended", "careful"], applies: ["pages"], live: false });
    expect(defOf("model.rescue")).toMatchObject({ kind: "choice", options: ["careful", "recommended"], applies: ["pages"], live: false });
    expect(defOf("model.quick")).toMatchObject({ kind: "choice", options: ["fast", "recommended"], applies: ["runner"], live: true });
    expect(defOf("work.tries")).toMatchObject({ kind: "number", min: 1, max: 5, step: 1, unit: "count", applies: ["runner"], live: false });
    expect(defOf("work.askOnAnyFailure")).toMatchObject({ kind: "switch", applies: ["runner"], live: false });
    expect(defOf("drive.maxSteps")).toMatchObject({ kind: "number", min: 3, max: 20, step: 1, unit: "count", applies: ["runner"], live: false });
    // Left out on purpose (see the plan, area 1): "Pause a plan when I change the project myself" stays fixed at on.
    expect(defOf("drive.pauseOnMyEdits")).toBeUndefined();
    expect(defOf("work.tryAgain")).toMatchObject({ kind: "choice", options: ["carry_on", "fresh"], applies: ["runner"], live: false });
    // The top is 30 until a real run shows a hook still waiting past 32 minutes is honoured (T05): only shorter waits for now.
    expect(defOf("approval.waitMinutes")).toMatchObject({ kind: "number", min: 5, max: 30, step: 5, unit: "minutes", applies: ["runner"], live: true, floor: "noAnswerIsNo" });
    for (const k of Object.keys(AREA_1)) expect(defOf(k)!.scope, k).toBe("app");
  });
  test("the three settings the engine keeps itself are reached only through the engine", () => {
    for (const k of ["spend.dailyLimit", "explain.on", "memory.paused", "numbers.on"]) expect(defOf(k)!.applies, k).toEqual(["runner"]);
  });
});

describe("one set of rules for every value (the shared cases)", () => {
  test("every case gives the same answer and the same normalized value", () => {
    let n = 0;
    for (const c of cases) {
      if ("migrate" in c) continue;
      n++;
      const r = c.def ? validate(c.def as Def, c.value) : validateKey(c.key, c.value);
      const where = JSON.stringify(c);
      expect(r.ok, where).toBe(c.ok);
      if (r.ok) expect(r.value, where).toEqual(c.normalized);
      else expect(r.reason, where).toBe(c.reason);
    }
    expect(n).toBeGreaterThanOrEqual(3 * 5);
  });
  test("there are at least three cases for each kind: a valid one, a refused one and one that is tidied", () => {
    const byKind = new Map<string, { ok: number; no: number; tidied: number }>();
    for (const c of cases) {
      if ("migrate" in c) continue;
      const d: Def | undefined = c.def ?? defOf(c.key);
      const k = d?.kind ?? "unknown";
      const e = byKind.get(k) ?? { ok: 0, no: 0, tidied: 0 };
      if (c.ok) { e.ok++; if (JSON.stringify(c.normalized) !== JSON.stringify(c.value)) e.tidied++; } else e.no++;
      byKind.set(k, e);
    }
    for (const k of ["switch", "choice", "number", "text", "list"]) {
      const e = byKind.get(k)!;
      expect(e.ok + e.no, k).toBeGreaterThanOrEqual(3);
      expect(e.ok, k).toBeGreaterThan(0);
      expect(e.no, k).toBeGreaterThan(0);
    }
    for (const k of ["number", "text", "list"]) expect(byKind.get(k)!.tidied, k).toBeGreaterThan(0);
  });
  test("migration from page storage keeps exactly today's meaning of each stored word", () => {
    let n = 0;
    for (const c of cases) {
      if (!("migrate" in c)) continue;
      n++;
      const got = fromPageStorage(c.migrate, c.raw);
      if (c.absent) expect(got, JSON.stringify(c)).toBeUndefined();
      else expect(got, JSON.stringify(c)).toEqual(c.value);
    }
    expect(n).toBeGreaterThanOrEqual(15);
    expect(Object.keys(MIGRATION_MAPS).sort()).toEqual(["isOn", "isOne", "notOff", "notZero", "textSize"]);
  });
  test("a number between steps is put on the nearest step, and never past the top", () => {
    expect(validateKey("work.maxTurns", 199)).toEqual({ ok: true, value: 200 });
    expect(validateKey("spend.dailyLimit", 499.999)).toEqual({ ok: true, value: 500 });
    expect(validateKey("spend.dailyLimit", 19.99)).toEqual({ ok: true, value: 19.99 });
  });
  test("a value that looks like a key or a password is never kept", () => {
    for (const s of ["sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAA", "ghp_abcdefghijklmnopqrstuvwxyz0123", "my password: hunter2hunter", "0123456789abcdef0123456789abcdef"]) expect(looksSecret(s), s).toBe(true);
    for (const s of ["Sign up", "Welcome back", "Save changes", "Total: 3 items"]) expect(looksSecret(s), s).toBe(false);
  });
});

describe("a broken list of settings is caught", () => {
  const base = (): Registry => JSON.parse(JSON.stringify(REGISTRY));
  const one = (patch: Partial<Def> & { key?: string }, kind?: string): string[] => {
    const r = base();
    const d = { ...(r.settings.find((x) => x.key === (kind ?? "work.maxTurns"))!), ...patch } as Def;
    r.settings = [...r.settings.filter((x) => x.key !== (kind ?? "work.maxTurns")), d];
    return checkRegistry(r);
  };
  test("a usual value outside its own range", () => expect(one({ default: 500 }).join()).toContain("work.maxTurns"));
  test("a range with nothing in it, or a step that does not fit", () => {
    expect(one({ min: 200, max: 20 }).length).toBeGreaterThan(0);
    expect(one({ step: 7 }).length).toBeGreaterThan(0);
    expect(one({ step: 0 }).length).toBeGreaterThan(0);
  });
  test("a choice with the same option twice, or a usual value that is not an option", () => {
    expect(one({ options: ["standard", "standard", "large"] }, "display.textSize").length).toBeGreaterThan(0);
    expect(one({ default: "huge" }, "display.textSize").length).toBeGreaterThan(0);
  });
  test("a section, a store, a kind or a reader that does not exist", () => {
    expect(one({ section: "nowhere" }).length).toBeGreaterThan(0);
    expect(one({ store: "cloud" as never }).length).toBeGreaterThan(0);
    expect(one({ kind: "slider" as never }).length).toBeGreaterThan(0);
    expect(one({ applies: ["phone" as never] }).length).toBeGreaterThan(0);
    expect(one({ applies: [] }).length).toBeGreaterThan(0);
  });
  test("a name that is not dotted lowerCamel, or used twice", () => {
    expect(one({ key: "Work.max_turns" }).length).toBeGreaterThan(0);
    const r = base(); r.settings.push({ ...r.settings[0] });
    expect(checkRegistry(r).length).toBeGreaterThan(0);
  });
  test("protective only for lists a person adds protections to, and never a plain setting as custom", () => {
    expect(one({ protective: true }).length).toBeGreaterThan(0);
    expect(one({ kind: "custom", default: null }).length).toBeGreaterThan(0);
  });
  test("a migration from a map that does not exist", () => {
    expect(one({ from: { pageStorage: { name: "companion.x", map: "maybe" as never } } }, "fun.reactions").length).toBeGreaterThan(0);
  });
  test("the engine's own stores only for settings the engine applies, for every project", () => {
    expect(one({ applies: ["pages"] }, "spend.dailyLimit").length).toBeGreaterThan(0);
    expect(one({ scope: "project" }, "explain.on").length).toBeGreaterThan(0);
  });
});

describe("the engine inside the app has the registry", () => {
  test("every protocol file the engine imports is copied into the app by the staging script", () => {
    // The installed app's engine is a copy (app/scripts/stage-engine.sh): a protocol file it imports but the script leaves
    // out would stop the engine at launch while every test here passes.
    const src = new URL("../src/", import.meta.url).pathname;
    const files: string[] = [];
    const walk = (d: string) => { for (const n of readdirSync(d)) { const f = join(d, n); if (statSync(f).isDirectory()) walk(f); else if (f.endsWith(".ts")) files.push(f); } };
    walk(src);
    const needed = new Set<string>();
    for (const f of files) for (const m of readFileSync(f, "utf8").matchAll(/from "(?:\.\.\/)+protocol\/([\w.]+)"/g)) needed.add(m[1]);
    // And what those protocol files import themselves.
    for (const n of [...needed]) for (const m of readFileSync(new URL(`../../protocol/${n}`, import.meta.url), "utf8").matchAll(/from "\.\/([\w.]+)"/g)) needed.add(m[1]);
    expect([...needed].sort()).toEqual(expect.arrayContaining(["index.ts", "settings.json", "settings.ts"]));
    const stage = readFileSync(new URL("../../app/scripts/stage-engine.sh", import.meta.url), "utf8");
    const line = stage.split("\n").find((l) => l.startsWith("cp protocol/")) ?? "";
    for (const n of needed) expect(line, n).toContain(`protocol/${n}`);
  });
});
