// The key map as the pages see it (keys.ts): every job's keys, read safely from what the app answers, named in plain
// words, and filled into every line that names a key. The app keeps and registers the keys (keymap.rs).
import { afterEach, describe, expect, test } from "bun:test";
import { acceptHint, armedFor, canPick, choicesFrom, chordLabel, JOBS, KEY_DEFAULTS, keyHint, keyProblem, keysFrom, keysIn, keysNow, KEYS_START, keysOf, onKeys, setKeysNow, withKeys, type Keys } from "./keys.ts";
import { S } from "./strings.ts";

const swap = (job: keyof Keys["using"], id: string | null, picked?: string): Keys => ({ using: { ...KEYS_START.using, [job]: id }, picked: { ...KEYS_START.picked, [job]: picked ?? id ?? KEY_DEFAULTS[job] } });
afterEach(() => setKeysNow(KEYS_START));

describe("the usual keys", () => {
  test("are the ones Companion always had, one per job", () => {
    expect(JOBS).toEqual(["card", "problem", "showme", "read", "accept", "explain", "talk", "stop"]);
    expect(KEY_DEFAULTS).toEqual({
      card: "control-option-command-k", problem: "control-option-command-f", showme: "control-option-command-s", read: "control-option-command-r",
      accept: "control-option-command-a", explain: "control-option-command-e", talk: "option-space", stop: "control-option-command-x",
    });
    expect(KEYS_START).toEqual({ using: KEY_DEFAULTS, picked: KEY_DEFAULTS });
    expect(new Set(Object.values(KEY_DEFAULTS)).size).toBe(JOBS.length);
    expect(keysNow()).toEqual(KEYS_START);
  });
});

describe("a chord in words", () => {
  test("names the modifiers in the Mac's order, then the key", () => {
    expect(chordLabel("control-option-command-k")).toBe("Control, Option, Command and K");
    expect(chordLabel("control-option-shift-command-x")).toBe("Control, Option, Shift, Command and X");
    expect(chordLabel("option-space")).toBe("Option and Space");
    expect(chordLabel("control-return")).toBe("Control and Return");
  });
  test("is empty for anything that is not a chord in exactly the app's form", () => {
    for (const junk of ["", "k", "option", "-k", "command-control-option-k", "control-control-k", "control-option-command-K", "control-option-command-v", "fn-k", "control-option-command-k-x", "Option and Space"]) expect(chordLabel(junk), junk).toBe("");
  });
});

describe("what the app answers", () => {
  test("is read safely: a job with an unreadable answer keeps its usual keys, and only a clear null means it has none", () => {
    const v = { using: { ...KEY_DEFAULTS, card: "control-option-command-j", talk: null }, picked: { ...KEY_DEFAULTS, card: "control-option-command-j" } };
    expect(keysFrom(v)).toEqual({ using: { ...KEY_DEFAULTS, card: "control-option-command-j", talk: null }, picked: { ...KEY_DEFAULTS, card: "control-option-command-j" } });
    expect(keysFrom({ using: { card: 7, stop: "junk" }, picked: { stop: "control-option-command-l" } })).toEqual({ using: KEY_DEFAULTS, picked: { ...KEY_DEFAULTS, stop: "control-option-command-l" } });
    for (const junk of [undefined, null, "x", 3, {}, { using: 1 }, { using: [], picked: "a" }]) expect(keysFrom(junk), String(junk)).toEqual(KEYS_START);
  });
  test("a change is shared with every line on the page, and whoever listens hears it", () => {
    let heard = 0;
    const off = onKeys(() => { heard += 1; });
    setKeysNow(swap("stop", "control-option-command-l"));
    expect(keysOf("stop")).toBe("Control, Option, Command and L");
    off(); setKeysNow(KEYS_START);
    expect(heard).toBe(1);
  });
});

describe("every line that names a key", () => {
  test("names the keys in use now", () => {
    expect(withKeys("Press {keys} to stop everything at once.", "stop")).toBe("Press Control, Option, Command and X to stop everything at once.");
    setKeysNow(swap("stop", "control-option-command-l"));
    expect(withKeys("Press {keys} to stop everything at once.", "stop")).toBe("Press Control, Option, Command and L to stop everything at once.");
    expect(withKeys("Press {keys}.", "stop", swap("stop", "control-option-shift-command-x"))).toBe("Press Control, Option, Shift, Command and X.");
  });
  test("a hint for a job without keys says so and where to pick others, never naming keys that do not work", () => {
    const off = swap("showme", null);
    const h = keyHint("showme", S.showMeKeyHint, off);
    expect(h).toBe(S.keyHintOff.replace("{job}", S.keyJobs.showme));
    expect(h).toContain(S.keysTitle); expect(h).not.toMatch(/Control|Option|Command/);
    expect(keyHint("showme", S.showMeKeyHint)).toContain("Control, Option, Command and S");
    expect(keyHint("accept", S.phHotkeys, swap("accept", null), S.phHotkeysOff)).toBe(S.phHotkeysOff);
  });
  test("the Prompt help result names its use keys only when the app could take them for this result", () => {
    // Taken at launch: no keys named. Free at launch, but another app took them before this result: none named either.
    expect(acceptHint(true)).toBe("For the next minute and a half, Control, Option, Command and A uses it, and Esc dismisses it.");
    expect(acceptHint(true, swap("accept", "control-option-command-u"))).toContain("Control, Option, Command and U uses it");
    expect(acceptHint(true, swap("accept", null))).toBe(S.phHotkeysOff);
    expect(acceptHint(false)).toBe(S.phHotkeysOff);
    expect(acceptHint(false)).not.toMatch(/Control|Option|Command/);
  });
  test("the keys the app took for a result are the ones its line names, even when the page knew others", () => {
    // Another app held them at launch and let go since: the app took them for this result, so the line names them.
    setKeysNow(swap("accept", null, "control-option-command-u"));
    let drawn = 0;
    const stop = onKeys(() => { drawn += 1; });
    expect(armedFor("control-option-command-u")).toBe(true);
    expect(keysNow().using.accept).toBe("control-option-command-u");
    expect(keysNow().picked.accept).toBe("control-option-command-u");
    expect(acceptHint(true)).toContain("Control, Option, Command and U uses it");
    expect(drawn).toBe(1);
    // The same keys again change nothing and draw nothing again.
    expect(armedFor("control-option-command-u")).toBe(true); expect(drawn).toBe(1);
    // Its picked keys taken since: the usual ones in their place, and only use a suggestion's keys change.
    expect(armedFor("control-option-command-a")).toBe(true);
    expect(keysNow().using).toEqual({ ...KEYS_START.using, accept: "control-option-command-a" });
    expect(keysNow().picked.accept).toBe("control-option-command-u");
    stop();
  });
  test("an answer that names no keys means none were taken, and the line names none", () => {
    for (const v of [null, undefined, false, true, "", "Control, Option, Command and A", "control-option-command-z", 7, {}]) {
      setKeysNow(KEYS_START);
      expect(armedFor(v), String(v)).toBe(false);
      expect(keysNow(), String(v)).toEqual(KEYS_START);
    }
  });
  test("a line said after the keys were pressed never shows a blank when the keys are gone", () => {
    expect(withKeys(S.ehOwnApp, "explain", swap("explain", null))).not.toContain("{keys}");
    expect(withKeys(S.ehOwnApp, "explain", swap("explain", null))).toContain(S.itsKeys);
  });
  test("lessons and other text that name the usual keys name the keys in use instead", () => {
    const say = "Press Control, Option, Command and F in Companion to find the same place in your project.";
    expect(keysIn(say)).toBe(say);
    expect(keysIn(say, swap("problem", "control-option-command-p"))).toBe("Press Control, Option, Command and P in Companion to find the same place in your project.");
    // Each job's own keys only: Command and Space (Spotlight) and a job that kept its keys stay as they are.
    const two = "Press Command and Space, then Control, Option, Command and K, then Control, Option, Command and F.";
    expect(keysIn(two, swap("card", "control-option-command-j"))).toBe("Press Command and Space, then Control, Option, Command and J, then Control, Option, Command and F.");
    expect(keysIn("Hold Option and Space and talk.", swap("talk", "control-return"))).toBe("Hold Control and Return and talk.");
    // Several jobs at once, each swapped once in a single pass, and a letter only as a whole word ("and Keys" is not K).
    expect(keysIn("Control, Option, Command and Keys", swap("card", "control-option-command-j"))).toBe("Control, Option, Command and Keys");
    const both: Keys = { using: { ...KEY_DEFAULTS, problem: "control-option-command-u", card: "control-option-shift-command-k" }, picked: { ...KEY_DEFAULTS, problem: "control-option-command-u", card: "control-option-shift-command-k" } };
    expect(keysIn("Control, Option, Command and K or Control, Option, Command and F", both)).toBe("Control, Option, Shift, Command and K or Control, Option, Command and U");
    // A job without keys keeps the usual words (they say which keys another app holds).
    expect(keysIn(say, swap("problem", null))).toBe(say);
  });
});

describe("Change: the short list", () => {
  test("is read safely, and only chords on the list can be pressed", () => {
    const c = choicesFrom({ action: "card", choices: ["control-option-command-k", "control-option-command-j", "junk", 7], free: ["control-option-command-k", "junk"], ours: { "control-option-command-j": "showme", "x": "nobody" } }, "card");
    expect(c).toEqual({ job: "card", choices: ["control-option-command-k", "control-option-command-j"], free: ["control-option-command-k"], ours: { "control-option-command-j": "showme" } });
    expect(canPick(c, KEYS_START, "control-option-command-k")).toBe(true);
    expect(canPick(c, KEYS_START, "control-option-command-j")).toBe(false);
    expect(canPick(c, KEYS_START, "control-option-command-l")).toBe(false);
    // An answer for another job, or one that cannot be read, offers nothing rather than guessing.
    for (const junk of [undefined, null, 7, {}, { action: "stop", choices: ["control-option-command-x"], free: ["control-option-command-x"] }]) expect(choicesFrom(junk, "card").choices, String(junk)).toEqual([]);
  });
  test("the keys a job uses now can always be pressed again, which keeps them after a fall back", () => {
    const c = choicesFrom({ action: "showme", choices: ["control-option-command-s", "control-option-command-j"], free: [], ours: {} }, "showme");
    expect(canPick(c, swap("showme", "control-option-command-s", "control-option-command-j"), "control-option-command-s")).toBe(true);
  });
  test("every reason the app gives for not changing the keys is said in plain words", () => {
    expect(keyProblem("taken")).toBe(S.keysTaken);
    expect(keyProblem("in_use")).toBe(S.keysInUse);
    expect(keyProblem("not_saved")).toBe(S.keysNotSaved);
    for (const c of ["unknown", "not_card", "Error: something odd", ""]) expect(keyProblem(c), c).toBe(S.keysFailed);
    for (const w of [S.keysTaken, S.keysInUse, S.keysNotSaved, S.keysFailed]) { expect(w).not.toContain("—"); expect(w.length).toBeGreaterThan(10); }
  });
});
