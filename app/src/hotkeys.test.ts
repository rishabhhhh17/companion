// Every key a hint names must be a key the app really registers (app/src-tauri/src/main.rs), for the job the hint says,
// and the hints must be on the pages a person looks at. A hint that names the wrong key is worse than none.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { S } from "./strings.ts";
import { keyHints } from "./settings.ts";

const main = readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");
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

describe("the hotkeys main.rs registers", () => {
  test("all use Control, Option and Command, and every job has its own letter", () => {
    expect(main).toContain(`let mods = ${MODS};`);
    expect(main).toContain(`fn sc_mods() -> Modifiers { ${MODS} }`);
    const jobs = registered();
    for (const j of ["open the ask box", "stop everything", "Prompt help", "hold to talk", "Show me how", "point at the problem", "explain an error", "accept"]) expect(jobs[j], j).toMatch(/^[A-Z]$/);
    expect(new Set(Object.values(jobs)).size).toBe(Object.keys(jobs).length);
  });
  test("Esc dismisses a Prompt help result while it shows", () => {
    expect(main).toContain("fn sc_esc() -> Shortcut { Shortcut::new(None, Code::Escape) }");
    expect(main).toMatch(/gs\.register\(sc_esc\(\)\)/);
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
    ["voiceHint", ["hold to talk"]],
    ["stopHint", ["stop everything"]],
    ["phHotkeys", ["accept"]],
  ];
  for (const [k, need] of want) {
    test(k, () => expect(named(String(S[k]))).toEqual(need.map((j) => jobs[j])));
  }
  test("the Prompt help result names Esc, and the card hint names the Esc the card itself handles", () => {
    expect(S.phHotkeys).toContain("Esc");
    expect(S.cardHint).toContain("Esc");
    expect(readFileSync(new URL("./card.tsx", import.meta.url), "utf8")).toMatch(/e\.key === "Escape"[^\n]*close_card/);
  });
  test("no line anywhere names a key that is not registered", () => {
    const letters = new Set(Object.values(jobs));
    const lessonDir = new URL("../../lessons/", import.meta.url).pathname;
    const texts: string[] = [
      ...(Object.values(S) as unknown[]).filter((v): v is string => typeof v === "string"),
      ...readdirSync(lessonDir).filter((f) => f.endsWith(".json")).map((f) => readFileSync(lessonDir + f, "utf8")),
      ...[...main.matchAll(/"([^"\n]*Control, Option, Command[^"\n]*)"/g)].map((m) => m[1]),
      readFileSync(new URL("./model.ts", import.meta.url), "utf8"),
    ];
    expect(texts.flatMap(named).length).toBeGreaterThan(8);
    for (const t of texts) for (const l of named(t)) expect(letters.has(l), `${l} in: ${t.slice(0, 80)}`).toBe(true);
  });
});

describe("the hints are shown where a person looks", () => {
  test("the list covers every hotkey a person can press any time", () => {
    const jobs = registered();
    const shown = new Set(keyHints().flatMap(named));
    for (const j of ["open the ask box", "stop everything", "Prompt help", "hold to talk", "Show me how", "point at the problem", "explain an error"]) expect(shown.has(jobs[j]), j).toBe(true);
  });
  test("at the end of the first run and in Settings", () => {
    const onboarding = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(onboarding).toContain("keyHints()");
    expect(onboarding).toContain("S.keysTitle");
    const settings = card.slice(card.indexOf("function SettingsPanel"));
    expect(settings.slice(0, settings.indexOf("\n}\n"))).toContain("keyHints()");
  });
});
