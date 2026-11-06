// M72 (make it work), engineer finding 1 and 2: a store with the retired Friendly style and no character of its own keeps
// its water character everywhere: Home, the edge character, Settings and the page root. Tested through setting() and the
// store, the way the app reads it (the shell keeps only values away from usual, so an untouched Character is not stored
// and setting() gives the registry's usual value, the Visor).
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { PAGE_STORAGE_MARK } from "../../protocol/settings.ts";
import { _invokeForTests, _resetForTests, changeSetting, characterNow, resetSetting, setting, storedSetting, takeSnapshot } from "./settingsStore.ts";

afterEach(() => { _resetForTests(); _invokeForTests(null); });
const snap = (values: Record<string, unknown>) => ({ values, usual: {}, project: "", migrated: [PAGE_STORAGE_MARK], problems: [], changed: [] });
const none = { getItem: () => null };
const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");

describe("a Friendly store keeps its water character", () => {
  test("setting() gives the usual Visor, but nothing is stored, so the character in force is the water character", () => {
    takeSnapshot(snap({ "look.style": "friendly" }));
    expect(setting("look.character", none)).toBe("visor");
    expect(storedSetting("look.character", none)).toBeUndefined();
    expect(storedSetting("look.style", none)).toBe("friendly");
    expect(characterNow(none)).toBe("friendly");
  });
  test("a stored character always wins over the retired style, and a stored match under Friendly is water", () => {
    takeSnapshot(snap({ "look.style": "friendly", "look.character": "orb" }));
    expect(characterNow(none)).toBe("orb");
    takeSnapshot(snap({ "look.style": "friendly", "look.character": "match" }));
    expect(characterNow(none)).toBe("friendly");
    takeSnapshot(snap({}));
    expect(characterNow(none)).toBe("visor");
    takeSnapshot(snap({ "look.character": "match" }));
    expect(characterNow(none)).toBe("visor");
  });
  test("picking a character under the retired style also puts the style back, so picking the Visor (the usual, never stored) sticks", async () => {
    const calls: { cmd: string; args?: Record<string, unknown> }[] = [];
    takeSnapshot(snap({ "look.style": "friendly" }));
    _invokeForTests(async (cmd, args) => { calls.push({ cmd, args }); return cmd === "settings_reset" ? snap({}) : snap({ "look.style": "friendly" }); });
    await changeSetting("look.character", "visor");
    expect(calls.map((c) => c.cmd)).toEqual(["settings_set", "settings_reset"]);
    expect(calls[1].args?.key).toBe("look.style");
    expect(characterNow(none)).toBe("visor");
  });
  test("Restore usual on Character also puts the retired style back", async () => {
    const calls: string[] = [];
    takeSnapshot(snap({ "look.style": "friendly" }));
    _invokeForTests(async (cmd, args) => { calls.push(`${cmd}:${String(args?.key)}`); return snap({}); });
    await resetSetting("look.character");
    expect(calls).toEqual(["settings_reset:look.character", "settings_reset:look.style"]);
  });
  test("with no retired style stored, a character change is the one call it always was", async () => {
    const calls: string[] = [];
    takeSnapshot(snap({}));
    _invokeForTests(async (cmd) => { calls.push(cmd); return snap({ "look.character": "orb" }); });
    await changeSetting("look.character", "orb");
    expect(calls).toEqual(["settings_set"]);
  });
});

describe("every place reads the one character in force", () => {
  test("Home, the edge character and Settings read characterNow, never setting(look.character) on its own", () => {
    expect(read("./homeCharacter.tsx")).toContain("useCharacter()");
    expect(read("./flowflowMini.tsx")).toContain("useCharacter()");
    const page = read("./settingsPage.tsx");
    expect(page).toContain("characterNow()");
    for (const f of ["./homeCharacter.tsx", "./flowflowMini.tsx", "./settingsPage.tsx"]) expect(read(f), f).not.toContain('useSetting("look.character")');
  });
  test("useLook passes look.style too (finding 2), so the root's data-character matches the drawn character", () => {
    const u = read("./useLook.ts");
    expect(u).toContain('"look.style"');
    expect(u).toContain("storedSetting");
  });
});

describe("the water character is drawn whole in the lead (seen in the M72 shots)", () => {
  test("it takes the lead's own column at the lead's size, with no offset or waterline mask cutting it", () => {
    const css = read("./ui/home.css");
    expect(css).toContain(".home .hero.ui-lead > .hero-words { grid-column: 1; padding-right: 0; }");
    expect(css).toContain(".home .hero .ui-lead-char .home-char { width: var(--lead-char); height: var(--lead-char); margin: 0; top: 0; translate: none; }");
    expect(css).toContain(".home .hero.ui-lead .ui-lead-char .ch-char { inset: 0; height: auto; margin: 0; padding: 0; -webkit-mask-image: none; mask-image: none; }");
  });
});
