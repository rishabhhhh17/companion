// The pages' side of the settings registry (T16): every window reads a setting through setting(key), from the shell's
// snapshot ("settings-changed"), the engine's own events for the three it keeps, and, until the one migration has run,
// the old page storage with exactly today's meaning. No page writes a file: changes go to the shell (settings_set).
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { REGISTRY, PAGE_STORAGE_MARK } from "../../protocol/settings.ts";
import { S } from "./strings.ts";
import { _invokeForTests, _resetForTests, changedNow, engineEvent, MIGRATED_FLAG, migrateFromPageStorage, migrationValues, notHeard, resetAll, resetSection, resetSetting, resetWithUndo, setting, settingsReady, startSettings, takeSnapshot, undoReset, undoValues, usualOf } from "./settingsStore.ts";

afterEach(() => { _resetForTests(); _invokeForTests(null); });
const storage = (m: Record<string, string>) => ({ getItem: (k: string) => (k in m ? m[k] : null), setItem: (k: string, v: string) => { m[k] = v; } });
// A stand in for the shell: records every command and its arguments in order, and answers with `answer`.
const shell = (answer: (cmd: string, args?: Record<string, unknown>) => unknown = () => undefined) => {
  const calls: { cmd: string; args?: Record<string, unknown> }[] = [];
  _invokeForTests(async (cmd, args) => { calls.push({ cmd, args }); return answer(cmd, args); });
  return calls;
};
// What the engine says about its own settings, as the events the page hears.
const heard = (k: string, v: unknown) => engineEvent(
  k === "spend.dailyLimit" ? { type: "spending.state", project: "/p", limitUsd: v, spentUsd: 0, minUsd: 1, maxUsd: 500 }
    : k === "explain.mode" ? { type: "explain.state", project: "/p", enabled: v !== "off", mode: v }
    : k === "memory.paused" ? { type: "memory.state", project: "/p", paused: v, projectLines: [], profileLines: [], problems: [] }
    : { type: "metrics.summary", enabled: v, days: {}, totals: {}, rates: {} });
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
    engineEvent({ type: "explain.state", project: "/p", enabled: false, mode: "off" });
    engineEvent({ type: "memory.state", project: "no-project", paused: true, projectLines: [], profileLines: [], problems: [] });
    engineEvent({ type: "metrics.summary", enabled: true, days: {}, totals: {}, rates: {} });
    expect([setting("spend.dailyLimit"), setting("explain.mode"), setting("memory.paused"), setting("numbers.on")]).toEqual([25, "off", true, true]);
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
    expect(store).toContain('call("settings_migrate", { from: PAGE_STORAGE_MARK, values })');
    expect(store).not.toMatch(/localStorage\.(setItem|removeItem)|removeItem\(/);
  });
  test("it sends the old choices once, and the snapshot it gets back is remembered in page storage", async () => {
    const old: Record<string, string> = { "companion.reactions": "off", "companion.textSize": "large" };
    const calls = shell((cmd, args) => cmd === "settings_get" ? snap({}, []) : cmd === "settings_migrate" ? snap(args!.values as Record<string, unknown>) : undefined);
    startSettings();
    await settingsReady();
    await migrateFromPageStorage(storage(old));
    expect(calls.map((c) => c.cmd)).toEqual(["settings_get", "settings_migrate"]);
    expect(calls[1].args).toEqual({ from: PAGE_STORAGE_MARK, values: { "fun.reactions": false, "display.textSize": "large" } });
    // The old choices are left as they were (for going back a version); only the flag is added.
    expect(old).toEqual({ "companion.reactions": "off", "companion.textSize": "large", [MIGRATED_FLAG]: "1" });
    // A second run does nothing: the mark is in the snapshot.
    await migrateFromPageStorage(storage(old));
    expect(calls.length).toBe(2);
  });
  test("a settings file lost after the migration (damaged, or removed by hand) never brings the choices from before the update back", async () => {
    // The flag is there and the shell's snapshot has no mark: the old storage is not read, and the migration records the
    // mark again without sending anything.
    const old = storage({ "companion.reactions": "off", "companion.voiceAutoSend": "1", [MIGRATED_FLAG]: "1" });
    const calls = shell((cmd) => (cmd === "settings_get" ? snap({}, []) : cmd === "settings_migrate" ? snap({}) : undefined));
    startSettings();
    await settingsReady();
    expect(setting("fun.reactions", old)).toBe(true);
    expect(setting("talk.autoSend", old)).toBe(false);
    await migrateFromPageStorage(old);
    expect(calls[1]).toEqual({ cmd: "settings_migrate", args: { from: PAGE_STORAGE_MARK, values: {} } });
  });
  test("a snapshot with the mark sets the flag; one without it does not", () => {
    const a: Record<string, string> = {}, b: Record<string, string> = {};
    takeSnapshot(snap({}, []), storage(a));
    expect(a).toEqual({});
    takeSnapshot(snap({}), storage(b));
    expect(b).toEqual({ [MIGRATED_FLAG]: "1" });
    // Storage that throws is never an error.
    expect(() => takeSnapshot(snap({}), { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } })).not.toThrow();
  });
});

describe("what changed, and Undo after Reset all", () => {
  test("only settings away from their usual value count, engine ones included", () => {
    takeSnapshot(snap({ "fun.reactions": false, "work.maxTurns": 80, "keys.hotkeys": { stop: "ctrl+opt+cmd+shift+x" }, "talk.voice": { voice: null, speed: 1, mic: null, language: "auto" } }, [PAGE_STORAGE_MARK], { "keys.hotkeys": {}, "talk.voice": { voice: null, speed: 1, mic: null, language: "auto" } }));
    engineEvent({ type: "spending.state", project: "/p", limitUsd: 25, spentUsd: 0, minUsd: 1, maxUsd: 500 });
    expect(changedNow().sort()).toEqual(["fun.reactions", "keys.hotkeys", "spend.dailyLimit"]);
    expect(changedNow("home")).toEqual(["fun.reactions"]);
  });
  const voice = { voice: { id: "v", name: "Ava", lang: "en-US" }, speed: 1.25, mic: null, language: "auto" };
  const usualVoice = { voice: null, speed: 1, mic: null, language: "auto" };
  test("Undo sends every value it kept back to the shell, one settings_set at a time, in the registry's order", async () => {
    takeSnapshot(snap({ "fun.reactions": false, "display.textSize": "large", "work.maxTurns": 150, "talk.voice": voice }, [PAGE_STORAGE_MARK], { "keys.hotkeys": {}, "talk.voice": usualVoice }));
    heard("explain.mode", "reasons");
    const back = undoValues();
    const calls = shell((cmd, args) => (cmd === "settings_set" ? snap({ [String(args!.key)]: args!.value }) : undefined));
    expect(await undoReset(back)).toEqual([]);
    expect(calls).toEqual([
      { cmd: "settings_set", args: { key: "talk.voice", value: voice } },
      { cmd: "settings_set", args: { key: "fun.reactions", value: false } },
      { cmd: "settings_set", args: { key: "work.maxTurns", value: 150 } },
      { cmd: "settings_set", args: { key: "explain.mode", value: "reasons" } },
      { cmd: "settings_set", args: { key: "display.textSize", value: "large" } },
    ]);
  });
  test("Undo carries on past a value the shell refuses, and names it", async () => {
    const calls = shell((cmd, args) => (args?.key === "keys.hotkeys" ? Promise.reject("keysTaken") : snap({})));
    const failed = await undoReset([["keys.hotkeys", { stop: "x" }], ["fun.reactions", false]]);
    expect(failed).toEqual(["keys.hotkeys"]);
    expect(calls.map((c) => c.args?.key)).toEqual(["keys.hotkeys", "fun.reactions"]);
  });
  test("a section reset keeps Undo's values for that section only, and Undo puts exactly those back", async () => {
    takeSnapshot(snap({ "teach.yourTurn": false, "fun.reactions": false }));
    heard("memory.paused", true);
    heard("spend.dailyLimit", 25);
    const calls = shell((cmd, args) => (cmd === "settings_reset" ? snap({ "fun.reactions": false }) : cmd === "settings_set" ? snap({ [String(args!.key)]: args!.value }) : undefined));
    const { done, back } = await resetWithUndo("memory");
    expect(done.ok).toBe(true);
    expect(calls[0]).toEqual({ cmd: "settings_reset", args: { section: "memory", engine: ["memory.paused"] } });
    expect(back).toEqual([["memory.paused", true], ["teach.yourTurn", false]]);
    await undoReset(back);
    expect(calls.slice(1)).toEqual([{ cmd: "settings_set", args: { key: "memory.paused", value: true } }, { cmd: "settings_set", args: { key: "teach.yourTurn", value: false } }]);
  });
  // A reset or its Undo is for the project the page showed. If another folder is open by then, the shell refuses (projectChanged).
  test("a reset names the project the page showed, and Undo writes a project's own settings only back to that project", async () => {
    takeSnapshot({ ...snap({ "check.skip": ["lint"], "fun.reactions": false }), project: "/a" });
    const calls = shell(() => ({ ...snap({}), project: "/a" }));
    await resetSection("checks");
    await resetSetting("check.skip");
    await resetAll();
    expect(calls.map((c) => c.args?.project)).toEqual(["/a", "/a", "/a"]);
    // Another folder is open when Undo is pressed: the values still go to the project they came from.
    takeSnapshot({ ...snap({}), project: "/b" });
    calls.length = 0;
    await undoReset([["check.skip", ["lint"]], ["fun.reactions", false]], "/a");
    expect(calls).toEqual([
      { cmd: "settings_set", args: { key: "check.skip", value: ["lint"], project: "/a" } },
      { cmd: "settings_set", args: { key: "fun.reactions", value: false } },
    ]);
  });
  test("Undo remembers the project of the reset it undoes", async () => {
    takeSnapshot({ ...snap({ "check.skip": ["lint"] }), project: "/a" });
    shell(() => ({ ...snap({}), project: "/a" }));
    const { back } = await resetWithUndo("checks");
    takeSnapshot({ ...snap({}), project: "/b" });
    const calls = shell(() => snap({}));
    await undoReset(back);
    expect(calls.find((c) => c.args?.key === "check.skip")?.args?.project).toBe("/a");
  });
  test("the engine's own settings not heard from yet are named, and never sent to be reset", async () => {
    takeSnapshot(snap({ "fun.reactions": false }));
    expect(notHeard()).toEqual(["spend.dailyLimit", "explain.mode", "memory.paused", "numbers.on"]);
    expect(notHeard("memory")).toEqual(["explain.mode", "memory.paused"]);
    heard("memory.paused", true);
    expect(notHeard("memory")).toEqual(["explain.mode"]);
    const calls = shell(() => snap({}));
    await resetAll();
    expect(calls[0].args).toEqual({ all: true, engine: ["memory.paused"] });
  });
});

describe("the page's Reset this section and Reset all", () => {
  const page = readFileSync(new URL("./settingsPage.tsx", import.meta.url), "utf8");
  const fn = (name: string) => page.slice(page.indexOf(name), page.indexOf("\n}\n", page.indexOf(name)));
  test("both name every setting that changes before, and both offer Undo for ten seconds after", () => {
    const sec = fn("function SettingsSection(");
    for (const t of ["resetWithUndo(id)", "toast.show(done, back)", "{toast.view}", "S.setResetSectionSure(names(changed))", "S.setNotHeard(names(unheard))"]) expect(sec, t).toContain(t);
    const all = fn("export function SettingsPage(");
    for (const t of ["resetWithUndo()", "allToast.show(done, back)", "{allToast.view}", "S.setResetAllSure(names(changedAll))", "S.setNotHeard(names(unheardAll))"]) expect(all, t).toContain(t);
    const hook = fn("function useUndoToast(");
    expect(hook).toContain("10_000");
    expect(hook).toContain("undoReset(back)");
    // Nothing resets without keeping Undo's values first.
    expect(page).not.toMatch(/\b(resetAll|resetSection)\(/);
  });
  test("the words say what goes back, and never that a setting in the list is left alone", () => {
    takeSnapshot(snap({}));
    heard("memory.paused", true);
    const list = changedNow().map((k) => S.set[k as keyof typeof S.set].label).join(", ");
    const w = S.setResetAllSure(list);
    expect(w).toContain("Pause learning");
    expect(w).not.toMatch(/\bmemory\b[^.]*not touched/i);
    expect(S.setNotHeard("Daily spending limit")).toContain("Daily spending limit");
    for (const t of [w, S.setNotHeard("x"), S.setUnreadable]) expect(/[–—]/.test(t), t).toBe(false);
  });
});

describe("what the page names and keeps for Undo is exactly what the shell resets (shared cases)", () => {
  const cases = readFileSync(new URL("../../protocol/fixtures/settings-reset-cases.jsonl", import.meta.url), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  test("there are cases", () => expect(cases.length).toBeGreaterThanOrEqual(10));
  for (const c of cases) {
    test(c.name, async () => {
      _resetForTests();
      // A place dragged off its step: the snapshot also carries the exact place, which only Undo uses.
      const shown = () => ({ ...snap(c.values, [PAGE_STORAGE_MARK], c.usual), ...(c.restore ? { restore: c.restore } : {}) });
      takeSnapshot(shown());
      for (const [k, v] of Object.entries(c.engine)) heard(k, v);
      const calls = shell(() => shown());
      const sent = (): Record<string, unknown> => ({ ...calls[0].args, engine: [...(calls[0].args!.engine as string[])].sort() });
      let named: string[];
      if (c.which.key) {
        named = changedNow().filter((k) => k === c.which.key);
        await resetSetting(c.which.key);
        expect(sent()).toEqual({ key: c.which.key, engine: c.sent });
      } else {
        const section: string | undefined = c.which.section;
        named = changedNow(section);
        expect(undoValues(section).map(([k]) => k)).toEqual(named);
        // Every value kept for Undo is the one in force now, or for a dragged place the exact place behind it.
        for (const [k, v] of undoValues(section)) expect(v, k).toEqual(c.restore?.[k] ?? c.values[k] ?? c.engine[k]);
        if (c.undo) expect(undoValues(section)).toEqual(c.undo);
        await (section ? resetSection(section) : resetAll());
        expect(sent()).toEqual(section ? { section, engine: c.sent } : { all: true, engine: c.sent });
      }
      expect([...named].sort()).toEqual(c.resets);
    });
  }
});
