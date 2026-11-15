// M98: true words on screen (F29). Nobody is told to connect an AI, add a key or sign in to Claude, and "getting ready" is
// said only while a part really is on its way. The key blocker says fixing is not switched on yet, offers what works
// without it (Check my project), and never a Try again that cannot work.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { PRODUCT_S, S } from "./strings.ts";
import { plainError } from "./model.ts";
import { blockLineFor, blockMainFor, blockerPose, fixOffered, heroStatusOf } from "./homeHero.ts";
import { heroMeaning } from "./meaning.ts";
import { readyDoneWords, setupList, setupNow } from "./setupList.ts";
import { moreWords, rowLine } from "./settingsPage.tsx";
import { PAGES } from "./settingsPages.ts";
import { developerShown, searchSettingsFor, shownResults } from "./settingsSearch.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

/** Every string a person could read in strings.ts, with its path. A function is called with sample values. */
function allWords(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const sample = [["x", "y", "z"], [2, 3, 4], ["x", 2, 3]];
  const walk = (v: unknown, path: string, depth: number) => {
    if (depth > 8) return;
    if (typeof v === "string") { out.push({ path, text: v }); return; }
    if (typeof v === "function") {
      for (const args of sample) { try { const r = (v as (...a: unknown[]) => unknown)(...args); if (typeof r === "string") out.push({ path, text: r }); } catch { /* a sample that does not fit */ } }
      return;
    }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`, depth + 1)); return; }
    if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k, depth + 1);
  };
  walk(S, "", 0);
  return out;
}

/** The developer row (Settings, More options, Account, For developers) and the Danger zone row that removes a key a
 *  developer saved: the only places a model key may be named. Neither shows to a customer (F29). */
const DEVELOPER_ONLY = new Set([
  "setRows.keyLabel", "setRows.keyDesc", "setRows.keySavedChip", "setRows.keyReplace", "setRows.keySave", "setRows.keySheet",
  "setFixed.key.title", "obKeyLabel", "keyNewHelp", "keyReplace", "keySavedNote", "keyRemoveSure",
  "danger.removeKeyLabel", "danger.removeKeyDesc", "danger.removeKeyButton",
]);
const BYO = /\bAPI key\b|your own Claude|own Claude key|Claude plan|add your Claude|connect your Claude|add your key|sign in with your Claude/i;

describe("the key blocker: fixing is not switched on yet (the founder's words, 15 Nov 2026)", () => {
  test("its words are the approved ones, with no Try again, no key, no connect and no sign in", () => {
    const k = S.home.blocked.key;
    expect(k.headline).toBe("Fixing is not switched on for this Mac yet");
    expect(k.line).toBe("Checking your project still works. Squibby will tell you here when fixing is ready. Your project is safe.");
    expect(k.main).toBe("");
    for (const w of [k.headline, k.line]) expect(w, w).not.toMatch(/try again|key|connect|sign in|no ai/i);
  });
  test("the main button is Check my project, which runs without the engine; with no project the setup list leads", () => {
    expect(blockMainFor("key", "/p")).toBe("check");
    expect(blockMainFor("key", "")).toBeNull();
    for (const b of ["engine", "claude", "claudeGetting"] as const) expect(blockMainFor(b, "/p")).toBeNull();
    expect(blockMainFor(null, "/p")).toBeNull();
    // Check my project is the project's own checks (runner problem.find runs the ladder, no model).
    expect(read("../../runner/src/agent.ts")).toMatch(/private async problemFind[\s\S]{0,4000}runLadder/);
  });
  test("nothing is broken: the character keeps its calm pose and the status line says the project's own state", () => {
    expect(blockerPose("key")).toBeUndefined();
    expect(blockerPose("claudeGetting")).toBeUndefined();
    expect(blockerPose("engine")).toBe("error");
    expect(blockerPose("claude")).toBe("error");
    expect(heroStatusOf("blocked", { kind: "unchecked" }, "idle", false, "key")).toBe("notChecked");
    expect(heroStatusOf("blocked", { kind: "works" }, "idle", false, "key")).toBe("proven");
    expect(heroStatusOf("blocked", { kind: "noProject" }, "idle", false, "key")).toBeNull();
    expect(heroStatusOf("blocked", { kind: "unchecked" }, "idle", false, "engine")).toBe("needs");
  });
  test("it is not a setup step: there is nothing for the person to do, so the list moves on to the project", () => {
    // Review of M98: the practice is left out while fixing is off (its Fix it could only end in a refusal), so the list
    // was ready, project, practice (step 2 of 3) and is now ready, project (step 2 of 2). Changed on purpose.
    const l = setupList({ blocker: "key", project: "", practiced: false })!;
    expect(l.map((r) => [r.id, r.state, r.act])).toEqual([["ready", "done", null], ["project", "now", "pickFolder"]]);
    expect(setupNow(l)).toEqual({ n: 2, of: 2 });
    expect(setupList({ blocker: "key", project: "/p", practiced: false })).toBeNull();
    // Every other case keeps the practice step.
    expect(setupList({ blocker: null, project: "", practiced: false })!.map((r) => r.id)).toEqual(["ready", "project", "practice"]);
    expect(setupList({ blocker: "claude", project: "", practiced: false })!.map((r) => r.id)).toEqual(["ready", "project", "practice"]);
  });
  test("the status tag keeps the project's own colour: never red while nothing is broken (review of M98)", () => {
    expect(heroMeaning({ mode: "blocked", tone: "idle", status: "works", blocker: "key" })).toBe("proven");
    expect(heroMeaning({ mode: "blocked", tone: "idle", status: "unchecked", blocker: "key" })).toBe("notChecked");
    expect(heroMeaning({ mode: "blocked", tone: "idle", status: "failing", blocker: "key" })).toBe("problem");
    expect(heroMeaning({ mode: "blocked", tone: "idle", status: "unchecked", blocker: "claudeGetting" })).toBe("working");
    expect(heroMeaning({ mode: "blocked", tone: "idle", status: "works", blocker: "engine" })).toBe("problem");
    expect(heroMeaning({ mode: "blocked", tone: "idle", status: "works", blocker: "claude" })).toBe("problem");
    expect(read("./card.tsx")).toMatch(/heroMeaning\(\{[^}]*blocker[^}]*\}\)/);
  });
  test("with no project open, nothing talks about a project, and the tick says only checking is ready (review of M98)", () => {
    const k = S.home.blocked.key;
    expect(blockLineFor("key", "/p")).toBe(k.line);
    const alone = blockLineFor("key", "");
    expect(alone).toBe(k.lineNoProject);
    expect(alone).not.toMatch(/your project/i);
    expect(alone).toMatch(/pick a project/i);
    for (const b of ["engine", "claude", "claudeGetting"] as const) expect(blockLineFor(b, "")).toBe(S.home.blocked[b].line);
    expect(readyDoneWords("key")).toBe("Checking is ready on this Mac");
    expect(readyDoneWords(null)).toBe(S.screens.setupSteps.ready.done);
    expect(read("./setupList.tsx")).toContain("readyDoneWords(blocker)");
    expect(read("./card.tsx")).toContain("blockLineFor(blocker, project)");
  });
  test("no Fix it or Why did this break while fixing is off: both need the model (review of M98)", () => {
    expect(fixOffered("key")).toBe(false);
    for (const b of [null, "engine", "claude", "claudeGetting"] as const) expect(fixOffered(b)).toBe(true);
    expect(S.pointFixOff).toMatch(/not switched on/);
    expect(S.pointFixOff).not.toMatch(/key|connect|sign in|getting ready/i);
  });
  test("Home wires it: no restart behind a Try again, the line shows over the setup list, the main button checks", () => {
    const card = read("./card.tsx");
    expect(card).not.toMatch(/blocker === "key"\) void invoke\("restart_engine"\)/);
    expect(card).toContain("blockMainFor(blocker, project)");
    expect(card).toContain("as={blockerPose(blocker)}");
    expect(read("./setupList.tsx")).not.toContain("S.tryAgain");
  });
});

describe('"getting ready" only where it is true', () => {
  test("only while a part is on its way (claudeGetting) and the setup row that waits for it", () => {
    const said = allWords().filter((w) => /getting ready/i.test(w.text)).map((w) => w.path);
    expect(said.sort()).toEqual(["home.blocked.claudeGetting.headline", "screens.setupSteps.ready.title"]);
  });
  test("the notch, its hover line, its chat and its peek say fixing is not switched on, never connect or add", () => {
    for (const w of [S.islandNotConnected, S.notConnectedNotice, S.m93.line.notReady, S.m96.chat.notReady, S.m84.next.notConnected, S.m84.next.notConnectedLine]) {
      expect(w, w).toMatch(/not switched on|still works/);
      expect(w, w).not.toMatch(/getting ready|connect|add your|your own|key|click/i);
    }
  });
});

describe("no bring your own Claude words for customers (F29)", () => {
  test("no customer string names an API key, your own Claude or a Claude plan; only the developer row may", () => {
    // Search words (`also`) are never shown: they only help a person find a row, such as "api key" for a key in the code.
    const shownWords = allWords().filter((w) => !/\.also\[\d+\]$/.test(w.path));
    const bad = shownWords.filter((w) => BYO.test(w.text) && !DEVELOPER_ONLY.has(w.path)).map((w) => `${w.path}: ${w.text}`);
    expect(bad).toEqual([]);
  });
  test("the engine's not switched on words reach a card as they are, never as Something went wrong", () => {
    // The same sentence runner/src/engines.ts NOT_CONNECTED says (runner/test/m98-true-words.test.ts checks its words).
    const w = `${PRODUCT_S} AI is not switched on for this Mac yet, so this could not start. Checking your project still works, and so does Undo.`;
    expect(plainError(`engine error: ${w}`)).toBe(w);
    expect(read("../../runner/src/engines.ts")).toContain("export const NOT_CONNECTED = `${PRODUCT_S} AI is not switched on for this Mac yet, so this could not start. Checking your project still works, and so does Undo.`;");
  });
  test("signing in with Google says what is true under F29", () => {
    expect(S.google.signInLine).not.toMatch(/Claude|key/i);
    expect(S.google.signInLine).toMatch(/Google/);
  });
  test("the dead first run strings are gone, and honestLines with them", () => {
    const s = S as unknown as Record<string, unknown>;
    for (const k of ["obWelcome2", "obKeyHelp", "addYourKey", "obConnectTitle", "obConnected", "obKeySave", "obPlanLater"]) expect(s[k], k).toBeUndefined();
    const fr = S.fr as unknown as Record<string, unknown>;
    for (const k of ["claudeTitle", "claudeLine", "keyPrivacy", "keyCost", "keyPlan", "keyHow", "keyPage", "skipKey", "keyNeeded"]) expect(fr[k], k).toBeUndefined();
    expect((S.home as unknown as Record<string, unknown>).addKey).toBeUndefined();
    expect(read("./onboarding.ts")).not.toContain("honestLines");
  });
});

describe("the developer key row: For developers, hidden behind its own switch", () => {
  test("one help text, with no promise that is not true yet (review of M98)", () => {
    const w = S.set["developer.tools"];
    expect(w.help).not.toMatch(/pays for/i);
    expect(rowLine("developer.tools")).toBe(w.help);
    expect(moreWords("developer.tools")).toEqual([]);
  });
  test("it sits in Account's More options under For developers, after the switch that shows it", () => {
    const t = PAGES.account.more.find((x) => x.id === "more.account.developer")!;
    expect(t.items).toEqual(["developer.tools", { fixed: "key" }]);
    expect(S.setGroupTitles["more.account.developer"]).toBe("For developers");
  });
  test("hidden unless the developer switch is on, in the page and in search", () => {
    expect(developerShown(undefined)).toBe(false);
    expect(developerShown(false)).toBe(false);
    expect(developerShown(true)).toBe(true);
    const keyHits = (on: boolean) => shownResults(searchSettingsFor("claude key"), on).filter((r) => "fixed" in r.hit && r.hit.fixed === "key");
    expect(keyHits(false)).toEqual([]);
    expect(keyHits(true).length).toBe(1);
    const page = read("./settingsPage.tsx");
    expect(page).toMatch(/case "key": return developerShown\(setting\("developer.tools"\)\) \? <KeyRow \/> : null;/);
    expect(page).toContain('const found = shownResults(results, developerShown(setting("developer.tools")));');
    expect(page).toContain("const groups = groupResults(found);");
  });
});
