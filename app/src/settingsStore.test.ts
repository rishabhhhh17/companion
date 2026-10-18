// The pages' side of the settings registry (T16): every window reads a setting through setting(key), from the shell's
// snapshot ("settings-changed"), the engine's own events for the three it keeps, and, until the one migration has run,
// the old page storage with exactly today's meaning. No page writes a file: changes go to the shell (settings_set).
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { REGISTRY, PAGE_STORAGE_MARK } from "../../protocol/settings.ts";
import { _resetForTests, changedNow, engineEvent, migrationValues, setting, takeSnapshot, undoValues, usualOf } from "./settingsStore.ts";

afterEach(() => _resetForTests());
const storage = (m: Record<string, string>) => ({ getItem: (k: string) => (k in m ? m[k] : null) });
const throwing = { getItem: () => { throw new Error("blocked"); } };
const snap = (values: Record<string, unknown>, migrated = [PAGE_STORAGE_MARK], usual: Record<string, unknown> = {}) => ({ values, usual, project: "", migrated, problems: [], changed: [] });

describe("reading a setting", () => {
  test("with no snapshot yet and nothing stored, every setting is its usual value", () => {
    for (const d of REGISTRY.settings) expect(setting(d.key, storage({})), d.key).toEqual(d.default);
    expect(setting("no.suchThing", storage({}))).toBeUndefined();
  });
  test("storage that throws gives the usual values, never an error", () => {
    expect(setting("fun.reactions", throwing)).toBe(true);
    expect(setting("display.textSize", throwing)).toBe("standard");
    expect(setting("talk.speak", null)).toBe(false);
  });
  test("the shell's snapshot is what is in force once the migration has run", () => {
    takeSnapshot(snap({ "fun.reactions": false, "work.maxTurns": 120 }));
    expect(setting("fun.reactions", storage({ "companion.reactions": "on" }))).toBe(false);
    expect(setting("work.maxTurns", storage({}))).toBe(120);
    expect(setting("talk.speak", storage({ "companion.speak": "1" })), "old storage is not read after the migration").toBe(false);
  });
  test("until the migration mark is in the snapshot, the old page storage still decides, so nothing flashes a wrong value", () => {
    const old = storage({ "companion.reactions": "off", "companion.textSize": "large", "companion.voiceAutoSend": "1" });
    expect(setting("fun.reactions", old)).toBe(false);
    takeSnapshot(snap({ "fun.reactions": true }, []));
    expect(setting("fun.reactions", old)).toBe(false);
    expect(setting("display.textSize", old)).toBe("large");
    expect(setting("talk.autoSend", old)).toBe(true);
    // A key the old storage does not have: the snapshot, then the usual value.
    expect(setting("work.maxTurns", old)).toBe(80);
    takeSnapshot(snap({ "fun.reactions": true }));
    expect(setting("fun.reactions", old)).toBe(true);
  });
  test("the engine's own settings come from its events, whatever the snapshot says", () => {
    takeSnapshot(snap({ "spend.dailyLimit": 99 }));
    expect(setting("spend.dailyLimit")).toBe(10);
    engineEvent({ type: "spending.state", project: "/p", limitUsd: 25, spentUsd: 1, minUsd: 1, maxUsd: 500 });
    engineEvent({ type: "explain.state", project: "/p", enabled: false });
    engineEvent({ type: "memory.state", project: "no-project", paused: true, projectLines: [], profileLines: [], problems: [] });
    engineEvent({ type: "metrics.summary", enabled: true, days: {}, totals: {}, rates: {} });
    expect([setting("spend.dailyLimit"), setting("explain.on"), setting("memory.paused"), setting("numbers.on")]).toEqual([25, false, true, true]);
    expect(engineEvent({ type: "agent.state", agent: "a", state: "idle" })).toBe(false);
  });
  test("a snapshot that is not one is ignored", () => {
    for (const bad of [null, 7, "x", { values: 3 }, { values: {}, migrated: "no" }]) takeSnapshot(bad);
    expect(setting("fun.reactions", storage({}))).toBe(true);
  });
  test("usual values: the shell's for keys and voice, the registry's for the rest", () => {
    expect(usualOf("work.maxTurns")).toBe(80);
    takeSnapshot(snap({}, [PAGE_STORAGE_MARK], { "keys.hotkeys": {}, "talk.voice": { voice: null, speed: 1, mic: null, language: "auto" } }));
    expect(usualOf("talk.voice")).toEqual({ voice: null, speed: 1, mic: null, language: "auto" });
  });
});

describe("the one migration from page storage", () => {
  test("every old key is read with exactly today's meaning", () => {
    const all = storage({
      "companion.reactions": "off", "companion.yourTurn": "on", "companion.textSize": "larger", "companion.speak": "1",
      "companion.speakReplies": "1", "companion.voiceAutoSend": "1", "companion.showmeAllScreens": "1", "companion.updateAuto": "0",
    });
    expect(migrationValues(all)).toEqual({
      "fun.reactions": false, "teach.yourTurn": true, "display.textSize": "larger", "talk.speak": true,
      "talk.speakReplies": true, "talk.autoSend": true, "showme.allScreens": true, "updates.daily": false,
    });
  });
  test("other stored words mean what they meant before", () => {
    expect(migrationValues(storage({ "companion.reactions": "on", "companion.yourTurn": "yes", "companion.textSize": "enormous", "companion.speak": "true", "companion.updateAuto": "1" }))).toEqual({
      "fun.reactions": true, "teach.yourTurn": false, "display.textSize": "standard", "talk.speak": false, "updates.daily": true,
    });
  });
  test("keys that were never stored are not sent, so the usual values apply", () => {
    expect(migrationValues(storage({}))).toEqual({});
  });
  test("storage that throws migrates nothing, and the migration is not marked done", () => {
    expect(migrationValues(throwing)).toBeNull();
    expect(migrationValues(null)).toBeNull();
  });
  test("the names it reads are exactly the old ones from the code before the registry", () => {
    const names = REGISTRY.settings.flatMap((d) => (d.from?.pageStorage ? [d.from.pageStorage.name] : [])).sort();
    expect(names).toEqual(["companion.reactions", "companion.showmeAllScreens", "companion.speak", "companion.speakReplies", "companion.textSize", "companion.updateAuto", "companion.voiceAutoSend", "companion.yourTurn"]);
  });
  test("the overlay only listens: it never asks the shell, and takes the settings sent with its events", () => {
    const o = readFileSync(new URL("./overlay.ts", import.meta.url), "utf8");
    expect(o).not.toMatch(/\binvoke\b/);
    expect(o).toContain("startSettings({ ask: false });");
    for (const ev of ["overlay-celebrate", "overlay-party"]) expect(o.slice(o.indexOf(`void listen("${ev}"`)).split("\n")[0], ev).toContain("takeSnapshot(p.settings)");
    const rs = readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");
    expect(rs).toContain('"overlay-celebrate", json!({ "rect": r, "settings": settings_snapshot(&[]) })');
    expect(rs).toMatch(/"overlay-party", json!\(\{ "x": [^\n]*"settings": settings_snapshot\(&\[\]\) \}\)/);
    const cap = readFileSync(new URL("../src-tauri/capabilities/overlay.json", import.meta.url), "utf8");
    expect(JSON.parse(cap).permissions).toEqual(["core:event:allow-listen", "core:event:allow-unlisten"]);
  });
  test("only Home's window runs it, once the first snapshot shows it is still to do", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).toContain("migrateFromPageStorage()");
    for (const f of ["dock.tsx", "overlay.ts", "island.tsx"]) expect(readFileSync(new URL(`./${f}`, import.meta.url), "utf8")).not.toContain("migrateFromPageStorage");
    const store = readFileSync(new URL("./settingsStore.ts", import.meta.url), "utf8");
    expect(store).toContain('invoke("settings_migrate", { from: PAGE_STORAGE_MARK, values })');
    expect(store).not.toMatch(/localStorage\.(setItem|removeItem)/);
  });
});

describe("what changed, and Undo after Reset all", () => {
  test("only settings away from their usual value count, engine ones included", () => {
    takeSnapshot(snap({ "fun.reactions": false, "work.maxTurns": 80, "keys.hotkeys": { stop: "ctrl+opt+cmd+shift+x" }, "talk.voice": { voice: null, speed: 1, mic: null, language: "auto" } }, [PAGE_STORAGE_MARK], { "keys.hotkeys": {}, "talk.voice": { voice: null, speed: 1, mic: null, language: "auto" } }));
    engineEvent({ type: "spending.state", project: "/p", limitUsd: 25, spentUsd: 0, minUsd: 1, maxUsd: 500 });
    expect(changedNow().sort()).toEqual(["fun.reactions", "keys.hotkeys", "spend.dailyLimit"]);
    expect(changedNow("home")).toEqual(["fun.reactions"]);
  });
  test("Undo puts back every value that was changed, through the shell, never by writing a file", () => {
    takeSnapshot(snap({ "fun.reactions": false, "display.textSize": "large", "work.maxTurns": 150, "talk.voice": { voice: { id: "v", name: "Ava", lang: "en-US" }, speed: 1.25, mic: null, language: "auto" } }, [PAGE_STORAGE_MARK], { "keys.hotkeys": {}, "talk.voice": { voice: null, speed: 1, mic: null, language: "auto" } }));
    engineEvent({ type: "explain.state", project: "/p", enabled: false });
    const back = undoValues();
    expect(Object.fromEntries(back)).toEqual({ "fun.reactions": false, "display.textSize": "large", "work.maxTurns": 150, "explain.on": false, "talk.voice": { voice: { id: "v", name: "Ava", lang: "en-US" }, speed: 1.25, mic: null, language: "auto" } });
    // After the reset, replaying them gives every value back.
    _resetForTests();
    takeSnapshot(snap(Object.fromEntries(back.filter(([k]) => k !== "explain.on"))));
    engineEvent({ type: "explain.state", project: "/p", enabled: false });
    for (const [k, v] of back) expect(setting(k), k).toEqual(v);
  });
});
