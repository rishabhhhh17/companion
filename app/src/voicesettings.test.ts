// Voice settings (M11 wave 4, item 2): the Mac's voice and its speed, the microphone, the language, whether the sound is
// on. What the app sends is read safely, and everything is said in plain words. Nothing here makes a sound or listens.
import { defOf } from "../../protocol/settings.ts";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { VOICE_START, languageLabel, micDefaultLabel, micLine, noteSpeed, soundLine, speedLabel, spokenSpeed, voiceAsk, voiceLabel, voiceLine, voiceProblem, voiceSettingsFrom, type VoiceSettings } from "./voicesettings.ts";
import { S } from "./strings.ts";

const sample: VoiceSettings = {
  voices: [{ id: "ava", name: "Ava", lang: "en-US", quality: 2 }, { id: "jamie", name: "Jamie", lang: "en-GB", quality: 3 }, { id: "lekha", name: "Lekha", lang: "hi-IN", quality: 1 }],
  macLang: "en-US", voice: "ava", voiceMissing: null, voiceUsing: null, speed: 1.25, speeds: [0.5, 0.75, 1, 1.25, 1.5],
  inputs: [{ id: "coreaudio:built-in", name: "MacBook Pro Microphone" }, { id: "coreaudio:usb", name: "Blue Yeti" }], defaultInput: "MacBook Pro Microphone",
  mic: "coreaudio:usb", micMissing: null, language: "hi", languages: ["auto", "en", "hi"], sound: "on",
};
const lang = (code: string) => new Intl.DisplayNames(["en"], { type: "language", languageDisplay: "standard" }).of(code);

describe("what the app says about voice settings, read safely", () => {
  test("a full answer is read as it is", () => {
    expect(voiceSettingsFrom(JSON.parse(JSON.stringify(sample)))).toEqual(sample);
  });
  test("an answer that cannot be read keeps the Mac's own choices and never claims something is away or the sound is off", () => {
    for (const bad of [null, undefined, 5, "x", [], { voices: "no", speed: "fast", sound: "loud", voice: 7, mic: {}, language: 3 }]) {
      const s = voiceSettingsFrom(bad);
      expect(s.voice).toBeNull(); expect(s.mic).toBeNull(); expect(s.voiceMissing).toBeNull(); expect(s.micMissing).toBeNull();
      expect(s.speed).toBe(1); expect(s.sound).toBe("on"); expect(s.language).toBe("auto");
      expect(s.speeds).toEqual(VOICE_START.speeds); expect(s.languages).toContain("auto");
    }
  });
  test("odd entries in the lists are dropped, never shown", () => {
    const s = voiceSettingsFrom({ ...sample, voices: [...sample.voices, { id: 5 }, null, "x", { id: "ok", name: "", lang: "en" }], inputs: [{ id: "a" }, { id: "b", name: "Mic B" }], speeds: [1, "2", -1, 9, 0.5] });
    expect(s.voices.map((v) => v.id)).toEqual(["ava", "jamie", "lekha"]);
    expect(s.inputs).toEqual([{ id: "b", name: "Mic B" }]);
    expect(s.speeds).toEqual([1, 0.5]);
  });
});

describe("voice settings in plain words", () => {
  test("a voice is its name, its language in words and, when better than the default, its quality", () => {
    expect(voiceLabel({ id: "ava", name: "Ava", lang: "en-US", quality: 2 })).toBe(`Ava, ${lang("en-US")}, ${S.voiceQualityEnhanced}`);
    expect(voiceLabel({ id: "jamie", name: "Jamie", lang: "en-GB", quality: 3 })).toBe(`Jamie, ${lang("en-GB")}, ${S.voiceQualityPremium}`);
    expect(voiceLabel({ id: "lekha", name: "Lekha", lang: "hi-IN", quality: 1 })).toBe(`Lekha, ${lang("hi-IN")}`);
    expect(voiceLabel({ id: "z", name: "Zoe (Premium)", lang: "en-US", quality: 3 })).toBe(`Zoe (Premium), ${lang("en-US")}`, );
    expect(voiceLabel({ id: "q", name: "Q", lang: "not a code", quality: 1 })).toBe("Q, not a code");
  });
  test("speeds and languages have plain names", () => {
    expect(speedLabel(1)).toBe(S.voiceSpeedNames["1"]);
    for (const n of [0.5, 0.75, 1, 1.25, 1.5]) expect(speedLabel(n)).not.toBe("");
    expect(speedLabel(1.1)).toBe("1.1 times");
    expect(languageLabel("auto")).toBe(S.voiceLanguageAuto);
    expect(languageLabel("hi")).toBe("Hindi");
    expect(languageLabel("zz")).toBe("zz");
    // Every language the app offers has a name here (voiceset.rs LANGUAGES).
    const rs = readFileSync(new URL("../src-tauri/src/voiceset.rs", import.meta.url), "utf8");
    const list = rs.slice(rs.indexOf("pub const LANGUAGES"), rs.indexOf("];", rs.indexOf("pub const LANGUAGES")));
    const codes = [...list.matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
    expect(codes.length).toBeGreaterThan(10);
    for (const c of codes) expect(languageLabel(c), c).not.toBe(c);
  });
  test("a picked voice that is gone says which one and what speaks instead", () => {
    expect(voiceLine({ ...sample, voiceMissing: "Zoe", voiceUsing: "Ava" })).toBe("Zoe is no longer on this Mac, so Ava speaks instead.");
    expect(voiceLine({ ...sample, voiceMissing: "Zoe", voiceUsing: null })).toBe("Zoe is no longer on this Mac, so your Mac's own voice speaks instead.");
    expect(voiceLine(sample)).toBe("");
  });
  test("a picked microphone that is not connected says the default listens until it is back", () => {
    expect(micLine({ ...sample, micMissing: "AirPods Pro" })).toBe("AirPods Pro is not connected, so your Mac's default microphone (MacBook Pro Microphone) listens until it is back.");
    expect(micLine({ ...sample, micMissing: "AirPods Pro", defaultInput: null })).toBe("AirPods Pro is not connected, so your Mac's default microphone listens until it is back.");
    expect(micLine({ ...sample, micMissing: "AirPods Pro", inputs: [], defaultInput: null })).toBe(S.micNone);
    expect(micLine({ ...sample, inputs: [], defaultInput: null })).toBe(S.micNone);
    expect(micLine(sample)).toBe("");
    expect(micDefaultLabel(sample)).toBe("Your Mac's default (MacBook Pro Microphone)");
    expect(micDefaultLabel({ ...sample, defaultInput: null })).toBe("Your Mac's default");
  });
  test("the sound being off is said plainly, with what to do", () => {
    expect(soundLine("on")).toBe("");
    for (const s of ["muted", "zero", "none"] as const) { expect(soundLine(s)).not.toBe(""); expect(soundLine(s)).toMatch(/words/); }
    expect(soundLine("muted")).toMatch(/muted/);
  });
  test("every reason the app can give for not saving is said in plain words", () => {
    const main = readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");
    const rs = readFileSync(new URL("../src-tauri/src/voiceset.rs", import.meta.url), "utf8");
    const set = main.slice(main.indexOf("fn set_voice_settings("), main.indexOf("\n}\n", main.indexOf("fn set_voice_settings(")));
    const apply = rs.slice(rs.indexOf("pub fn apply("), rs.indexOf("\n}\n", rs.indexOf("pub fn apply(")));
    const codes = [...set.matchAll(/"([a-z_]+)"\.(?:into|to_string)\(\)/g), ...apply.matchAll(/"(unknown_[a-z]+)"/g)].map((m) => m[1]);
    expect([...new Set(codes)].sort()).toEqual(["not_card", "not_saved", "unknown_language", "unknown_mic", "unknown_voice"]);
    for (const c of codes) { expect(voiceProblem(c), c).not.toBe(""); expect(voiceProblem(c), c).not.toContain("_"); }
    expect(voiceProblem("Error: odd")).toBe(S.voiceSaveFailed);
  });
  test("a change sends everything else as it is, so changing the speed never drops the picked voice or microphone", () => {
    expect(voiceAsk(sample, { speed: 0.75 })).toEqual({ voice: "ava", speed: 0.75, mic: "coreaudio:usb", language: "hi" });
    expect(voiceAsk(sample, { voice: null, mic: null })).toEqual({ voice: null, speed: 1.25, mic: null, language: "hi" });
    expect(voiceAsk(VOICE_START, { language: "en" })).toEqual({ voice: null, speed: 1, mic: null, language: "en" });
  });
});

describe("the Settings rows", () => {
  // Settings is settingsPage.tsx since the registry (T16); the voice editor is the talk.voice row's own.
  const card = readFileSync(new URL("./settingsPage.tsx", import.meta.url), "utf8");
  const rows = card.slice(card.indexOf("function VoiceRows"), card.indexOf("\n}\n", card.indexOf("function VoiceRows")));
  test("Settings asks the app for the lists and changes them only through set_voice_settings, and the app has both commands", () => {
    expect(rows).toContain('invoke("voice_settings")');
    expect(rows).toContain('invoke("set_voice_settings", voiceAsk(');
    expect(rows).toContain("voiceSettingsFrom(");
    const row = card.slice(card.indexOf("function SettingRow"), card.indexOf("\n}\n", card.indexOf("function SettingRow")));
    expect(row).toContain('d.key === "talk.voice" ? <VoiceRows />');
    const main = readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");
    for (const c of ["voice_settings", "set_voice_settings"]) expect(new RegExp(`generate_handler!\\[[^\\]]*\\b${c}\\b`).test(main), c).toBe(true);
  });
  test("every row is labelled for VoiceOver, and the lines about what is away are announced", () => {
    for (const label of ["S.voicePickLabel", "S.micPickLabel", "S.voiceLanguageLabel", "S.voiceSpeedGroup"]) expect(rows).toContain(label);
    expect(rows).toContain("voiceLine(v)"); expect(rows).toContain("micLine(v)"); expect(rows).toContain("soundLine(v.sound)");
    expect(rows).toMatch(/role="status"/);
  });
  test("the sample is said only when the person presses its button, through the same speak command", () => {
    const tries = rows.split("\n").filter((l) => l.includes('invoke("speak"'));
    expect(tries.length).toBe(1);
    expect(tries[0]).toContain("onClick=");
    expect(tries[0]).toContain("S.voiceSample");
  });
  test("Speak to me and Answer out loud are rows of their own in the same section, each off until turned on", () => {
    for (const k of ["talk.speak", "talk.speakReplies"]) expect(defOf(k), k).toMatchObject({ kind: "switch", default: false, section: "talking", store: "settings" });
    expect(S.set["talk.speak"].label).toBe(S.speakSetting);
    expect(S.set["talk.speakReplies"].label).toBe(S.speakRepliesSetting);
    // Turning either off silences at once: the shell does it when the setting changes (main.rs setting_applied).
    const rs = readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");
    expect(rs).toContain('if (key == "talk.speak" || key == "talk.speakReplies") && off(key) { speech_off(app); }');
  });
});

// Found in review, 18 Oct 2026: Show me's steps were timed for the normal speed whatever speed was picked, and the line in
// Settings about the project's words left out the setting names the speech model also gets.
describe("the picked speed reaches the card's own timing", () => {
  test("the card knows the speed Settings last read or saved, normal until then", () => {
    expect(spokenSpeed()).toBe(1);
    expect(noteSpeed({ ...sample, speed: 0.5 })).toEqual({ ...sample, speed: 0.5 });
    expect(spokenSpeed()).toBe(0.5);
    noteSpeed(voiceSettingsFrom({ speed: "fast" }));   // an answer that cannot be read is normal speed
    expect(spokenSpeed()).toBe(1);
  });
  test("the card reads the speed when it starts, and Settings notes every speed it reads or saves", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    const page = readFileSync(new URL("./settingsPage.tsx", import.meta.url), "utf8");
    const rows = page.slice(page.indexOf("function VoiceRows"), page.indexOf("\n}\n", page.indexOf("function VoiceRows")));
    expect(rows.match(/setV\(noteSpeed\(voiceSettingsFrom\(x\)\)\)/g)?.length).toBe(2);
    expect(rows).not.toMatch(/setV\(voiceSettingsFrom\(x\)\)/);
    // At its start the card asks only for the saved speed (voice_speed), never the lists: listing the microphones waits
    // until Settings is opened (T13).
    const main = card.slice(card.indexOf("function Card()"));
    expect(main).toContain('void invoke("voice_speed").then((x) => noteSpeed(voiceSettingsFrom({ speed: x }))).catch(() => {});');
    expect(main.slice(0, main.indexOf("function VoiceRows") > 0 ? main.indexOf("function VoiceRows") : undefined)).not.toContain('invoke("voice_settings")');
    const rs = readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");
    const cmd = rs.slice(rs.indexOf("fn voice_speed("), rs.indexOf("\n}\n", rs.indexOf("fn voice_speed(")));
    expect(cmd).toContain('window.label() != "card"');
    expect(cmd).toContain("voice_now().speed");
    expect(cmd).not.toMatch(/inputs\(|voices\(/);
    expect(/generate_handler!\[[^\]]*\bvoice_speed\b/.test(rs)).toBe(true);
  });
});

describe("what Settings says the speech model gets from the project", () => {
  test("every kind of name it gets is named, and that values never are", () => {
    // voicewords.rs: package names, the setting names the project check found, file and folder names.
    for (const w of ["file", "folder", "package names", "settings your project needs"]) expect(S.voiceWordsHelp).toContain(w);
    expect(S.voiceWordsHelp).toContain("never their values");
    expect(S.voiceWordsHelp).not.toContain("\u2014");
  });
});
