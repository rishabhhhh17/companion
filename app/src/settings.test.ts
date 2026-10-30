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

describe(`what ${PRODUCT} keeps, and deleting it`, () => {
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
    expect(remove).toContain("hand_key(None, false)");
    // The gate is the tested one (keystore::remove_with: only the card, only the exact words, gone only after a fresh look),
    // and the engine is told only after it says the key is gone.
    expect(remove).toMatch(/keystore::remove_with\(window\.label\(\), &confirm, [^;]*\)\?;/);
    expect(remove.indexOf("keystore::remove_with(")).toBeLessThan(remove.indexOf("hand_key(None, false)"));
    expect(main).toMatch(/generate_handler!\[[^\]]*\bremove_api_key\b/);
  });
  test("the Settings key box is a password box that the page empties, and removing asks first", () => {
    const card = readFileSync(new URL("./settingsPage.tsx", import.meta.url), "utf8");
    const keys = card.slice(card.indexOf("function KeySection"), card.indexOf("\n}\n", card.indexOf("function KeySection")));
    expect(keys).toMatch(/<input type="password" autoComplete="off"/);
    expect(keys).toContain('invoke("save_api_key"');
    expect(keys).toContain('invoke("remove_api_key", { confirm: REMOVE_KEY_PHRASE })');
    expect(keys).toContain("S.keyRemoveSure");
    expect(readFileSync(new URL("./settingsPage.tsx", import.meta.url), "utf8")).toContain('{fixedShown("key") && inv && <KeySection keySaved={inv.keySaved}');
  });
});

import { numbersLines } from "./settings.ts";
describe("beta numbers in words", () => {
  test("counts and rates are shown plainly, and a missing rate says so", () => {
    const l = numbersLines({ enabled: true, totals: { session: 5, walk_started: 4, walk_done: 3 }, rates: { walkCompletion: 0.75, stepSuccess: null, proofPass: 0.5, anywhereShare: null, softRingCorrections: 2 } });
    expect(l[0]).toBe(`Times you used ${PRODUCT}: 5`);
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

import { defOf } from "../../protocol/settings.ts";
describe("screen sharing and calls (rule 7)", () => {
  test("both are on unless turned off, kept by the app in presentation.json (the registry, T16)", () => {
    for (const k of ["sharing.hide", "calls.quiet"]) expect(defOf(k), k).toMatchObject({ kind: "switch", default: true, store: "presentation", applies: ["shell"], section: "sharing" });
  });
  test("Settings shows both switches as registry rows, and the app keeps them (not the page)", () => {
    expect(S.set["sharing.hide"].label).toBe(S.hideFromSharingSetting);
    expect(S.set["calls.quiet"].label).toBe(S.quietOnCallsSetting);
    const main = readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");
    for (const c of ["settings_set", "quiet_now", "showme_hide"]) expect(new RegExp(`generate_handler!\\[[^\\]]*\\b${c}\\b`).test(main), c).toBe(true);
    for (const c of ["presentation_settings", "set_presentation"]) expect(new RegExp(`generate_handler!\\[[^\\]]*\\b${c}\\b`).test(main), c).toBe(false);
    expect(main).toContain("fn presentation_set(app: &AppHandle, s: presentation::Settings)");
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
    for (const l of starts) expect(l.slice(l.indexOf('invoke("showme_start"'))).toMatch(/^invoke\("showme_start", \{ question[^;]*, allScreens: allScreensOn\(\)(, settle)?(, mode)?(, before)? \}\)/);   // settle: a look after an action may wait for the page (anywhere.ts waitsForPage); mode and before: an everyday look (everyday.ts)
    expect(defOf("showme.allScreens")).toMatchObject({ kind: "switch", default: false, section: "pointing" });
    expect(S.set["showme.allScreens"].label).toBe(S.allScreensSetting);
  });
});

import { keyChangedLine, keyHints, keyRows, pickerLines, resetLine, TALK_DEFAULT, talkCost, talkSharedNote, voiceHint } from "./settings.ts";
import { chordLabel, choicesFrom, KEY_DEFAULTS, KEYS_START, type Choices, type Job, type Keys } from "./keys.ts";
import { S, PRODUCT } from "./strings.ts";
// Keys to remember (M11 wave 4): every job, its keys, and Change for a short list of free keys; hold to talk (F18.3) is one of them.
describe("the Keys section in Settings", () => {
  const set = (job: Job, using: string | null, picked?: string): Keys => ({ using: { ...KEYS_START.using, [job]: using }, picked: { ...KEYS_START.picked, [job]: picked ?? using ?? KEY_DEFAULTS[job] } });
  const list = (job: Job, free: string[], ours: Record<string, string> = {}): Choices => choicesFrom({ action: job, choices: job === "talk" ? ["option-space", "option-return", "control-return"] : [KEY_DEFAULTS[job], "control-option-command-j", "control-option-command-l"], free, ours }, job);
  test("one row for every job, in the order the hints use, with its name and the keys it uses now", () => {
    const rows = keyRows(KEYS_START);
    expect(rows.map((r) => r.job)).toEqual(["card", "problem", "showme", "read", "accept", "explain", "secondlook", "talk", "dictate", "stop"]);
    expect(rows.map((r) => r.name)).toEqual(["Open Home", "Point at the problem", "Show me how", "Prompt help", "Use a Prompt help suggestion", "Explain an error", "Second Look", "Hold to talk", "Type by voice", "Stop everything"]);
    expect(rows[0].keys).toBe("Control, Option, Command and K");
    expect(rows.find((r) => r.job === "talk")!.keys).toBe("Option and Space");
    expect(rows.filter((r) => r.problem)).toEqual([]);
    expect(keyRows(set("card", "control-option-command-j"))[0].keys).toBe("Control, Option, Command and J");
  });
  test("hold to talk on Option and Space warns about the apps that share it without notice; on other keys, what to do if talking does nothing", () => {
    expect(keyRows(KEYS_START).find((r) => r.job === "talk")!.line).toBe(S.talkKeysNowDefault);
    expect(S.talkKeysNowDefault).toBe("Alfred, Raycast and ChatGPT also use Option and Space unless you changed theirs. If one of them stops opening, or talking does nothing, press Change and pick other keys.");
    expect(keyRows(set("talk", "control-return")).find((r) => r.job === "talk")!).toMatchObject({ line: S.talkKeysNow, problem: false });
    // Every other job on the keys it should have needs no line, except use a suggestion, whose keys work only at one moment.
    for (const r of keyRows(KEYS_START).filter((r) => r.job !== "talk" && r.job !== "accept")) expect(r.line, r.job).toBe("");
  });
  test("use a suggestion says its keys work only while a Prompt help suggestion shows", () => {
    expect(keyRows(KEYS_START).find((r) => r.job === "accept")!).toMatchObject({ line: S.keysAcceptWhen, problem: false });
    expect(S.keysAcceptWhen).toBe("These keys work only while a Prompt help suggestion shows.");
    expect(keyRows(set("accept", "control-option-command-u")).find((r) => r.job === "accept")!.line).toBe(S.keysAcceptWhen);
    // A problem says the problem instead.
    expect(keyRows(set("accept", null)).find((r) => r.job === "accept")!.problem).toBe(true);
  });
  test("after a change, one line says what the job uses now", () => {
    expect(keyChangedLine("showme", set("showme", "control-option-command-j"))).toBe("Show me how now uses Control, Option, Command and J.");
    expect(keyChangedLine("talk", set("talk", "control-return"))).toBe("Hold to talk now uses Control and Return.");
    expect(keyChangedLine("stop", set("stop", null))).toBe("");
    expect(keyChangedLine("stop", set("stop", null))).not.toContain("—");
  });
  test("a job without keys says plainly which keys another app has, and Stop everything points to the menu bar icon", () => {
    const off = keyRows(set("showme", null)).find((r) => r.job === "showme")!;
    expect(off).toMatchObject({ keys: S.keysNone, problem: true, line: "Another app is already using Control, Option, Command and S, so these keys do not work right now. Press Change to pick other keys." });
    const stop = keyRows(set("stop", null, "control-option-command-l")).find((r) => r.job === "stop")!;
    expect(stop).toMatchObject({ keys: S.keysNone, problem: true, line: "Another app is already using Control, Option, Command and L, so the key for Stop everything does not work right now. Stop everything is still in the menu bar icon. Press Change to pick other keys." });
    const talk = keyRows(set("talk", null)).find((r) => r.job === "talk")!;
    expect(talk).toMatchObject({ problem: true, line: "Another app is already using Option and Space, so hold to talk is off. Press Change to pick other keys." });
  });
  test("a job on its usual keys because another app has the ones picked says so, and how to keep them", () => {
    const fell = keyRows(set("explain", "control-option-command-e", "control-option-command-j")).find((r) => r.job === "explain")!;
    expect(fell).toMatchObject({ keys: "Control, Option, Command and E", problem: true, line: `Another app is already using Control, Option, Command and J, so ${PRODUCT} uses Control, Option, Command and E for this for now. Keep them, or press Change to pick others.` });
    const talk = keyRows(set("talk", "option-space", "option-return")).find((r) => r.job === "talk")!;
    expect(talk.line).toBe("Another app is already using Option and Return, so hold to talk uses Option and Space for now. Keep them, or press Change to pick others.");
    for (const r of [...keyRows(set("stop", null)), fell, talk]) expect(r.line).not.toContain("—");
  });
  test("the picker says once why some keys cannot be pressed, unless the row already says it", () => {
    expect(pickerLines(list("card", ["control-option-command-k", "control-option-command-j", "control-option-command-l"]), KEYS_START)).toEqual([]);
    expect(pickerLines(list("card", ["control-option-command-k", "control-option-command-j"]), KEYS_START)).toEqual([S.keysNotFree]);
    expect(S.keysNotFree).toBe("Keys you cannot pick are already used by another app.");
    expect(pickerLines(list("card", ["control-option-command-k", "control-option-command-l"], { "control-option-command-j": "showme" }), KEYS_START)).toEqual([S.keysOurs]);
    // Off on Option and Space: the row names it, so only another chord that is taken adds the reason.
    expect(pickerLines(list("talk", ["option-return", "control-return"]), set("talk", null))).toEqual([]);
    expect(pickerLines(list("talk", ["option-return"]), set("talk", null))).toEqual([S.keysNotFree]);
  });
  test("use a suggestion's keys another app took since show as taken, with the reason", () => {
    // Not registered while no result shows, so the app tries them; macOS refused them, so they are not in the free list.
    expect(pickerLines(list("accept", ["control-option-command-j", "control-option-command-l"]), KEYS_START)).toEqual([S.keysNotFree]);
    expect(pickerLines(list("accept", ["control-option-command-a", "control-option-command-j", "control-option-command-l"]), KEYS_START)).toEqual([]);
  });
  test("when the keys another app held at launch are free again, the picker says so instead of a stale reason", () => {
    expect(pickerLines(list("talk", ["option-space", "option-return", "control-return"]), set("talk", null))).toEqual(["Option and Space are free again. Press them to use them again, or pick others."]);
  });
  test("Reset says what it did, and names any job that kept its keys because another app has the usual ones", () => {
    expect(resetLine({ ...KEYS_START, kept: [] })).toBe(S.keysResetDone);
    // Also true of a job that had no keys and still has none, so the words do not claim it kept any.
    expect(resetLine({ ...KEYS_START, kept: ["stop", "showme", "nobody", 7] })).toBe("These could not go back to their usual keys, because another app is using them: Stop everything, Show me how.");
    expect(resetLine(null)).toBe(S.keysResetDone);
  });
  test("the hold to talk hint names the keys in use, and says where to pick keys when another app holds them", () => {
    expect(voiceHint(KEYS_START)).toStartWith("Hold Option and Space, talk, and let go.");
    expect(voiceHint(set("talk", "control-return"))).toStartWith("Hold Control and Return, talk, and let go.");
    const off = voiceHint(set("talk", null));
    expect(off).toContain(S.keysTitle); expect(off).not.toMatch(/Option and|Control and/);
    expect(keyHints()).toContain(voiceHint(KEYS_START));
  });
  test("the first run warns about apps that share Option and Space, only while hold to talk uses them", () => {
    expect(talkSharedNote(KEYS_START)).toBe("Alfred, Raycast and ChatGPT also use Option and Space unless you changed theirs. If one of them stops opening, or talking does nothing, pick other keys in Settings, under Keys to remember.");
    expect(talkSharedNote(set("talk", "option-return"))).toBe("");
    expect(talkSharedNote(set("talk", null))).toBe("");
    expect(TALK_DEFAULT).toBe("option-space");
  });
  test("the picker says what each other hold to talk choice gives up", () => {
    expect(talkCost("option-space")).toBe("");
    expect(talkCost("option-return")).toBe("Option and Return: while picked, it no longer adds a new line in Messages and other apps.");
    expect(talkCost("control-return")).toBe("Control and Return: while picked, it no longer adds a line break in text boxes.");
    expect(talkCost("control-option-command-j")).toBe("");
    expect(chordLabel("option-return")).toBe("Option and Return");
  });
  test("Settings shows every row, Change opens the short list, and Reset is there", () => {
    const card = readFileSync(new URL("./settingsPage.tsx", import.meta.url), "utf8");
    const fn = (name: string) => card.slice(card.indexOf(`function ${name}`), card.indexOf("\n}\n", card.indexOf(`function ${name}`)));
    const section = fn("KeysSection");
    expect(section).toContain("keyRows(keys)");
    expect(section).toContain('invoke("reset_keys")');
    expect(section).toContain("aria-expanded={open === r.job}");
    expect(section).toContain("S.keysChangeFor(r.name)");
    expect(section).toContain("<KeyPicker");
    const picker = fn("KeyPicker");
    expect(picker).toContain('invoke("key_choices", { action: job })');
    expect(picker).toContain('invoke("set_key", { action: job, id })');
    expect(picker).toContain("disabled={busy || !canPick(c, id)}");
    expect(picker).toContain("aria-pressed={keys.using[job] === id}");
    expect(picker).toContain("pickerLines(c, keys)");
    expect(picker).toContain("talkCost(id)");
    expect(picker).toContain("keyProblem(");
    // The app's answer becomes the keys every line on the page names, and the row says what changed.
    expect(picker).toContain("const k = keysFrom(v); setKeysNow(k); onDone(k);");
    // A change is said in one line, and the keyboard goes back to the row's Change button once the list closes (it was on
    // a button in the list, which is gone), so a keyboard or VoiceOver user does not lose their place.
    expect(section).toContain("keyChangedLine(");
    expect(section).toContain('role="status"');
    // It goes there only by the rule every move of the keyboard in Home follows (focus.ts takeIfLost: Home has the keyboard
    // and nothing in it does), never by a focus of its own, so it never pulls the keyboard from a box the person went to.
    expect(section).toMatch(/takeIfLost\(\(\) => changeButtons\.current\[job\]\)/);
    expect(section).not.toMatch(/\.focus\(/);
    // Keys another app took since the list was asked for: the list is asked for again, so they show as taken.
    expect(picker).toMatch(/if \(code === "taken"\) load\(\)/);
    // Nothing on the page reads key presses to learn keys: it only offers the list the app sends.
    for (const f of [section, picker]) expect(f).not.toMatch(/onKey(Down|Up|Press)/);
    const panel = fn("SettingsPage");
    expect(fn("SettingRow")).toContain("<KeysSection keys={keys} />");
    expect(panel).toContain('invoke("key_map")');
  });
  test("the app has the commands, only Home or the Settings window may try or change keys, and one change or check at a time", () => {
    const main = readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");
    for (const c of ["key_map", "key_choices", "set_key", "reset_keys"]) expect(new RegExp(`generate_handler!\\[[^\\]]*\\b${c}\\b`).test(main), c).toBe(true);
    for (const c of ["talk_keys", "set_talk_keys"]) expect(new RegExp(`generate_handler!\\[[^\\]]*\\b${c}\\b`).test(main), c).toBe(false);
    const body = (name: string) => main.slice(main.indexOf(`fn ${name}(`), main.indexOf("\n}\n", main.indexOf(`fn ${name}(`)));
    for (const c of ["key_choices", "set_key", "reset_keys"]) {
      const b = body(c);
      // Home, or the Settings window that shows the same Keys section (27 Oct 2026), never another window.
      expect(b, c).toContain('if settings::card_or_settings(window.label()).is_err() { return Err("not_card".into()); }');
      // Reset goes through keys_to_usual, which the registry's Reset uses too (T16); it takes the same lock.
      const work = c === "reset_keys" ? b.indexOf("keys_to_usual(") : b.indexOf("KEYS_SWITCH.lock()");
      expect(work, c).toBeGreaterThan(-1);
      expect(b.indexOf("card_or_settings(window.label())"), c).toBeLessThan(work);
    }
    expect(body("keys_to_usual")).toContain("KEYS_SWITCH.lock()");
    expect(body("key_choices")).toContain("keymap::free(a,");
    expect(body("set_key")).toContain("keymap::switch(a,");
    expect(body("keys_to_usual")).toContain("keymap::reset(&picked,");
    // Every reason the app can give is a code the page puts into words.
    const rs = readFileSync(new URL("../src-tauri/src/keymap.rs", import.meta.url), "utf8");
    const codes = new Set([...rs.matchAll(/NotChanged::\w+ => "([a-z_]+)"/g), ...["key_choices", "set_key", "reset_keys"].flatMap((c) => [...body(c).matchAll(/Err\("([a-z_]+)"\.into\(\)\)/g)])].map((m) => m[1]));
    expect([...codes].sort()).toEqual(["in_use", "not_card", "not_enough", "not_saved", "reserved", "taken", "unknown"]);
  });
  test("the first run names the keys in use and the apps that may share hold to talk's", () => {
    const ob = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
    expect(ob).toContain("useKeys()");
    expect(ob).toContain("keyHints(keys)");
    expect(ob.indexOf("talkSharedNote(keys)")).toBeGreaterThan(ob.indexOf("keyHints(keys)"));
  });
});
