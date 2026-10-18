// Area 2 of the settings plan (docs/milestones/M11-customize-plan.md): checking your project. These check the settings
// themselves (their usual values are exactly today's behaviour, their limits are the plan's), the shared reading of house
// rules (protocol/fixtures/rules-cases.jsonl, also run by the shell's houserules.rs), and that nothing on the "never a
// setting" list became one: the start check and the browser check can never be left out, and a start can only be one of
// the project's own scripts, never a command.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkRegistry, defOf, REGISTRY, ruleOf, ruleText, RULE_KINDS, SCRIPT_NAME, validateKey, type Def, type Registry } from "../../protocol/settings.ts";
import { parseRules } from "../src/rules.ts";

const ruleCases = readFileSync(new URL("../../protocol/fixtures/rules-cases.jsonl", import.meta.url), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

describe("the settings for checking a project", () => {
  test("each one is there, in Checking your project, with today's behaviour as its usual value", () => {
    const want: Record<string, unknown> = {
      "rules.house": [], "check.mustSee": [], "check.press": "", "check.afterPress": "", "check.start": "auto", "check.skip": [],
      "check.time": "normal", "check.install": "auto", "check.pageSize": "desktop", "net.slow": false, "pictures.make": true,
      "pictures.keep": 200, "rescue.readDeployLog": true,
    };
    for (const [k, v] of Object.entries(want)) {
      expect(defOf(k), k).toBeDefined();
      expect(defOf(k)!.default, k).toEqual(v);
      expect(defOf(k)!.section, k).toBe("checks");
      expect(defOf(k)!.applies, k).toEqual(["runner"]);
    }
  });
  test("the per project ones are per project; slow internet, pictures and the deploy log are for every project", () => {
    for (const k of ["rules.house", "check.mustSee", "check.press", "check.afterPress", "check.start", "check.skip", "check.time", "check.install", "check.pageSize"]) expect(defOf(k)!.scope, k).toBe("project");
    for (const k of ["net.slow", "pictures.make", "pictures.keep", "rescue.readDeployLog"]) expect(defOf(k)!.scope, k).toBe("app");
  });
  test("their limits are the plan's", () => {
    expect(defOf("rules.house")).toMatchObject({ kind: "list", maxItems: 50, item: { maxLength: 200 }, protective: true, store: "rules" });
    expect(defOf("check.mustSee")).toMatchObject({ kind: "list", maxItems: 5, item: { maxLength: 80 }, store: "settings" });
    expect(defOf("check.press")).toMatchObject({ kind: "text", maxLength: 60 });
    expect(defOf("check.afterPress")).toMatchObject({ kind: "text", maxLength: 80 });
    expect(defOf("check.time")!.options).toEqual(["normal", "longer", "longest"]);
    expect(defOf("check.install")!.options).toEqual(["auto", "ask", "never"]);
    expect(defOf("check.pageSize")!.options).toEqual(["desktop", "phone", "both"]);
    expect(defOf("pictures.keep")).toMatchObject({ kind: "number", min: 0, max: 1000, step: 50, unit: "count" });
    expect(validateKey("pictures.keep", 0)).toEqual({ ok: true, value: 0 });
    expect(validateKey("pictures.keep", 1000)).toEqual({ ok: true, value: 1000 });
    expect(validateKey("pictures.keep", 1001)).toEqual({ ok: false, reason: "tooHigh" });
    expect(validateKey("pictures.keep", -50)).toEqual({ ok: false, reason: "tooLow" });
    expect(validateKey("check.mustSee", ["a", "b", "c", "d", "e", "f"])).toEqual({ ok: false, reason: "tooMany" });
    expect(validateKey("check.mustSee", ["x".repeat(81)])).toEqual({ ok: false, reason: "tooLong" });
    expect(validateKey("check.press", "y".repeat(61))).toEqual({ ok: false, reason: "tooLong" });
  });
  test("house rules are protective: never reset by a section or everything, and kept in the project's own file", () => {
    const d = defOf("rules.house")!;
    expect(d.protective).toBe(true);
    expect(d.store).toBe("rules");
  });
});

describe("the floors: what these settings can never do", () => {
  test("only the type check, the lint, the build and the tests can be left out; never the start or the browser check (F14)", () => {
    expect(defOf("check.skip")!.allowedItems).toEqual(["typecheck", "lint", "build", "test"]);
    for (const no of ["start", "browser", "review", "install", "Browser", "the browser check"]) expect(validateKey("check.skip", [no]), no).toEqual({ ok: false, reason: "notAllowed" });
    expect(validateKey("check.skip", ["lint", "test"])).toEqual({ ok: true, value: ["lint", "test"] });
  });
  test("a start is auto or the name of one of the project's own scripts, never a command", () => {
    for (const ok of ["auto", "dev", "start", "preview", "dev:web", "start.prod", "serve_local", "a"]) expect(validateKey("check.start", ok), ok).toEqual({ ok: true, value: ok });
    for (const no of ["", "dev; rm -rf ~", "npm run dev", "dev && curl x", "$(whoami)", "-x", ":dev", "dev server", "x".repeat(61), "dev\n", 7, null]) expect(validateKey("check.start", no), String(no)).toEqual({ ok: false, reason: "notChoice" });
    expect(SCRIPT_NAME.test("dev")).toBe(true);
    expect(SCRIPT_NAME.test("dev`id`")).toBe(false);
  });
  test("the choice whose options come from the project is the only kind of choice with one fixed option", () => {
    const base = (): Registry => JSON.parse(JSON.stringify(REGISTRY));
    const patch = (key: string, p: Partial<Def>) => { const r = base(); r.settings = r.settings.map((d) => (d.key === key ? { ...d, ...p } : d)); return checkRegistry(r); };
    expect(patch("check.start", { optionsFrom: undefined }).join()).toContain("check.start");
    expect(patch("check.time", { optionsFrom: "projectScripts" }).length).toBe(0);
    expect(patch("check.start", { optionsFrom: "anything" as never }).join()).toContain("check.start");
    expect(patch("check.press", { optionsFrom: "projectScripts" } as never).join()).toContain("check.press");
  });
});

describe("house rules are read the same way everywhere (shared cases)", () => {
  test("every case gives the same kind, pattern and text", () => {
    expect(ruleCases.length).toBeGreaterThanOrEqual(20);
    for (const c of ruleCases) {
      const r = ruleOf(c.line);
      if (c.kind === null) expect(r, JSON.stringify(c)).toBeNull();
      else expect(r, JSON.stringify(c)).toEqual({ kind: c.kind, pattern: c.pattern, text: c.text });
    }
  });
  test("the engine's own rules file reader agrees with every case", () => {
    for (const c of ruleCases) {
      const got = parseRules(c.line).rules;
      if (c.kind === null) expect(got, JSON.stringify(c)).toEqual([]);
      else expect(got, JSON.stringify(c)).toEqual([{ kind: c.kind, pattern: c.pattern, text: c.text }]);
    }
  });
  test("a rule built from one of the five kinds reads back as that kind", () => {
    expect(RULE_KINDS).toEqual(["never_edit", "never_run", "ask_edit", "ask_run", "ask_install"]);
    expect(ruleText("never_edit", "  .env ")).toBe("never edit .env");
    expect(ruleText("never_run", "npm   publish")).toBe("never run npm publish");
    expect(ruleText("ask_edit", "src/*")).toBe("ask before editing src/*");
    expect(ruleText("ask_run", "git push")).toBe("ask before running git push");
    expect(ruleText("ask_install", "")).toBe("ask before installing packages");
    expect(ruleText("never_edit", "")).toBeNull();
    expect(ruleText("never_run", "   ")).toBeNull();
    for (const k of RULE_KINDS) { const t = ruleText(k, "x"); if (t) expect(ruleOf(t)?.kind).toBe(k); }
  });
});
