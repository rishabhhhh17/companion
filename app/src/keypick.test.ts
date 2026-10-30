// Finding L: any chord, picked without reading a key press. The person ticks Control, Option, Shift and Command and chooses
// the key from a list; the page builds the id and shows why it is not enough, and the app checks it again (keymap.rs why_not).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { CUSTOM_KEYS, MAC_OWN, chordLabel, customChord, keyProblem } from "./keys.ts";
import { S } from "./strings.ts";

const keymapRs = readFileSync(new URL("../src-tauri/src/keymap.rs", import.meta.url), "utf8");
const page = readFileSync(new URL("./settingsPage.tsx", import.meta.url), "utf8");
const none = { control: false, option: false, shift: false, command: false };
const tick = (...m: ("control" | "option" | "shift" | "command")[]) => Object.fromEntries(Object.keys(none).map((k) => [k, m.includes(k as never)])) as typeof none;

describe("building a chord from ticks and a key", () => {
  test("the id is the app's: the modifiers in the Mac's order, then the key", () => {
    expect(customChord(tick("command", "control"), "z")).toEqual({ id: "control-command-z" });
    expect(customChord(tick("shift", "control", "option", "command"), "7")).toEqual({ id: "control-option-shift-command-7" });
    expect(customChord(tick("control", "shift"), "space")).toEqual({ id: "control-shift-space" });
    expect(chordLabel("control-shift-7")).toBe("Control, Shift and 7");
    expect(chordLabel("control-option-z")).toBe("Control, Option and Z");
  });
  test("fewer than two modifiers, or only Option and Shift, are not enough, with the reason in plain words", () => {
    for (const t of [tick(), tick("control"), tick("command"), tick("option"), tick("option", "shift")]) {
      expect(customChord(t, "z"), JSON.stringify(t)).toEqual({ problem: "not_enough" });
    }
    expect(S.keysNotEnough).toContain("two");
    expect(S.keysNotEnough).toContain("Control or Command");
  });
  test("the Mac's own shortcuts are not offered, the same ones the app refuses", () => {
    expect(customChord(tick("command", "shift"), "4")).toEqual({ problem: "reserved" });
    expect(customChord(tick("control", "command"), "q")).toEqual({ problem: "reserved" });
    expect(customChord(tick("command", "shift"), "2")).toEqual({ id: "shift-command-2" });
    const rust = [...keymapRs.slice(keymapRs.indexOf("const MAC_OWN"), keymapRs.indexOf("];", keymapRs.indexOf("const MAC_OWN"))).matchAll(/Chord::new\(([A-Z |]+), Key::(\w+)\)/g)]
      .map((x) => [x[1].split("|").map((n) => n.trim().toLowerCase()).sort().join("-"), x[2].startsWith("N") ? x[2].slice(1) : x[2].toLowerCase()].join(":"));
    const ours = MAC_OWN.map((c) => { const p = c.split("-"); const k = p.pop()!; return `${p.sort().join("-")}:${k}`; });
    expect(ours.sort()).toEqual(rust.sort());
  });
  test("a key that is not in the list is never built", () => {
    for (const bad of ["", "tab", "f1", "escape", "ß", "ZZ", "control"]) expect(customChord(tick("control", "option"), bad), bad).toEqual({ problem: "unknown" });
  });
  test("the list is the letters, the digits and Space, the same keys the app knows", () => {
    expect(CUSTOM_KEYS.length).toBe(37);
    expect(CUSTOM_KEYS.slice(0, 26).join("")).toBe("abcdefghijklmnopqrstuvwxyz");
    expect(CUSTOM_KEYS.slice(26, 36).join("")).toBe("0123456789");
    expect(CUSTOM_KEYS[36]).toBe("space");
    const table = [...keymapRs.matchAll(/\(Key::\w+, Code::\w+, "(\w+)", "\w+"\)/g)].map((x) => x[1]);
    expect([...CUSTOM_KEYS, "return"].sort()).toEqual(table.sort());
  });
});

describe("what the app says when it refuses", () => {
  test("every code has its own plain sentence", () => {
    for (const code of ["taken", "in_use", "not_saved", "not_enough", "reserved"]) {
      const l = keyProblem(code);
      expect(l, code).toMatch(/\.$/); expect(l).not.toBe(S.keysFailed); expect(l).not.toContain("—");
    }
    expect(keyProblem("whatever")).toBe(S.keysFailed);
    expect(keyProblem("taken")).toBe(S.keysTaken); expect(keyProblem("in_use")).toBe(S.keysInUse);
  });
});

describe("the picker in Settings", () => {
  test("sits under the presets, which stay as they are, and sends only an id to the app", () => {
    const picker = page.slice(page.indexOf("function KeySheet("), page.indexOf("// Talking and listening"));
    expect(picker).toContain("c.choices.map(");              // the presets, as before
    expect(picker).toContain("customChord(");
    expect(picker).toContain('invoke("set_key", { action: job, id })');
    expect(picker).toContain("S.keysCustomUse");
    // The words: a switch for each of Control, Option, Shift and Command, and a list (the Menu part), never a box that
    // reads a key press (rule 8).
    expect(picker).toContain("<Switch checked={t[mod]} label={S.keyWords[mod]}"); expect(picker).toContain("<Menu label={S.keysCustomKey}");
    expect(picker).not.toMatch(/onKeyDown|onKeyUp|keydown|keyup|KeyboardEvent/);
    // The Menu's own keys only move through its list, inside its own focused window; they never become a chord or reach
    // the app.
    const parts = readFileSync(new URL("./ui/parts.tsx", import.meta.url), "utf8");
    expect(parts).not.toMatch(/invoke\(|set_key|customChord|addEventListener\("key/);
  });
  test("its words exist, and say what the boxes are for", () => {
    for (const k of ["keysCustomTitle", "keysCustomHelp", "keysCustomKey", "keysCustomUse", "keysNotEnough", "keysReserved"] as const) expect(typeof S[k], k).toBe("string");
    expect(S.keysCustomHelp).toContain("Control or Command");
    // The modifiers are switches, so the words say turn on, never tick (review, 31 Oct).
    expect(S.keysCustomHelp).toMatch(/^Turn on at least two/);
  });
});
