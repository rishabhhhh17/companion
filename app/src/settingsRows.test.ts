// Settings rows and search (settingsRows.ts): plain code, so each kind of row, Reset and the search are tested without a
// screen. The page (settingsPage.tsx) only draws what these say.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { REGISTRY, defOf, type Def } from "../../protocol/settings.ts";
import { S } from "./strings.ts";
import { floorWords, fold, folderName, homeSizeHint, numberFrom, PLACE_KEYS, rowModel, searchSettings, shownNow, valueWords } from "./settingsRows.ts";

const d = (key: string) => defOf(key)!;
const text: Def = { key: "test.press", section: "checks", kind: "text", default: "", maxLength: 60, scope: "project", applies: ["runner"], store: "settings", live: false };
const list: Def = { key: "test.rules", section: "checks", kind: "list", default: [], maxItems: 5, item: { maxLength: 80 }, scope: "project", applies: ["runner"], store: "settings", live: false, protective: true, floor: "test" };

describe("every setting has its words", () => {
  const words = S.set as Record<string, { label: string; help: string; also?: readonly string[]; options?: Record<string, string>; usual?: string }>;
  test("a label and a help line for every setting, and words for every option, with nothing left over", () => {
    for (const def of REGISTRY.settings) {
      const w = words[def.key];
      expect(w, def.key).toBeDefined();
      expect(w.label.length, def.key).toBeGreaterThan(0);
      expect(w.help.length, def.key).toBeGreaterThan(0);
      if (def.kind === "choice") expect(Object.keys(w.options ?? {}).sort(), def.key).toEqual([...(def.options ?? [])].sort());
      if (def.kind === "custom") expect(w.usual, def.key).toBeTruthy();
    }
    expect(Object.keys(words).sort()).toEqual(REGISTRY.settings.map((x) => x.key).sort());
    expect(Object.keys(S.sections).sort()).toEqual([...REGISTRY.sections].sort());
    // A fixed part shown under a row has its words too.
    for (const def of REGISTRY.settings) if (def.floor) expect((S.floors as Record<string, string>)[def.floor], def.key).toBeTruthy();
  });
  test("the words follow the writing rules: no em dashes, no doubled spaces, plain words", () => {
    const all: string[] = [S.on, S.off, ...Object.values(S.sections)];
    for (const w of Object.values(words)) all.push(w.label, w.help, ...(w.also ?? []), ...Object.values(w.options ?? {}), ...(w.usual ? [w.usual] : []));
    for (const g of Object.values(S.fixedGroups)) all.push(g.title, ...g.also);
    for (const t of all) {
      expect(/[–—]/.test(t), t).toBe(false);
      expect(t.includes("  ") || t !== t.trim(), t).toBe(false);
      expect(/\b(undefined|null|NaN|JSON)\b/.test(t), t).toBe(false);
    }
    for (const t of Object.values(S.setProblem)) if (typeof t === "string") expect(/[–—]/.test(t), t).toBe(false);
  });
  test("no on and off words are written into the settings code: they come from strings.ts", () => {
    for (const f of ["settingsPage.tsx", "settingsRows.ts", "card.tsx"]) {
      const src = readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
      expect(src, f).not.toMatch(/\?\s*"on"\s*:\s*"off"/);
      expect(src, f).not.toMatch(/:\s*\{[^}]*\?\s*"on"/);
    }
  });
});

describe("one row of each kind", () => {
  test("a switch shows On or Off, with its usual value", () => {
    const r = rowModel(d("fun.reactions"), false, true, "");
    expect(r).toMatchObject({ kind: "switch", label: "Reactions and celebrations", shown: S.off, usualLine: S.setUsual(S.on), changed: true, canReset: true, later: false });
    expect(r.resetLabel).toBe("Reset Reactions and celebrations to On");
    expect(rowModel(d("fun.reactions"), true, true, "").canReset).toBe(false);
  });
  test("a choice shows its option's words", () => {
    const r = rowModel(d("display.textSize"), "large", "standard", "");
    expect(r.shown).toBe("Large");
    expect(r.usualLine).toBe("Usual: Standard");
    expect(r.options).toEqual([{ id: "standard", label: "Standard" }, { id: "large", label: "Large" }, { id: "larger", label: "Larger" }, { id: "largest", label: "Largest" }]);
  });
  test("a number shows its unit, its range and step, and says when it takes effect", () => {
    const r = rowModel(d("work.maxTurns"), 120, 80, "");
    expect(r).toMatchObject({ kind: "number", shown: "120", usualLine: "Usual: 80", later: true, changed: true, number: { min: 20, max: 200, step: 10, unit: "count" } });
    expect(rowModel(d("spend.dailyLimit"), 25, 10, "").shown).toBe("$25");
    expect(rowModel(d("spend.dailyLimit"), 12.5, 10, "").shown).toBe("$12.50");
    expect(rowModel(d("spend.dailyLimit"), 10, 10, "").usualLine).toBe("Usual: $10");
  });
  test("text and list rows, and a project setting with no folder chosen is disabled and says why", () => {
    const t = rowModel(text, "", "", "");
    expect(t).toMatchObject({ kind: "text", shown: S.setNone, disabled: true, projectLine: S.setNeedsProject, maxLength: 60 });
    const p = rowModel(text, "Sign up", "", "/Users/me/Sites/shop");
    expect(p).toMatchObject({ disabled: false, projectLine: S.setThisProject("shop"), shown: "Sign up", canReset: true });
  });
  test("a protective list is never reset from its row, and shows its fixed part", () => {
    const l = rowModel(list, ["never edit .env"], [], "/p/site");
    expect(l).toMatchObject({ kind: "list", changed: true, canReset: false, floor: "test", maxItems: 5 });
    expect(l.shown).toBe("never edit .env");
    expect(rowModel(list, [], [], "/p/site").shown).toBe(S.setNone);
  });
  test("keys and voice rows have their own editors and are changed when away from their own usual values", () => {
    const k = rowModel(d("keys.hotkeys"), { stop: "x" }, {}, "");
    expect(k).toMatchObject({ kind: "custom", changed: true, canReset: true, usualLine: S.setUsual("the usual keys") });
    expect(rowModel(d("keys.hotkeys"), {}, {}, "").canReset).toBe(false);
    expect(valueWords(d("talk.voice"), null)).toBe("your Mac's own voice and microphone");
  });
  test("helpers: a typed number, a folder's name, letters without accents", () => {
    expect(numberFrom("$ 12.50")).toBe(12.5);
    expect(numberFrom(" 120 ")).toBe(120);
    for (const bad of ["", "abc", "1,000", "12..5", "1e3"]) expect(numberFrom(bad), bad).toBeNull();
    expect(folderName("/Users/me/Sites/shop/")).toBe("shop");
    expect(fold("Café Ÿes")).toBe("cafe yes");
  });
});

describe("search", () => {
  test("nothing typed shows everything", () => {
    const r = searchSettings("");
    expect(r.all).toBe(true);
    expect(r.sections.map((x) => x.id)).toEqual(REGISTRY.sections.filter((s) => REGISTRY.settings.some((x) => x.section === s)));
  });
  test("it finds a setting by its label, its help, an option or another word for it, ignoring case and accents", () => {
    const keys = (q: string) => searchSettings(q).sections.flatMap((s) => s.keys);
    expect(keys("reactions")).toContain("fun.reactions");
    expect(keys("CONFETTI")).toContain("fun.reactions");
    expect(keys("largest")).toContain("display.textSize");
    expect(keys("monitor")).toContain("showme.allScreens");
    expect(keys("turns")).toContain("work.maxTurns");
    expect(keys("budget")).toContain("spend.dailyLimit");
    expect(keys("Zóom")).toEqual(expect.arrayContaining(["calls.quiet", "display.textSize"]));
  });
  test("words are matched from their start, and every word typed must match", () => {
    const keys = (q: string) => searchSettings(q).sections.flatMap((s) => s.keys);
    expect(keys("eactions")).not.toContain("fun.reactions");
    expect(keys("quiet calls")).toEqual(["calls.quiet"]);
  });
  test("results stay under their section titles, and a section title finds its whole section", () => {
    const r = searchSettings("screen sharing");
    expect(r.sections.find((s) => s.id === "sharing")?.keys.sort()).toEqual(["calls.quiet", "sharing.hide"]);
    expect(r.sections.every((s) => s.title === S.sections[s.id as keyof typeof S.sections])).toBe(true);
  });
  test("the parts that are not settings are found too, and the count says how many match", () => {
    const r = searchSettings("delete");
    expect(r.fixed).toContain("kept");
    expect(searchSettings("api key").fixed).toContain("key");
    expect(r.count).toBe(r.sections.reduce((n, s) => n + s.keys.length, 0) + r.fixed.length);
  });
  test("no match says so", () => {
    const r = searchSettings("xylophone");
    expect(r.count).toBe(0);
    expect(r.sections).toEqual([]);
    expect(r.fixed).toEqual([]);
  });
});

// ---- M11 area 4: Home, the island and the character ----
describe("the rows for Home, the island and the character", () => {
  test("Move to another display after shows only with Follow me, and the page leaves it out of the rows and the count otherwise", () => {
    const with_ = (where: string) => (k: string) => (k === "island.display" ? where : undefined);
    expect(shownNow("island.followDelay", with_("follow"))).toBe(true);
    expect(shownNow("island.followDelay", with_("builtIn"))).toBe(false);
    expect(shownNow("island.followDelay", with_("main"))).toBe(false);
    for (const def of REGISTRY.settings.filter((x) => x.key !== "island.followDelay")) expect(shownNow(def.key, with_("main")), def.key).toBe(true);
    const page = readFileSync(new URL("./settingsPage.tsx", import.meta.url), "utf8");
    expect(page).toContain("const results = searchSettings(q, shownSettings().filter((x) => shownNow(x.key, setting)));");
  });
  test("Home size suggests Large when the text is larger than usual, and only then", () => {
    expect(homeSizeHint("larger", "standard")).toBe(S.setHomeLarger);
    expect(homeSizeHint("largest", "standard")).toBe(S.setHomeLarger);
    for (const [t, h] of [["standard", "standard"], ["large", "standard"], ["larger", "large"], ["largest", "large"]]) expect(homeSizeHint(t, h), `${t} ${h}`).toBeNull();
    const page = readFileSync(new URL("./settingsPage.tsx", import.meta.url), "utf8");
    expect(page).toContain('homeSizeHint(setting("display.textSize"), value)');
  });
  test("the character's place: the edge is a choice of four, the position a percent from 0 to 100 in steps of 5", () => {
    const e = rowModel(d("character.edge"), "left", "right", "");
    expect(e.options?.map((o) => o.label)).toEqual(["Left", "Right", "Top", "Bottom"]);
    expect([e.shown, e.usualLine, e.changed, e.canReset]).toEqual(["Left", S.setUsual("Right"), true, true]);
    const p = rowModel(d("character.position"), 37, 50, "");
    expect([p.shown, p.usualLine, p.number]).toEqual(["37%", S.setUsual("50%"), { min: 0, max: 100, step: 5, unit: "percent" }]);
    const wait = rowModel(d("island.openDelay"), 0.4, 0.4, "");
    expect([wait.shown, wait.changed, wait.later]).toEqual(["0.4 seconds", false, false]);
    expect(rowModel(d("character.linger"), 10, 1.5, "").shown).toBe("10 seconds");
  });
  test("Reset the character's place puts back its edge, its position and Same place on every display, and nothing else", () => {
    expect([...PLACE_KEYS]).toEqual(["character.edge", "character.position", "character.sameEverywhere"]);
    for (const k of PLACE_KEYS) expect(d(k).store, k).toBe("dock");
    const page = readFileSync(new URL("./settingsPage.tsx", import.meta.url), "utf8");
    expect(page).toContain('const placeChanged = changedNow("home").filter((k) => (PLACE_KEYS as readonly string[]).includes(k));');
    expect(page).toContain("for (const k of placeChanged) await resetSetting(k);");
    expect(page).toContain("{S.setResetPlace}");
    expect(S.setResetPlace.length).toBeGreaterThan(0);
  });
  test("the two fixed parts are said under their rows", () => {
    expect(rowModel(d("island.show"), false, true, "").floor).toBe("islandOff");
    expect(floorWords("islandOff")).toContain("Home opens beside the character");
    expect(rowModel(d("home.goToNeeds"), "markTab", "goToIt", "").floor).toBe("needsMarked");
    expect(floorWords("needsMarked")).toContain("A question waiting for your answer always opens Now");
    for (const t of Object.values(S.floors)) { expect(/[\u2013\u2014]/.test(t), t).toBe(false); expect(t.includes("  "), t).toBe(false); }
  });
  test("When something needs me says what really happens: no island means the mark is on the character, and words only with Speak to me", () => {
    const w = S.set["home.goToNeeds"] as { help: string; options: Record<string, string> };
    expect(w.options.markTab).toBe("Only mark the tab");
    expect(w.help).toContain("or on the character when the island is off");
    expect(w.help).toContain("With Speak to me on, it also says what is waiting.");
    const floor = floorWords("needsMarked");
    expect(floor).toContain("Prompt help and the error explainer you start always open Now");
    expect(floor).toContain("or on the character when the island is off");
    expect(floor).toContain("is said out loud when Speak to me is on");
    // Close Home when I click another app names the island only as something that may not be there.
    expect(S.set["home.closeOnClickAway"].help).not.toContain("click the island or the character");
    expect(S.set["home.closeOnClickAway"].help).toContain("click the character, or the island when it is shown, again");
  });
  test("search finds them by the words people use", () => {
    for (const [q, key] of [["notch", "island.show"], ["hover", "island.peekOnHover"], ["monitor", "island.display"], ["click away", "home.closeOnClickAway"], ["bigger", "home.size"], ["corner", "character.edge"], ["reduce motion", "character.motion"], ["full screen", "character.overFullScreen"]]) {
      expect(searchSettings(q).sections.flatMap((x) => x.keys), q).toContain(key);
    }
  });
});

