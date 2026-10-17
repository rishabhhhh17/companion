// Every key a hint names must be a key the app really registers (app/src-tauri/src/main.rs through keymap.rs), for the
// job the hint says, and the hints must be on the pages a person looks at. A hint that names the wrong key is worse than
// none. Since every key can be changed (M11 wave 4), each hint is filled from the keys in use, and the usual keys here
// must be the ones keymap.rs registers.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { S } from "./strings.ts";
import { keyHints, TALK_DEFAULT } from "./settings.ts";
import { chordLabel, JOBS, KEY_DEFAULTS, KEYS_START, keyHint, withKeys, type Job, type Keys } from "./keys.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const main = read("../src-tauri/src/main.rs");
const keymapRs = read("../src-tauri/src/keymap.rs");
const talkRs = read("../src-tauri/src/talkkeys.rs");
/** The part of a Rust file a person can meet: its tests name made up keys on purpose. */
const shipped = (rs: string) => rs.slice(0, rs.indexOf("#[cfg(test)]"));
const body = (src: string, from: string, to = "\n}\n") => { const a = src.indexOf(from); expect(a, from).toBeGreaterThan(-1); return src.slice(a, src.indexOf(to, a)); };

/** keymap.rs's own tables: each modifier's id and word, each key's id and word, and each job's usual keys as an id. */
function rust() {
  const mods = [...keymapRs.matchAll(/\((CONTROL|OPTION|SHIFT|COMMAND), "(\w+)", "(\w+)", Modifiers::\w+\)/g)].map((m) => ({ name: m[1], id: m[2], word: m[3] }));
  const keys = Object.fromEntries([...keymapRs.matchAll(/\(Key::(\w+), Code::\w+, "(\w+)", "(\w+)"\)/g)].map((m) => [m[1], { id: m[2], word: m[3] }]));
  const jobIds = Object.fromEntries([...body(keymapRs, "pub fn id(self)").matchAll(/Action::(\w+) => "([a-z]+)"/g)].map((m) => [m[1], m[2]]));
  const chord = (modNames: string, key: string) => [...mods.filter((m) => modNames.split("|").map((x) => x.trim()).includes(m.name)).map((m) => m.id), keys[key]?.id].join("-");
  const defaults = Object.fromEntries([...body(keymapRs, "pub const DEFAULTS", "];").matchAll(/\(Action::(\w+), Chord::new\(([A-Z |]+), Key::(\w+)\)\)/g)].map((m) => [jobIds[m[1]], chord(m[2], m[3])]));
  const talk = [...body(talkRs, "pub const CHOICES", "];").matchAll(/Chord::new\((OPTION|CONTROL), Key::(\w+)\)/g)].map((m) => chord(m[1], m[2]));
  return { mods, keys, jobIds, defaults, talk };
}
/** The letters a sentence names as "Control, Option, Command and X". */
const named = (t: string) => [...t.matchAll(/Control, Option, Command and ([A-Z])\b/g)].map((m) => m[1]);
/** Two key chords a sentence names, such as "Option and Space" (not the end of "Control, Option, Command and K"). */
const namedChords = (t: string) => [...t.matchAll(/(?<!, )\b(Option|Control|Command|Shift) and (Space|Return|Enter|Tab|Backquote|Escape|Esc|[A-Z])\b/g)].map((m) => `${m[1]} and ${m[2]}`);
const letterOf = (id: string) => id.split("-").pop()!.toUpperCase();
const keys = (job: Job, id: string | null): Keys => ({ using: { ...KEYS_START.using, [job]: id }, picked: { ...KEYS_START.picked, [job]: id ?? KEY_DEFAULTS[job] } });

describe("the keys main.rs registers", () => {
  test("the usual keys in keymap.rs are the page's, and both name them with the same words", () => {
    const r = rust();
    expect(r.defaults).toEqual(KEY_DEFAULTS);
    expect(Object.values(r.jobIds)).toEqual([...JOBS]);
    for (const m of r.mods) expect((S.keyWords as Record<string, string>)[m.id], m.id).toBe(m.word);
    for (const k of Object.values(r.keys)) expect(chordLabel(`control-${k.id}`), k.id).toBe(`Control and ${k.word}`);
    // Every letter job uses Control, Option and Command, as it always did; hold to talk is two keys.
    for (const j of JOBS.filter((j) => j !== "talk")) expect(KEY_DEFAULTS[j], j).toStartWith("control-option-command-");
    expect(KEY_DEFAULTS.talk).toBe("option-space");
    expect(new Set(JOBS.filter((j) => j !== "talk").map((j) => letterOf(KEY_DEFAULTS[j]))).size).toBe(JOBS.length - 1);
  });
  test("every job is registered through the key map at launch, before the one notice, and no key is written into main.rs", () => {
    const setup = main.slice(main.indexOf(".setup(move |app|"));
    expect(setup.indexOf("start_keys(app.handle())")).toBeGreaterThan(0);
    expect(setup.indexOf("start_keys(app.handle())")).toBeLessThan(setup.indexOf("keymap::launch_notice(&launch.started, launch.damaged)"));
    expect(body(main, "fn start_keys(")).toContain("keymap::start(&picked,");
    expect(main).not.toMatch(/Code::Key[A-Z]/);
    expect(main + shipped(keymapRs)).not.toContain("Code::KeyV");
  });
  test("the handler sends each job's keys to that job, and only the keys in use now reach it", () => {
    const handler = body(main, ".with_handler(", ".build(),");
    const arm = (job: string) => { const a = handler.indexOf(`keymap::Action::${job} =>`); expect(a, job).toBeGreaterThan(-1); const rest = handler.slice(a + 10); const n = rest.search(/keymap::Action::\w+ =>/); return rest.slice(0, n < 0 ? undefined : n); };
    expect(arm("Card")).toContain('open_card(app, "hotkey", true)'); expect(arm("Card")).not.toContain("showme-mode");
    expect(arm("ShowMe")).toContain('"showme-mode"');
    expect(arm("Problem")).toContain('"find-problem"');
    expect(arm("Read")).toContain("phelp::on_hotkey(");
    expect(arm("Explain")).toContain("errhelp::on_hotkey(");
    expect(arm("Accept")).toContain("phelp::put_back(&a, false)");
    expect(arm("Stop")).toContain('stop_everything("kill switch")');
    expect(main).toContain("fn is_talk(s: &Shortcut) -> bool { key_action(s) == Some(keymap::Action::Talk) }");
    expect(body(main, "fn key_action(")).toContain("key_using(");
    expect(body(main, "fn key_using(")).toContain("KEYS_USING[a.index()]");
  });
  test("Esc dismisses a Prompt help result while it shows, with the accept keys in use", () => {
    expect(main).toContain("fn sc_esc() -> Shortcut { Shortcut::new(None, Code::Escape) }");
    expect(main).toMatch(/gs\.register\(sc_esc\(\)\)/);
    const arm = body(main, "fn arm_now(");
    expect(arm).toContain("key_using(keymap::Action::Accept)");
    expect(arm).toContain("ACCEPT_ARMED");
  });
  test("hold to talk is two keys, Option and Space by default, handled as press and let go", () => {
    const r = rust();
    expect(r.talk).toEqual(["option-space", "option-return", "control-return"]);
    expect(r.talk[0]).toBe(TALK_DEFAULT);
    expect(talkRs).toContain("pub const DEFAULT: Chord = CHOICES[0];");
    expect(chordLabel(r.talk[0])).toBe("Option and Space");
    // The old four key chord is gone, and nothing registers V.
    expect(main).not.toContain("Code::KeyV");
    // The handler: the chord in use, a repeat while held does nothing, and both the press and the let go reach the microphone.
    const hold = main.slice(main.indexOf("if is_talk(s) {"), main.indexOf("if e.state != ShortcutState::Pressed { return; }"));
    expect(hold).toMatch(/if down \{ h\.press\(now\(\) as u64\) \} else \{ h\.release\(\) \}/);
    expect(hold.indexOf("if !counts { return; }")).toBeLessThan(hold.indexOf("voice_send(app"));
    expect(hold).toContain("VoiceMsg::Down(now() as u64)"); expect(hold).toContain("VoiceMsg::Up(now() as u64)");
  });
  test("every hold to talk chord but the default says what it gives up, as talkkeys.rs lists it", () => {
    // talkkeys.rs checks that each other chord is on its list of macOS text keys it takes; the page must say which.
    expect(talkRs).toContain("fn every_other_choice_gives_up_a_macos_text_key_and_the_picker_must_say_which()");
    const costs = S.talkKeyCosts as Record<string, string>;
    const others = rust().talk.slice(1);
    expect(Object.keys(costs)).toEqual(others);
    for (const id of others) { expect(costs[id], id).toStartWith(`${chordLabel(id)}: while picked, it no longer `); expect(namedChords(costs[id])).toEqual([chordLabel(id)]); }
    expect(costs[TALK_DEFAULT]).toBeUndefined();
  });
});

describe("every hint names the keys in use", () => {
  // Each line that names a job's keys, and that job. Every one is a template: it names no key itself.
  const lines: [string, Job][] = [
    [S.cardHint, "card"], [S.pointHint, "problem"], [S.practiceKeys, "problem"], [S.showMeKeyHint, "showme"], [S.phKeyHint, "read"],
    [S.phNeedsAccess, "read"], [S.errKeyHint, "explain"], [S.ehNeedsAccess, "explain"], [S.ehOwnApp, "explain"], [S.ehNothing("Terminal"), "explain"],
    [S.stopHint, "stop"], [S.phHotkeys, "accept"], [S.voiceHint, "talk"],
  ];
  test("each is a template with one place for the keys, and names no key itself", () => {
    for (const [t, j] of lines) { expect(t.split("{keys}").length, `${j}: ${t}`).toBe(2); expect(named(t)).toEqual([]); expect(namedChords(t)).toEqual([]); }
  });
  test("filled with the usual keys, each names the keys main.rs registers for its job", () => {
    for (const [t, j] of lines) {
      const filled = withKeys(t, j, KEYS_START);
      if (j === "talk") expect(namedChords(filled), t).toEqual(["Option and Space"]);
      else expect(named(filled), t).toEqual([letterOf(KEY_DEFAULTS[j])]);
    }
  });
  test("filled after a change, each names the new keys, and a job without keys is never named", () => {
    for (const [t, j] of lines) {
      const id = j === "talk" ? "control-return" : "control-option-command-u";
      expect(withKeys(t, j, keys(j, id)), t).toContain(chordLabel(id));
    }
    for (const j of JOBS) {
      const hint = keyHints(keys(j, null)).join(" ");
      if (j === "talk") expect(namedChords(hint)).toEqual([]);
      else if (j !== "accept") expect(named(hint)).not.toContain(letterOf(KEY_DEFAULTS[j]));
    }
  });
  test("the hint list names every job a person can press any time, with the keys in use", () => {
    const all = keyHints();
    for (const j of JOBS.filter((j) => j !== "talk" && j !== "accept")) expect(all.flatMap(named), j).toContain(letterOf(KEY_DEFAULTS[j]));
    expect(all.flatMap(namedChords)).toEqual(["Option and Space"]);
    const moved = keyHints(keys("stop", "control-option-shift-command-x"));
    expect(moved.at(-1)).toBe("Press Control, Option, Shift, Command and X to stop everything at once.");
    for (const id of rust().talk) expect(keyHints(keys("talk", id)).flatMap(namedChords), id).toEqual([chordLabel(id)]);
    expect(keyHint("card", S.cardHint)).toBe(withKeys(S.cardHint, "card"));
  });
  test("the Prompt help result names Esc, and the card hint names the Esc the card itself handles", () => {
    expect(S.phHotkeys).toContain("Esc"); expect(S.phHotkeysOff).toContain("Esc");
    expect(S.cardHint).toContain("Esc");
    expect(read("./card.tsx")).toMatch(/e\.key === "Escape"[^\n]*close_card/);
  });
  test("every page fills its key lines from the key map, never from a fixed line", () => {
    const card = read("./card.tsx");
    for (const k of ["practiceKeys", "phHotkeys", "cardHint", "pointHint", "showMeKeyHint", "phKeyHint", "errKeyHint", "stopHint"]) expect(card, k).not.toContain(`{S.${k}}`);
    expect(card).toContain('keyHint("problem", S.practiceKeys');
    // The use keys are named only when the app could take them for this result: ph_ready answers whether it did.
    expect(card).toContain("acceptHint(phArmed, keys)");
    expect(card).toMatch(/invoke\("ph_ready", \{[^}]*\}\)\.then\(\(v\) => setPhArmed\(v !== false\)\)/);
    expect(main).toMatch(/fn ph_ready\([^)]*\) -> bool \{[^\n]*arm_result_keys\(&app, true\); ACCEPT_ARMED\.load\(Ordering::SeqCst\) \}/);
    const model = read("./model.ts");
    expect(model).not.toMatch(/Control, Option, Command/);
    expect(model).toContain('withKeys(S.phNeedsAccess, "read")');
    // Lessons (and the engine's own lesson lines) name the usual keys; the page names the keys in use instead.
    expect(model).toMatch(/say: keysIn\(String\(e\.say\)\)/);
  });
  test("no line anywhere names a key that is not registered", () => {
    const letters = new Set(JOBS.filter((j) => j !== "talk").map((j) => letterOf(KEY_DEFAULTS[j])));
    const offered = new Set(rust().talk.map(chordLabel));
    const lessonDir = new URL("../../lessons/", import.meta.url).pathname;
    const docs = ["../../docs/alpha/INSTALL.md", "../../docs/alpha/PRIVACY.md"].map(read);
    const texts: string[] = [
      ...(Object.values(S) as unknown[]).filter((v): v is string => typeof v === "string"),
      ...lines.map(([t, j]) => withKeys(t, j, KEYS_START)),
      ...Object.values(S.talkKeyCosts as Record<string, string>),
      ...readdirSync(lessonDir).filter((f) => f.endsWith(".json")).map((f) => readFileSync(lessonDir + f, "utf8")),
      ...[...main.matchAll(/"([^"\n]*(?:Control|Option|Command)[^"\n]*)"/g)].map((m) => m[1]),
      ...[shipped(keymapRs), shipped(talkRs)].flatMap((rs) => [...rs.matchAll(/"([^"\n]*(?:Option|Control) and [^"\n]*)"/g)].map((m) => m[1])),
      read("./model.ts"),
      ...docs,
    ];
    expect(texts.flatMap(named).length).toBeGreaterThan(6);
    for (const t of texts) for (const l of named(t)) expect(letters.has(l), `${l} in: ${t.slice(0, 80)}`).toBe(true);
    // Lessons tell the person to press other apps' keys (Command and Space for Spotlight), so in a lesson only a line about
    // talking must name one of our chords.
    const lessonLines = texts.filter((t) => t.trimStart().startsWith("{")).flatMap((t) => t.split("\n")).filter((l) => /talk/i.test(l));
    for (const t of [...texts.filter((t) => !t.trimStart().startsWith("{")), ...lessonLines]) for (const c of namedChords(t)) expect(offered.has(c), `${c} in: ${t.slice(0, 80)}`).toBe(true);
  });
  test("the friends' install and privacy notes name the usual keys, say every one can be changed, and never the old V", () => {
    const install = read("../../docs/alpha/INSTALL.md");
    const privacy = read("../../docs/alpha/PRIVACY.md");
    for (const d of [install, privacy]) { expect(d).toContain("Option and Space"); expect(d).not.toMatch(/\*\*V\*\*/); }
    expect(install).toContain(S.keysTitle);
    expect(install).toContain("These are the usual keys. You can change any of them in **Settings**, under Keys to remember");
  });
  test("the install note covers apps that share Option and Space without any notice, and what the other keys give up", () => {
    // macOS refuses keys only when another app took them alone, so Alfred, Raycast and ChatGPT can share them silently.
    const install = read("../../docs/alpha/INSTALL.md");
    const talk = install.slice(install.indexOf("**To talk**"), install.indexOf("\n", install.indexOf("**To talk**")));
    expect(talk).toContain("Alfred, Raycast and ChatGPT also use Option and Space unless you changed theirs.");
    expect(talk).toContain("If one of them stops opening, or talking does nothing, pick other keys");
    expect(talk).not.toMatch(/If another app already uses Option and Space, Companion says so when it opens/);
    expect(talk).toContain("no longer add a new line");
  });
  test("the launch notice and the ready line point to the same Settings heading the page shows", () => {
    expect(keymapRs).toContain(`pub(crate) const WHERE_TO_PICK: &str = "in Settings, under ${S.keysTitle}";`);
    expect(S.keysHelp).toContain(S.keysTitle);
    expect(S.keyHintOff).toContain(S.keysTitle);
  });
});

describe("the hints are shown where a person looks", () => {
  test("at the end of the first run, and every job with its keys in Settings", () => {
    const onboarding = read("./onboarding.tsx");
    const card = read("./card.tsx");
    expect(onboarding).toContain("keyHints(keys)");
    expect(onboarding).toContain("S.keysTitle");
    const settings = body(card, "function SettingsPanel");
    expect(settings).toContain("<KeysSection");
    expect(body(card, "function KeysSection")).toContain("keyRows(keys)");
  });
});
