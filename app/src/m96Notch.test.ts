// M96, the notch HeyClicky style: small, then it opens out (docs/milestones/M96-heyclicky-notch.md). The founder, 15 Nov 2026,
// on the real M93 hover: "I don't like how it looks, just see how HeyClicky does it", then "it starts small and then when we
// go to settings then it opens up", and "yeah" to the mock. These tests hold the three states and when each shows, the one
// pill in every state, the name in every odd case, that nothing takes the keys at rest or while pointing, and the small chat.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initial, type HistoryItem, type Model } from "./model.ts";
import type { ReviewCard } from "./review.ts";
import { HOVER_H, HOVER_W, NAME_SHOWN_MAX, hoverAction, hoverGreeting, hoverPill, type HoverActionId } from "./notchMinimal.ts";
import { CHAT, CHAT_MAX, chatAsk, chatBubbles, chatClosesAway, chatHolds, chatWhen, notchNext, notchView, outcome, takesKeys, type NotchEvent, type NotchView } from "./notchChat.ts";
import { LAYOUT_H } from "./notchQuick.ts";
import { arrivalFrom } from "./home.ts";
import { OPEN_R } from "./homeShape.ts";
import { S } from "./strings.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const P = "/Users/me/signup-page";
const NOW = new Date(2026, 10, 15, 15, 0).getTime();
const at = (h: number, mi: number, day = 15) => new Date(2026, 10, day, h, mi).toISOString();
const row = (o: Partial<HistoryItem> = {}): HistoryItem => ({ id: 1, label: "Make the signup button work", status: "done", usd: 0, startedAt: at(14, 30), endedAt: at(14, 41), checkpoint: "cp_9", changed: 2, proof: "passed", ...o });
const batch = (count: number, o: Partial<ReviewCard> = {}): ReviewCard => ({ project: P, batch: "rv_1a2b", stage: "ready", files: [], count, capped: false, secretFiles: [], auto: false, proof: false, asked: false, fix: null, note: null, result: null, ...o });
const m = (o: Partial<Model> = {}): Model => ({ ...initial(), runnerUp: true, connected: "api_key", folder: P, ...o });
const approval = { id: "ap_1", agent: "a", tool: "Bash", risk: "network", summary: "curl example.com", detail: "curl example.com" } as unknown as Model["approvals"][number];
const failing = (): Model => m({ history: [row({ status: "not_done", proof: "failed" })] });
const undoable = (): Model => m({ history: [row()], receipt: { checkpoint: "cp_9", changed: [{ file: "src/a.ts", kind: "modified" }], commands: 0, notUndoable: [], usdEstimate: 0, proof: "partial" } as Model["receipt"] });

describe("the greeting: a lowercase hey and the first name", () => {
  test("blank, missing or not a string says hey there", () => {
    for (const v of ["", "   ", "\n\t", null, undefined, 42, {}, ["Sam"], "🙂"]) expect(hoverGreeting(v)).toBe("hey there");
  });
  test("one word, and a full name says only its first word, in lowercase as the mock says it", () => {
    expect(hoverGreeting("Rishabh")).toBe("hey rishabh");
    expect(hoverGreeting("  rishabh ")).toBe("hey rishabh");
    expect(hoverGreeting("Rishabh Kapadia")).toBe("hey rishabh");
    expect(hoverGreeting("Jean-Luc Picard")).toBe("hey jean-luc");
    expect(hoverGreeting("ZOË")).toBe("hey zoë");
  });
  test("odd characters: hidden, control and direction marks go; any script stays; drawn as text, never markup", () => {
    expect(hoverGreeting("‮Rishabh")).toBe("hey rishabh");
    expect(hoverGreeting("Ri​shabh")).toBe("hey ri");
    expect(hoverGreeting("ऋषभ कपाड़िया")).toBe("hey ऋषभ");
    expect(hoverGreeting("李雷")).toBe("hey 李雷");
    expect(hoverGreeting("\"Sam\",")).toBe("hey sam");
    expect(hoverGreeting("<b>Sam</b>")).toBe("hey b>sam</b");
  });
  test("a very long name is cut cleanly with an ellipsis, and the row's CSS cuts it again at any text size", () => {
    const g = hoverGreeting("Wolfeschlegelsteinhausenbergerdorff Smith");
    expect(Array.from(g.slice("hey ".length)).length).toBe(NAME_SHOWN_MAX);
    expect(g.endsWith("…")).toBe(true);
    expect(read("./ui/notch.css")).toMatch(/\.island-panel \.nb-greet \{[^}]*overflow: hidden; text-overflow: ellipsis; white-space: nowrap;/);
  });
});

describe("the one pill, in every state", () => {
  const act = (x: Model, o: Partial<Parameters<typeof hoverAction>[2]> = {}) => hoverAction(x, NOW, { layout: "quick", ...o });
  const cases: [string, () => Model, HoverActionId, string, boolean, Partial<Parameters<typeof hoverAction>[2]>?][] = [
    ["the engine stopped", () => m({ runnerUp: false }), "seeWhy", "See why", false],
    ["Claude not set up yet", () => m({ connected: "none" }), "home", "Open Home", false],
    ["a question waits", () => m({ approvals: [approval] }), "answer", "Answer", true],
    ["Claude Code waits on you", () => m({ claudeWaiting: { project: P, message: "" } }), "claude", "See what Claude asks", true],
    ["no project", () => m({ folder: null }), "pick", "Pick a project", false],
    ["2 changes wait", () => m({ review: batch(2) }), "review", "2 changes to review", true],
    ["1 change waits", () => m({ review: batch(1) }), "review", "1 change to review", true],
    ["a check failed", failing, "fix", "Fix it", false],
    ["the last fix can be undone", undoable, "undo", "Undo last change", false],
    ["not checked yet", () => m(), "check", "Check my project", false],
    ["nothing waits", () => m({ history: [row()] }), "check", "Check my project", false],
    ["a job runs", () => m(), "stop", "Stop", false, { layout: "job" }],
  ];
  for (const [name, x, id, words, dot, o] of cases) test(name, () => {
    const a = act(x(), o);
    expect(a.id).toBe(id);
    expect(hoverPill(a, x())).toEqual({ words, dot });
    // Every press but Stop opens Home at a place the shell knows; Stop sends the stop itself.
    if (id === "stop") expect(a.go).toBeNull();
    else { expect(a.go).not.toBeNull(); if (a.go!.then) expect(arrivalFrom(a.go!)).not.toBeNull(); }
  });
  test("a tool turned off, or the buttons off, is Open Home; Stop and the engine's own action stay whatever is off", () => {
    expect(act(m({ review: batch(2) }), { on: (t) => t !== "review" }).id).toBe("home");
    expect(act(m(), { on: (t) => t !== "findProblem" }).id).toBe("home");
    expect(act(m(), { buttons: false }).id).toBe("home");
    expect(act(m(), { layout: "job", buttons: false }).id).toBe("stop");
    expect(act(m({ runnerUp: false }), { buttons: false }).id).toBe("seeWhy");
  });
  test("Undo last change follows the Undo tool's own switch (F20): off, the pill offers a check instead", () => {
    expect(act(undoable()).id).toBe("undo");
    expect(act(undoable(), { on: (t) => t !== "undo" }).id).toBe("check");
    expect(act(undoable(), { on: (t) => t !== "undo" && t !== "findProblem" }).id).toBe("home");
  });
  test("Undo last change only asks Home's own Undo question: nothing is undone from the notch", () => {
    expect(act(undoable()).go).toEqual({ then: { do: "undo" } });
    expect(read("./islandPanel.tsx")).not.toMatch(/undoTo|undo\.request|restoreCheckpoint/);
  });
  test("no icon in the pill, no Open Home words, no line row, no check boxes: the face, the hello and the pill", () => {
    const panel = read("./islandPanel.tsx");
    const at = panel.indexOf('className="nb-row"'), end = panel.indexOf("</div>", panel.indexOf('className="nb-pill"'));
    const hover = panel.slice(at, end);
    expect(at).toBeGreaterThan(0);
    // Feel round 3 (19 Nov 2026), changed on purpose: the founder's HeyClicky reference of 18 Nov 2026 asks for a headline, one hint line and a row with the pill and a small round Open Home. The pill itself still has no icon; Open Home is a round icon button beside it, and a review's
    // news leads with its tick or cross.
    const pillOnly = panel.slice(panel.indexOf('className="nb-pill"'), panel.indexOf("</button>", panel.indexOf('className="nb-pill"')));
    expect(pillOnly).not.toContain("<Icon");
    for (const gone of ["<Tile", "ip-home", "ip-line", "ip-act-row", "type=\"checkbox\""]) expect(hover).not.toContain(gone);
    expect(hover).toContain('className="nb-hint"');
    expect(panel).toContain('className="nb-open"');
    expect(hover).toContain("<FlowMini");
    expect(hover).toContain('className="nb-greet"');
    expect(hover).toContain('className="nb-pill"');
  });
});

describe("which state shows when", () => {
  test("from what the shell says", () => {
    expect(notchView({ pointing: false, homeOpen: false, chat: false })).toBe("rest");
    expect(notchView({ pointing: true, homeOpen: false, chat: false })).toBe("pointing");
    expect(notchView({ pointing: true, homeOpen: true, chat: true })).toBe("opened");
    expect(notchView({ pointing: false, homeOpen: true, chat: false })).toBe("home");
  });
  const steps: [NotchView, NotchEvent, NotchView][] = [
    ["rest", "point", "pointing"], ["pointing", "leave", "rest"],
    ["pointing", "clickHello", "opened"], ["rest", "askKey", "opened"], ["pointing", "askKey", "opened"],
    ["opened", "esc", "rest"], ["opened", "clickOutside", "rest"], ["opened", "leave", "opened"],
    ["opened", "settings", "home"], ["opened", "expand", "home"],
    ["pointing", "pressAction", "home"], ["pointing", "clickNotch", "home"], ["rest", "clickNotch", "home"],
    ["home", "esc", "rest"], ["home", "clickOutside", "rest"], ["home", "askKey", "home"],
    // Founder round 1 (17 Nov 2026, "when I open the chat, I cannot close it fully"): the chat's own Close, and a second
    // click on the notch, fold it back.
    ["opened", "close", "rest"], ["opened", "clickNotch", "rest"], ["home", "close", "rest"],
  ];
  for (const [from, e, to] of steps) test(`${from} + ${e} = ${to}`, () => expect(notchNext(from, e)).toBe(to));
  test("Stop everything hides all, from every state", () => {
    for (const v of ["rest", "pointing", "opened", "home"] as NotchView[]) expect(notchNext(v, "stop")).toBe("rest");
  });
  test("with the small chat off, the greeting and the ask key open all of Home, as before", () => {
    expect(notchNext("pointing", "clickHello", { smallChat: false })).toBe("home");
    expect(notchNext("rest", "askKey", { smallChat: false })).toBe("home");
  });
  test("the shell is wired the same way (main.rs, island.rs)", () => {
    const main = read("../src-tauri/src/main.rs"), island = read("../src-tauri/src/island.rs");
    expect(main).toContain('fn island_chat(app: AppHandle) { open_card(&app, "notch_chat", false); }');
    expect(main).toContain('keymap::Action::Card => open_card(app, "ask_key", true),');
    expect(island).toContain('!was_open && on && island && matches!(source, "notch_chat" | "ask_key")');
    // Esc in Home closes it; Stop everything closes it at once and the island goes back to the bare notch.
    // Changed on purpose (founder round 1): Esc is heard on the window while Home shows, so it closes wherever the keys are.
    expect(read("./card.tsx")).toContain('if (e.key === "Escape" && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); box.current?.blur(); player.current.hush(); closeHome(); }');
    // Feel round 1 (18 Nov 2026): closeHome starts the fold on the page at once, then tells the shell.
    expect(read("./card.tsx")).toContain('const closeHome = () => { homeStage.close(); void invoke("close_card"); };');
    expect(read("./card.tsx")).toContain('window.addEventListener("keydown", onEsc);');
    expect(main).toContain('home_stop_now("stop_everything")');
  });
});

describe("the keys: never taken at rest or while pointing", () => {
  test("only in the chat or Home, and only after a click into it or the ask key", () => {
    for (const v of ["rest", "pointing"] as NotchView[]) for (const clickedIn of [false, true]) for (const askKey of [false, true]) expect(takesKeys(v, { clickedIn, askKey })).toBe(false);
    expect(takesKeys("opened", { clickedIn: false, askKey: false })).toBe(false);
    expect(takesKeys("opened", { clickedIn: true, askKey: false })).toBe(true);
    expect(takesKeys("opened", { clickedIn: false, askKey: true })).toBe(true);
  });
  test("the island's panel never focuses anything, and the greeting opens the chat without the keyboard", () => {
    const panel = read("./islandPanel.tsx");
    expect(panel).not.toMatch(/\.focus\(|autoFocus|makeKey/);
    expect(panel).toContain('invoke("island_chat")');
    // Home's own field takes the keys only when the shell says a key opened it (opened.keyboard), as before.
    // Changed on purpose (M110, 23 Nov 2026): focus after one frame (16 ms) instead of 30 ms, so keyboard open stays under budget.
    expect(read("./card.tsx")).toContain("else if (keyboard) setTimeout(() => box.current?.focus(), 16);");
    // Changed on purpose (QA1, 19 Nov 2026): the one focus call is Tab going round the chat's own controls, on the person's
    // own Tab press inside it (tabRound); nothing else in the chat ever moves the keys.
    const chatSrc = read("./notchChat.tsx");
    expect(chatSrc.replace(/const tabRound = [\s\S]*?\n  \};\n/, "")).not.toMatch(/autoFocus|\.focus\(/);
    expect(chatSrc.match(/\.focus\(/g)?.length ?? 0).toBe(1);
  });
});

describe("the sizes are one number on both sides", () => {
  const rs = read("../src-tauri/src/island.rs");
  const num = (re: RegExp) => Number(re.exec(rs)![1]);
  test("pointing: one row about 330 wide and 42 tall, inside the shell's limits", () => {
    // Feel round 3 (the founder's HeyClicky reference, 18 Nov 2026): 96 tall now, a headline, a hint and the pill row.
    expect([HOVER_W, HOVER_H]).toEqual([330, 96]);
    expect(LAYOUT_H).toEqual({ quick: HOVER_H, job: HOVER_H });
    expect(HOVER_W).toBeGreaterThanOrEqual(num(/pub const PANEL_W_MIN: f64 = ([\d.]+);/));
    expect(HOVER_W).toBeLessThanOrEqual(num(/pub const PANEL_W: f64 = ([\d.]+);/));
    expect(HOVER_H).toBeGreaterThanOrEqual(num(/pub const PANEL_MIN: f64 = ([\d.]+);/));
    const css = read("./ui/notch.css");
    expect(css).toContain(`.island-panel[data-layout="quick"], .island-panel[data-layout="job"] { width: ${HOVER_W}px; height: ${HOVER_H}px;`);
    // The bottom corners about 20, the same as the shell's click through.
    expect(read("./style.css")).toContain(".island.notch { --r-open: 20px; }");
    expect(rs).toContain("pub const PANEL_R_NOTCH: f64 = 20.0;");
    // The island tells the shell the width it draws, with the height.
    expect(read("./island.tsx")).toContain("panelW");
  });
  test("opened: about 460 by 300 with the notch's row, its corners Home's own (24, the mock says about 26)", () => {
    expect(CHAT).toEqual({ w: 460, h: 266 });
    expect(rs).toContain(`pub const CHAT: HomeSize = HomeSize { w: ${CHAT.w}.0, min_h: ${CHAT.h}.0, max_h: ${CHAT.h}.0 };`);
    expect(OPEN_R).toBe(24);
  });
  test("one short spring to grow and shrink, about 220 ms, a fade with Reduce Motion", () => {
    const css = read("./ui/notch.css");
    expect(read("./ui/tokens.css")).toMatch(/--dur-notch-row: 220ms;/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^}]*\.island-panel\[data-shown\]\[data-layout\]/);
  });
});

describe("the small chat: the recent news as bubbles", () => {
  test("the person's asks and Squibby's plain answers, oldest first, then what is at work and what waits", () => {
    const x = m({ history: [row({ id: 1, label: "fix the email check", startedAt: at(14, 0), endedAt: at(14, 10) }), row({ id: 2, label: "put the password check back", status: "not_done", proof: "failed", failedCheck: "npm test", startedAt: at(14, 40), endedAt: at(14, 41) })], review: batch(2), claudeWaiting: { project: P, message: "" } });
    const b = chatBubbles(x, P);
    // Changed on purpose (feel round 2, 19 Nov 2026): the chat showed only the newest task over empty dots. It shows the
    // recent thread, oldest at the top, and scrolls; older work is in Home's History.
    expect(CHAT_MAX).toBe(14);
    // Tasks are cut whole, never one bubble of a pair (founder round 1). Both tasks show now, in the order they were asked.
    expect(b.map((y) => [y.who, y.words])).toEqual([
      ["you", "fix the email check"], ["squibby", S.m96.chat.proven(2)],
      ["you", "put the password check back"], ["squibby", S.m96.chat.failedCheck("npm test")], ["squibby", S.m96.chat.claude], ["squibby", S.m96.chat.review(2)],
    ]);
    expect(chatBubbles(m({ history: x.history }), P).map((y) => y.words)).toEqual(["fix the email check", S.m96.chat.proven(2), "put the password check back", S.m96.chat.failedCheck("npm test")]);
  });
  test("only the newest few, never more than fit", () => {
    const many = Array.from({ length: 9 }, (_, i) => row({ id: i + 1, label: `task ${i}`, startedAt: at(10 + i, 0), endedAt: at(10 + i, 5) }));
    const b = chatBubbles(m({ history: many, review: batch(3) }), P, { hint: "Type a few words first." });
    // Changed on purpose (founder round 1): the newest task's ask and answer stay together even when what waits fills the
    // room, so at most the newest pair over CHAT_MAX.
    expect(b.length).toBeLessThanOrEqual(CHAT_MAX + 1);
    expect(b[0]!.who).toBe("you");
    expect(b.at(-1)!.words).toBe("Type a few words first.");
    expect(b.some((y) => y.words === "task 8")).toBe(true);   // the newest task's ask, with its answer after it
    expect(b.some((y) => y.words === "task 0")).toBe(false);
    // Feel round 2: the recent thread, in the order asked (two tasks or more, not only the newest).
    const asks = b.filter((y) => y.who === "you").map((y) => y.words);
    expect(asks.length).toBeGreaterThan(1);
    expect(asks).toEqual([...asks].sort((p, q) => Number(p.split(" ")[1]) - Number(q.split(" ")[1])));
  });
  test("each outcome in plain words", () => {
    expect(outcome(row({ proof: null, changed: 1 }))).toBe("Finished, not checked yet. It changed 1 file.");
    expect(outcome(row({ changed: 0 }))).toBe("Done, and the checks pass.");
    expect(outcome(row({ status: "interrupted" }))).toBe("Stopped.");
    expect(outcome(row({ undone: true }))).toBe(S.m96.chat.undone);
    expect(outcome(row({ status: "not_done" }))).toBe("It did not finish.");
  });
  test("only proof says done (rule 14): failed, partial, skipped and no proof are never called Done", () => {
    const C = S.m96.chat;
    expect(outcome(row({ proof: "passed", changed: 2 }))).toBe(C.proven(2));
    expect(outcome(row({ proof: "failed", changed: 2 }))).toBe(C.checksFailed);
    expect(outcome(row({ proof: "partial", changed: 2 }))).toBe(C.partial);
    expect(outcome(row({ proof: "skipped", changed: 2 }))).toBe(C.unchecked(2));
    expect(outcome(row({ proof: null, changed: 0 }))).toBe(C.unchecked(0));
    for (const proof of ["failed", "partial", "skipped", null]) expect(outcome(row({ proof })), String(proof)).not.toMatch(/^Done/);
    expect(C.unchecked(null)).toBe("Finished, not checked yet.");
    expect(JSON.stringify(Object.keys(C))).not.toContain('"done"');
  });
  test("the bubbles that point somewhere say where: changes to review, Claude Code waiting, a failed check", () => {
    const x = m({ history: [row({ status: "not_done", proof: "failed", failedCheck: "npm test" })], review: batch(2), claudeWaiting: { project: P, message: "" } });
    const b = chatBubbles(x, P);
    // Changed on purpose (round 1): the failed task's ask now shows above its answer.
    expect(b.map((y) => y.go ?? null)).toEqual([null, "now", "now", "review"]);
    // Feel round 2: the failed reply, and only it, offers the Fix it pill.
    expect(b.map((y) => y.fix ?? null)).toEqual([null, true, null, null]);
    expect(chatBubbles(m({ history: [row()] }), P).every((y) => !y.go)).toBe(true);
  });
  test("the field says which project an ask goes to", () => {
    expect(chatAsk(P)).toBe("Ask about signup-page…");
    expect(chatAsk("/Users/me/signup-page/")).toBe("Ask about signup-page…");
    expect(chatAsk("")).toBe(S.m96.chat.ask);
  });
  test("the task at work is said, another project's news is not, and nothing says an invite", () => {
    const live = m({ task: { agent: "b1", project: P, label: "make the button blue", lines: [], costUsd: 0 } });
    expect(chatBubbles(live, P).map((y) => y.words)).toEqual(["make the button blue", S.m96.chat.working]);
    expect(chatBubbles(m({ review: batch(2, { project: "/Users/me/other" }), claudeWaiting: { project: "/Users/me/other" } }), P).map((y) => y.words)).toEqual([S.m96.chat.empty("signup-page")]);
    expect(chatBubbles(m({ runnerUp: false }), P)[0]!.words).toBe(S.m96.chat.off);
  });
  // Changed on purpose (feel round 2, 19 Nov 2026): the clock is when the oldest task shown was asked, not when it ended.
  test("the time line: Today and the clock of the oldest task shown, when it was asked", () => {
    expect(chatWhen(m({ history: [row()] }), P, NOW)).toEqual({ day: "Today", time: "2:30 pm" });
    expect(chatWhen(m({ history: [row({ startedAt: at(9, 5, 14), endedAt: at(9, 5, 14) })] }), P, NOW)?.day).toBe("Yesterday");
    expect(chatWhen(m(), P, NOW)).toBeNull();
  });
  // Feel round 2: two tasks asked on two days, both shown in the order asked, each day under its own time line, stamped
  // from its own task's time.
  test("each day's tasks under their own time line, in the order asked", () => {
    const x = m({ history: [row({ id: 2, label: "add an email check", startedAt: at(14, 0), endedAt: at(14, 20), checkpoint: "cp_2" }), row({ id: 1, label: "make the signup button work", startedAt: at(9, 5, 14), endedAt: at(9, 9, 14), checkpoint: "cp_1" })] });
    const b = chatBubbles(x, P, { now: NOW });
    expect(b.filter((y) => y.who === "you").map((y) => y.words)).toEqual(["make the signup button work", "add an email check"]);
    expect(b.filter((y) => y.when).map((y) => [y.words, y.when])).toEqual([["make the signup button work", { day: "Yesterday", time: "9:05 am" }], ["add an email check", { day: "Today", time: "2:00 pm" }]]);
    // Without the time, no lines are stamped (the old callers).
    expect(chatBubbles(x, P).some((y) => y.when)).toBe(false);
  });
  test("anything that needs a card of its own opens the chat out to all of Home", () => {
    const ok = { onboarded: true, vague: false, noProject: false, handoff: false, attached: 0, freshNotice: false, freshResult: false };
    expect(chatHolds(m({ history: [row()], review: batch(2) }), ok)).toBe(true);
    expect(chatHolds(m({ approvals: [approval] }), ok)).toBe(false);
    expect(chatHolds(m({ plan: { agent: "a", steps: ["x"], truncated: false, estimateUsd: 0 } }), ok)).toBe(false);
    expect(chatHolds(m(), { ...ok, vague: true })).toBe(false);
    expect(chatHolds(m(), { ...ok, noProject: true })).toBe(false);
    expect(chatHolds(m(), { ...ok, onboarded: false })).toBe(false);
  });
  test("what the chat cannot show opens it out too: voice, a notice or an error, files to send, a new result", () => {
    const ok = { onboarded: true, vague: false, noProject: false, handoff: false, attached: 0, freshNotice: false, freshResult: false };
    expect(chatHolds(m(), ok)).toBe(true);
    // Hold to talk: the listening line, a model to download, the microphone refused. Home draws each with its light.
    // Changed on purpose (QA1, 19 Nov 2026): listening, writing the words down and the words heard stay in the chat, which
    // says it listens (qa1.test.ts); the rest still open Home, where their buttons and light are.
    for (const stage of ["needs_model", "needs_mic", "mic_refused", "error"]) expect(chatHolds(m({ voice: { stage, message: "x" } }), ok), stage).toBe(false);
    expect(chatHolds(m({ error: "The engine stopped." }), ok)).toBe(false);
    expect(chatHolds(m({ notice: "Flow is off." }), { ...ok, freshNotice: true })).toBe(false);
    expect(chatHolds(m(), { ...ok, attached: 1 })).toBe(false);
    expect(chatHolds(m({ receipt: undoable().receipt }), { ...ok, freshResult: true })).toBe(false);
    // An old notice or result from before the chat opened does not throw it open at once.
    expect(chatHolds(m({ notice: "old", receipt: undoable().receipt }), ok)).toBe(true);
  });
});

describe("the look: the black, one lavender blue, words in strings.ts", () => {
  const tokens = read("./ui/tokens.css");
  test("the lavender blue and the dotted grid are named tokens, and the old lime never shows here", () => {
    for (const t of ["--lav-1: #DFE8FF;", "--lav-2: #A9C1FF;", "--lav-ink: #13213D;", "--chat-them: #2A2B2F;", "--chat-grid:"]) expect(tokens).toContain(t);
    for (const f of ["./ui/notch.css", "./ui/black.css", "./notchChat.tsx", "./islandPanel.tsx"]) expect(read(f)).not.toMatch(/lime/i);
  });
  test("the lavender is only on the pill, the person's bubble, the mic and the field: one accent, never a surface", () => {
    const sheets = ["./ui/notch.css", "./ui/black.css", "./ui/parts.css", "./ui/home.css", "./style.css"].map(read).join("\n");
    const rules = sheets.split("}").filter((r) => /var\(--lav-/.test(r)).map((r) => r.split("{")[0]!.trim());
    expect(rules.length).toBeGreaterThan(0);
    // Feel round 3 (19 Nov 2026): the small chat's suggestions are the same lavender pill (the founder's HeyClicky reference).
    for (const sel of rules) expect(sel, sel).toMatch(/\.nb-pill|\.nc-me|\.nc-mic|\.nc-field|\.nc-pill/);
  });
  test("every word is in strings.ts, and none has an em dash", () => {
    for (const f of ["./notchChat.ts", "./notchChat.tsx", "./notchMinimal.ts"]) {
      const src = read(f).replace(/^\s*(\/\/|\/\*\*|\*).*$/gm, "");
      expect(src, f).not.toMatch(/"(hey|Today|Ask|Send|Settings|Undo last change|Check my project)[ "]/);
      expect(src, f).not.toMatch(/#[0-9a-f]{3,6}\b|rgba?\(/i);
    }
    expect(JSON.stringify(S.m96)).not.toContain("—");
  });
  test("real SVG icons for Settings and Open all of Home, never emoji or text glyphs", () => {
    const chat = read("./notchChat.tsx");
    expect(chat).toContain('<Icon name="gear"');
    expect(chat).toContain('<Icon name="expand"');
    expect(chat).not.toMatch(/[⚙⤢↑]/);
    expect(read("./icons.tsx")).toMatch(/^ {2}expand: </m);
  });
});

// Founder round 1 (17 Nov 2026): "when I open the chat, I cannot close it fully", and the chat showed an answer above a
// question it never showed, and Working on it for a task that had finished.
describe("round 1: the chat's order, what is live, and closing it", () => {
  const two = [row({ id: 1, label: "fix the signup form", checkpoint: "cp_1", startedAt: at(11, 0), endedAt: at(11, 20) }), row({ id: 2, label: "make the button blue", checkpoint: "cp_2", startedAt: at(11, 30), endedAt: at(11, 35) })];
  test("two finished tasks never start with an answer whose ask was cut", () => {
    const b = chatBubbles(m({ history: two }), P);
    expect(b[0]!.who).toBe("you");
    // Changed on purpose (feel round 2, 19 Nov 2026): the recent thread shows, each ask with its answer, in the order asked.
    expect(b.map((y) => y.words)).toEqual(["fix the signup form", S.m96.chat.proven(2), "make the button blue", S.m96.chat.proven(2)]);
    expect(chatBubbles(m({ history: two, review: batch(2) }), P).map((y) => y.words)).toEqual(["fix the signup form", S.m96.chat.proven(2), "make the button blue", S.m96.chat.proven(2), S.m96.chat.review(2)]);
  });
  test("asks show in the order they were asked, not the order they ended", () => {
    const slow = [row({ id: 1, label: "first ask", checkpoint: "cp_1", startedAt: at(11, 0), endedAt: at(12, 0), changed: 0 }), row({ id: 2, label: "second ask", checkpoint: "cp_2", startedAt: at(11, 10), endedAt: at(11, 20), changed: 0 })];
    // Changed on purpose (feel round 2): both show now, the first asked first, though it ended last.
    expect(chatBubbles(m({ history: slow }), P).map((y) => y.words)).toEqual(["first ask", S.m96.chat.proven(0), "second ask", S.m96.chat.proven(0)]);
  });
  test("no answer is ever first without its ask, for any number of tasks and waits", () => {
    for (let n = 0; n <= 5; n++) for (const waits of [{}, { review: batch(2) }, { review: batch(2), claudeWaiting: { project: P, message: "" } }]) {
      const hist = Array.from({ length: n }, (_, i) => row({ id: i + 1, label: `task ${i}`, checkpoint: `cp_${i}`, startedAt: at(10 + i, 0), endedAt: at(10 + i, 5) }));
      const b = chatBubbles(m({ history: hist, ...waits }), P);
      for (let i = 0; i < b.length; i++) if (b[i]!.key.startsWith("sq:") && b[i]!.key !== "sq:empty") expect(b[i - 1]?.who, `${n} ${JSON.stringify(waits)}`).toBe("you");
    }
  });
  test("a finished task with its receipt and its History row says no Working on it and is not said twice", () => {
    const task = { agent: "b1", project: P, checkpoint: "cp_2", label: "make the button blue", lines: [], costUsd: 0 };
    const b = chatBubbles(m({ history: two, task, receipt: { ...undoable().receipt!, checkpoint: "cp_2" } }), P);
    expect(b.map((y) => y.words)).not.toContain(S.m96.chat.working);
    expect(b.filter((y) => y.words === "make the button blue").length).toBe(1);
    // Before its History row came: still no Working on it once its receipt is here.
    expect(chatBubbles(m({ task, receipt: { ...undoable().receipt!, checkpoint: "cp_2" } }), P).map((y) => y.words)).not.toContain(S.m96.chat.working);
  });
  test("the task at work keeps its bubbles' keys when it becomes a History row, so the words never animate in twice", () => {
    const task = { agent: "b1", project: P, checkpoint: "cp_2", label: "make the button blue", lines: [], costUsd: 0 };
    const live = chatBubbles(m({ task }), P).map((y) => y.key);
    const after = chatBubbles(m({ history: [two[1]!] }), P).map((y) => y.key);
    expect(live).toEqual(after);
  });
  test("a task at work in another project is said, so Stop and the greyed Send have a reason", () => {
    const task = { agent: "b1", project: "/Users/me/other-shop", label: "fix it", lines: [], costUsd: 0 };
    const b = chatBubbles(m({ task }), P);
    expect(b.map((y) => y.words)).toEqual([S.m96.chat.workingIn("other-shop")]);
    expect(chatBubbles(m({ task, receipt: undoable().receipt }), P).map((y) => y.words)).toEqual([S.m96.chat.empty("signup-page")]);
    // Work the engine runs in another folder (Home shows none of it): named while its agent is busy, gone once it rests.
    expect(chatBubbles(m({ away: { b2: "/Users/me/other-shop" }, agents: { b2: "working" } }), P).map((y) => y.words)).toEqual([S.m96.chat.workingIn("other-shop")]);
    expect(chatBubbles(m({ away: { b2: "/Users/me/other-shop" }, agents: { b2: "idle" } }), P).map((y) => y.words)).toEqual([S.m96.chat.empty("signup-page")]);
  });
  test("a click elsewhere always folds the chat (nothing it holds waits for a tap), except words being typed in it", () => {
    expect(chatClosesAway(true, false)).toBe(true);
    expect(chatClosesAway(true, true)).toBe(false);
    expect(chatClosesAway(false, false), "Close Home when I click another app off").toBe(false);
    const card = read("./card.tsx");
    expect(card).toMatch(/listen\("home-click-away", \(\) => \{ if \(chatOn\.current \? chatClosesAway\(/);
    expect(card).toMatch(/listen\("home-pointer-left", \(\) => \{ if \(chatOn\.current \? chatClosesAway\(/);
  });
  test("the chat has its own Close, a quiet icon button with an existing drawing and words", () => {
    const chat = read("./notchChat.tsx");
    expect(chat).toContain('<Icon name="close"');
    expect(chat).toContain("aria-label={C.close}");
    expect(S.m96.chat.close).toBe("Close");
  });
  test("Flowflow's face is in the chat's top row only while it lives in the notch (the founder: not on there)", () => {
    const chat = read("./notchChat.tsx"), panel = read("./islandPanel.tsx"), island = read("./island.tsx");
    // Changed on purpose (round 2): the handle stays mounted for the whole drag so the let go is never lost; while it is
    // pulled out only the face inside hides (data-out). Still never drawn on the edge.
    expect(chat).toMatch(/\{tucked && <span className="nc-face-hold" data-tucked="" data-out=\{out\.dragging/);
    expect(panel).toMatch(/\{tucked && <FlowMini className="ip-face nb-face"/);
    expect(panel).toContain('data-out={out.dragging ? "" : undefined}');
    // The notch's take line is words and the glow only: Flowflow itself is under the pointer.
    const take = island.slice(island.indexOf('className="island-take"'), island.indexOf("</div>", island.indexOf('className="island-take"')));
    expect(take).not.toContain("FlowMini");
  });
});
