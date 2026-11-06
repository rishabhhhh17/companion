// M74, your way (docs/milestones/M74-your-way.md): the pages' side of the new settings. Where each one lives, the lines
// Settings draws for them, quiet hours on the notch, a review that closes quietly, and the spend warning with no amount.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { REGISTRY, defOf } from "../../protocol/settings.ts";
import { reviewModeOf } from "../../protocol/index.ts";
import { initial, reduce, type Model } from "./model.ts";
import { closesQuietly, hushReview, quietNow, type ReviewCard } from "./review.ts";
import { reviewKeepLine, reviewStartLine } from "./settings.ts";
import { mainKeys, moreKeys, PAGES, placeOf, SIDEBAR } from "./settingsPages.ts";
import { S } from "./strings.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const SET = S.set as Record<string, { label: string; help: string }>;
const NEW = ["spend.warnAt", "review.ignore", "review.modeHere", "app.openAtLogin", "undo.keepSize", "undo.keepAge", "privacy.neverSend", "review.send", "quiet.on", "quiet.from", "quiet.to", "review.stopKinds", "review.whenNothing", "review.maxFiles"];

describe("where the settings live", () => {
  test("every new setting has exactly one place, and the ones that matter most are on a main page", () => {
    const all = SIDEBAR.flatMap((p) => [...mainKeys(p), ...moreKeys(p)]);
    for (const k of NEW) expect(all.filter((x) => x === k).length, k).toBe(1);
    expect(placeOf("spend.warnAt")).toMatchObject({ page: "account", more: false });
    expect(placeOf("review.modeHere")).toMatchObject({ page: "fixing", more: false });
    expect(placeOf("app.openAtLogin")).toMatchObject({ page: "general", more: false });
    for (const k of ["privacy.neverSend", "review.send", "undo.keepSize", "undo.keepAge"]) expect(placeOf(k), k).toMatchObject({ page: "privacy", more: false });
    for (const k of ["review.ignore", "review.stopKinds", "review.whenNothing", "review.maxFiles"]) expect(placeOf(k), k).toMatchObject({ topic: "more.fixing.review" });
    for (const k of ["quiet.on", "quiet.from", "quiet.to"]) expect(placeOf(k), k).toMatchObject({ topic: "more.general.quiet" });
  });
  test("the hidden ones came up: how strict, the key warning and how many times to try a fix are on the main Fixing page", () => {
    for (const k of ["review.strictness", "review.keyWarning", "work.tries"]) expect(mainKeys("fixing"), k).toContain(k);
    expect(S.set["work.tries"].label).toBe("How many times to try a fix");
    // The key warning is still off until turned on.
    expect(defOf("review.keyWarning")!.default).toBe(false);
  });
  test("every notch setting is in the Notch group or the Notch topic, and both say what they hold", () => {
    const notch = REGISTRY.settings.filter((d) => d.key.startsWith("island.") && !d.hidden).map((d) => d.key);
    const groups = [...PAGES.general.groups.find((g) => g.id === "general.notch")!.items, ...PAGES.general.more.find((t) => t.id === "more.general.notch")!.items];
    for (const k of notch) expect(groups, k).toContain(k);
    expect(S.setGroupTitles["more.general.notch"]).toBe("Notch");
    expect(S.setGroupFoot["general.notch"]).toBeTruthy();
    expect(S.setGroupFoot["more.general.notch"]).toBeTruthy();
    expect(read("./settingsPage.tsx")).toContain("<Group footer={(S.setGroupFoot as Record<string, string>)[topic.id]}>");
  });
  test("review history is said on Privacy too, as a line with a way to the one row that changes it", () => {
    expect(PAGES.privacy.groups.flatMap((g) => g.items)).toContainEqual({ fixed: "reviewKeep" });
    expect(reviewKeepLine("90")).toBe("Reviews stay in History for 90 days. Only file names are kept, never their text.");
    expect(reviewKeepLine("365")).toContain("for a year.");
    expect(reviewKeepLine("nonsense")).toContain("90 days");
    expect(read("./settingsPage.tsx")).toContain('c.go("review.keepDays")');
  });
  test("a page with a setting for one project says Pick a project first while none is open", () => {
    const pages = SIDEBAR.filter((p) => mainKeys(p).some((k) => defOf(k)?.scope === "project"));
    expect(pages).toContain("fixing");
    expect(S.m74.pickProject).toMatch(/^Pick a project first\./);
    expect(read("./settingsPage.tsx")).toContain('{!c.project && keys.some((k) => defOf(k)?.scope === "project") && <p className="set-note" role="note">{S.m74.pickProject}</p>}');
  });
});

describe("the line under Review changes says when a review starts", () => {
  test("from the two waits, in plain words", () => {
    expect(reviewStartLine("ask", 20, 60)).toBe("A review starts once your files have not changed for 20 seconds, or a minute with Automatic.");
    expect(reviewStartLine("automatic", 45, 120)).toBe("A review starts once your files have not changed for 45 seconds, or 2 minutes with Automatic.");
    expect(reviewStartLine("ask", undefined, "x")).toContain("20 seconds");
    expect(reviewStartLine("off", 20, 60)).toBe(S.m74.reviewOff);
  });
  test("this project's own choice is the one in force", () => {
    expect(reviewStartLine(reviewModeOf("ask", "off"), 20, 60)).toBe(S.m74.reviewOff);
    expect(read("./card.tsx")).toContain('reviewModeOf(useSetting("review.mode"), useSetting("review.modeHere"))');
  });
});

const P = "/Users/me/shop";
const card = (o: Partial<ReviewCard> = {}): ReviewCard => ({ project: P, batch: "rv_1", stage: "reviewed", files: [], count: 1, capped: false, secretFiles: [], auto: false, proof: false, asked: false, fix: null, note: null, result: { rating: "safe", reasons: [], touches: [], summary: "", notes: [], checks: "not_run", sendBack: "x", lane: "cheap" } as never, ...o });

describe("quiet hours for the notch", () => {
  const at = (h: number) => new Date(2026, 10, 6, h, 30);
  test("across midnight, within a day, off, and the same hour twice means none", () => {
    expect(quietNow(true, 22, 7, at(23))).toBe(true);
    expect(quietNow(true, 22, 7, at(3))).toBe(true);
    expect(quietNow(true, 22, 7, at(7))).toBe(false);
    expect(quietNow(true, 22, 7, at(12))).toBe(false);
    expect(quietNow(true, 9, 17, at(10))).toBe(true);
    expect(quietNow(true, 9, 17, at(18))).toBe(false);
    expect(quietNow(false, 22, 7, at(23))).toBe(false);
    expect(quietNow(true, 8, 8, at(8))).toBe(false);
    expect(quietNow(true, "x", 7, at(23))).toBe(false);
  });
  test("the notch leaves out changes to review, but a key warning still shows, and only while hushed", () => {
    const m: Model = { ...initial(), folder: P, review: card({ stage: "ready", result: null }) } as Model;
    expect(hushReview(m, true).review).toBeNull();
    expect(hushReview(m, false)).toBe(m);
    const key = { ...m, review: card({ stage: "ready", result: null, keys: [{ file: "a.ts", line: 1 }] }) } as Model;
    expect(hushReview(key, true).review).not.toBeNull();
    const island = read("./island.tsx");
    expect(island).toContain("const m = hushReview(mAll, hushed);");
    expect(island).toContain("review={review && !hushed}");
  });
});

describe("a review that finds nothing", () => {
  test("Keep it in Home (the usual) never closes it; Close it quietly closes only a safe review with no reasons, untouched", () => {
    expect(closesQuietly(card(), "leave")).toBe(false);
    expect(closesQuietly(card(), "closeQuietly")).toBe(true);
    expect(closesQuietly(card({ result: { ...card().result!, reasons: [{ kind: "files_removed", say: "x" }] } as never }), "closeQuietly")).toBe(false);
    expect(closesQuietly(card({ result: { ...card().result!, rating: "worth_a_look" } as never }), "closeQuietly")).toBe(false);
    expect(closesQuietly(card({ stage: "ready", result: null }), "closeQuietly")).toBe(false);
    expect(closesQuietly(card({ sentBack: true }), "closeQuietly")).toBe(false);
    expect(closesQuietly(card({ later: card({ batch: "rv_2" }) }), "closeQuietly")).toBe(false);
  });
  test("its History row says it closed by itself, never that you said it looks fine", () => {
    expect(read("./card.tsx")).toContain('reviewDismiss(project, quietBatch, "quiet")');
    expect(S.history.reviewDid.closed_quietly).toBe("Nothing found, closed by itself");
  });
});

describe("the spend warning", () => {
  test("it is a note for the project open now, and it never shows an amount", () => {
    const m: Model = { ...initial(), folder: P } as Model;
    const after = reduce(m, { type: "spending.warn", project: P, percent: 80 } as never);
    expect(after.notice).toBe(S.m74.spendWarn(80));
    expect(reduce(m, { type: "spending.warn", project: "/other", percent: 80 } as never).notice).toBe(m.notice);
    expect(reduce(m, { type: "spending.warn", project: P, percent: 33 } as never)).toBe(m);
    for (const p of [50, 80]) expect(S.m74.spendWarn(p)).not.toMatch(/\d|\$|cent/);
  });
});

describe("Open when you log in asks first", () => {
  test("turning it on shows a question; turning it off never asks", () => {
    const page = read("./settingsPage.tsx");
    expect(page).toContain('d.key === "app.openAtLogin" ? (v: boolean) => { if (v) setAskLogin(true); else { setAskLogin(false); void change(false); } }');
    expect(page).toContain("<ConfirmStep key=\"login\"");
    expect(S.m74.loginAsk).toContain("System Settings");
    expect(S.setProblem.loginItem).toBeTruthy();
  });
});

describe("the words", () => {
  test("no long dashes and no cents in anything M74 says", () => {
    const words = JSON.stringify([S.m74.reviewStarts("20 seconds", "a minute"), S.m74.reviewOff, S.m74.pickProject, S.m74.reviewKeep("90 days"), S.m74.loginAsk, S.m74.spendWarn(50), S.m74.spendWarn(80),
      ...NEW.map((k) => SET[k]), S.floors.reviewIgnoreBuiltIn, S.floors.neverSendBuiltIn, S.floors.reviewAlwaysStops, S.floors.undoKeeps, S.floors.quietKeys]);
    expect(words).not.toMatch(/[–—]/);
    expect(words).not.toMatch(/\bcents?\b/i);
    for (const k of NEW) expect(SET[k]?.label, k).toBeTruthy();
  });
  test("the look stays fixed: M74 adds nothing to the Look page", () => {
    expect(mainKeys("look")).toEqual(["look.colour", "look.character", "look.layout", "display.textSize"]);
    expect(PAGES.look.more).toEqual([]);
    for (const k of NEW) expect(k.startsWith("look."), k).toBe(false);
  });
});
