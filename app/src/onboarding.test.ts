import { describe, expect, test } from "bun:test";
import { addMemory } from "./commands.ts";
import { back, canContinue, commandsFor, DEFAULT_ANSWERS, effectsOf, groupSettingsFor, keyCheck, keyLooksRight, KEY_PAGE, next, QUESTIONS, REQUIRED, settingsFor, STEPS } from "./onboarding.ts";
import { readFileSync } from "node:fs";
import { S } from "./strings.ts";

describe("moving through the first run", () => {
  test("see it work, connect, pick a folder, and an optional last step; the first and last have nowhere to go", () => {
    expect([...STEPS]).toEqual(["look", "connect", "folder", "yours"]);
    expect(next("look")).toBe("connect"); expect(next("connect")).toBe("folder"); expect(next("folder")).toBe("yours"); expect(next("yours")).toBeNull();
    expect(back("connect")).toBe("look"); expect(back("look")).toBeNull();
    expect([...REQUIRED]).toEqual(["connect", "folder"]);
  });
  test("the hero comes first, before any key, folder or question (F17; product doc section 4: a demo before connecting)", () => {
    expect(STEPS[0]).toBe("look");
    expect(canContinue("look", { connected: false, project: "" })).toBe(true);
    // The real practice is still one press away, on the folder step, and taking it ends the first run there.
    const ui = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
    expect(ui).toContain('if (step === "look") return');
    expect(ui).toContain("<FirstLook onGo={() => go(next(step))} />");
    expect(ui.indexOf("onDone(); startPractice(first.id);")).toBeGreaterThan(ui.indexOf('{step === "folder" && ('));
  });
  test("you cannot move past connecting Claude or choosing a folder until it is done", () => {
    expect(canContinue("connect", { connected: false, project: "/p" })).toBe(false);
    expect(canContinue("connect", { connected: true, project: "" })).toBe(true);
    expect(canContinue("folder", { connected: true, project: "" })).toBe(false);
    expect(canContinue("folder", { connected: true, project: "/p" })).toBe(true);
    for (const s of ["look", "yours"] as const) expect(canContinue(s, { connected: false, project: "" })).toBe(true);
  });
});

describe("the questions", () => {
  test("there are at most five, and every answer says what it changes", () => {
    expect(QUESTIONS.length).toBeLessThanOrEqual(5);
    for (const q of QUESTIONS) { expect(q.yesEffect.length).toBeGreaterThan(10); expect(q.noEffect.length).toBeGreaterThan(10); expect(q.yesEffect).not.toBe(q.noEffect); }
  });
  test("the effects shown match the answers given", () => {
    const e = effectsOf({ ...DEFAULT_ANSWERS, short: true, autoSend: true });
    expect(e.some((x) => /short/i.test(x))).toBe(true); expect(e.some((x) => /straight away/i.test(x))).toBe(true);
  });
  test("answers become lines in the profile with their source, and settings changed through the shell", () => {
    const cmds = commandsFor({ explain: false, short: true, plain: true, autoSend: false }, "/p", (scope, text, source) => addMemory("/p", scope, text, source)) as any[];
    expect(cmds.some((c) => c.type === "explain.set")).toBe(false);
    expect(settingsFor({ explain: false, short: true, plain: true, autoSend: true })).toEqual([["explain.mode", "off"], ["talk.autoSend", true]]);
    expect(settingsFor(DEFAULT_ANSWERS)).toEqual([["explain.mode", "reasonsAndQuestion"], ["talk.autoSend", false]]);
    // Explain and auto send are settings (T16): the first run changes them the way Settings does, never by its own command.
    const ui = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
    expect(ui).toContain("for (const [key, on] of settingsFor(answers)) void changeSetting(key, on);");
    expect(ui).not.toContain("setExplain");
    expect(cmds.filter((c) => c.type === "memory.add").map((c) => c.text)).toEqual(["Prefers short answers", "Prefers plain words, no jargon"]);
    expect(cmds.every((c) => c.type !== "memory.add" || c.source === "your answer at setup")).toBe(true);
  });
  test("saying no to everything adds nothing to the profile", () => {
    const cmds = commandsFor({ explain: true, short: false, plain: false, autoSend: false }, "/p", (s, t, so) => addMemory("/p", s, t, so)) as any[];
    expect(cmds.filter((c) => c.type === "memory.add")).toEqual([]);
  });
});

describe("the key is checked with Anthropic when it is saved", () => {
  test("nothing before a save; checking until the answer for this save arrives; an older answer is never shown", () => {
    expect(keyCheck(null, { result: "works", at: 5 })).toBeNull();
    expect(keyCheck(100, null)).toBe("checking");
    expect(keyCheck(100, { result: "works", at: 50 })).toBe("checking");
    expect(keyCheck(100, { result: "refused", at: 120 })).toBe("refused");
    expect(keyCheck(100, { result: "works", at: 100 })).toBe("works");
  });
  test("a refused key cannot be continued past, and every answer is in plain words", () => {
    const ui = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
    expect(ui).toContain('disabled={!canContinue(step, ctx) || (step === "connect" && check === "refused")}');
    for (const k of ["checking", "works", "refused", "no_connection", "unknown"] as const) { expect(S.obKeyCheck[k].length).toBeGreaterThan(10); expect(S.obKeyCheck[k]).not.toMatch(/40[13]|status|HTTP|models/); }
  });
  test("Get a key opens Anthropic's own page, only on the person's press, and a failure never shows a raw error", () => {
    expect(KEY_PAGE).toBe("https://console.anthropic.com/settings/keys");
    const ui = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
    expect(ui).toContain('onClick={() => void invoke("open_link", { url: KEY_PAGE })');
    expect(ui).not.toContain("String(e)");
  });
});

describe("the key box", () => {
  const good = "sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcdefgh";
  test("a good key passes; mistakes are explained in plain words", () => {
    expect(keyLooksRight(good)).toBeNull(); expect(keyLooksRight(` ${good}\n`)).toBeNull();
    for (const bad of ["", "hello", "sk-ant-short", `${good} extra`, "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789abcdef"]) expect(keyLooksRight(bad)).toMatch(/\.$/);
  });
  test("the message never repeats what was typed", () => { expect(keyLooksRight("sk-ant-secretsecret space")).not.toContain("secretsecret"); });
});

// Found in the M11 audit (A81): the first run said Screen Recording comes only with Show me and Accessibility only with
// Prompt help and the error explainer, and INSTALL.md gave other, incomplete reasons. Both now name every feature that asks.
describe("the first run and INSTALL name every feature that asks for each permission", () => {
  const install = readFileSync(new URL("../../docs/alpha/INSTALL.md", import.meta.url), "utf8");
  const section = install.slice(install.indexOf("## What it asks for, and when"), install.indexOf("## The keys"));
  test("Accessibility: Prompt help, the error explainer and Do it for me", () => {
    for (const t of [S.obPerm1, section]) for (const f of ["Prompt help", "error", "Do it for me"]) expect(t, f).toContain(f);
  });
  test("Screen Recording: Show me, a lesson's step and Point at the problem", () => {
    for (const t of [S.obPerm2, section]) for (const f of ["Show me", "lesson", "Point at the problem"]) expect(t, f).toContain(f);
    expect(S.obPerm2).not.toMatch(/only the first time you use Show me,/);
  });
});

describe("the first run explains the four groups (F20 item 6)", () => {
  test("the groups have their place in the optional last step, after the questions, which can always be passed", () => {
    const ui = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
    const yours = ui.slice(ui.indexOf('{step === "yours" && ('));
    expect(yours.indexOf("S.groups.firstTitle")).toBeGreaterThan(yours.indexOf("S.obQuestionsTitle"));
    expect(canContinue("yours", { connected: false, project: "" })).toBe(true);
  });
  test("each group is explained in one short line, four lines in all, in plain words with no score or level", () => {
    const lines = Object.values(S.groups.short);
    expect(lines.length).toBe(4);
    for (const l of lines) { expect(l.length).toBeGreaterThan(20); expect(l.length).toBeLessThan(110); expect(l).toMatch(/\.$/); }
  });
  test("switching a group off in the first run changes the same setting Settings does, and leaving it on changes nothing", () => {
    expect(groupSettingsFor([])).toEqual([]);
    expect(groupSettingsFor(["voice", "files"])).toEqual([["voice.on", false], ["files.on", false]]);
    const ui = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
    expect(ui).toContain("for (const [key, on] of groupSettingsFor(groupsOff)) void changeSetting(key, on);");
  });
  test("Skip and start keeps nothing from the last step (the usual answers, every group on), and the practice route neither", () => {
    const ui = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
    expect(ui).toContain('onClick={() => finish(false)}>{S.obSkipStart}');
    expect(ui).toContain("if (keep) {");
    expect(ui).toContain("onDone(); startPractice(first.id);");
  });
});

describe("Home opens by itself at the very first launch", () => {
  test("the page asks once when the first run is not finished; the shell opens Home once per launch, without the keyboard", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).toContain('useEffect(() => { if (!onboarded) void invoke("first_run_open").catch(() => {}); }, []);');
    const main = readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");
    const fn = main.slice(main.indexOf("fn first_run_open("), main.indexOf("\n}\n", main.indexOf("fn first_run_open(")));
    expect(fn).toContain('if window.label() != "card"');
    expect(fn).toContain("FIRST_RUN_OPENED.swap(true, Ordering::SeqCst)");
    expect(fn).toContain('open_card(&app, "first_run", false);');   // rule 9: never the keyboard unasked
    expect(fn).not.toContain("makeKey");
  });
});
