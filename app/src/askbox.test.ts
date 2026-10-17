import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { askKey, draftToKeep, MAX_DRAFT } from "./askbox.ts";

const k = (key: string, o: { shift?: boolean; composing?: boolean; alt?: boolean; meta?: boolean; ctrl?: boolean } = {}) =>
  askKey({ key, shift: !!o.shift, alt: !!o.alt, meta: !!o.meta, ctrl: !!o.ctrl, composing: !!o.composing });
const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");

describe("the ask box keys", () => {
  test("Return sends, as it always did", () => expect(k("Enter")).toBe("send"));
  test("Shift and Return starts a new line, and so does Option and Return", () => {
    expect(k("Enter", { shift: true })).toBe("newline");
    expect(k("Enter", { alt: true })).toBe("newline");
  });
  test("while an input method is composing (Japanese, Chinese, Korean), Return belongs to it", () => {
    expect(k("Enter", { composing: true })).toBeNull();
    expect(k("Enter", { composing: true, shift: true })).toBeNull();
  });
  test("other keys, and Return with Command or Control, are left alone", () => {
    expect(k("a")).toBeNull();
    expect(k("Tab")).toBeNull();
    expect(k("Enter", { meta: true })).toBeNull();
    expect(k("Enter", { ctrl: true })).toBeNull();
  });
  test("the box is several lines tall when needed, and its keys go through askKey", () => {
    expect(card).toMatch(/<textarea ref=\{box\}/);
    expect(card).toContain("askKey({");
    expect(card).not.toMatch(/<input ref=\{box\}/);
  });
});

describe("words from hold to talk", () => {
  test("sent by themselves, they go with the folder and settings of now, not of when the setting was last changed", () => {
    const heard = card.slice(card.indexOf('ev.stage === "heard"'), card.indexOf('dispatch({ type: "ui.voiceClosed" })'));
    expect(heard).toContain("setTimeout(() => submitNow.current(), 0)");
    expect(heard).not.toMatch(/setTimeout\(\(\) => submit\(\)/);
    expect(card).toContain("const submitNow = useRef(submit); submitNow.current = submit;");
  });
});

describe("the draft kept on this Mac", () => {
  test("what is typed is kept, as typed, with its new lines", () => {
    expect(draftToKeep("Make the signup button blue\nand bigger", false)).toBe("Make the signup button blue\nand bigger");
  });
  test("nothing is kept for an empty box", () => {
    expect(draftToKeep("", false)).toBeNull();
    expect(draftToKeep("  \n ", false)).toBeNull();
  });
  test("nothing is kept off the record", () => expect(draftToKeep("Fix the login page", true)).toBeNull());
  test("a draft that holds something that looks like a key or a password is never kept", () => {
    expect(draftToKeep("use this key sk-ant-api03-abcdefghijklmnopqrstuvwx to call it", false)).toBeNull();
    expect(draftToKeep("the database password=hunter22 is wrong", false)).toBeNull();
    expect(draftToKeep("connect with postgres://me:secretpw@db.example.com/app", false)).toBeNull();
  });
  test("a very long draft is cut to its first part, never split inside a character", () => {
    const long = "é".repeat(MAX_DRAFT + 50);
    const kept = draftToKeep(long, false)!;
    expect(Array.from(kept).length).toBe(MAX_DRAFT);
    expect(draftToKeep("🙂".repeat(MAX_DRAFT + 1), false)).toBe("🙂".repeat(MAX_DRAFT));
  });
  test("the card keeps the draft through these rules, and clears it whenever the box is emptied by sending", () => {
    expect(card).toContain("draftToKeep(");
    const submit = card.slice(card.indexOf("const submit = () => {"), card.indexOf("// Which task broke it"));
    expect(submit).toContain("clearBox()");
    const plan = card.slice(card.indexOf("const plan = () => {"), card.indexOf("return (", card.indexOf("const plan = () => {")));
    expect(plan).toContain("clearBox()");
    const research = card.slice(card.indexOf("const research = () => {"), card.indexOf("const plan = () => {"));
    expect(research).toContain("clearBox()");
    expect(card).not.toMatch(/box\.current\.value = ""/);
  });
});
