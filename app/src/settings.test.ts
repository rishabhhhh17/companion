// The settings page: plain words for sizes and permissions, and the delete everything steps.
import { describe, expect, test } from "bun:test";
import { DELETE_PHRASE, deletableLines, formatBytes, permissionRow, type Inventory } from "./settings.ts";

describe("sizes in plain words", () => {
  test("bytes, kilobytes, megabytes, gigabytes", () => {
    expect(formatBytes(0)).toBe("nothing");
    expect(formatBytes(900)).toBe("under 1 KB");
    expect(formatBytes(12 * 1024)).toBe("12 KB");
    expect(formatBytes(141 * 1024 * 1024)).toBe("141 MB");
    expect(formatBytes(2.4 * 1024 * 1024 * 1024)).toBe("2.4 GB");
  });
});

describe("permissions", () => {
  test("allowed needs nothing; turned off says so and offers System Settings; not asked yet says when it will be asked", () => {
    expect(permissionRow("screen_recording", "allowed")).toMatchObject({ state: "Allowed", todo: "", button: false });
    expect(permissionRow("microphone", "not_asked")).toMatchObject({ state: "Not asked yet", button: false });
    expect(permissionRow("microphone", "not_asked").todo).toMatch(/first time/);
    expect(permissionRow("microphone", "not_allowed")).toMatchObject({ state: "Turned off", button: true });
    expect(permissionRow("microphone", "not_allowed").todo).toMatch(/said no.*System Settings/);
    expect(permissionRow("accessibility", "unknown")).toMatchObject({ button: false });
  });
  test("where macOS cannot tell never asked from said no, one plain line covers both, with the way to turn it on", () => {
    for (const k of ["screen_recording", "accessibility"] as const) {
      const r = permissionRow(k, "off");
      expect(r).toMatchObject({ state: "Not on", button: true });
      expect(r.todo).toMatch(/first time/); expect(r.todo).toMatch(/said no/); expect(r.todo).toMatch(/System Settings/);
    }
  });
  test("blocked by a Screen Time or management setting says who can change it, with no button that cannot help", () => {
    const r = permissionRow("microphone", "restricted");
    expect(r).toMatchObject({ state: "Blocked on this Mac", button: false });
    expect(r.todo).toMatch(/manages this Mac/);
  });
  test("every word the app can send is understood", async () => {
    const rs = await Bun.file(new URL("../src-tauri/src/permissions.rs", import.meta.url)).text();
    const fn = rs.slice(rs.indexOf("pub fn page_word"), rs.indexOf("pub fn support_words"));
    const words = [...fn.matchAll(/=> "([a-z_]+)"/g)].map((m) => m[1]);
    expect(words.sort()).toEqual(["allowed", "not_allowed", "not_asked", "off", "restricted", "unknown"]);
    for (const w of words.filter((w) => w !== "unknown")) expect(permissionRow("microphone", w as never).state, w).not.toBe("Not checked yet");
  });
  test("each says what it is for, in plain words", () => {
    for (const k of ["screen_recording", "accessibility", "microphone"] as const) {
      const r = permissionRow(k, "allowed");
      expect(r.label.length).toBeGreaterThan(3); expect(r.why.length).toBeGreaterThan(20); expect(r.why).not.toMatch(/TCC|entitlement|API/i);
    }
  });
});

describe("what Companion keeps, and deleting it", () => {
  const inv: Inventory = { items: [{ id: "history", label: "Your task history and spending record", bytes: 12288 }, { id: "speech", label: "The speech model for hold to talk", bytes: 141 * 1024 * 1024 }], keySaved: true, projectsWithNotes: 2 };
  test("every group is listed with its size, and a saved key is named", () => {
    expect(deletableLines(inv)).toEqual(["Your task history and spending record: 12 KB", "The speech model for hold to talk: 141 MB", "Your saved Claude key (in your Keychain)"]);
  });
  test("with no key saved there is no key line", () => expect(deletableLines({ ...inv, keySaved: false }).some((l) => /key/i.test(l))).toBe(false));
  test("the confirmation is exact words, so a stray call cannot delete anything", () => expect(DELETE_PHRASE).toBe("delete everything"));
});

import { keyStatus, REMOVE_KEY_PHRASE, submitKey } from "./settings.ts";
import { readFileSync } from "node:fs";
describe("replacing and removing the key in Settings", () => {
  const good = "sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcdefgh";
  test("a good key is sent once, trimmed, and the box is emptied right away", () => {
    expect(submitKey(`  ${good}\n`)).toEqual({ clear: true, send: good, problem: null });
  });
  test("a key that does not look right is never sent, the box is emptied too, and the words never repeat it", () => {
    for (const bad of ["", "hello", "sk-ant-short", `${good} extra`, "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789abcdef"]) {
      const r = submitKey(bad);
      expect(r.send).toBeNull(); expect(r.clear).toBe(true); expect(r.problem).toMatch(/\.$/);
      if (bad.length > 6) expect(r.problem).not.toContain(bad);
    }
  });
  test("the same checks as the first run", async () => {
    const { keyLooksRight } = await import("./onboarding.ts");
    for (const k of [good, "", "sk-ant-short", `${good} x`]) expect(submitKey(k).problem).toBe(keyLooksRight(k));
  });
  test("whether a key is saved is said in plain words", () => {
    expect(keyStatus(true)).toMatch(/saved in your Mac's Keychain/);
    expect(keyStatus(false)).toMatch(/No key is saved/);
  });
  test("removing needs the exact words the app checks, and the app tells the engine it has no key", () => {
    const keystore = readFileSync(new URL("../src-tauri/src/keystore.rs", import.meta.url), "utf8");
    expect(keystore).toContain(`pub const REMOVE_PHRASE: &str = "${REMOVE_KEY_PHRASE}";`);
    const main = readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");
    const remove = main.slice(main.indexOf("fn remove_api_key"), main.indexOf("\n}\n", main.indexOf("fn remove_api_key")));
    expect(remove).toContain("keystore::delete_item(");
    expect(remove).toContain("hand_key(None)");
    // The gate is the tested one (keystore::remove_with: only the card, only the exact words, gone only after a fresh look),
    // and the engine is told only after it says the key is gone.
    expect(remove).toMatch(/keystore::remove_with\(window\.label\(\), &confirm, [^;]*\)\?;/);
    expect(remove.indexOf("keystore::remove_with(")).toBeLessThan(remove.indexOf("hand_key(None)"));
    expect(main).toMatch(/generate_handler!\[[^\]]*\bremove_api_key\b/);
  });
  test("the Settings key box is a password box that the page empties, and removing asks first", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    const keys = card.slice(card.indexOf("function KeySection"), card.indexOf("\n}\n", card.indexOf("function KeySection")));
    expect(keys).toMatch(/<input type="password" autoComplete="off"/);
    expect(keys).toContain('invoke("save_api_key"');
    expect(keys).toContain('invoke("remove_api_key", { confirm: REMOVE_KEY_PHRASE })');
    expect(keys).toContain("S.keyRemoveSure");
    expect(card.slice(card.indexOf("function SettingsPanel"))).toContain("<KeySection");
  });
});

import { numbersLines } from "./settings.ts";
describe("beta numbers in words", () => {
  test("counts and rates are shown plainly, and a missing rate says so", () => {
    const l = numbersLines({ enabled: true, totals: { session: 5, walk_started: 4, walk_done: 3 }, rates: { walkCompletion: 0.75, stepSuccess: null, proofPass: 0.5, anywhereShare: null, softRingCorrections: 2 } });
    expect(l[0]).toBe("Times you used Companion: 5");
    expect(l[2]).toBe("Lessons started: 4, finished: 3 (75%)");
    expect(l[3]).toContain("not enough yet");
    expect(l.at(-1)).toBe("Times you corrected a guess: 2");
  });
});

import { permissionLesson } from "./settings.ts";
import { readdirSync } from "node:fs";
describe("permission lessons", () => {
  test("each permission names a lesson that ships with the app", () => {
    const shipped = readdirSync(new URL("../../lessons", import.meta.url).pathname).map((f) => f.replace(/\.json$/, ""));
    for (const k of ["screen_recording", "accessibility", "microphone"] as const) expect(shipped).toContain(permissionLesson(k));
  });
});

import { PRESENTATION_DEFAULT, presentationFrom } from "./settings.ts";
describe("screen sharing and calls (rule 7)", () => {
  test("both are on unless the app clearly says off", () => {
    expect(PRESENTATION_DEFAULT).toEqual({ hideFromSharing: true, quietOnCalls: true });
    expect(presentationFrom({ hideFromSharing: false, quietOnCalls: true })).toEqual({ hideFromSharing: false, quietOnCalls: true });
    for (const junk of [undefined, null, "off", 3, { hideFromSharing: "no", quietOnCalls: 0 }]) expect(presentationFrom(junk)).toEqual({ hideFromSharing: true, quietOnCalls: true });
  });
  test("Settings shows both switches, and the app has the commands they use, kept in the app (not the page)", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    const row = card.slice(card.indexOf("function PresentationRow"), card.indexOf("\n}\n", card.indexOf("function PresentationRow")));
    expect(row).toContain('invoke("presentation_settings")');
    expect(row).toContain('invoke("set_presentation", { hideFromSharing: next.hideFromSharing, quietOnCalls: next.quietOnCalls })');
    expect(card.slice(card.indexOf("function SettingsPanel"))).toContain("<PresentationRow");
    const main = readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");
    for (const c of ["presentation_settings", "set_presentation", "quiet_now", "showme_hide"]) expect(new RegExp(`generate_handler!\\[[^\\]]*\\b${c}\\b`).test(main), c).toBe(true);
  });
  test("reactions and confetti ask the app first, so they stay quiet during a call", () => {
    const dock = readFileSync(new URL("./dock.tsx", import.meta.url), "utf8");
    expect(dock).toContain('invoke("quiet_now")');
  });
});

import { allScreensOn } from "./settings.ts";
describe("Show me on all screens", () => {
  test("off unless the person turns it on (product doc: the display under the cursor), and off without storage", () => {
    expect(allScreensOn()).toBe(false);
  });
  test("every Show me look passes the person's choice, and Settings has the switch", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    const starts = card.split("\n").filter((l) => l.includes('invoke("showme_start"'));
    expect(starts.length).toBeGreaterThanOrEqual(3);
    for (const l of starts) expect(l.slice(l.indexOf('invoke("showme_start"'))).toMatch(/^invoke\("showme_start", \{ question[^;]*, allScreens: allScreensOn\(\) \}\)/);
    expect(card.slice(card.indexOf("function SettingsPanel"))).toContain("S.allScreensSetting");
  });
});

import { keyHints, TALK_DEFAULT, TALK_KEYS_START, talkCanPick, talkCost, talkKeysFrom, talkKeysLine, talkLabel, talkNotFreeLine, talkProblem, talkSharedNote, voiceHint } from "./settings.ts";
import { S } from "./strings.ts";
describe("hold to talk keys (F18.3)", () => {
  const all = ["option-space", "option-return", "control-return"];
  test("Option and Space until the app says otherwise", () => {
    expect(TALK_DEFAULT).toBe("option-space");
    expect(TALK_KEYS_START).toEqual({ using: "option-space", picked: "option-space", choices: all, free: all });
    expect(talkLabel("option-space")).toBe("Option and Space");
    expect(talkLabel("control-space")).toBe("");
  });
  test("what the app answers is read safely: an unknown answer keeps the default, a clear none means hold to talk is off", () => {
    expect(talkKeysFrom({ using: "option-return", picked: "option-return", choices: all, free: all })).toEqual({ using: "option-return", picked: "option-return", choices: all, free: all });
    expect(talkKeysFrom({ using: null, picked: "option-space", choices: all, free: ["option-return"] })).toEqual({ using: null, picked: "option-space", choices: all, free: ["option-return"] });
    expect(talkKeysFrom({ using: "option-space", picked: "control-return", choices: ["control-return", "control-space", 7], free: ["option-space", "control-space", 7] })).toEqual({ using: "option-space", picked: "control-return", choices: ["control-return"], free: ["option-space"] });
    for (const junk of [undefined, null, "x", 3, {}, { using: "control-space" }, { using: 1, picked: [], choices: "all" }]) expect(talkKeysFrom(junk), String(junk)).toEqual(TALK_KEYS_START);
  });
  test("which keys can be picked: a clear empty list means none is free, but a missing one never claims another app has keys", () => {
    expect(talkKeysFrom({ using: null, picked: "option-space", choices: all, free: [] }).free).toEqual([]);
    for (const free of [undefined, "all", 7, null]) expect(talkKeysFrom({ using: "option-space", picked: "option-space", choices: all, free }).free, String(free)).toEqual(all);
    const off = talkKeysFrom({ using: null, picked: "option-space", choices: all, free: ["option-return", "control-return"] });
    expect(all.map((id) => talkCanPick(off, id))).toEqual([false, true, true]);
    // The keys in use are Companion's own, so they can always be picked again (that keeps them after a fall back).
    expect(talkCanPick({ using: "option-space", picked: "option-return", choices: all, free: [] }, "option-space")).toBe(true);
    expect(talkCanPick(TALK_KEYS_START, "control-space")).toBe(false);
  });
  test("one plain reason for keys that cannot be picked, unless the line above already says it", () => {
    expect(talkNotFreeLine(TALK_KEYS_START)).toBe("");
    expect(talkNotFreeLine({ ...TALK_KEYS_START, free: ["option-space", "option-return"] })).toBe(S.talkKeysNotFree);
    expect(S.talkKeysNotFree).toBe("Keys you cannot pick are already used by another app.");
    // Hold to talk is off on Option and Space: the line above names it, so only another chord that is taken adds the reason.
    expect(talkNotFreeLine({ using: null, picked: "option-space", choices: all, free: ["option-return", "control-return"] })).toBe("");
    expect(talkNotFreeLine({ using: null, picked: "option-space", choices: all, free: ["option-return"] })).toBe(S.talkKeysNotFree);
    expect(talkNotFreeLine({ using: "option-space", picked: "option-return", choices: all, free: ["option-space", "control-return"] })).toBe("");
  });
  test("the hint names the keys in use, and says where to pick keys when another app holds them", () => {
    expect(voiceHint(TALK_KEYS_START)).toStartWith("Hold Option and Space, talk, and let go.");
    expect(voiceHint({ ...TALK_KEYS_START, using: "control-return", picked: "control-return" })).toStartWith("Hold Control and Return, talk, and let go.");
    const off = voiceHint({ ...TALK_KEYS_START, using: null });
    expect(off).toContain(S.keysTitle); expect(off).not.toMatch(/Option and|Control and/);
    expect(keyHints()).toContain(voiceHint(TALK_KEYS_START));
    expect(keyHints({ ...TALK_KEYS_START, using: "option-return", picked: "option-return" })).toContain(voiceHint({ ...TALK_KEYS_START, using: "option-return", picked: "option-return" }));
  });
  test("Settings says which keys hold to talk uses, covers keys another app shares without notice, and says plainly when another app has the ones picked", () => {
    // macOS does not refuse keys another app took without asking for them alone, so Alfred, Raycast and ChatGPT may share
    // Option and Space with no notice at launch. The line says what that looks like and what to do.
    expect(talkKeysLine(TALK_KEYS_START)).toEqual({ text: "Hold to talk uses Option and Space. Alfred, Raycast and ChatGPT also use these keys unless you changed theirs. If one of them stops opening, or talking does nothing, pick others:", problem: false });
    expect(talkKeysLine({ ...TALK_KEYS_START, using: "control-return", picked: "control-return" })).toEqual({ text: "Hold to talk uses Control and Return. If talking does nothing, or another app stops reacting to these keys, pick others:", problem: false });
    const off = talkKeysLine({ ...TALK_KEYS_START, using: null, free: ["option-return", "control-return"] });
    expect(off.problem).toBe(true); expect(off.text).toBe("Another app is already using Option and Space, so hold to talk is off. Pick other keys:");
    const fell = talkKeysLine({ using: "option-space", picked: "option-return", choices: all, free: all });
    expect(fell.problem).toBe(true); expect(fell.text).toBe("Another app is already using Option and Return, so hold to talk uses Option and Space for now. Keep them, or pick others:");
    for (const l of [off, fell, talkKeysLine(TALK_KEYS_START)]) expect(l.text).not.toContain("—");
  });
  test("when the keys another app held at launch are free again, Settings says so instead of a stale reason", () => {
    const back = talkKeysLine({ using: null, picked: "option-space", choices: all, free: all });
    expect(back).toEqual({ text: "Hold to talk is off because another app was using Option and Space when Companion opened. They are free now: press them to turn hold to talk back on, or pick others:", problem: true });
    expect(talkNotFreeLine({ using: null, picked: "option-space", choices: all, free: all })).toBe("");
  });
  test("the first run warns about apps that share Option and Space, only while hold to talk uses them", () => {
    expect(talkSharedNote(TALK_KEYS_START)).toBe("Alfred, Raycast and ChatGPT also use Option and Space unless you changed theirs. If one of them stops opening, or talking does nothing, pick other keys in Settings, under Keys to remember.");
    expect(talkSharedNote(TALK_KEYS_START)).toContain(S.keysTitle);
    expect(talkSharedNote({ ...TALK_KEYS_START, using: "option-return", picked: "option-return" })).toBe("");
    expect(talkSharedNote({ ...TALK_KEYS_START, using: null })).toBe("");
  });
  test("the picker says what each other choice gives up while it is hold to talk", () => {
    expect(talkCost("option-space")).toBe("");
    expect(talkCost("option-return")).toBe("Option and Return: while picked, it no longer adds a new line in Messages and other apps.");
    expect(talkCost("control-return")).toBe("Control and Return: while picked, it no longer adds a line break in text boxes.");
    expect(talkCost("control-space")).toBe("");
  });
  test("every reason the app can give for not changing the keys is said in plain words", () => {
    const rs = readFileSync(new URL("../src-tauri/src/talkkeys.rs", import.meta.url), "utf8");
    const main = readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");
    const set = main.slice(main.indexOf("fn set_talk_keys"), main.indexOf("\n}\n", main.indexOf("fn set_talk_keys")));
    const codes = [...rs.matchAll(/Problem::\w+ => "([a-z_]+)"/g), ...set.matchAll(/Err\("([a-z_]+)"\.into\(\)\)/g)].map((m) => m[1]);
    expect(codes.sort()).toEqual(["not_card", "not_saved", "taken", "unknown"]);
    expect(talkProblem("taken")).toBe("Another app is already using those keys. Pick other keys.");
    expect(talkProblem("not_saved")).toBe("Could not save that on this Mac. Try again.");
    for (const c of codes) expect(talkProblem(c), c).not.toBe("");
    expect(talkProblem("Error: something odd")).toBe(talkProblem("unknown"));
  });
  test("Settings shows the picker under the keys, the app has its commands, and only the card may change or check the keys", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    const row = card.slice(card.indexOf("function TalkKeysRow"), card.indexOf("\n}\n", card.indexOf("function TalkKeysRow")));
    expect(row).toContain('invoke("set_talk_keys", { id })');
    expect(row).toContain("aria-pressed={talk.using === id}");
    expect(row).toContain("disabled={busy || !talkCanPick(talk, id)}");
    expect(row).toContain("talkNotFreeLine(talk)");
    expect(row).toContain("talkCost(id)");
    expect(row).toContain("talkProblem(");
    expect(row).toContain("talkKeysFrom(");
    const settings = card.slice(card.indexOf("function SettingsPanel"));
    const panel = settings.slice(0, settings.indexOf("\n}\n"));
    expect(panel).toContain('invoke("talk_keys")');
    expect(panel).toContain("keyHints(talk)");
    expect(panel.indexOf("<TalkKeysRow")).toBeGreaterThan(panel.indexOf("keyHints(talk)"));
    const main = readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");
    for (const c of ["talk_keys", "set_talk_keys"]) expect(new RegExp(`generate_handler!\\[[^\\]]*\\b${c}\\b`).test(main), c).toBe(true);
    const body = (name: string) => main.slice(main.indexOf(`fn ${name}(`), main.indexOf("\n}\n", main.indexOf(`fn ${name}(`)));
    const set = body("set_talk_keys");
    expect(set).toContain('if window.label() != "card" { return Err("not_card".into()); }');
    expect(set.indexOf('window.label() != "card"')).toBeLessThan(set.indexOf("talkkeys::switch("));
    expect(set).toContain("Ok(talk_state(&app))");
    // Reading the keys tries the free ones (talkkeys::free), so it is card only too, and one change or check at a time.
    const get = body("talk_keys");
    expect(get).toContain('if window.label() != "card" { return Err("not_card".into()); }');
    expect(get.indexOf("TALK_SWITCH.lock()")).toBeLessThan(get.indexOf("talk_state(&app)"));
    expect(body("talk_state")).toContain("talkkeys::free(using,");
  });
  test("the first run also names the keys in use and the apps that may share them", () => {
    const ob = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
    expect(ob).toContain('invoke("talk_keys")');
    expect(ob).toContain("keyHints(talk)");
    expect(ob.indexOf("talkSharedNote(talk)")).toBeGreaterThan(ob.indexOf("keyHints(talk)"));
  });
});
