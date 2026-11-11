// M55 section 3, adapts to you (tests first, rule 17). Home's main action follows the kind of app in front and the
// project's state, and More ways to ask puts the ways the person presses most first. The app in front is never read
// beyond its kind (rules 5 and 7): the shell sends one word, and Home reads nothing else. "Used often" is learned only
// from real presses inside Squibby (rule 15), kept on this Mac only, and can be reset. One name for each action stays
// (the audit, item 9): the plan's "Find the problem" and "Is it safe to go live?" are Check my project and Check before
// going live, and its "Review what changed" is Review the changes.
import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initial, reduce, type HistoryItem, type Model } from "./model.ts";
import { FRONT_KINDS, frontFollowed, frontKindOf, halfWay, homeMode, homeStatus, MAIN_TOOL, mainChoices, mainFor, type FrontKind, type HomeStatus } from "./homeHero.ts";
import { buttonShown } from "./groups.ts";
import { MAX_USES, MIN_USES, notePress, orderWays, readCounts, resetUsed, risen, USED_KEY, WAYS, wayLabel, type Way } from "./usedOften.ts";
import { PAGES, placeOf } from "./settingsPages.ts";
import { REGISTRY } from "../../protocol/settings.ts";
import { S } from "./strings.ts";
import { shellSource } from "../dom/sourceText.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const card = read("./card.tsx"), settingsPage = read("./settingsPage.tsx"), usedSrc = read("./usedOften.ts");
const main = shellSource(), everyday = read("../src-tauri/src/everyday.rs");
const P = "/Users/me/test-shop";
const NOW = Date.parse("2026-11-03T12:00:00Z");
const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const begin = [ev({ type: "checkpoint.created", project: P, agent: "a", checkpoint: "cp_1", label: "Before: fix the signup button", files: 3, skipped: [] }), ev({ type: "agent.state", agent: "a", state: "working" })];
const receipt = (o: Record<string, unknown> = {}) => ev({ type: "receipt", agent: "a", checkpoint: "cp_1", changed: [{ file: "src/signup.js", kind: "modified" }], commands: 0, notUndoable: [], usdEstimate: 0.05, proof: "passed", ended: "done", ...o });
const ended = (o: Record<string, unknown>, state = "idle") => run([...begin, receipt(o), ev({ type: "agent.state", agent: "a", state })]);
const row = (o: Partial<HistoryItem>): HistoryItem => ({ id: 1, label: "fix the form", status: "done", usd: 0.1, startedAt: "2026-11-03T10:00:00Z", endedAt: "2026-11-03T10:00:00Z", checkpoint: "c", changed: 1, proof: "passed", ...o });
const proven = { ...initial(), history: [row({})] } as Model;
const failing = { ...initial(), history: [row({ status: "not_done", proof: "failed" })] } as Model;
const unchecked = initial();
const st = (m: Model, project = P): HomeStatus => homeStatus(m, project, NOW);

describe("the main action for each app and project state", () => {
  // The rows are the project's states, the columns the kind of app in front (null: not known, or not followed).
  const COLS: (FrontKind | null)[] = [null, "editor", "aiApp", "browser", "terminal", "other"];
  const table: [string, Model, string, string[]][] = [
    //                                 none        editor   aiApp    browser       terminal   other
    ["not checked yet", unchecked, "rest", ["check", "check", "check", "check", "explain", "check"]],
    // Proven: Check before going live in every app (the review, 3 Nov 2026: an editor in front hid it, the usual case).
    ["proven", proven, "rest", ["shipCheck", "shipCheck", "shipCheck", "shipCheck", "shipCheck", "shipCheck"]],
    ["failing", failing, "rest", ["fix", "fix", "fix", "fix", "fix", "fix"]],
  ];
  for (const [name, m, mode, want] of table) {
    test(name, () => {
      expect(homeMode(m)).toBe(mode as never);
      COLS.forEach((front, i) => expect(mainFor(homeMode(m), st(m), () => true, { front }), `${name}, ${front}`).toBe(want[i] as never));
    });
  }
  test("a task left half way carries on in every app, before the app in front", () => {
    const stopped = ended({ ended: "stopped", proof: "skipped" });
    expect(halfWay(stopped, P)).toBe(true);
    for (const front of COLS) expect(mainFor(homeMode(stopped), st(stopped), () => true, { front, halfWay: true }), String(front)).toBe("carryOn");
    // Without it, the stopped result is not checked yet: Check my project, as before.
    expect(mainFor(homeMode(stopped), st(stopped))).toBe("check");
  });
  test("no project yet: Choose a project, whatever app is in front or whatever is half way", () => {
    for (const front of COLS) expect(mainFor("rest", st(initial(), ""), () => false, { front, halfWay: true })).toBe("folder");
  });
  test("changes waiting lead Home in every app, with Review the changes (the review card's own main button)", () => {
    // homeMode "review" has no status main button: the hero's reviewMain is the one, whatever app is in front.
    for (const front of COLS) expect(mainFor("review", st(unchecked), () => true, { front })).toBeNull();
    // M71: the review card under the lead has its own Review changes, so the lead has none then (one main button).
    expect(card).toContain(': reviewMain ? (show("review") && reviewOn && home.tab === "now" ? null : { label: S.home.reviewMain, go: () => openReview(), status: false })');
    expect(S.home.reviewMain).toBe("Review the changes");
  });
  test("nothing else gets a main button: a job at work, a question, a card that needs a look, an answer", () => {
    for (const mode of ["working", "question", "needs", "answer", "blocked"] as const) for (const front of COLS) expect(mainFor(mode, st(proven), () => true, { front, halfWay: true })).toBeNull();
  });
  test("an action whose tool is off steps back to the project's own, and to none when that is off too", () => {
    const off = (tool: string) => (b: string) => b !== tool;
    expect(mainFor("rest", st(proven), off("explainError"), { front: "terminal" })).toBe("shipCheck");
    expect(mainFor("rest", st(proven), off("findProblem"), { front: "editor" })).toBe("shipCheck");
    expect(mainFor("rest", st(unchecked), off("findProblem"), { front: "terminal" })).toBe("explain");
    expect(mainFor("rest", st(unchecked), (b) => b !== "findProblem" && b !== "explainError", { front: "terminal" })).toBeNull();
    const stopped = ended({ ended: "stopped", proof: "skipped" });
    expect(mainFor("result", st(stopped), off("carryOn"), { halfWay: true })).toBe("check");
    // Each main action's button belongs to its tool (groups.ts), so a tool switched off never shows here either.
    expect(MAIN_TOOL).toEqual({ fix: "findProblem", check: "findProblem", shipCheck: "shipCheck", folder: null, carryOn: "carryOn", explain: "explainError" });
    const offOnly = (key: string) => (k: string) => (k === key ? false : undefined);
    expect([buttonShown("carryOn", () => undefined), buttonShown("explainError", () => undefined)]).toEqual([true, true]);
    expect(buttonShown("carryOn", offOnly("flow.on"))).toBe(false);
    expect(buttonShown("explainError", offOnly("prompt.on"))).toBe(false);
    expect(buttonShown("explainError", offOnly("flow.on"))).toBe(true);
  });
  test("the choices are written once, project first: no project, then half way, then a failure or a proven fix, then the app", () => {
    expect(mainChoices({ main: "fix" }, { front: "terminal" })).toEqual(["fix"]);
    expect(mainChoices({ main: "check" }, { front: "terminal" })).toEqual(["explain", "check"]);
    // A proven project keeps its own next step, Check before going live, whatever app is in front.
    for (const front of ["editor", "aiApp", "browser", "terminal", "other"] as const) expect(mainChoices({ main: "shipCheck" }, { front }), front).toEqual(["shipCheck"]);
    expect(mainChoices({ main: "shipCheck" }, { halfWay: true, front: "editor" })).toEqual(["carryOn", "shipCheck"]);
    expect(mainChoices({ main: "check" }, { front: "editor" })).toEqual(["check"]);
    expect(mainChoices({ main: "check" }, { front: "browser" })).toEqual(["check"]);
    expect(mainChoices({ main: "shipCheck" }, { front: "browser" })).toEqual(["shipCheck"]);
    expect(mainChoices({ main: "check" }, { halfWay: true, front: "terminal" })).toEqual(["carryOn", "check"]);
    expect(mainChoices({ main: "folder" }, { halfWay: true, front: "editor" })).toEqual(["folder"]);
  });
  test("one name for each action (the audit, item 9): the main labels are the ones already used elsewhere", () => {
    expect(S.home.main).toEqual({ fix: "Fix it", shipCheck: "Check before going live", check: "Check my project", folder: "Choose a project", carryOn: "Carry on", explain: "Explain an error" });
    expect(S.home.main.carryOn).toBe(S.resume);
    expect(S.home.main.explain).toBe(S.look.chipExplain);
    expect(S.home.main.check).toBe(S.look.chipFind);
    expect(S.home.main.shipCheck).toBe(S.look.chipSafe);
  });
});

describe("a task left half way", () => {
  test("stopped by the person, or by its spending limit or turns, and its conversation can still carry on", () => {
    expect(halfWay(ended({ ended: "stopped", proof: "skipped" }), P)).toBe(true);
    expect(halfWay(ended({ ended: "failed", endedWhy: "spending_limit", proof: "skipped" }), P)).toBe(true);
    expect(halfWay(ended({ ended: "failed", endedWhy: "turns", proof: "skipped" }), P)).toBe(true);
  });
  test("not the daily limit (it would stop again at once), not a finished or failed task, not one that asked something", () => {
    expect(halfWay(ended({ ended: "failed", endedWhy: "daily_limit", proof: "skipped" }), P)).toBe(false);
    expect(halfWay(ended({}), P)).toBe(false);
    expect(halfWay(ended({ ended: "failed", endedWhy: "check_failed", proof: "failed" }, "error"), P)).toBe(false);
    expect(halfWay(ended({ ended: "stopped", proof: "failed" }), P)).toBe(false);
    expect(halfWay(ended({ ended: "needs_you", asks: true, proof: "skipped" }, "needsYou"), P)).toBe(false);
  });
  test("not in another project, after an Undo, or once the engine restarted (nothing to carry on)", () => {
    const stopped = ended({ ended: "stopped", proof: "skipped" });
    expect(halfWay(stopped, "/Users/me/other")).toBe(false);
    expect(halfWay({ ...stopped, receipt: { ...stopped.receipt!, undone: true } }, P)).toBe(false);
    expect(halfWay({ ...stopped, receipt: { ...stopped.receipt!, gone: true } }, P)).toBe(false);
    expect(halfWay(initial(), P)).toBe(false);
  });
  test("Carry on sends Try again's own command, through the follow up path, so the engine is told how the last try ended", () => {
    expect(card).toContain('if (a === "carryOn") { followSent(false); void send(retryTask(project)).catch(followRefused); return; }');
    expect(card).toContain('if (a === "explain") { explainFromBox(); return; }');
    expect(card).toContain("halfWay: halfWay(m, project)");
  });
});

describe("the app in front is never read beyond its kind (rules 5 and 7)", () => {
  test("Home takes one of five words and nothing else", () => {
    expect(FRONT_KINDS).toEqual(["editor", "aiApp", "browser", "terminal", "other"]);
    for (const k of FRONT_KINDS) expect(frontKindOf({ kind: k })).toBe(k);
    for (const bad of [null, undefined, "editor", {}, { kind: "Editor" }, { kind: "com.microsoft.VSCode" }, { kind: "code" }, { kind: 3 }, { id: "com.apple.Terminal" }, { name: "Terminal", title: "~/shop: npm run dev" }]) expect(frontKindOf(bad), JSON.stringify(bad)).toBeNull();
    // Anything sent beside the kind is not read: the result is only ever the kind.
    expect(frontKindOf({ kind: "terminal", name: "Terminal", title: "secret.txt", id: "com.apple.Terminal" })).toBe("terminal");
  });
  test("with Home follows the app in front off, Home goes by the project alone", () => {
    expect(frontFollowed("terminal", false)).toBeNull();
    expect(frontFollowed("terminal", true)).toBe("terminal");
    expect(frontFollowed("terminal", undefined)).toBe("terminal");
    expect(mainFor("rest", st(proven), () => true, { front: frontFollowed("terminal", false) })).toBe("shipCheck");
    expect(card).toContain('const followFront = useSetting("home.followFrontApp");');
    expect(card).toContain("{ front: frontFollowed(frontKind, followFront), halfWay: halfWay(m, project) }");
  });
  test("the page reads the kind only through frontKindOf, from the shell's two messages", () => {
    expect(card).toContain('listen("front-kind", (e) => { const k = frontKindOf(e.payload); if (k) setFrontKind(k); })');
    expect(card).toContain("const k = frontKindOf({ kind: (e.payload as { front?: unknown } | null)?.front });");
    // The page never asks the shell which app is in front for this (front_app is Settings' own Add the app in front).
    const cardFront = card.match(/invoke\("front_app"/g) ?? [];
    expect(cardFront.length).toBe(0);
  });
  test("the shell sends the kind alone, to Home alone, from the id alone, and with the setting off reads nothing", () => {
    expect(main).toContain('if let Some(v) = everyday::home_front(&setting_now("home.followFrontApp"), front_id) {');
    expect(main).toContain('let _ = app.emit_to("card", "front-kind", v);');
    expect(main).toContain('if let Some(k) = everyday::home_front(&setting_now("home.followFrontApp"), front_id).and_then(|v| v.get("kind").cloned()) { opened["front"] = k; }');
    expect(everyday).toContain('let kind = if follow == &Value::Bool(false) { Some("other") } else { home_kind(&front()) };');
    expect(everyday).toContain('kind.map(|k| json!({ "kind": k }))');
    // The pages' shared state no longer names the app in front.
    expect(main).toContain('let state = json!({ "clicks": CLICKS.load(Ordering::SeqCst), "card_key": ck });');
    expect(read("./tauri.ts")).toContain("export type AppState = { clicks: number; card_key: boolean };");
  });
});

// A small page storage for the tests, as localStorage behaves.
class Mem { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, String(v)); } removeItem(k: string) { this.m.delete(k); } }
const ways = (ids: Way[]) => ids.map((id) => ({ id }));

describe("what you use often rises in More ways to ask, learned only from your own presses (rule 15)", () => {
  let mem: Mem;
  beforeEach(() => { mem = new Mem(); });
  test("a real press counts; a click made by code, or a press with the setting off, never does", () => {
    expect(notePress("plan", { trusted: true, on: true }, mem)).toBe(true);
    expect(notePress("plan", { trusted: false, on: true }, mem)).toBe(false);
    expect(notePress("plan", { trusted: true, on: false }, mem)).toBe(false);
    expect(readCounts(mem)).toEqual({ plan: 1 });
    // Only ways on the list: nothing else can be written.
    expect(notePress("deleteEverything" as Way, { trusted: true, on: true }, mem)).toBe(false);
    expect(readCounts(mem)).toEqual({ plan: 1 });
  });
  test("one press is not a habit: a way rises from its second press, most pressed first, a tie in the usual order", () => {
    const all = ways([...WAYS]);
    notePress("drawIt", { trusted: true, on: true }, mem);
    expect(orderWays(all, readCounts(mem)).map((w) => w.id)).toEqual([...WAYS]);
    for (let i = 0; i < 2; i++) notePress("drawIt", { trusted: true, on: true }, mem);
    for (let i = 0; i < 2; i++) notePress("plan", { trusted: true, on: true }, mem);
    for (let i = 0; i < 2; i++) notePress("research", { trusted: true, on: true }, mem);
    expect(risen(readCounts(mem))).toEqual(["drawIt", "plan", "research"]);
    expect(orderWays(all, readCounts(mem)).map((w) => w.id)).toEqual(["drawIt", "plan", "research", "find", "safe", "explain", "showMe", "rescue", "online", "bisect"]);
    expect(MIN_USES).toBe(2);
  });
  test("off, the usual order, whatever was learned; a way not drawn now is simply left out", () => {
    for (let i = 0; i < 3; i++) notePress("rescue", { trusted: true, on: true }, mem);
    expect(orderWays(ways(["find", "rescue", "plan"]), readCounts(mem), false).map((w) => w.id)).toEqual(["find", "plan", "rescue"]);
    expect(orderWays(ways(["plan", "find"]), readCounts(mem)).map((w) => w.id)).toEqual(["find", "plan"]);
  });
  test("counts stop at a ceiling, so an old habit can be caught up", () => {
    for (let i = 0; i < MAX_USES + 10; i++) notePress("plan", { trusted: true, on: true }, mem);
    expect(readCounts(mem).plan).toBe(MAX_USES);
  });
  test("only counts are kept, under one key, and anything odd in storage is dropped, never guessed", () => {
    notePress("explain", { trusted: true, on: true }, mem);
    expect(JSON.parse(mem.getItem(USED_KEY)!)).toEqual({ v: 1, counts: { explain: 1 } });
    mem.setItem(USED_KEY, JSON.stringify({ v: 1, counts: { plan: 3, nope: 9, find: -2, safe: 1.5, rescue: "7", drawIt: 999 } }));
    expect(readCounts(mem)).toEqual({ plan: 3, drawIt: MAX_USES });
    mem.setItem(USED_KEY, "not json");
    expect(readCounts(mem)).toEqual({});
    expect(readCounts(null)).toEqual({});
  });
  test("Reset forgets it all, and the usual order is back", () => {
    for (let i = 0; i < 4; i++) notePress("bisect", { trusted: true, on: true }, mem);
    resetUsed(mem);
    expect(mem.getItem(USED_KEY)).toBeNull();
    expect(orderWays(ways([...WAYS]), readCounts(mem)).map((w) => w.id)).toEqual([...WAYS]);
  });
  test("the page notes a press only from the button the person pressed, and holds the order while the list is open", () => {
    expect(card).toContain('const wayPress = (id: Way, go: () => void) => (e: React.MouseEvent<HTMLButtonElement>) => { notePress(id, { trusted: e.nativeEvent.isTrusted, on: usedFirst }); go(); };');
    expect(card).toContain('const usedFirst = useSetting("home.usedOftenFirst") !== false;');
    expect(card).toContain('<details className="more">\n              <summary onClick={(e) => { setWayCounts(readCounts()); const d = e.currentTarget.parentElement; setTimeout(() => setMoreDesc(firstWayTip(d)), 0); }}>{S.look.more}');
    expect(card).toContain("].filter((w) => !!w.el), wayCounts, usedFirst).map((w) => w.el)}");
    // Every way on the list is drawn with its own id, and only More ways notes presses.
    for (const w of WAYS) expect(card, w).toContain(`onClick={wayPress("${w}", `);
    expect(card.match(/notePress\(/g)?.length).toBe(1);
    // The main action is not in More ways twice.
    expect(card).toContain('toolOn("errorHelp") && main !== "explain" &&');
  });
  test("kept only on this Mac, in the page's own storage: no command, no event, nothing sent", () => {
    expect(usedSrc).not.toMatch(/invoke\(|send\(|listen\(|fetch\(/);
    expect(usedSrc).toContain('export const USED_KEY = "companion.usedOften";');
  });
  test("Settings says what was learned in words, and Reset forgets it", () => {
    expect(settingsPage).toContain('case "usedOften": return <UsedOftenRow />;');
    expect(settingsPage).toContain("onClick={() => { resetUsed(); setSaid(S.setRows.usedOftenDone); }}>{S.setRows.usedOftenReset}</Button>");
    // What was learned, as it is: a way switched off since is still said (it comes first again once it is back on).
    expect(S.setRows.usedOftenNow(["Plan it", "Look up"].join(", "))).toBe("You press these most: Plan it, Look up.");
    expect(WAYS.map(wayLabel)).toEqual([S.look.chipFind, S.look.chipSafe, S.look.chipExplain, S.look.chipShowMe, S.planIt, S.rescueIt, S.researchIt, S.onlineButton, S.bisectButton, S.drawIt]);
  });
});

describe("the settings", () => {
  const def = (k: string) => REGISTRY.settings.find((d) => d.key === k);
  test("Home follows the app in front: on by usual, read by the shell and the pages, in More options beside Home's own", () => {
    expect(def("home.followFrontApp")).toMatchObject({ kind: "switch", default: true, applies: ["shell", "pages"], scope: "app" });
    expect(S.set["home.followFrontApp"].label).toBe("Home follows the app in front");
    expect(S.set["home.followFrontApp"].help).toContain("Only the kind of app is used, never its name or anything in it.");
    expect(placeOf("home.followFrontApp")).toMatchObject({ page: "more", topic: "more.general.home", more: true });
  });
  test("Put the ways I use most first: on by usual, the page's own, with Reset beside it", () => {
    expect(def("home.usedOftenFirst")).toMatchObject({ kind: "switch", default: true, applies: ["pages"], scope: "app" });
    expect(S.set["home.usedOftenFirst"].help).toContain("only from your own presses");
    const topic = PAGES.general.more.find((t) => t.id === "more.general.home")!;
    expect(topic.items).toEqual(["home.closeOnClickAway", "home.stepAside", "home.goToNeeds", "home.size", "home.followFrontApp", "home.usedOftenFirst", "history.thisWeek", { fixed: "usedOften" }]);   // M77: the week's count
    expect(S.setFixed.usedOften.also).toContain("reset");
  });
  test("plain words: no em dashes and nothing in capitals (AI is a name, said as it is everywhere)", () => {
    const words = [S.set["home.followFrontApp"].label, S.set["home.followFrontApp"].help, S.set["home.usedOftenFirst"].label, S.set["home.usedOftenFirst"].help,
      S.setRows.usedOften, S.setRows.usedOftenNone, S.setRows.usedOftenDone, S.setRows.usedOftenReset, S.home.main.carryOn, S.home.main.explain];
    for (const w of words) { expect(w).not.toContain("—"); expect(w.replace(/\bAI\b/g, "")).not.toMatch(/\b[A-Z]{2,}\b/); }
  });
});
