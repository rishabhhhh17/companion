// The Settings rows for checking a project (checkRows.ts, area 2 of the settings plan), as plain code: what the start
// choice offers, which checks can be left out, when the project's own files win, the house rules editor, and what
// lowering "Pictures to keep" says first. Every word comes from strings.ts.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { defOf } from "../../protocol/settings.ts";
import { S } from "./strings.ts";
import { addRule, afterPressShown, askRuleOn, factsFrom, installNote, picturesGoing, proofLines, removeRule, ruleKindOptions, skipItems, startOptions, type CheckFacts } from "./checkRows.ts";
import { valueWords } from "./settingsRows.ts";

const facts = (o: Partial<CheckFacts> = {}): CheckFacts => ({ project: "/p", scripts: ["dev", "preview", "web"], checks: ["lint", "test"], proofFile: null, launchFile: false, ...o });

describe("the facts come from the engine's project report", () => {
  test("only the fields the rows need, read carefully", () => {
    expect(factsFrom({ type: "project.report", project: "/p", scripts: ["dev", 3, "x"], checks: ["lint", "browser", "test"], proofFile: { expectText: ["Hi"], click: "#a", expectAfterClick: null }, launchFile: true })).toEqual({ project: "/p", scripts: ["dev", "x"], checks: ["lint", "test"], proofFile: { expectText: ["Hi"], click: "#a", expectAfterClick: null }, launchFile: true });
    expect(factsFrom({ type: "project.report", project: "/p" })).toEqual({ project: "/p", scripts: [], checks: [], proofFile: null, launchFile: false });
    expect(factsFrom({ type: "spending.state", project: "/p" })).toBeNull();
    expect(factsFrom(null)).toBeNull();
  });
});

describe("how to start this project for the check", () => {
  test("Let Companion find it first, then the project's own scripts, never a box to type a command in", () => {
    expect(startOptions("auto", facts())).toEqual([{ id: "auto", label: S.set["check.start"].options.auto }, { id: "dev", label: "dev" }, { id: "preview", label: "preview" }, { id: "web", label: "web" }]);
    expect(defOf("check.start")!.kind).toBe("choice");
  });
  test("a chosen script that is not there any more is still shown, said as gone", () => {
    expect(startOptions("old", facts()).at(-1)).toEqual({ id: "old", label: S.chkScriptGone("old") });
  });
  test("with nothing known about the project yet, only Let Companion find it", () => {
    expect(startOptions("auto", null)).toEqual([{ id: "auto", label: S.set["check.start"].options.auto }]);
  });
});

describe("checks to leave out", () => {
  test("only the checks the project has, plus any left out before, and never the start or browser check", () => {
    expect(skipItems(facts(), [])).toEqual(["lint", "test"]);
    expect(skipItems(facts({ checks: ["lint"] }), ["build"])).toEqual(["lint", "build"]);
    expect(skipItems(null, [])).toEqual(["typecheck", "lint", "build", "test"]);
    expect(skipItems(facts({ checks: ["browser", "start"] as never }), [])).toEqual([]);
  });
  test("the row's value is said in words", () => {
    expect(valueWords(defOf("check.skip")!, ["lint", "test"])).toBe("The lint check, The tests");
  });
});

describe("the project's own files win", () => {
  test("with a .claude/proof.json, its words and button are shown, read only", () => {
    expect(proofLines("check.mustSee", facts())).toEqual([]);
    const f = facts({ proofFile: { expectText: ["Hello", "Sign up"], click: "#buy", expectAfterClick: "Thanks" } });
    expect(proofLines("check.mustSee", f)).toEqual([S.chkProofFile, S.chkProofShows("Hello, Sign up")]);
    expect(proofLines("check.press", f)).toEqual([S.chkProofFile, S.chkProofShows("#buy")]);
    expect(proofLines("check.afterPress", f)).toEqual([S.chkProofFile, S.chkProofShows("Thanks")]);
    expect(proofLines("check.press", facts({ proofFile: { expectText: [], click: null, expectAfterClick: null } }))).toEqual([S.chkProofFile, S.chkProofShows(S.setNone)]);
    expect(proofLines("check.time", f)).toEqual([]);
  });
  test("words after pressing are shown only when there is a button to press", () => {
    expect(afterPressShown("", facts())).toBe(false);
    expect(afterPressShown("Add to cart", facts())).toBe(true);
    expect(afterPressShown("", facts({ proofFile: { expectText: [], click: "#a", expectAfterClick: "Done" } }))).toBe(true);
  });
});

describe("installing packages and the house rule", () => {
  test("the rule 'ask before installing packages' makes it ask, and the row says why", () => {
    expect(askRuleOn(["never edit .env"])).toBe(false);
    expect(askRuleOn(["Ask before installing  packages"])).toBe(true);
    expect(installNote("auto", ["ask before installing packages"])).toBe(S.chkAskRule);
    expect(installNote("ask", ["ask before installing packages"])).toBeNull();
    expect(installNote("never", ["ask before installing packages"])).toBeNull();
    expect(installNote("auto", [])).toBeNull();
  });
});

describe("the house rules editor", () => {
  test("a rule is built from one of the five kinds and what it is about", () => {
    expect(ruleKindOptions().map((o) => o.id)).toEqual(["never_edit", "never_run", "ask_edit", "ask_run", "ask_install"]);
    expect(addRule([], "never_edit", "  .env ")).toEqual({ ok: true, list: ["never edit .env"] });
    expect(addRule(["never edit .env"], "ask_install", "")).toEqual({ ok: true, list: ["never edit .env", "ask before installing packages"] });
    expect(addRule([], "never_run", " ")).toEqual({ ok: false, problem: S.rulesNeedWhat });
    expect(addRule(["never edit .env"], "never_edit", ".env")).toEqual({ ok: false, problem: S.rulesAlready });
    expect(addRule([], "never_run", "x".repeat(200))).toEqual({ ok: false, problem: S.setProblem.tooLong(200) });
    expect(addRule([], "never_run", "sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAA")).toEqual({ ok: false, problem: S.setProblem.secret });
  });
  test("up to fifty rules can be added, and taking one off always works", () => {
    const fifty = Array.from({ length: 50 }, (_, i) => `never edit f${i}`);
    expect(addRule(fifty, "never_edit", "more")).toEqual({ ok: false, problem: S.setProblem.tooMany(50) });
    expect(removeRule(fifty, "never edit f3")).toHaveLength(49);
    expect(removeRule(["a", "b"], "c")).toEqual(["a", "b"]);
  });
  test("it is never reset: no Reset on its row, and it is left out of every reset", () => {
    expect(defOf("rules.house")!.protective).toBe(true);
  });
});

describe("pictures to keep", () => {
  test("lowering it below the pictures kept says first how many go", () => {
    expect(picturesGoing(230, 200, 100)).toBe(130);
    expect(picturesGoing(230, 200, 0)).toBe(230);
    expect(picturesGoing(80, 200, 100)).toBe(0);
    expect(picturesGoing(230, 100, 200)).toBe(0);   // raising it removes nothing
    expect(picturesGoing(undefined, 200, 50)).toBe(0);
    expect(S.chkPicturesGo(130, 100)).toContain("130");
  });
});

describe("the page draws these rows", () => {
  test("the Settings page uses each special row, and writes no setting itself", () => {
    const src = readFileSync(new URL("./settingsPage.tsx", import.meta.url), "utf8");
    for (const f of ["startOptions(", "skipItems(", "proofLines(", "afterPressShown(", "installNote(", "picturesGoing(", "HouseRules", "factsFrom("]) expect(src, f).toContain(f);
    expect(src).not.toContain("localStorage.setItem(\"companion.rules");
  });
});
