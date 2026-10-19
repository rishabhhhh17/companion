// The Settings rows for checking a project (checkRows.ts, area 2 of the settings plan), as plain code: what the start
// choice offers, which checks can be left out, when the project's own files win, the house rules editor, and what
// lowering "Pictures to keep" says first. Every word comes from strings.ts.
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { defOf } from "../../protocol/settings.ts";
import { S } from "./strings.ts";
import { addRule, afterPressShown, askRuleOn, factsFrom, installNote, picturesGoing, proofLines, removeRule, ruleKindOptions, skipItems, startOptions, type CheckFacts } from "./checkRows.ts";
import { problemWords, valueWords } from "./settingsRows.ts";
import { _invokeForTests, _resetForTests, changeSetting } from "./settingsStore.ts";

afterEach(() => { _resetForTests(); _invokeForTests(null); });
const page = readFileSync(new URL("./settingsPage.tsx", import.meta.url), "utf8");
const part = (start: string) => { const at = page.indexOf(start); return page.slice(at, page.indexOf("\n}\n", at)); };

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
    expect(startOptions("auto", facts({ scripts: ["dev", "preview", "start:web"] }))).toEqual([{ id: "auto", label: S.set["check.start"].options.auto }, { id: "dev", label: "dev" }, { id: "preview", label: "preview" }, { id: "start:web", label: "start:web" }]);
    expect(defOf("check.start")!.kind).toBe("choice");
  });
  test("only scripts that start the project are offered, whatever the report holds: never a build, the tests or a deploy", () => {
    expect(startOptions("auto", facts({ scripts: ["build", "deploy", "dev", "test", "web"] })).map((o) => o.id)).toEqual(["auto", "dev"]);
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

describe("house rules are saved only for the project they came from", () => {
  test("Save says which project's list it is; every other change is sent as before", async () => {
    const calls: { cmd: string; args?: Record<string, unknown> }[] = [];
    _invokeForTests(async (cmd, args) => { calls.push({ cmd, args }); return { values: {} }; });
    await changeSetting("rules.house", ["never edit .env"], "/Users/me/a");
    await changeSetting("fun.reactions", false);
    expect(calls).toEqual([
      { cmd: "settings_set", args: { key: "rules.house", value: ["never edit .env"], project: "/Users/me/a" } },
      { cmd: "settings_set", args: { key: "fun.reactions", value: false } },
    ]);
    expect(Object.keys(calls[1].args!)).toEqual(["key", "value"]);
  });
  test("another project drops a list that was not saved, and a save the shell refuses says why", () => {
    // Keyed by its project: when the folder changes (a copy from a link that finishes opens its own), the editor starts again.
    expect(page).toMatch(/<HouseRules key=\{shownFor\} project=\{shownFor\} /);
    expect(page).toContain("const shownFor = snapshotNow()?.project ?? project;");
    expect(part("function HouseRules(")).toContain('changeSetting("rules.house", list, project)');
    expect(problemWords("projectChanged")).toBe(S.setProblem.projectChanged);
    expect(S.setProblem.projectChanged).not.toBe(S.setProblem.other);
  });
});

describe("the keyboard and VoiceOver on these rows", () => {
  test("after Pictures to keep asks first, Cancel gives the keyboard back to the number box, which can take it", () => {
    const keep = part("function PicturesKeep(");
    expect(keep).toContain("const inputId = useId();");
    expect(keep).toContain("back={inputId}");
    expect(keep).toContain("inputId={inputId}");
    expect(part("function NumberControl(")).toMatch(/<input id=\{inputId\} type="text"/);
  });
  test("after a rule is removed, the keyboard goes to the next rule's Remove, or to the Add box", () => {
    const rules = part("function HouseRules(");
    expect(rules).toContain("takeIfLost(() => document.getElementById(id))");
    expect(rules).toMatch(/const remove = \(rule: string\) => \{[^\n]*setFocusTo\(/);
    expect(rules).toContain("<select id={addId}");
  });
  test("what the editor says is one polite region that is always there, so VoiceOver reads each change", () => {
    const rules = part("function HouseRules(");
    expect(rules.match(/role="status"/g)).toHaveLength(1);
    expect(rules).not.toMatch(/\{(?:draft|note)[^}]*&& <div[^>]*role="status"/);
    expect(rules).toContain('<div className={said ? "line" : "sr"} role="status">{said}</div>');
  });
  test("a switch to leave a check out reads as a sentence", () => {
    expect(S.chkLeaveOut(S.set["check.skip"].options.typecheck)).toBe("Leave out the type check");
    expect(S.chkLeaveOut(S.set["check.skip"].options.test)).toBe("Leave out the tests");
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
