// Settings' pages (the overhaul spec, 3.2 to 3.4 and 7.2): every visible setting in protocol/settings.json has exactly one
// place, on a page's main level or in that page's section of More options, and search finds every one of them; the main
// levels stay short; the rows that own two keys write them as the spec says; and the words follow the copy rules (3.11).
import { describe, expect, test } from "bun:test";
import { REGISTRY } from "../../protocol/settings.ts";
import { AT_REST, atRestOf, atRestWrites, CHILD_OF, FIRST_PAGE, HAIRLINE_BEFORE, HIDDEN_OPTIONS, MAIN, mainKeys, MORE_SECTIONS, moreKeys, PAGES, placeOf, ROW_OWNS, SIDEBAR, type Fixed, type PageId } from "./settingsPages.ts";
import { LINE_MAX, moreWords, rowLine } from "./settingsPage.tsx";
import { searchSettingsFor } from "./settingsSearch.ts";
import { wordsOf } from "./settingsRows.ts";
import { S } from "./strings.ts";

const visible = REGISTRY.settings.filter((d) => !d.hidden).map((d) => d.key);
const placedOn = (k: string): string[] => SIDEBAR.flatMap((p) => [...mainKeys(p).map((x) => (x === k ? `${p}` : "")), ...moreKeys(p).map((x) => (x === k ? `more:${p}` : ""))]).filter(Boolean);
const fixedIn = (p: PageId): Fixed[] => [...PAGES[p].groups.flatMap((g) => g.items), ...PAGES[p].more.flatMap((t) => t.items)].flatMap((i) => (typeof i === "string" ? [] : [i.fixed]));

describe("every setting has exactly one place (the spec, 3.4)", () => {
  test("each visible key is on exactly one page's main level or in exactly one More section, and nothing else is", () => {
    for (const k of visible) expect(placedOn(k), k).toHaveLength(1);
    const all = SIDEBAR.flatMap((p) => [...mainKeys(p), ...moreKeys(p)]);
    for (const k of all) expect(visible, `${k} is not a visible setting`).toContain(k);
    expect(all.length).toBe(visible.length);
  });
  test("the hidden setting (the tools tried) has no place and is never found", () => {
    for (const d of REGISTRY.settings.filter((x) => x.hidden)) {
      expect(placedOn(d.key), d.key).toHaveLength(0);
      expect(searchSettingsFor(wordsOf(d.key).label).some((r) => "key" in r.hit && r.hit.key === d.key), d.key).toBe(false);
    }
  });
  test("each page's main level holds at most 10 settings, and the main levels together are about 35", () => {
    for (const p of SIDEBAR) expect(mainKeys(p).length, p).toBeLessThanOrEqual(10);
    expect(MAIN.size).toBeGreaterThanOrEqual(30);
    expect(MAIN.size).toBeLessThanOrEqual(40);
  });
  test("the main levels are the ones the spec names", () => {
    expect(mainKeys("account")).toEqual(["spend.dailyLimit"]);
    expect(mainKeys("general")).toEqual(["island.show", "island.peekOnHover", "island.openForQuestions", "island.display", "home.escStops", "display.textSize", "guide.on", "secondLook.on", "files.on", "watch.on"]);
    expect(mainKeys("fixing")).toEqual(["rules.house", "check.install", "check.pageSize", "explain.mode", "undo.protectMyEdits"]);
    expect(mainKeys("flowflow")).toEqual(["character.lively", "look.water", "look.size", "character.name", "character.edge", "character.dockWhen", "character.peek", "character.stick", "character.follow", "sound.on"]);
    // The overhaul spec (3.4): Prompt help, split out of voice.on, is its own group on Keys and voice.
    expect(mainKeys("keys")).toEqual(["keys.hotkeys", "voice.on", "talk.voice", "talk.speak", "talk.captions", "talk.dictate", "prompt.on"]);
    expect(mainKeys("privacy")).toEqual(["sharing.hide", "calls.quiet", "memory.paused"]);
    expect(mainKeys("about")).toEqual(["updates.daily"]);
    expect(mainKeys("more")).toEqual([]);
  });
  test("every part that is not a setting has one place and its words", () => {
    const fixed = SIDEBAR.flatMap(fixedIn);
    expect(new Set(fixed).size).toBe(fixed.length);
    expect(fixed.sort()).toEqual((Object.keys(S.setFixed) as Fixed[]).sort());
    // The plan leads Account, the danger zone is Privacy's last group, Google sits with Watch routines (shown only while they are on).
    expect(PAGES.account.groups[0].items).toEqual([{ fixed: "plan" }]);
    expect(PAGES.privacy.groups.at(-1)!.items).toEqual([{ fixed: "danger" }]);
    expect(placeOf("google")).toMatchObject({ page: "more", topic: "more.general.watch" });
  });
});

describe("the sidebar and the groups (the spec, 3.2)", () => {
  test("eight pages, in order, a hairline before About, and Settings opens on General the first time", () => {
    expect(SIDEBAR).toEqual(["account", "general", "fixing", "flowflow", "keys", "privacy", "about", "more"]);
    expect(HAIRLINE_BEFORE).toBe("about");
    expect(FIRST_PAGE).toBe("general");
    for (const p of SIDEBAR) { expect(S.pages[p].title, p).toBeTruthy(); expect(S.pages[p].sub, p).toBeTruthy(); }
    expect(S.pages.keys.title).toBe("Keys and voice");
    expect(S.pages.more.title).toBe("More options");
  });
  test("every group and topic has its title (the preview card has none), and More's sections follow the sidebar", () => {
    for (const p of SIDEBAR) {
      for (const g of PAGES[p].groups) expect(g.id === "flowflow.preview" || !!S.setGroupTitles[g.id], g.id).toBe(true);
      for (const t of PAGES[p].more) expect(S.setGroupTitles[t.id], t.id).toBeTruthy();
    }
    expect(MORE_SECTIONS).toEqual(["account", "general", "fixing", "flowflow", "keys", "privacy"]);
    // Powers, Advanced and the Squibby heading are gone; "Flow" is "Fix" everywhere a person reads it.
    const titles = JSON.stringify([S.pages, S.setGroupTitles]);
    expect(titles).not.toMatch(/Powers|Advanced/);
    expect(wordsOf("flow.on").label).toBe("Fix");
  });
  test("a topic whose tool is off says how to turn it on, and child rows follow their parent switch", () => {
    for (const p of SIDEBAR) for (const t of PAGES[p].more) if (t.parent) expect(REGISTRY.settings.find((d) => d.key === t.parent)?.kind, t.id).toBe("switch");
    for (const [child, parent] of Object.entries(CHILD_OF)) { expect(mainKeys("keys"), child).toContain(child); expect(parent).toBe("voice.on"); }
    expect(S.setFrame.turnOnTool("Convert files")).toBe("Turn on Convert files in General to use these.");
  });
  test("a deep link finds a page, a group, a topic, a setting or a part", () => {
    expect(placeOf("general")).toMatchObject({ page: "general", more: false });
    expect(placeOf("account.spending")).toMatchObject({ page: "account", group: "account.spending" });
    expect(placeOf("spend.dailyLimit")).toMatchObject({ page: "account", group: "account.spending" });
    expect(placeOf("character.stick")).toMatchObject({ page: "flowflow", group: "flowflow.place" });
    expect(placeOf("budget.task")).toMatchObject({ page: "more", topic: "more.account.spending" });
    expect(placeOf("plan")).toMatchObject({ page: "account", group: "account.plan" });
    expect(placeOf("no.suchKey")).toBeNull();
  });
});

describe("At rest: one control for two keys (the spec, 3.4)", () => {
  test("Show, Half and Hidden read and write Tuck into the edge and Stick to the edge", () => {
    expect(ROW_OWNS["character.peek"]).toEqual(["character.peek", "character.stick"]);
    expect(AT_REST).toEqual(["show", "half", "hidden"]);
    expect(atRestOf(false, true)).toBe("show");
    expect(atRestOf(false, false)).toBe("show");
    expect(atRestOf(true, true)).toBe("half");
    expect(atRestOf(true, false)).toBe("hidden");
    expect(atRestWrites("show")).toEqual([["character.peek", false]]);
    expect(atRestWrites("half")).toEqual([["character.peek", true], ["character.stick", true]]);
    expect(atRestWrites("hidden")).toEqual([["character.peek", true], ["character.stick", false]]);
    for (const v of AT_REST) { const w = Object.fromEntries(atRestWrites(v)); expect(atRestOf(w["character.peek"], w["character.stick"] ?? true)).toBe(v); }
    expect(Object.keys(S.setRows.atRest.options)).toEqual([...AT_REST]);
  });
  test("the Deep theme is hidden, and Paper stays (T17)", () => {
    expect(HIDDEN_OPTIONS["look.theme"]).toEqual(["deep"]);
    expect(REGISTRY.settings.find((d) => d.key === "look.theme")?.options).toContain("paper");
  });
});

describe("one line under a row, never a wall (the spec, 3.6; the founder, 31 Oct)", () => {
  test("every row's line is at most about two lines; the rest is behind Learn more", () => {
    for (const k of visible) expect(rowLine(k).length, `${k}: ${rowLine(k)}`).toBeLessThanOrEqual(LINE_MAX);
    // A long help is never lost: Learn more holds it, and the part that never changes.
    const long = visible.filter((k) => wordsOf(k).help.length > LINE_MAX);
    expect(long.length).toBeGreaterThan(20);
    for (const k of long) expect(moreWords(k).join(" "), k).toContain(wordsOf(k).help);
    expect(moreWords("island.show").join(" ")).toContain(S.floors.islandOff);
  });
  test("a choice side by side has short words, so a Segmented control never wraps", () => {
    for (const d of REGISTRY.settings.filter((x) => x.kind === "choice" && (x.options?.length ?? 0) <= 3 && !x.optionsFrom && !["look.water", "character.lively"].includes(x.key))) {
      for (const o of d.options!.filter((x) => !(HIDDEN_OPTIONS[d.key] ?? []).includes(x))) {
        const words = S.setSeg[d.key]?.[o] ?? (wordsOf(d.key).options ?? {})[o] ?? o;
        expect(words.length, `${d.key} ${o}: ${words}`).toBeLessThanOrEqual(12);
      }
    }
  });
});

describe("the copy rules for Settings (the spec, 3.11)", () => {
  const descriptions = Object.entries(S.short);
  test("labels are sentence case with no pronoun; descriptions speak to you, never I or me", () => {
    for (const k of MAIN) {
      const l = wordsOf(k).label;
      expect(l[0], k).toBe(l[0].toUpperCase());
      // A tool's own name ("Show me how") is a name, not a pronoun.
      expect(l.slice(1).replace("how me how", ""), `${k}: ${l}`).not.toMatch(/\b(?:I|me|my)\b/);
    }
    for (const [k, t] of descriptions) expect(t, k).not.toMatch(/\b(?:I|me|my|I'm|I'll)\b/);
  });
  test("buttons start with a verb, never Manage, Submit, Simply or Easily, and no word has a long dash", () => {
    const all = JSON.stringify([S.short, S.setSeg, S.setGroupTitles, S.setGroupFoot, S.setFixed, S.pages, S.danger, S.dangerKeepsProjects, S.dangerKeepsTrial,
      S.setRows, S.keyJobLines, S.plan, S.setFrame.noMatch("x"), S.setFrame.moreLink("General", 3), S.setFrame.restorePage("General")]);
    expect(all).not.toMatch(/[–—]/);
    expect(all).not.toMatch(/\b(?:Manage|Submit|Simply|Easily|simply|easily)\b/);
    expect(S.plan.buttons.billing).toBe("Billing and invoices");
    expect(S.setRows.keySave).toBe("Save key");
    expect(S.settingsOpenSystem).toBe("Open System Settings");
  });
  test("the old labels still find their settings (each went into its synonyms)", () => {
    for (const [q, k] of [["Daily spending limit", "spend.dailyLimit"], ["Speak to me", "talk.speak"], ["Quiet during calls", "calls.quiet"], ["Pause learning", "memory.paused"], ["Explain after a task", "explain.mode"], ["Character size", "look.size"]] as const) {
      expect(searchSettingsFor(q).some((r) => "key" in r.hit && r.hit.key === k), q).toBe(true);
    }
  });
});
