// Every key a hint names must be a key the app really registers (app/src-tauri/src/main.rs), for the job the hint says,
// and the hints must be on the pages a person looks at. A hint that names the wrong key is worse than none.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { S } from "./strings.ts";
import { keyHints, TALK_DEFAULT, TALK_KEYS_START, type TalkKeys } from "./settings.ts";

const main = readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");
const talkRs = readFileSync(new URL("../src-tauri/src/talkkeys.rs", import.meta.url), "utf8");
const MODS = "Modifiers::CONTROL | Modifiers::ALT | Modifiers::SUPER";

/** Each job main.rs registers a hotkey for, and the letter it uses (all with Control, Option and Command). */
function registered(): Record<string, string> {
  const letter: Record<string, string> = {};
  for (const m of main.matchAll(/let (\w+) = Shortcut::new\(Some\(mods\), Code::Key([A-Z])\)/g)) letter[m[1]] = m[2];
  for (const m of main.matchAll(/fn (sc_\w+)\(\) -> Shortcut \{ Shortcut::new\(Some\(sc_mods\(\)\), Code::Key([A-Z])\) \}/g)) letter[`${m[1]}()`] = m[2];
  const list = /for \(sc, what\) in \[(.*?)\] \{/s.exec(main)?.[1] ?? "";
  const jobs: Record<string, string> = {};
  for (const m of list.matchAll(/\((\w+(?:\(\))?), "([^"]+)"\)/g)) { const l = letter[m[1]]; if (l) jobs[m[2]] = l; }
  // Accept is armed only while a Prompt help result is showing, together with Esc.
  if (/gs\.register\(sc_accept\(\)\)/.test(main) && letter["sc_accept()"]) jobs["accept"] = letter["sc_accept()"];
  return jobs;
}
/** The letters a sentence names as "Control, Option, Command and X". */
const named = (t: string) => [...t.matchAll(/Control, Option, Command and ([A-Z])\b/g)].map((m) => m[1]);

/** The hold to talk chords talkkeys.rs offers, in order, each with the words its modifier and key are shown as. */
function chords(): { id: string; label: string; mods: string; code: string }[] {
  const word = (kind: string) => Object.fromEntries([...talkRs.matchAll(new RegExp(`${kind}::(\\w+) => "(\\w+)"`, "g"))].map((m) => [m[1], m[2]]));
  const toMods = Object.fromEntries([...talkRs.matchAll(/Mod::(\w+) => Modifiers::(\w+)/g)].map((m) => [m[1], m[2]]));
  const toCode = Object.fromEntries([...talkRs.matchAll(/Key::(\w+) => Code::(\w+)/g)].map((m) => [m[1], m[2]]));
  const [modWord, keyWord] = [word("Mod"), word("Key")];
  const list = /pub const CHOICES: &\[Chord\] = &\[(.*?)\];/s.exec(talkRs)?.[1] ?? "";
  return [...list.matchAll(/Chord \{ id: "([a-z-]+)", with: Mod::(\w+), key: Key::(\w+) \}/g)].map((m) => ({ id: m[1], label: `${modWord[m[2]]} and ${keyWord[m[3]]}`, mods: toMods[m[2]], code: toCode[m[3]] }));
}
/** Two key chords a sentence names, such as "Option and Space" (not the end of "Control, Option, Command and K"). */
const namedChords = (t: string) => [...t.matchAll(/(?<!, )\b(Option|Control|Command|Shift) and (Space|Return|Enter|Tab|Backquote|Escape|Esc|[A-Z])\b/g)].map((m) => `${m[1]} and ${m[2]}`);
const using = (id: string | null): TalkKeys => ({ ...TALK_KEYS_START, using: id, picked: id ?? TALK_DEFAULT });

describe("the hotkeys main.rs registers", () => {
  test("all use Control, Option and Command, and every job has its own letter", () => {
    expect(main).toContain(`let mods = ${MODS};`);
    expect(main).toContain(`fn sc_mods() -> Modifiers { ${MODS} }`);
    const jobs = registered();
    for (const j of ["open the ask box", "stop everything", "Prompt help", "Show me how", "point at the problem", "explain an error", "accept"]) expect(jobs[j], j).toMatch(/^[A-Z]$/);
    expect(new Set(Object.values(jobs)).size).toBe(Object.keys(jobs).length);
  });
  test("Esc dismisses a Prompt help result while it shows", () => {
    expect(main).toContain("fn sc_esc() -> Shortcut { Shortcut::new(None, Code::Escape) }");
    expect(main).toMatch(/gs\.register\(sc_esc\(\)\)/);
  });
  test("hold to talk is two keys, Option and Space by default, registered at launch and handled as press and let go", () => {
    const list = chords();
    expect(list.map((c) => c.id)).toEqual(["option-space", "option-return", "control-return"]);
    expect(talkRs).toContain("pub const DEFAULT: &Chord = &CHOICES[0];");
    expect(list[0]).toEqual({ id: TALK_DEFAULT, label: "Option and Space", mods: "ALT", code: "Space" });
    for (const c of list) expect(["ALT", "CONTROL"], c.id).toContain(c.mods);
    // The old four key chord is gone: no letter job is hold to talk, and nothing registers V.
    expect(Object.keys(registered())).not.toContain("hold to talk");
    expect(main).not.toContain("Code::KeyV");
    // Launch: the saved chord or the default, through the tested rules, before the one notice is said.
    expect(main).toMatch(/talkkeys::start\(picked, \|c\| gs\.register\(talkkeys::shortcut\(c\)\)\.is_ok\(\)\)/);
    const setup = main.slice(main.indexOf(".setup(move |app|"));
    expect(setup.indexOf("start_talk_keys(app.handle())")).toBeGreaterThan(0);
    expect(setup.indexOf("start_talk_keys(app.handle())")).toBeLessThan(setup.indexOf("talkkeys::launch_notice(&taken, &talk)"));
    // The handler: the chord in use, a repeat while held does nothing, and both the press and the let go reach the microphone.
    const hold = main.slice(main.indexOf("if is_talk(s) {"), main.indexOf("if e.state != ShortcutState::Pressed { return; }"));
    expect(hold).toMatch(/if down \{ h\.press\(now\(\) as u64\) \} else \{ h\.release\(\) \}/);
    expect(hold.indexOf("if !counts { return; }")).toBeLessThan(hold.indexOf("voice_send(app"));
    expect(hold).toContain("VoiceMsg::Down(now() as u64)"); expect(hold).toContain("VoiceMsg::Up(now() as u64)");
    expect(main).toContain("fn is_talk(s: &Shortcut) -> bool { talk_using().is_some_and(|c| &talkkeys::shortcut(c) == s) }");
  });
  test("the strings name each chord exactly as talkkeys.rs builds it", () => {
    const names = S.talkKeyNames as Record<string, string>;
    expect(Object.keys(names)).toEqual(chords().map((c) => c.id));
    for (const c of chords()) expect(names[c.id], c.id).toBe(c.label);
  });
  test("every chord but the default says what it gives up, as talkkeys.rs lists it", () => {
    // talkkeys.rs checks that each other chord is on its list of macOS text keys it takes; the page must say which.
    expect(talkRs).toContain("fn every_other_choice_gives_up_a_macos_text_key_and_the_picker_must_say_which()");
    const costs = S.talkKeyCosts as Record<string, string>;
    const others = chords().slice(1);
    expect(Object.keys(costs)).toEqual(others.map((c) => c.id));
    for (const c of others) { expect(costs[c.id], c.id).toStartWith(`${c.label}: while picked, it no longer `); expect(namedChords(costs[c.id])).toEqual([c.label]); }
    expect(costs[TALK_DEFAULT]).toBeUndefined();
  });
});

describe("every hint names the right key", () => {
  const jobs = registered();
  const want: [keyof typeof S, string[]][] = [
    ["cardHint", ["open the ask box"]],
    ["pointHint", ["point at the problem"]],
    ["practiceKeys", ["point at the problem"]],
    ["showMeKeyHint", ["Show me how"]],
    ["phKeyHint", ["Prompt help"]],
    ["errKeyHint", ["explain an error"]],
    ["stopHint", ["stop everything"]],
    ["phHotkeys", ["accept"]],
  ];
  for (const [k, need] of want) {
    test(k, () => expect(named(String(S[k]))).toEqual(need.map((j) => jobs[j])));
  }
  test("the hold to talk hint names the chord in use, for every chord, and none when another app holds it", () => {
    for (const c of chords()) {
      const voice = keyHints(using(c.id)).filter((l) => namedChords(l).length > 0);
      expect(voice.flatMap(namedChords), c.id).toEqual([c.label]);
      expect(voice[0]).toContain(`Hold ${c.label}`);
    }
    expect(keyHints(using(null)).flatMap(namedChords)).toEqual([]);
    expect(keyHints().flatMap(namedChords)).toEqual(["Option and Space"]);
  });
  test("the Prompt help result names Esc, and the card hint names the Esc the card itself handles", () => {
    expect(S.phHotkeys).toContain("Esc");
    expect(S.cardHint).toContain("Esc");
    expect(readFileSync(new URL("./card.tsx", import.meta.url), "utf8")).toMatch(/e\.key === "Escape"[^\n]*close_card/);
  });
  test("no line anywhere names a key that is not registered", () => {
    const letters = new Set(Object.values(jobs));
    const offered = new Set(chords().map((c) => c.label));
    const lessonDir = new URL("../../lessons/", import.meta.url).pathname;
    const docs = ["../../docs/alpha/INSTALL.md", "../../docs/alpha/PRIVACY.md"].map((p) => readFileSync(new URL(p, import.meta.url), "utf8"));
    const texts: string[] = [
      ...(Object.values(S) as unknown[]).filter((v): v is string => typeof v === "string"),
      ...Object.values(S.talkKeyNames as Record<string, string>),
      ...Object.values(S.talkKeyCosts as Record<string, string>),
      ...readdirSync(lessonDir).filter((f) => f.endsWith(".json")).map((f) => readFileSync(lessonDir + f, "utf8")),
      ...[...main.matchAll(/"([^"\n]*Control, Option, Command[^"\n]*)"/g)].map((m) => m[1]),
      ...[...talkRs.matchAll(/"([^"\n]*(?:Option|Control) and [^"\n]*)"/g)].map((m) => m[1]),
      readFileSync(new URL("./model.ts", import.meta.url), "utf8"),
      ...docs,
    ];
    expect(texts.flatMap(named).length).toBeGreaterThan(8);
    for (const t of texts) for (const l of named(t)) expect(letters.has(l), `${l} in: ${t.slice(0, 80)}`).toBe(true);
    // Lessons tell the person to press other apps' keys (Command and Space for Spotlight), so in a lesson only a line about
    // talking must name one of our chords.
    const lessonLines = texts.filter((t) => t.trimStart().startsWith("{")).flatMap((t) => t.split("\n")).filter((l) => /talk/i.test(l));
    for (const t of [...texts.filter((t) => !t.trimStart().startsWith("{")), ...lessonLines]) for (const c of namedChords(t)) expect(offered.has(c), `${c} in: ${t.slice(0, 80)}`).toBe(true);
  });
  test("the friends' install and privacy notes name the new talk keys, and never the old V", () => {
    const install = readFileSync(new URL("../../docs/alpha/INSTALL.md", import.meta.url), "utf8");
    const privacy = readFileSync(new URL("../../docs/alpha/PRIVACY.md", import.meta.url), "utf8");
    for (const d of [install, privacy]) { expect(d).toContain("Option and Space"); expect(d).not.toMatch(/\*\*V\*\*/); }
    expect(install).toContain(S.keysTitle);
  });
  test("the install note covers apps that share Option and Space without any notice, and what the other keys give up", () => {
    // macOS refuses keys only when another app took them alone, so Alfred, Raycast and ChatGPT can share them silently.
    const install = readFileSync(new URL("../../docs/alpha/INSTALL.md", import.meta.url), "utf8");
    const talk = install.slice(install.indexOf("**To talk**"), install.indexOf("\n", install.indexOf("**To talk**")));
    expect(talk).toContain("Alfred, Raycast and ChatGPT also use Option and Space unless you changed theirs.");
    expect(talk).toContain("If one of them stops opening, or talking does nothing, pick other keys");
    expect(talk).not.toMatch(/If another app already uses Option and Space, Companion says so when it opens/);
    expect(talk).toContain("no longer add a new line");
  });
  test("the launch notice and the ready line point to the same Settings heading the page shows", () => {
    expect(talkRs).toContain(`const WHERE_TO_PICK: &str = "in Settings, under ${S.keysTitle}";`);
  });
});

describe("the hints are shown where a person looks", () => {
  test("the list covers every hotkey a person can press any time", () => {
    const jobs = registered();
    const shown = new Set(keyHints().flatMap(named));
    for (const j of ["open the ask box", "stop everything", "Prompt help", "Show me how", "point at the problem", "explain an error"]) expect(shown.has(jobs[j]), j).toBe(true);
    expect(keyHints().flatMap(namedChords)).toContain("Option and Space");
  });
  test("at the end of the first run and in Settings", () => {
    const onboarding = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(onboarding).toContain("keyHints(talk)");
    expect(onboarding).toContain("S.keysTitle");
    const settings = card.slice(card.indexOf("function SettingsPanel"));
    expect(settings.slice(0, settings.indexOf("\n}\n"))).toContain("keyHints(talk)");
  });
});
