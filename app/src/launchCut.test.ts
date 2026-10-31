// F28, the launch cut, the pages' side: one product at launch (Fix it, with proof, a receipt and Undo). The side tools
// start off, and every one of them is still built, still has its switch in Settings and is found by search, so it can be
// turned on again. Four jobs keep keys by usual. protocol/fixtures/launch-cut.json is read by the shell and the engine
// too, so all three agree.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import fixture from "../../protocol/fixtures/launch-cut.json";
import { defOf, REGISTRY } from "../../protocol/settings.ts";
import { buttonShown, permissionNeeded, TOOLS, toolOn, type ToolId } from "./groups.ts";
import { hasKeys, JOBS, KEY_DEFAULTS, KEY_USUAL, keysFrom, KEYS_START } from "./keys.ts";
import { groupSettingsFor } from "./onboarding.ts";
import { cutNoticeLine, droppedLine, googleParts, keyHints, keyRows } from "./settings.ts";
import { homeStatus, notchStatusLine } from "./homeHero.ts";
import { initial } from "./model.ts";
import { CHILD_OF, PAGES, placeOf } from "./settingsPages.ts";
import { searchSettingsFor } from "./settingsSearch.ts";
import { S } from "./strings.ts";

const usual = (k: string): unknown => defOf(k)?.default;
/** The usual values with these switches turned on, as Settings would. */
const turnedOn = (...on: string[]) => (k: string): unknown => (on.includes(k) ? true : usual(k));
const switchesOf = (id: ToolId): string[] => {
  const t = TOOLS.find((x) => x.id === id)!;
  const group = REGISTRY.settings.find((d) => d.key === `${t.group}.on`) ? [`${t.group}.on`] : [];
  return [...group, ...(t.switch ? [t.switch] : [])];
};
const found = (q: string) => searchSettingsFor(q).map((r) => ("key" in r.hit ? r.hit.key : `fixed:${r.hit.fixed}`));

describe("the launch cut's usual values", () => {
  test("the registry's usual values are the fixture's", () => {
    for (const [k, v] of Object.entries(fixture.usual)) expect(defOf(k)?.default, k).toEqual(v);
  });
  test("the side tools start off, and the hero and what stays on are on", () => {
    for (const id of fixture.toolsOff) expect(toolOn(id as ToolId, usual), id).toBe(false);
    for (const id of fixture.toolsOn) expect(toolOn(id as ToolId, usual), id).toBe(true);
    // Its buttons are not drawn while it is off: Draw it on Home and in a practice.
    expect(buttonShown("drawIt", usual)).toBe(false);
    expect(buttonShown("practiceWhy", usual)).toBe(false);
    // And Draw why on Point at the problem's result, the hero Fix it card every new person sees.
    expect(buttonShown("pointWhy", usual)).toBe(false);
    expect(buttonShown("pointWhy", turnedOn("drawIt.on"))).toBe(true);
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).toContain('m.point.stage === "found" && buttonShown("pointWhy") && <button');
    expect(card).toContain('asked.current || !toolOn("drawIt")) return;');
    expect(card).not.toContain('!toolOn("explain")) return;');
    expect(buttonShown("start", usual) && buttonShown("rescue", usual) && buttonShown("findProblem", usual)).toBe(true);
  });
  test("a tool that is off never asks for its permission (rule 8)", () => {
    // With talking on, the microphone may still be asked for hold to talk; Type by voice adds nothing while it is off.
    const dictateOnly = (k: string): unknown => (k === "voice.on" ? true : k === "talk.dictate" ? false : usual(k));
    expect(permissionNeeded("microphone", dictateOnly)).toBe(true);
    expect(permissionNeeded("microphone", (k) => (k === "voice.on" ? false : usual(k)))).toBe(false);
  });
});

describe("every tool the cut turns off is still there, reachable and turned on from Settings, and found by search", () => {
  for (const id of fixture.toolsOff as ToolId[]) {
    test(id, () => {
      const t = TOOLS.find((x) => x.id === id)!;
      expect(t, "nothing is deleted").toBeTruthy();
      expect(t.commands.length + t.runner.length + (t.hotkeys?.length ?? 0), "it still has its ways in").toBeGreaterThan(0);
      const sw = switchesOf(id).filter((k) => usual(k) === false);
      expect(sw.length, "it is off by a switch").toBeGreaterThan(0);
      for (const k of sw) {
        expect(placeOf(k), `${k} has a place in Settings`).not.toBeNull();
        expect(S.set[k as keyof typeof S.set], `${k} has its words`).toBeTruthy();
        expect(found((S.set[k as keyof typeof S.set] as { label: string }).label), `${k} is found by its name`).toContain(k);
      }
      expect(toolOn(id, turnedOn(...sw)), "turning its switches on turns it on").toBe(true);
    });
  }
  test("watch routines and connecting Google: off, in General, found by search; connecting shows once it is on", () => {
    expect(usual("watch.on")).toBe(false);
    expect(placeOf("watch.on")).toMatchObject({ page: "general", more: false });
    expect(found("watch")).toContain("watch.on");
    expect(found("google")).toContain("fixed:google");
    const page = readFileSync(new URL("./settingsPage.tsx", import.meta.url), "utf8");
    expect(page).toContain('case "google": return placeShown("google") ? <GoogleSection connecting={setting("watch.on") === true} /> : null;');
    expect(googleParts([], true).connect).toBe(true);
    expect(googleParts([], false).connect).toBe(false);
  });
  test("Prompt help (split out of voice.on) has its own switch on Keys and voice, and its More topic follows it", () => {
    expect(placeOf("prompt.on")).toMatchObject({ page: "keys", more: false });
    expect(PAGES.keys.more.find((t) => t.id === "more.keys.prompt")!.parent).toBe("prompt.on");
    expect(found("prompt help")).toContain("prompt.on");
    expect(toolOn("promptHelp", (k) => (k === "voice.on" ? false : usual(k))), "talking off leaves Prompt help on").toBe(true);
    expect(toolOn("promptHelp", (k) => (k === "prompt.on" ? false : usual(k)))).toBe(false);
    // Type by voice still sits under Talk to Squibby.
    expect(CHILD_OF["talk.dictate"]).toBe("voice.on");
  });
  test("the hidden hello in the notch starts off and is kept, never drawn as a row", () => {
    expect(usual("panel.showHello")).toBe(false);
    expect(defOf("panel.showHello")!.hidden).toBe(true);
  });
  test("installs before a check usually ask (M49), offered as Ask, Always, Never on Fixing's main level", () => {
    expect(usual("check.install")).toBe("ask");
    expect(placeOf("check.install")).toMatchObject({ page: "fixing", more: false });
    expect(S.setSeg["check.install"]).toEqual({ auto: "Always", ask: "Ask", never: "Never" });
  });
});

describe("the first run starts from the values in force", () => {
  test("pressing Next with nothing changed writes nothing, so file conversion stays off", () => {
    const off = (["flow", "guide", "voice", "files", "prompt"] as const).filter((g) => usual(`${g}.on`) === false);
    expect(off).toEqual(["files"]);
    expect(groupSettingsFor([...off], usual)).toEqual([]);
    expect(groupSettingsFor([], usual)).toEqual([["files.on", true]]);
    const ui = readFileSync(new URL("./onboarding.tsx", import.meta.url), "utf8");
    expect(ui).toContain("useState<SwitchedId[]>(() => offGroups())");
  });
});

describe("four default keys (F28)", () => {
  test("Fix it, Hold to talk, Prompt help and Stop everything, plus use a suggestion; the other five have none", () => {
    for (const [job, chord] of Object.entries(fixture.keys.bound)) expect(KEY_USUAL[job as keyof typeof KEY_USUAL], job).toBe(chord);
    for (const job of fixture.keys.unbound) expect(KEY_USUAL[job as keyof typeof KEY_USUAL], job).toBeNull();
    expect(S.keyJobs.problem).toBe("Fix it");
    // Each still keeps its own suggested keys, offered first when the person adds one.
    for (const j of JOBS) expect(KEY_DEFAULTS[j], j).toBeTruthy();
  });
  test("Settings shows each job, the five with No key yet and Add a key, and no problem", () => {
    const rows = keyRows(KEYS_START);
    for (const job of fixture.keys.unbound) expect(rows.find((r) => r.job === job), job).toMatchObject({ keys: S.keysNoKeyYet, problem: false, none: true });
    const page = readFileSync(new URL("./settingsPage.tsx", import.meta.url), "utf8");
    expect(page).toContain("{keys.using[job] ? S.keysChange : S.setFrame.addKey}");
    expect(page).toContain('const F28_JOBS: readonly Job[] = ["problem", "talk", "read", "stop", "accept"];');
  });
  test("the first run's list of keys names only what can be pressed", () => {
    expect(keyHints(KEYS_START).length).toBe(4);
  });
  test("each migration case reads as the shell writes it: chosen keys kept, old usual keys gone, said once and calmly", () => {
    for (const c of fixture.keyMigration) {
      const k = keysFrom({ using: c.keys, picked: c.keys, dropped: c.dropped });
      for (const j of JOBS) expect(hasKeys(j, k), `${c.name}: ${j}`).toBe((c.keys as Record<string, string | null>)[j] !== null);
      const line = droppedLine(k);
      if (c.dropped.length === 0) expect(line, c.name).toBe("");
      else {
        expect(line, c.name).toBe(S.keysDropped(c.dropped.map((j) => S.keyJobs[j as keyof typeof S.keyJobs]).join(", ")));
        expect(line).not.toMatch(/—|!|sorry|oops/i);
      }
    }
    const page = readFileSync(new URL("./settingsPage.tsx", import.meta.url), "utf8");
    expect(page).toContain('void invoke("keys_notice_seen")');
  });
});

describe("an install from before the cut (settings.rs launch_cut)", () => {
  test("Settings says once which tools now start off, by their names, and nothing for a new install", () => {
    for (const c of fixture.cutMigration) {
      const line = cutNoticeLine((k) => (k === "groups.cutNotice" ? c.notice : usual(k)));
      if (c.notice.length === 0) { expect(line, c.name).toBe(""); continue; }
      for (const t of c.notice) expect(line, c.name).toContain((S.groups.tools as Record<string, { name: string }>)[t].name);
      expect(line).not.toContain("\u2014");
    }
    expect(cutNoticeLine(usual)).toBe("");
    // Every tool it can name is one the cut turned off, with its own switch's usual value now off.
    const allowed = defOf("groups.cutNotice")!.allowedItems!;
    for (const c of fixture.cutMigration) for (const t of c.notice) expect(allowed).toContain(t);
    for (const c of fixture.cutMigration) for (const [k, v] of Object.entries(c.values)) { expect(defOf(k)?.default, k).toBe(false); expect(typeof v).toBe("boolean"); }
    expect(defOf("groups.cutNotice")?.hidden).toBe(true);
    const page = readFileSync(new URL("./settingsPage.tsx", import.meta.url), "utf8");
    expect(page).toContain('const cut = id === "general.tools" ? cutNoticeLine() : "";');
    expect(page).toContain('onClick={() => void changeSetting("groups.cutNotice", [])}>{S.cutNoticeOk}</Button>');
  });
  test("a Google account already connected stays in Settings to disconnect, with watch routines off (rule 6)", () => {
    const acct = { signin: false, apps: ["gmail"] };
    expect(googleParts([acct], false)).toEqual({ section: true, signIn: false, connect: false });
    expect(googleParts([{ signin: true, apps: [] }], false)).toEqual({ section: true, signIn: true, connect: false });
    expect(googleParts([], false).section).toBe(false);
    expect(googleParts([], true)).toEqual({ section: true, signIn: true, connect: true });
    const page = readFileSync(new URL("./settingsPage.tsx", import.meta.url), "utf8");
    expect(page).toContain('case "google": return placeShown("google") ? <GoogleSection connecting={setting("watch.on") === true} /> : null;');
    expect(page).toContain('control={<Button kind="danger" size="sm" onClick={() => drop(a.id, false)}>{S.google.disconnect}</Button>}');
    expect((S.short as Record<string, string>)["watch.on"]).not.toMatch(/plus Google connections/);
  });
});

describe("Home after the first check agrees with it", () => {
  const P = "/Users/me/shop";
  test("a passing check says the checks pass, never Not checked yet, and is not called proven", () => {
    const s = homeStatus({ ...initial(), point: { stage: "clear" } }, P, Date.now());
    expect(s.verdict.headline).toBe(S.home.checksPass("shop"));
    expect(s.verdict.headline).toBe(S.fr.checkClear("shop"));
    expect(s.verdict.proven).toBe(false);
    expect(s.main).toBe("check");
    expect(notchStatusLine(s, P)).toBe(`${S.home.checksPass("shop")}.`);
  });
  test("a failing check is a problem, with Fix it as the main button", () => {
    const s = homeStatus({ ...initial(), point: { stage: "found", label: "Running the tests" } }, P, Date.now());
    expect(s.kind).toBe("failing");
    expect(s.verdict.headline).toBe(S.home.failing("shop"));
    expect(s.main).toBe("fix");
    expect(notchStatusLine(s, P)).toBe(`${S.home.failing("shop")}.`);
  });
  test("nothing checked is still Not checked yet", () => {
    expect(homeStatus(initial(), P, Date.now()).verdict.headline).toBe(S.home.notChecked);
  });
});

describe("the first run's tools line names every permission they ask for", () => {
  test("screen, microphone and Accessibility", () => {
    expect(S.fr.powersLine).toMatch(/screen/);
    expect(S.fr.powersLine).toMatch(/microphone/);
    expect(S.fr.powersLine).toMatch(/Accessibility/);
    for (const a of Object.values(S.fr.asks)) expect(S.fr.powersLine.toLowerCase()).toContain(a.replace(/^Asks for (the )?/, "").replace(/ the first time$/, "").replace(/ access$/, "").toLowerCase());
  });
});
