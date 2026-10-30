// Search in Settings (the overhaul spec, 3.7): every setting is found by its own name, plain words find what people mean
// ("mic", "plan", "zoom"), a word one typo away still finds it, the parts that are not settings are found too, and nothing
// found says what to try.
import { describe, expect, test } from "bun:test";
import { REGISTRY } from "../../protocol/settings.ts";
import { groupResults, MAX_RESULTS, scoreOf, searchables, searchSettingsFor, typos, wordScore } from "./settingsSearch.ts";
import { ROW_OWNS, type Fixed } from "./settingsPages.ts";
import { wordsOf } from "./settingsRows.ts";
import { S } from "./strings.ts";

const keysFor = (q: string) => searchSettingsFor(q).map((r) => ("key" in r.hit ? r.hit.key : `fixed:${r.hit.fixed}`));
const owner = (k: string) => Object.entries(ROW_OWNS).find(([, ks]) => ks.includes(k))?.[0] ?? k;

describe("the scorer", () => {
  test("an exact word beats the start of a word, which beats one typo; nothing else matches", () => {
    expect(wordScore("mic", ["mic"])).toBe(3);
    expect(wordScore("micro", ["microphone"])).toBe(2);
    expect(wordScore("microphnoe", ["microphone"])).toBe(1);   // two letters swapped is one typo
    expect(wordScore("sond", ["sound"])).toBe(0);              // a typo counts only for words over four letters
    expect(wordScore("xylophone", ["microphone"])).toBe(0);
  });
  test("typos counts a missing, added, changed or swapped letter as one", () => {
    expect(typos("water", "watr")).toBe(1);
    expect(typos("water", "waters")).toBe(1);
    expect(typos("water", "wafer")).toBe(1);
    expect(typos("water", "wtaer")).toBe(1);
    expect(typos("water", "wtare")).toBeGreaterThan(1);
  });
  test("every word typed must match, and a match on the name comes first", () => {
    expect(scoreOf("screen share", { label: ["hide"], rest: ["screen", "share"] })).toBeGreaterThan(0);
    expect(scoreOf("screen banana", { label: ["hide"], rest: ["screen", "share"] })).toBe(0);
    expect(scoreOf("hide", { label: ["hide"], rest: [] })).toBeGreaterThan(scoreOf("hide", { label: [], rest: ["hide"] }));
    expect(scoreOf("", { label: ["x"], rest: [] })).toBe(0);
  });
});

describe("what search finds", () => {
  test("every visible setting is found by its own name, as its row (At rest answers for its two keys)", () => {
    for (const d of REGISTRY.settings.filter((x) => !x.hidden)) expect(keysFor(wordsOf(d.key).label), d.key).toContain(owner(d.key));
  });
  test("every part that is not a setting is found by its name, and the plain words the spec lists find theirs", () => {
    for (const fx of Object.keys(S.setFixed) as Fixed[]) expect(keysFor(S.setFixed[fx].title), fx).toContain(`fixed:${fx}`);
    for (const q of ["plan", "pro", "trial", "billing", "cancel", "invoice", "student", "license"]) expect(keysFor(q), q).toContain("fixed:plan");
    for (const q of ["delete", "reset", "forget", "remove"]) expect(keysFor(q), q).toContain("fixed:danger");
    for (const q of ["mic", "microphone", "talk", "speak", "voice", "dictate"]) expect(keysFor(q), q).toContain("talk.voice");
    for (const q of ["shortcut", "hotkey", "keys", "stop", "panic"]) expect(keysFor(q), q).toContain("keys.hotkeys");
    for (const q of ["cost", "money", "spend", "limit", "budget"]) expect(keysFor(q), q).toContain("spend.dailyLimit");
    for (const q of ["dark", "light", "theme"]) expect(keysFor(q), q).toContain("look.theme");
    for (const q of ["quiet", "calm", "still", "animation", "battery"]) expect(keysFor(q), q).toContain("character.lively");
    for (const q of ["zoom", "screen share", "record"]) expect(keysFor(q), q).toContain("sharing.hide");
    expect(keysFor("replay")).toContain("fixed:replay");
    expect(keysFor("report a problem")).toContain("fixed:logs");
    expect(keysFor("permissions")).toContain("fixed:permissions");
  });
  test("one typo still finds it", () => {
    expect(keysFor("microphnoe")).toContain("talk.voice");
    expect(keysFor("screan sharing")).toContain("sharing.hide");
  });
  test("at most 30 results, best first, and nothing for an empty box or a word nothing has", () => {
    expect(MAX_RESULTS).toBe(30);
    expect(searchSettingsFor("the").length).toBeLessThanOrEqual(30);
    expect(searchSettingsFor("")).toEqual([]);
    expect(searchSettingsFor("   ")).toEqual([]);
    expect(searchSettingsFor("xylophone")).toEqual([]);
    const r = searchSettingsFor("notch");
    for (let i = 1; i < r.length; i++) expect(r[i - 1].score).toBeGreaterThanOrEqual(r[i].score);
    expect(S.setFrame.noMatch("xylophone")).toBe("No setting matches “xylophone”. Try a plain word like sound, keys or plan.");
  });
  test("results are grouped under their page and group, a More setting under More options and its topic", () => {
    const g = groupResults(searchSettingsFor("notch"));
    expect(g.length).toBeGreaterThan(1);
    expect(g.some((x) => x.page === "general" && x.group === "general.notch")).toBe(true);
    expect(g.some((x) => x.page === "more" && x.group === "more.general.notch")).toBe(true);
    expect(S.setFrame.heading("General", "Notch and Home")).toBe("General, Notch and Home");
  });
  test("searchables names every visible setting once (a row that owns two keys once) and every fixed part", () => {
    const s = searchables();
    const keys = s.flatMap((x) => ("key" in x.hit ? [x.hit.key] : []));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain("character.stick");
    expect(keys).not.toContain("groups.tried");
    expect(keys.length).toBe(REGISTRY.settings.filter((d) => !d.hidden).length - 1);
    expect(s.filter((x) => "fixed" in x.hit).length).toBe(Object.keys(S.setFixed).length);
  });
});
