// Home in the notch (F18.1): the tabs Home is laid out in, which tab opens by itself, when a click elsewhere closes Home,
// and the island's one line of status. All plain code, tested without a screen.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initial, reduce, type Model } from "./model.ts";
import { PANEL_TAB, TABS, closesOnClickAway, homeReduce, homeStart, islandAlert, islandLine, islandWord, ISLAND_LINE_MAX, need, panelsIn, tabKey, tabName, typing, type HomeState, type Panel } from "./home.ts";
import { S } from "./strings.ts";

const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const task = (label = "add a sign up page") => [ev({ type: "checkpoint.created", agent: "a", checkpoint: "cp_1", label: `Before: ${label}`, files: 3, skipped: [] }), ev({ type: "agent.state", agent: "a", state: "working" })];
const approval = (id = "ap_1", title = "git push sends your work to a remote") => ev({ type: "approval.request", approval: id, agent: "a", checkpoint: "cp_1", toolUseId: "t", risk: "git", title, expiresAt: "2999-01-01T00:00:00Z" });
const stuck = ev({ type: "loop.stuck", agent: "a", index: 2, title: "Fix the form", failure: { label: "Tests", detail: "1 failed" }, options: [{ id: "different", label: "Try a different way" }, { id: "stop", label: "Stop here" }] });
const walkStep = (index = 0) => [ev({ type: "ui.walkRequested", walk: "w1" }), ev({ type: "walk.step", walk: "w1", lesson: "k", title: "Turn on Screen Recording", index, total: 3, say: "Open System Settings", find: "System Settings", ask: false })];
const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");

describe("Home's tabs", () => {
  test("five tabs in a fixed order, named in the strings file", () => {
    expect([...TABS]).toEqual(["now", "did", "learn", "memory", "settings"]);
    expect(TABS.map(tabName)).toEqual(["Now", "What I did", "Learn", "Memory", "Settings"]);
    for (const t of TABS) expect(tabName(t)).toBe(S.homeTabs[t]);
  });
  test("every part of the old card has exactly one tab, and every tab has something in it", () => {
    for (const t of TABS) expect(panelsIn(t).length, t).toBeGreaterThan(0);
    const all = TABS.flatMap(panelsIn);
    expect(new Set(all).size).toBe(all.length);
    expect(all.sort()).toEqual((Object.keys(PANEL_TAB) as Panel[]).sort());
  });
  test("Now holds what the card showed while working; the rest go to their own tabs", () => {
    for (const p of ["ask", "urgent", "task", "proof", "receipt", "promptHelp", "errorHelp", "showMe", "point", "drive", "ship", "voice"] as Panel[]) expect(PANEL_TAB[p], p).toBe("now");
    expect(PANEL_TAB.history).toBe("did");
    for (const p of ["lessons", "walk", "practice"] as Panel[]) expect(PANEL_TAB[p], p).toBe("learn");
    expect(PANEL_TAB.memory).toBe("memory");
    expect(PANEL_TAB.settings).toBe("settings");
  });
  test("the ask box is only hidden on other tabs, never taken away: a draft, and words from hold to talk, are kept", () => {
    expect(card).toMatch(/<div hidden=\{!show\("ask"\)\}>/);
    expect(card).not.toMatch(/\{show\("ask"\) &&/);
  });
  test("words from hold to talk bring Now forward, where the box is", () => {
    const heard = card.slice(card.indexOf('ev.stage === "heard"'), card.indexOf('dispatch({ type: "ui.voiceClosed" });'));
    expect(heard).toContain('homeDispatch({ type: "pick", tab: "now" })');
  });
  test("a tab asks for what it shows whenever it is the one showing, also when it opened by itself", () => {
    const fx = card.slice(card.indexOf("// What each tab shows is asked for"), card.indexOf("}, [home.tab, project]);"));
    expect(fx).toContain('home.tab === "learn"');
    expect(fx).toContain("walkList(");
    expect(fx).toContain('home.tab === "memory"');
    expect(fx).toContain("listMemory(");
  });
  test("the card shows each part only on its own tab", () => {
    for (const p of Object.keys(PANEL_TAB)) expect(card, p).toContain(`show("${p}")`);
    // The settings rows are the same SettingsPanel as before, now on the Settings tab instead of behind a button.
    expect(card).toMatch(/\{show\("settings"\) && <SettingsPanel /);
    expect(card).not.toMatch(/\bsettingsOpen\b/);
    expect(card).not.toMatch(/\blessonsOpen\b/);
  });
});

describe("which tab opens by itself", () => {
  test("nothing waiting: no tab is pushed", () => {
    expect(need(initial())).toBeNull();
    expect(need(run(task()))).toBeNull();
  });
  test("a question (an approval) and the loop card open Now", () => {
    expect(need(run([...task(), approval()]))).toMatchObject({ tab: "now", key: "approval:ap_1" });
    expect(need(run([...task(), stuck]))).toMatchObject({ tab: "now" });
    expect(need(run([...task(), ev({ type: "plan.ready", agent: "a", steps: [{ title: "One" }], estimateUsd: 0.1 })]))?.tab).toBe("now");
    expect(need(run([...task(), ev({ type: "drive.paused", agent: "a", reason: "editor" })]))?.tab).toBe("now");
  });
  test("a lesson step and the practice open Learn", () => {
    expect(need(run(walkStep()))).toMatchObject({ tab: "learn" });
    expect(need(run([ev({ type: "ui.practiceStarted", project: "/p", kind: "signup" })]))?.tab).toBe("learn");
  });
  test("a question outranks a lesson, and each new step is a new need", () => {
    expect(need(run([...walkStep(), approval()]))?.tab).toBe("now");
    expect(need(run(walkStep(0)))?.key).not.toBe(need(run(walkStep(1)))?.key);
  });
  test("what a hotkey started (Prompt help, the error explainer) shows Now at each step, refusals too", () => {
    for (const stage of ["reading", "consent", "ready", "needs_accessibility", "nothing_to_read", "error"]) {
      expect(need(run([ev({ type: "app.prompt_help", stage, app: "Notes" })]))?.tab, stage).toBe("now");
    }
    for (const stage of ["reading", "consent", "needs_accessibility", "nothing_selected", "refused"]) {
      expect(need(run([ev({ type: "app.explain_error", stage, app: "Terminal", req: "r1" })]))?.tab, stage).toBe("now");
    }
    const answered = run([ev({ type: "app.explain_error", stage: "thinking", app: "Terminal", req: "r1" }), ev({ type: "error.explained", req: "r1", ok: true, sentences: ["It could not find the file."], excerpt: "x", evidence: "y" })]);
    expect(need(answered)?.tab).toBe("now");
    expect(need(run([ev({ type: "app.prompt_help", stage: "pasted", app: "Notes" })]))).toBeNull();
  });
  test("pointing during a lesson does not pull the person away from the lesson", () => {
    const m = run([...walkStep(), ev({ type: "app.showme", stage: "pointing", message: "Here", req: "sm_1", turn: true })]);
    expect(need(m)?.tab).toBe("learn");
    const alone = run([ev({ type: "app.showme", stage: "needs_permission", message: "Allow Screen Recording" })]);
    expect(need(alone)?.tab).toBe("now");
  });
});

describe("the Home reducer", () => {
  const go = (s: HomeState, ...a: Parameters<typeof homeReduce>[1][]) => a.reduce(homeReduce, s);
  test("starts on Now", () => { expect(homeStart().tab).toBe("now"); expect(homeStart().said).toBe(""); });
  test("the person picks a tab", () => {
    expect(go(homeStart(), { type: "pick", tab: "settings" }).tab).toBe("settings");
    expect(go(homeStart(), { type: "pick", tab: "learn" }, { type: "pick", tab: "did" }).tab).toBe("did");
  });
  test("a new need shows its tab and says so for VoiceOver", () => {
    const s = go(homeStart(), { type: "pick", tab: "settings" }, { type: "need", need: { key: "approval:ap_1", tab: "now", why: S.needsYouTitle } });
    expect(s.tab).toBe("now");
    expect(s.said).toBe(S.homeShown("Now", S.needsYouTitle));
  });
  test("the same need does not pull the person back once they chose another tab; the next one does", () => {
    const n = { key: "approval:ap_1", tab: "now" as const, why: S.needsYouTitle };
    let s = go(homeStart(), { type: "need", need: n }, { type: "pick", tab: "memory" }, { type: "need", need: n });
    expect(s.tab).toBe("memory");
    s = go(s, { type: "need", need: { ...n, key: "approval:ap_2" } });
    expect(s.tab).toBe("now");
  });
  test("a need going away leaves the person where they are, and the same need coming back later counts again", () => {
    const n = { key: "walk:w1:0:step", tab: "learn" as const, why: S.lessonsTitle };
    let s = go(homeStart(), { type: "need", need: n }, { type: "pick", tab: "now" }, { type: "need", need: null });
    expect(s.tab).toBe("now");
    s = go(s, { type: "need", need: n });
    expect(s.tab).toBe("learn");
  });
  test("someone typing on another tab is never pulled away: the tab is marked and said instead", () => {
    const n = { key: "approval:ap_1", tab: "now" as const, why: S.needsYouTitle };
    const s = go(homeStart(), { type: "pick", tab: "settings" }, { type: "need", need: n, typing: true });
    expect(s.tab).toBe("settings");
    expect(s.said).toBe(S.homeWaiting("Now", S.needsYouTitle));
    // Once noticed it does not pull them later either; a new need while not typing does.
    expect(go(s, { type: "need", need: n }).tab).toBe("settings");
    expect(go(s, { type: "need", need: { ...n, key: "approval:ap_2" } }).tab).toBe("now");
  });
  test("typing means a text box, a list or editable text has the keyboard in a window that has it", () => {
    expect(typing({ tag: "INPUT", editable: false }, true)).toBe(true);
    expect(typing({ tag: "TEXTAREA", editable: false }, true)).toBe(true);
    expect(typing({ tag: "SELECT", editable: false }, true)).toBe(true);
    expect(typing({ tag: "DIV", editable: true }, true)).toBe(true);
    expect(typing({ tag: "BUTTON", editable: false }, true)).toBe(false);
    expect(typing({ tag: "INPUT", editable: false }, false), "Home is not the window being typed in").toBe(false);
    expect(typing(null, true)).toBe(false);
  });
  test("the card tells the reducer whether the person is typing", () => {
    expect(card).toMatch(/homeDispatch\(\{ type: "need", need: needNow, typing: typing\(/);
  });
  test("a need already on its tab is not announced again", () => {
    const s = go(homeStart(), { type: "need", need: { key: "approval:ap_1", tab: "now", why: S.needsYouTitle } });
    expect(s.said).toBe("");
  });
  test("the ask box hotkey shows Now (the box is there); a click on the island keeps the tab", () => {
    expect(go(homeStart(), { type: "pick", tab: "settings" }, { type: "opened", keyboard: true }).tab).toBe("now");
    expect(go(homeStart(), { type: "pick", tab: "settings" }, { type: "opened", keyboard: false }).tab).toBe("settings");
  });
  test("picking a tab clears the last announcement (VoiceOver reads the tab itself)", () => {
    const s = go(homeStart(), { type: "pick", tab: "settings" }, { type: "need", need: { key: "k", tab: "now", why: "x" } }, { type: "pick", tab: "did" });
    expect(s.said).toBe("");
  });
});

describe("the tabs from the keyboard", () => {
  test("arrows move and wrap, Home and End jump, other keys do nothing", () => {
    expect(tabKey("now", "ArrowRight")).toBe("did");
    expect(tabKey("settings", "ArrowRight")).toBe("now");
    expect(tabKey("now", "ArrowLeft")).toBe("settings");
    expect(tabKey("learn", "ArrowLeft")).toBe("did");
    expect(tabKey("learn", "Home")).toBe("now");
    expect(tabKey("learn", "End")).toBe("settings");
    for (const k of ["Enter", " ", "Tab", "a", "ArrowDown"]) expect(tabKey("learn", k)).toBeNull();
  });
  test("the tab list follows the tabs pattern: one tab in the Tab order, arrows for the rest, the chosen one marked", () => {
    expect(card).toContain('role="tablist"');
    expect(card).toContain('role="tab"');
    expect(card).toContain('role="tabpanel"');
    expect(card).toMatch(/aria-selected=\{t === home\.tab\}/);
    expect(card).toMatch(/tabIndex=\{t === home\.tab \? 0 : -1\}/);
    expect(card).toMatch(/onKeyDown=\{[^\n]*tabKey\(/);
    // A tab shown by itself is said out loud, since the keyboard focus does not move there.
    expect(card).toMatch(/aria-live="polite"[^\n]*\{home\.said\}/);
  });
});

describe("a click elsewhere closes Home, unless something there needs the person", () => {
  test("closes when nothing is waiting, also while a task works", () => {
    expect(closesOnClickAway(initial(), false)).toBe(true);
    expect(closesOnClickAway(run(task()), false)).toBe(true);
  });
  test("stays for a question, a lesson, a pointer, Prompt help, the first run", () => {
    expect(closesOnClickAway(run([...task(), approval()]), false)).toBe(false);
    expect(closesOnClickAway(run(walkStep()), false)).toBe(false);
    expect(closesOnClickAway(run([ev({ type: "app.showme", stage: "thinking", message: "Finding it", req: "sm_1" })]), false)).toBe(false);
    expect(closesOnClickAway(run([ev({ type: "app.prompt_help", stage: "consent", app: "Notes" })]), false)).toBe(false);
    expect(closesOnClickAway(run([ev({ type: "app.voice", stage: "listening", message: "Listening" })]), false)).toBe(false);
    expect(closesOnClickAway(run([ev({ type: "ui.undoAsked", checkpoint: "cp_1" })]), false)).toBe(false);
    expect(closesOnClickAway(initial(), true), "the first run sends people to other apps (a key, a sign in)").toBe(false);
  });
  test("the card asks before it closes, and closes the way Esc does", () => {
    expect(card).toMatch(/listen\("home-click-away", [^\n]*closesOnClickAway\(/);
    expect(card).toMatch(/home-click-away[^\n]*player\.current\.hush\(\);[^\n]*invoke\("close_card"\)/);
  });
});

describe("the island's status", () => {
  test("a mark beside the notch only when the person should look: a question, listening, just done", () => {
    expect(islandAlert(initial())).toBe(false);
    expect(islandAlert(run(task()))).toBe(false);
    expect(islandAlert(run([...task(), approval()]))).toBe(true);
    expect(islandAlert(run([ev({ type: "app.voice", stage: "listening", message: "Listening" })]))).toBe(true);
    expect(islandAlert(run([...task(), ev({ type: "agent.state", agent: "a", state: "done" })]))).toBe(true);
    expect(islandAlert(run([ev({ type: "app.runner_down" })]))).toBe(false);
  });
  test("one line: ready, working on what, needs you for what, done with what", () => {
    expect(islandLine(initial())).toBe(S.islandReady);
    expect(islandLine(run(task()))).toBe(S.islandWorkingOn("add a sign up page"));
    expect(islandLine(run([...task(), approval()]))).toBe(S.islandNeedsYou("git push sends your work to a remote"));
    expect(islandLine(run([...task(), stuck]))).toBe(S.islandNeedsYou(S.stuckTitle));
    expect(islandLine(run([...task(), ev({ type: "agent.state", agent: "a", state: "done" })]))).toBe(S.islandDone("add a sign up page"));
    expect(islandLine(run([ev({ type: "app.voice", stage: "listening", message: "Listening" })]))).toBe(S.islandListening);
    expect(islandLine(run([ev({ type: "app.runner_down" })]))).toBe(S.islandOff);
  });
  test("a long task name is cut to one line", () => {
    const l = islandLine(run(task("x".repeat(300))));
    expect(l.length).toBeLessThanOrEqual(ISLAND_LINE_MAX);
    expect(l.endsWith("…")).toBe(true);
  });
  test("the task's name only for the task's own work, never for listening or looking", () => {
    const finished = [...task(), ev({ type: "agent.state", agent: "a", state: "idle" })];
    expect(islandLine(run([...finished, ev({ type: "app.voice", stage: "transcribing", message: "x" })]))).toBe("Understanding you");
    expect(islandLine(run([...finished, ev({ type: "app.showme", stage: "looking", message: "x", req: "sm_1" })]))).toBe("Looking at your screen");
    expect(islandLine(run([...finished, ev({ type: "app.showme", stage: "your_turn_done", message: "That's it.", req: "sm_1" })]))).toBe("Done");
  });
  test("working with no name says what the character says", () => {
    expect(islandLine(run([ev({ type: "agent.state", agent: "a", state: "thinking" })]))).toBe("Thinking");
  });
  test("the pill's one word is the character's state, short enough for the pill", () => {
    expect(islandWord(initial())).toBe("Ready");
    expect(islandWord(run([...task(), approval()]))).toBe("Needs you");
    expect(islandWord(run([ev({ type: "agent.state", agent: "a", state: "error" })]))).toBe(S.islandWordError);
    for (const st of ["idle", "thinking", "working", "checking", "needsYou", "done", "error"]) {
      expect(islandWord(run([ev({ type: "agent.state", agent: "a", state: st })])).length, st).toBeLessThanOrEqual(12);
    }
    expect(islandWord(run([ev({ type: "app.runner_down" })])).length).toBeLessThanOrEqual(12);
  });
});
