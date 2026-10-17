// F18 item 2: the companion comes from anywhere. The shell decides where the character goes (roam.rs, tested there);
// the page only shows the named state it is told (surface, travel, settle, visiting, return, home) so the founder's art
// can replace the placeholder dot later, and Settings has the one switch.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ROAM_PHASES, roamFrom } from "./roam.ts";
import { comeToFrom } from "./settings.ts";
import { S } from "./strings.ts";
import { bend, ease } from "./pointer.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("the named states", () => {
  test("are the shell's, in the same words", () => {
    const rust = read("../src-tauri/src/roam.rs");
    const names = [...rust.slice(rust.indexOf("pub fn name(self)"), rust.indexOf("pub fn name(self)") + 400).matchAll(/=> "([a-z]+)"/g)].map((m) => m[1]);
    expect([...names].sort()).toEqual([...ROAM_PHASES].sort());
    expect(ROAM_PHASES).toContain("surface");
    expect(ROAM_PHASES).toContain("travel");
    expect(ROAM_PHASES).toContain("settle");
    expect(ROAM_PHASES).toContain("return");
  });
  test("anything the page cannot read is home, facing nowhere in particular", () => {
    expect(roamFrom({ phase: "settle", toward: "left" })).toEqual({ phase: "settle", toward: "left" });
    expect(roamFrom({ phase: "visiting", toward: "up" })).toEqual({ phase: "visiting", toward: "up" });
    for (const junk of [undefined, null, 3, "travel", {}, { phase: "fly" }, { phase: "travel", toward: "sideways" }, { phase: "__proto__" }]) {
      const r = roamFrom(junk);
      expect(ROAM_PHASES).toContain(r.phase);
      expect([null, "left", "right", "up", "down"]).toContain(r.toward);
    }
    expect(roamFrom({ phase: "fly", toward: "left" }).phase).toBe("home");
    expect(roamFrom({ phase: "travel", toward: "sideways" })).toEqual({ phase: "travel", toward: null });
  });
});

describe("the character page", () => {
  const dock = read("./dock.tsx");
  test("shows the state it is told and which way to face, and nothing else moves it", () => {
    expect(dock).toContain('listen("roam"');
    expect(dock).toContain("data-roam={roam.phase}");
    expect(dock).toContain("data-toward={roam.toward ?? undefined}");
    expect(dock).not.toMatch(/setPosition|moveTo|set_focus|focus\(\)/);
  });
  test("every named state that moves is switched off with reduced motion", () => {
    const css = read("./style.css");
    const block = /@media \(prefers-reduced-motion: reduce\)\s*\{([^}]*\{[^}]*\}[^}]*)\}/.exec(css)?.[1] ?? "";
    expect(block).toContain("[data-roam]");
    for (const p of ["surface", "travel", "settle", "return"]) expect(css).toContain(`.character[data-roam="${p}"]`);
  });
  test("the trip uses the arrow's easing and bend", () => {
    expect(ease(0)).toBe(0); expect(ease(1)).toBe(1); expect(ease(0.5)).toBe(0.5); expect(ease(0.25)).toBe(0.125);
    expect(bend(100)).toBe(25); expect(bend(10_000)).toBe(80);
  });
});

describe("Come to what it is about", () => {
  test("is on unless the app clearly says off", () => {
    expect(comeToFrom({ comeTo: false })).toBe(false);
    expect(comeToFrom({ comeTo: true })).toBe(true);
    for (const junk of [undefined, null, "off", 0, {}, { comeTo: "no" }, { comeTo: 0 }]) expect(comeToFrom(junk)).toBe(true);
  });
  test("Settings has the switch, kept by the app, and the hint for dragging it anywhere", () => {
    const card = read("./card.tsx");
    const settings = card.slice(card.indexOf("function SettingsPanel"));
    expect(card).toContain('invoke("dock_settings")');
    expect(card).toContain('invoke("set_come_to", { on: next })');
    expect(settings).toContain("<ComeToRow");
    const row = card.slice(card.indexOf("function ComeToRow"), card.indexOf("\n}\n", card.indexOf("function ComeToRow")));
    for (const s of ["S.comeToSetting", "S.comeToHelp", "S.dragHint"]) expect(row).toContain(s);
    const main = read("../src-tauri/src/main.rs");
    for (const c of ["dock_settings", "set_come_to"]) expect(new RegExp(`generate_handler!\\[[^\\]]*\\b${c}\\b`).test(main), c).toBe(true);
  });
  test("the words say what it does, in plain words", () => {
    expect(S.comeToSetting).toBe("Come to what it is about");
    expect(S.comeToHelp).toMatch(/^On unless you turn it off\./);
    expect(S.comeToHelp).toMatch(/never on top of it/);
    expect(S.comeToHelp).toMatch(/goes back/);
    expect(S.dragHint).toMatch(/any edge or corner/);
    expect(S.hideFromSharingHelp).toMatch(/character, rings and card/);
  });
});
