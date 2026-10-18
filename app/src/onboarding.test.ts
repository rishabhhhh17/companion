import { describe, expect, test } from "bun:test";
import { addMemory } from "./commands.ts";
import { back, canContinue, commandsFor, DEFAULT_ANSWERS, effectsOf, keyLooksRight, next, QUESTIONS, settingsFor, STEPS } from "./onboarding.ts";
import { readFileSync } from "node:fs";

describe("moving through the first run", () => {
  test("the steps go in order, and the first and last have nowhere to go", () => {
    expect(next("welcome")).toBe("connect"); expect(next("first")).toBeNull(); expect(back("connect")).toBe("welcome"); expect(back("welcome")).toBeNull();
    expect(STEPS.length).toBe(6);
  });
  test("you cannot move past connecting Claude or choosing a folder until it is done", () => {
    expect(canContinue("connect", { connected: false, project: "/p" })).toBe(false);
    expect(canContinue("connect", { connected: true, project: "" })).toBe(true);
    expect(canContinue("folder", { connected: true, project: "" })).toBe(false);
    expect(canContinue("folder", { connected: true, project: "/p" })).toBe(true);
    for (const s of ["welcome", "questions", "permissions", "first"] as const) expect(canContinue(s, { connected: false, project: "" })).toBe(true);
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
    expect(settingsFor({ explain: false, short: true, plain: true, autoSend: true })).toEqual([["explain.on", false], ["talk.autoSend", true]]);
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
