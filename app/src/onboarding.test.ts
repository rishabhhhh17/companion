import { describe, expect, test } from "bun:test";
import { addMemory } from "./commands.ts";
import { back, canContinue, commandsFor, DEFAULT_ANSWERS, effectsOf, groupSettingsFor, keyLooksRight, next, QUESTIONS, settingsFor, STEPS } from "./onboarding.ts";
import { readFileSync } from "node:fs";
import { S } from "./strings.ts";

describe("moving through the first run", () => {
  test("the steps go in order, and the first and last have nowhere to go", () => {
    expect(next("welcome")).toBe("connect"); expect(next("first")).toBeNull(); expect(back("connect")).toBe("welcome"); expect(back("welcome")).toBeNull();
    expect(STEPS.length).toBe(8);
  });
  test("the practice comes in minute one: right after Connect, before the folder, the questions and the permissions (F17)", () => {
    expect(STEPS.slice(0, 4)).toEqual(["welcome", "connect", "practice", "folder"]);
    expect(next("connect")).toBe("practice"); expect(next("practice")).toBe("folder"); expect(back("folder")).toBe("practice");
    // It can always be skipped, and it never comes before Connect (the fix needs Claude).
    expect(canContinue("practice", { connected: true, project: "" })).toBe(true);
    expect(STEPS.indexOf("practice")).toBeGreaterThan(STEPS.indexOf("connect"));
  });
  test("you cannot move past connecting Claude or choosing a folder until it is done", () => {
    expect(canContinue("connect", { connected: false, project: "/p" })).toBe(false);
    expect(canContinue("connect", { connected: true, project: "" })).toBe(true);
    expect(canContinue("folder", { connected: true, project: "" })).toBe(false);
    expect(canContinue("folder", { connected: true, project: "/p" })).toBe(true);
    for (const s of ["welcome", "practice", "questions", "groups", "permissions", "first"] as const) expect(canContinue(s, { connected: false, project: "" })).toBe(true);
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
  test("a step after the questions and before the permissions, which can always be passed", () => {
    expect(next("questions")).toBe("groups"); expect(next("groups")).toBe("permissions"); expect(back("permissions")).toBe("groups");
    expect(canContinue("groups", { connected: false, project: "" })).toBe(true);
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
  test("skipping the questions goes on to the groups, and the practice route keeps nothing from this step", () => {
    const ui = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
    expect(ui).toContain('onClick={() => { setAnswers(DEFAULT_ANSWERS); go("groups"); }}');
    expect(ui).toContain("onDone(); startPractice(first.id);");
  });
});
