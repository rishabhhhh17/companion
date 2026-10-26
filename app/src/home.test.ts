// Home in the notch (F18.1): the tabs Home is laid out in, which tab opens by itself, when a click elsewhere closes Home,
// and the island's one line of status. All plain code, tested without a screen.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initial, reduce, visualState, type Model } from "./model.ts";
import { PANEL_TAB, PLACES, TABS, characterShows, closesOnClickAway, homeReduce, stepsAside, homeStart, islandAlert, islandLine, ISLAND_LINE_MAX, markedLine, need, panelsIn, phArmable, shownOn, tabKey, tabName, typing, type HomeState, type Panel } from "./home.ts";
import { S, PRODUCT } from "./strings.ts";
import { EMPTY_LINE, liveLine, newsOf } from "./a11y.ts";
import { PH_KEYS_MS } from "./keys.ts";

const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const task = (label = "add a sign up page") => [ev({ type: "checkpoint.created", agent: "a", checkpoint: "cp_1", label: `Before: ${label}`, files: 3, skipped: [] }), ev({ type: "agent.state", agent: "a", state: "working" })];
const approval = (id = "ap_1", title = "git push sends your work to a remote") => ev({ type: "approval.request", approval: id, agent: "a", checkpoint: "cp_1", toolUseId: "t", risk: "git", title, expiresAt: "2999-01-01T00:00:00Z" });
const stuck = ev({ type: "loop.stuck", agent: "a", index: 2, title: "Fix the form", failure: { label: "Tests", detail: "1 failed" }, options: [{ id: "different", label: "Try a different way" }, { id: "stop", label: "Stop here" }] });
const walkStep = (index = 0) => [ev({ type: "ui.walkRequested", walk: "w1" }), ev({ type: "walk.step", walk: "w1", lesson: "k", title: "Turn on Screen Recording", index, total: 3, say: "Open System Settings", find: "System Settings", ask: false })];
const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("Home's tabs", () => {
  test("five tabs in a fixed order, named in the strings file", () => {
    expect([...TABS]).toEqual(["now", "did", "learn", "memory", "settings"]);
    expect(TABS.map(tabName)).toEqual(["Now", "What I did", "Learn", "Memory", "Settings"]);
    for (const t of TABS) expect(tabName(t)).toBe(S.homeTabs[t]);
  });
  test("every part of the old card has exactly one place (a tab, or every tab), and every tab has something in it", () => {
    for (const t of TABS) expect(panelsIn(t).length, t).toBeGreaterThan(0);
    expect([...PLACES]).toEqual([...TABS, "every"]);
    const all = PLACES.flatMap(panelsIn);
    expect(new Set(all).size).toBe(all.length);
    expect(all.sort()).toEqual((Object.keys(PANEL_TAB) as Panel[]).sort());
    expect(panelsIn("every")).toEqual(["notes"]);
  });
  test("Now holds what the card showed while working; the rest go to their own tabs", () => {
    for (const p of ["ask", "urgent", "task", "proof", "receipt", "promptHelp", "errorHelp", "showMe", "point", "drive", "ship", "voice", "whatsNew"] as Panel[]) expect(PANEL_TAB[p], p).toBe("now");
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
    // The settings rows (the registry's Settings page, T16) are on the Settings tab.
    expect(card).toMatch(/\{show\("settings"\) && <SettingsPage /);
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
  test("during a lesson, what Show me says is on Learn under the lesson, and a problem with it is a new thing to see there", () => {
    // Screen Recording is needed, it could not find that, the window changed, the click missed: the person must see why
    // no pointer came, on the tab that shows the lesson (the old card showed it under the lesson too).
    for (const stage of ["needs_permission", "error", "window_changed", "not_sure", "your_turn_miss"]) {
      const m = run([...walkStep(), ev({ type: "app.showme", stage, message: "Screen Recording is needed", req: "sm_1", turn: true })]);
      const n = need(m);
      expect(n?.tab, stage).toBe("learn");
      expect(n?.key, stage).toBe(`showme:sm_1:${stage}`);
      expect(shownOn("showMe", n!.tab, m), stage).toBe(true);
      expect(shownOn("walk", n!.tab, m), stage).toBe(true);
      expect(shownOn("showMe", "now", m), stage).toBe(false);
    }
    // Someone who went to Now during the lesson is brought back to see it.
    const step = run(walkStep());
    const problem = run([...walkStep(), ev({ type: "app.showme", stage: "needs_permission", message: "Screen Recording is needed", req: "sm_1" })]);
    const s = [{ type: "need", need: need(step) }, { type: "pick", tab: "now" }, { type: "need", need: need(problem) }].reduce((a, x) => homeReduce(a, x as never), homeStart());
    expect(s.tab).toBe("learn");
    // Without a lesson, Show me answers on Now as before.
    const alone = run([ev({ type: "app.showme", stage: "needs_permission", message: "Allow Screen Recording" })]);
    expect(shownOn("showMe", "now", alone)).toBe(true);
    expect(shownOn("showMe", "learn", alone)).toBe(false);
  });
  test("the card decides what shows with the same rule", () => {
    expect(card).toContain("const show = (p: Panel) => shownOn(p, home.tab, m);");
  });
});

describe(`what ${PRODUCT} says about itself shows on every tab`, () => {
  test("opening Home with the engine down shows why, whatever tab was left open", () => {
    const m = run([ev({ type: "app.runner_down" })]);
    expect(m.error).toBeTruthy();
    for (const t of TABS) {
      const s = [{ type: "pick", tab: t }, { type: "opened", keyboard: false }].reduce((a, x) => homeReduce(a, x as never), homeStart());
      expect(s.tab, t).toBe(t);
      expect(shownOn("notes", s.tab, m), t).toBe(true);
    }
  });
  test("so does an error from something done on another tab (a memory edit, the lesson list)", () => {
    const m = run([ev({ type: "protocol.error", reason: "Could not save that." })]);
    expect(m.error).toBeTruthy();
    for (const t of TABS) expect(shownOn("notes", t, m), t).toBe(true);
  });
  test("the card draws the notes between the tabs and the tab's panel, not inside one tab", () => {
    const at = card.indexOf('{show("notes") && <>');
    expect(at).toBeGreaterThan(card.indexOf('role="tablist"'));
    expect(at).toBeLessThan(card.indexOf('role="tabpanel"'));
    const block = card.slice(at, card.indexOf("</>}", at));
    expect(block).toContain("{m.error}");
    expect(block).toContain("{m.notice}");
    expect(block).not.toContain("folderNone");
  });
  test("Memory does not say it is looking while the engine is down", () => {
    expect(card).toMatch(/show\("memory"\) && project && !m\.memory && m\.runnerUp && /);
  });
});

describe("the Home reducer", () => {
  const go = (s: HomeState, ...a: Parameters<typeof homeReduce>[1][]) => a.reduce(homeReduce, s);
  test("starts on Now", () => { expect(homeStart().tab).toBe("now"); expect(homeStart().needKey).toBe(""); });
  test("the person picks a tab", () => {
    expect(go(homeStart(), { type: "pick", tab: "settings" }).tab).toBe("settings");
    expect(go(homeStart(), { type: "pick", tab: "learn" }, { type: "pick", tab: "did" }).tab).toBe("did");
  });
  test("a new need shows its tab and says so for VoiceOver, on Home's one live line (a11y.ts)", () => {
    const s = go(homeStart(), { type: "pick", tab: "settings" }, { type: "need", need: { key: "approval:ap_1", tab: "now", why: S.needsYouTitle } });
    expect(s.tab).toBe("now");
    // What the live line says, from the tab that was open when the need came.
    expect(liveLine(EMPTY_LINE, [], run([...task(), approval()]), "settings").line.text).toBe(S.homeWaiting("Now", `${S.needsYouTitle}: git push sends your work to a remote`));
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
    expect(newsOf(run([...task(), approval()]), s.tab)[0].text).toBe(S.homeWaiting("Now", `${S.needsYouTitle}: git push sends your work to a remote`));
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
    expect(card).toMatch(/const act = \{ type: "need" as const, need: needNow, typing: typing\(/);
    expect(card).toContain("homeDispatch(act);");
  });
  test("a need already on its tab is not announced again", () => {
    const s = go(homeStart(), { type: "pick", tab: "learn" }, { type: "need", need: { key: "walk:w1:0:step", tab: "learn", why: S.lessonsTitle } });
    expect(s.tab).toBe("learn");
    expect(newsOf(run(walkStep()), s.tab), "its own panel says it").toEqual([]);
    // A question on Now while Now is open: just the question, no tab.
    expect(newsOf(run([...task(), approval()]), "now")[0].text).toBe(`${S.needsYouTitle}: git push sends your work to a remote`);
  });
  test("the ask box hotkey shows Now (the box is there); a click on the island keeps the tab", () => {
    expect(go(homeStart(), { type: "pick", tab: "settings" }, { type: "opened", keyboard: true }).tab).toBe("now");
    expect(go(homeStart(), { type: "pick", tab: "settings" }, { type: "opened", keyboard: false }).tab).toBe("settings");
  });
  test("picking a tab says nothing more on the live line (VoiceOver reads the tab itself)", () => {
    const s = go(homeStart(), { type: "pick", tab: "settings" }, { type: "need", need: { key: "k", tab: "now", why: "x" } }, { type: "pick", tab: "did" });
    expect(s.tab).toBe("did");
    const m = run([...task(), approval()]), a = liveLine(EMPTY_LINE, [], m, "settings");
    expect(liveLine(a.line, a.said, m, s.tab).line).toBe(a.line);
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
    // The places are a list down the side (a vertical tab list), so Up and Down move too, the same way.
    expect(tabKey("now", "ArrowDown")).toBe("did");
    expect(tabKey("now", "ArrowUp")).toBe("settings");
    for (const k of ["Enter", " ", "Tab", "a"]) expect(tabKey("learn", k)).toBeNull();
  });
  test("the tab list follows the tabs pattern: one tab in the Tab order, arrows for the rest, the chosen one marked", () => {
    expect(card).toContain('role="tablist"');
    expect(card).toContain('role="tab"');
    expect(card).toContain('role="tabpanel"');
    expect(card).toMatch(/aria-selected=\{t === home\.tab\}/);
    expect(card).toMatch(/tabIndex=\{t === home\.tab \? 0 : -1\}/);
    expect(card).toMatch(/onKeyDown=\{[^\n]*tabKey\(/);
    // A tab shown by itself is said out loud on the one live line, since the keyboard focus does not move there.
    expect(card).toContain("liveLine(line.current, heard.current, m, tabNow.current)");
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

// HeyClicky v1.0.53 parity: Report a bug moves Home aside, so the email it opens is visible. Ours, with "Step aside for
// what Home opens" on (home.stepAside, off unless turned on): after a link, the email for Report a problem, or Finder for
// the support log opened, Home closes the way Esc does, unless something on it waits for the person (the same rule as a
// click elsewhere). What it said (the log's name) is still there when Home opens again.
describe("Home steps aside for what it opens", () => {
  test("off unless turned on; on, it steps aside when nothing waits, also while a task works", () => {
    expect(stepsAside(initial(), false, false)).toBe(false);
    expect(stepsAside(initial(), false, true)).toBe(true);
    expect(stepsAside(run(task()), false, true)).toBe(true);
  });
  test("never while something waits: a question, a lesson (its link is part of the step), a pointer, the first run", () => {
    expect(stepsAside(run([...task(), approval()]), false, true)).toBe(false);
    expect(stepsAside(run(walkStep()), false, true)).toBe(false);
    expect(stepsAside(run([ev({ type: "app.showme", stage: "thinking", message: "Finding it", req: "sm_1" })]), false, true)).toBe(false);
    expect(stepsAside(initial(), true, true)).toBe(false);
  });
  test("it does not depend on Close Home when I click another app", () => {
    const page = read("./card.tsx");
    const fn = page.slice(page.indexOf("const stepAside = () =>"), page.indexOf("\n", page.indexOf("const stepAside = () =>")));
    expect(fn).toContain('stepsAside(nowModel.current, onboardingNow.current, setting("home.stepAside") === true)');
    expect(fn).toContain('invoke("close_card")');
    expect(fn).not.toContain("home.closeOnClickAway");
  });
  test("only after the link, the email or Finder really opened, never on a failure", () => {
    const page = read("./card.tsx");
    const open = page.slice(page.indexOf("function OpenButton("), page.indexOf("function CopyButton("));
    expect(open).toMatch(/invoke\("open_link", \{ url: l\.url \}\)\.then\(\(\) => \{ onNote\(""\); opened\.stepAside\(\); \}\)\.catch/);
    const settings = read("./settingsPage.tsx");
    expect(settings).toMatch(/invoke\("report_problem", [^\n]*\.then\(\(n\) => \{ setExported\(S\.reportOpened\(String\(n\)\)\); onStepAside\(\); \}\)\.catch/);
    expect(settings).toMatch(/invoke\("export_logs"\)\.then\(\(n\) => \{ setExported\(S\.exportLogsDone[^\n]*\); onStepAside\(\); \}\)\.catch/);
    expect(page).toContain("onStepAside={stepAside}");
  });
});

describe("the island's status", () => {
  test("wings beside the notch while something happens: working, a question, listening, just done; never idle", () => {
    expect(islandAlert(initial())).toBe(false);
    // The fun island (27 Oct 2026): work going on now shows too, as wings with a live mark (it used to stay bare).
    expect(islandAlert(run(task()))).toBe(true);
    expect(islandAlert(run([...task(), approval()]))).toBe(true);
    expect(islandAlert(run([ev({ type: "app.voice", stage: "listening", message: "Listening" })]))).toBe(true);
    expect(islandAlert(run([...task(), ev({ type: "agent.state", agent: "a", state: "done" })]))).toBe(true);
    expect(islandAlert(run([ev({ type: "app.runner_down" })]))).toBe(false);
  });
  test("one line: nothing when idle, working on what, needs you for what, done with what", () => {
    expect(islandLine(initial())).toBe("");
    expect(islandLine(run(task()))).toBe(S.islandWorkingOn("add a sign up page"));
    expect(islandLine(run(task()))).toBe("Working on: Add a sign up page");
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
  test("the pill has no word any more: idle it is bare, and what happens shows as wings (island.test.ts)", () => {
    const page = readFileSync(new URL("./island.tsx", import.meta.url), "utf8");
    expect(page).not.toMatch(/islandWord|pillrow/);
  });
});

// ---- M11 area 4: the settings for Home (protocol/settings.json) ----
describe("When something needs me (home.goToNeeds)", () => {
  const go = (s: HomeState, ...a: Parameters<typeof homeReduce>[1][]) => a.reduce(homeReduce, s);
  const lesson = () => need(run(walkStep()))!;
  test("Go to it is today's: Home goes to the tab where it waits", () => {
    expect(go(homeStart(), { type: "pick", tab: "memory" }, { type: "need", need: lesson() }).tab).toBe("learn");
    expect(markedLine(go(homeStart(), { type: "pick", tab: "memory" }), { type: "need", need: lesson() })).toBeNull();
  });
  test("Only mark the tab keeps the person where they are, counts the need as seen, and says what is waiting", () => {
    const at = go(homeStart(), { type: "pick", tab: "memory" });
    const a = { type: "need" as const, need: lesson(), markOnly: true };
    const s = go(at, a);
    expect(s.tab).toBe("memory");
    expect(s.needKey).toBe(lesson().key);
    expect(markedLine(at, a)).toBe(S.homeWaiting(tabName("learn"), S.lessonsTitle));
    // The tab is marked (card.tsx draws the dot for the need's tab when it is not the open one) and VoiceOver hears it.
    expect(card).toContain("const waits = needNow?.tab === t && t !== home.tab;");
    expect(newsOf(run(walkStep()), "memory").map((n) => n.text)).toContain(S.homeWaiting(tabName("learn"), S.lessonsTitle));
    // Said once: the same need again says nothing and moves nothing.
    expect(markedLine(s, a)).toBeNull();
    expect(go(s, a).tab).toBe("memory");
    // Nothing is said for a need on the tab that is open, or for no need.
    expect(markedLine(go(homeStart(), { type: "pick", tab: "learn" }), a)).toBeNull();
    expect(markedLine(at, { type: "need", need: null, markOnly: true })).toBeNull();
  });
  test("a question waiting for an answer is never hidden: it still opens Now", () => {
    for (const m of [run([...task(), approval()]), run([...task(), stuck]), run([...task(), ev({ type: "plan.ready", agent: "a", steps: [{ title: "One" }], estimateUsd: 0.1 })]), run([...task(), ev({ type: "drive.paused", agent: "a", reason: "editor" })])]) {
      const n = need(m)!;
      expect(n.question, n.key).toBe(true);
      const at = go(homeStart(), { type: "pick", tab: "settings" });
      expect(go(at, { type: "need", need: n, markOnly: true }).tab, n.key).toBe("now");
      expect(markedLine(at, { type: "need", need: n, markOnly: true }), n.key).toBeNull();
    }
    // Everything else is not a question. Prompt help's question before the first read is not one of these either, but it
    // must always show (below): its panel is the light for reading another app.
    for (const m of [run(walkStep()), run([ev({ type: "app.showme", stage: "pointing", message: "Here", req: "sm_1" })])]) {
      expect(need(m)!.question, need(m)!.key).toBeFalsy();
      expect(need(m)!.mustShow, need(m)!.key).toBeFalsy();
    }
    expect(need(run([ev({ type: "app.prompt_help", stage: "consent", app: "Notes" })]))!.mustShow).toBe(true);
    // While typing, a question marks its tab as it always has, and with Only mark the tab that is said out loud too.
    const n = need(run([...task(), approval()]))!;
    const at = go(homeStart(), { type: "pick", tab: "settings" });
    expect(go(at, { type: "need", need: n, typing: true, markOnly: true }).tab).toBe("settings");
    expect(markedLine(at, { type: "need", need: n, typing: true, markOnly: true })).toBe(S.homeWaiting(tabName("now"), S.needsYouTitle));
    expect(markedLine(at, { type: "need", need: n, typing: true })).toBeNull();
  });
  // Prompt help and the error explainer start from the person's own hotkey, and their panel on Now is the light for reading
  // another app's text (rule 5), holds the question asked before the first read, and shows the rewrite before its keys
  // work in every app. So they are never only marked: from every tab, typing or not, each of their steps shows Now.
  const PH_STAGES = ["reading", "consent", "ready", "needs_accessibility", "nothing_to_read", "error", "refused"];
  const EH_STAGES = ["reading", "consent", "ready", "unexplained", "needs_accessibility", "nothing_selected", "refused", "error"];
  const phAt = (stage: string) => run(stage === "ready"
    ? [ev({ type: "app.prompt_help", stage: "thinking", app: "Notes", req: "ph_1" }), ev({ type: "assist.prompt.done", req: "ph_1", text: "Better words", diff: [] })]
    : [ev({ type: "app.prompt_help", stage, app: "Notes" })]);
  const ehAt = (stage: string) => run([ev({ type: "app.explain_error", stage, app: "Terminal", req: "r1" })]);
  test("Prompt help and the error explainer always show Now, from every tab, with Only mark the tab and while typing", () => {
    const cases: [string, Model, Panel][] = [...PH_STAGES.map((s) => [`ph ${s}`, phAt(s), "promptHelp"] as [string, Model, Panel]), ...EH_STAGES.map((s) => [`eh ${s}`, ehAt(s), "errorHelp"] as [string, Model, Panel])];
    for (const [name, m, panel] of cases) {
      const n = need(m)!;
      expect(n, name).toBeTruthy();
      expect(n.mustShow, name).toBe(true);
      for (const t of TABS) {
        const at = go(homeStart(), { type: "pick", tab: t });
        for (const extra of [{ markOnly: true }, { typing: true }, { markOnly: true, typing: true }, {}]) {
          const a = { type: "need" as const, need: n, ...extra };
          const s = go(at, a);
          expect(s.tab, `${name} from ${t} ${JSON.stringify(extra)}`).toBe("now");
          expect(shownOn(panel, s.tab, m), `${name} from ${t}`).toBe(true);
          expect(markedLine(at, a), `${name} from ${t}: shown, so nothing is said for it`).toBeNull();
        }
      }
    }
  });
  test("a whole Prompt help press from Settings with Only mark the tab: each step that needs the person is on screen", () => {
    let s = go(homeStart(), { type: "pick", tab: "settings" });
    let m = initial();
    for (const e of [ev({ type: "app.prompt_help", stage: "reading", app: "Notes" }), ev({ type: "app.prompt_help", stage: "consent", app: "Notes" }), ev({ type: "app.prompt_help", stage: "reading", app: "Notes" }), ev({ type: "app.prompt_help", stage: "thinking", app: "Notes", req: "ph_1" }), ev({ type: "assist.prompt.done", req: "ph_1", text: "Better words", diff: [] })]) {
      m = reduce(m, e as never);
      s = homeReduce(s, { type: "need", need: need(m), markOnly: true });
      if (need(m)) expect(shownOn("promptHelp", s.tab, m), String(m.ph?.stage)).toBe(true);
    }
    expect(m.ph?.stage).toBe("ready");
    expect(phArmable(m, s.tab, true)).toBe(true);
  });
  test("the result's keys, which work in every app, are armed only while its panel with the change shows", () => {
    const m = phAt("ready");
    for (const t of TABS) expect(phArmable(m, t, true), t).toBe(shownOn("promptHelp", t, m));
    expect(phArmable(m, "settings", true)).toBe(false);
    expect(phArmable(m, "now", true)).toBe(true);
    // Home closed (Esc, the island or the character clicked, a full screen app, Hide): nothing shows, so never armed.
    for (const t of TABS) expect(phArmable(m, t, false), t).toBe(false);
    // Not before there is a result, and never with no text to put back.
    expect(phArmable(phAt("reading"), "now", true)).toBe(false);
    expect(phArmable(run([ev({ type: "app.prompt_help", stage: "ready", app: "Notes" })]), "now", true)).toBe(false);
    expect(phArmable(initial(), "now", true)).toBe(false);
    // The card arms them in one place only, behind this check, once for each result, and gives them back the moment the
    // result stops showing (Home closed, another tab), to take them again when it shows again.
    expect(card.match(/invoke\("ph_ready"/g)?.length).toBe(1);
    expect(card).toContain("const [homeOpen, setHomeOpen] = useState(false);");
    expect(card).toMatch(/listen\("opened", [\s\S]*?setHomeOpen\(true\);/);
    expect(card).toMatch(/listen\("closed", \(\) => \{[^\n]*setHomeOpen\(false\);/);
    const fx = card.slice(card.indexOf("const phShown = phArmable(m, home.tab, homeOpen);"), card.indexOf("const shipIt = "));
    expect(fx).toContain('if (!phShown) { setPhKeysUp(false); clearTimeout(phKeysTimer.current); if (phArmedFor.current !== null) { phArmedFor.current = null; void invoke("ph_disarm").catch(() => {}); } return; }');
    expect(fx).toContain("if (!m.ph?.text || phArmedFor.current === m.ph.text) return;");
    expect(fx.indexOf("if (!phShown")).toBeLessThan(fx.indexOf('invoke("ph_ready"'));
    // The result is handed back with its own request, so the shell keeps it only for the read still waiting.
    expect(fx).toContain('void invoke("ph_ready", { text: m.ph.text, handback: m.ph.handback ?? "paste", req: m.ph.req ?? "" })');
    expect(fx).toContain("}, [m.ph?.stage, m.ph?.text, phShown]);");
  });
  // Found in the M11 audit (A38): the shell gives the keys back when Home closes (Esc, a click away) and after a minute and
  // a half, without telling the page, so the result kept naming keys that did nothing (or reached the app in front).
  test("the result names its keys only while the shell holds them, and asks for them again each time Home opens", () => {
    const fx = card.slice(card.indexOf("const phShown = phArmable(m, home.tab, homeOpen);"), card.indexOf("const shipIt = "));
    expect(fx).toContain("setPhArmed(armedFor(v)); setPhKeysUp(true); clearTimeout(phKeysTimer.current); phKeysTimer.current = setTimeout(() => setPhKeysUp(false), PH_KEYS_MS);");
    expect(card).toContain("{phKeysUp && <div className=\"line muted\">{acceptHint(phArmed, keys)}</div>}");
    // Home closing stops it showing (homeOpen false), which puts the line away and gives the keys back; opening Home again
    // shows it again, so the keys are asked for again (phArmedFor was cleared).
    expect(fx).toContain("if (!phShown) { setPhKeysUp(false); clearTimeout(phKeysTimer.current); if (phArmedFor.current !== null) { phArmedFor.current = null;");
    expect(card).toContain('const offClosed = listen("closed", () => { overReceipt.current = false; homeShown.current = false; setHomeOpen(false);');
    // The page's minute and a half is the shell's own (main.rs arm_now).
    const main = readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");
    const arm = main.slice(main.indexOf("fn arm_now("), main.indexOf("fn ph_consent"));
    expect(arm).toContain("Duration::from_secs(90)");
    expect(PH_KEYS_MS).toBe(90_000);
  });
  test("with Only mark the tab, anything that needs the person shows the island's mark", () => {
    const m = run(walkStep());
    expect(islandAlert(m)).toBe(islandAlert(m, false));
    expect(islandAlert(m, true)).toBe(true);
    expect(islandAlert(initial(), true), "nothing waiting: no mark").toBe(false);
    expect(islandAlert(run([ev({ type: "app.runner_down" })]), true)).toBe(false);
    const island = readFileSync(new URL("./island.tsx", import.meta.url), "utf8");
    expect(island).toContain('const raw = islandWings(m, useSetting("home.goToNeeds") === "markTab");');
  });
  test("with Only mark the tab and no island, the character shows that mark instead, and keeps its own lights", () => {
    const lesson = run(walkStep());
    // The usual settings, or the island shown: the character is drawn exactly as before.
    for (const [markTab, island] of [[false, true], [false, false], [true, true]]) {
      for (const m of [lesson, initial(), run(task())]) expect(characterShows(m, markTab, island)).toBe(visualState(m));
    }
    // Only mark the tab with the island off: anything that needs the person lights the character (the island's mark).
    expect(characterShows(lesson, true, false)).toBe("needsYou");
    expect(characterShows(run([ev({ type: "app.showme", stage: "error", message: "x", req: "sm_1" })]), true, false)).toBe("needsYou");
    expect(characterShows(run([ev({ type: "app.voice", stage: "needs_mic", message: "x" })]), true, false)).toBe("needsYou");
    // Nothing waiting: no mark. The engine down: as before.
    expect(characterShows(initial(), true, false)).toBe("idle");
    expect(characterShows(run([ev({ type: "app.runner_down" })]), true, false)).toBe(visualState(run([ev({ type: "app.runner_down" })])));
    // Its own lights (listening, looking at the screen) and an error are never covered by the mark.
    const looking = run([...walkStep(), ev({ type: "app.showme", stage: "looking", message: "Looking at your screen", req: "sm_1" })]);
    expect(characterShows(looking, true, false)).toBe("checking");
    const listening = run([...walkStep(), ev({ type: "app.voice", stage: "listening", message: "Listening" })]);
    expect(characterShows(listening, true, false)).toBe("listening");
    // needsYou has a ring that shows with no motion at all, so it is a visible light with reduced motion too.
    expect(read("./style.css")).toMatch(/\.character\[data-state="needsYou"\] \{ box-shadow:/);
    // The character's page draws it from the two settings.
    const dock = read("./dock.tsx");
    expect(dock).toContain('const state = characterShows(m, useSetting("home.goToNeeds") === "markTab", useSetting("island.show") !== false);');
    expect(dock).toContain("data-state={state} data-motion={motionFor(state, reduced)}");
  });
  test("the card reads the setting for each new need, and says what was only marked when Speak to me is on", () => {
    const eff = card.slice(card.indexOf("const needNow = need(m);"), card.indexOf("// A tab shown by itself took away"));
    expect(eff).toContain('markOnly: setting("home.goToNeeds") === "markTab"');
    expect(eff).toContain("const said = markedLine(home, act);");
    expect(eff).toContain("if (said && speechOn()) sayIt(said, false);");
  });
});

describe("Close Home when I click another app (home.closeOnClickAway)", () => {
  test("on is today's rule", () => {
    for (const m of [initial(), run(task()), run([...task(), approval()]), run(walkStep())]) expect(closesOnClickAway(m, false, true)).toBe(closesOnClickAway(m, false));
  });
  test("off, a click elsewhere never closes Home; Esc, Close and the island or the character still do", () => {
    for (const m of [initial(), run(task()), run([...task(), approval()])]) expect(closesOnClickAway(m, false, false)).toBe(false);
    expect(card).toMatch(/listen\("home-click-away", [^\n]*closesOnClickAway\(nowModel\.current, onboardingNow\.current, setting\("home\.closeOnClickAway"\) === true\)/);
    // The shell does not even watch for clicks while it is off (main.rs open_card, homeset.rs wiring test).
    expect(read("../src-tauri/src/main.rs")).toContain("if !was_open && home_set().click_away { watch_click_away(&a); }");
  });
});

