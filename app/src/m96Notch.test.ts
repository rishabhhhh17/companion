// M96, the notch HeyClicky style: small, then it opens out (docs/milestones/M96-heyclicky-notch.md). The founder, 15 Nov 2026,
// on the real M93 hover: "I don't like how it looks, just see how HeyClicky does it", then "it starts small and then when we
// go to settings then it opens up", and "yeah" to the mock. These tests hold the three states and when each shows, the one
// pill in every state, the name in every odd case, that nothing takes the keys at rest or while pointing, and the small chat.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initial, type HistoryItem, type Model } from "./model.ts";
import type { ReviewCard } from "./review.ts";
import { HOVER_H, HOVER_W, NAME_SHOWN_MAX, hoverAction, hoverGreeting, hoverPill, type HoverActionId } from "./notchMinimal.ts";
import { CHAT, CHAT_MAX, chatAsk, chatBubbles, chatHolds, chatWhen, notchNext, notchView, outcome, takesKeys, type NotchEvent, type NotchView } from "./notchChat.ts";
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
    for (const gone of ["<Tile", "<Icon", "ip-home", "S.m93.openHome", "ip-line", "ip-act-row", "type=\"checkbox\""]) expect(hover).not.toContain(gone);
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
    expect(read("./card.tsx")).toContain('if (e.key === "Escape" && !composing(e)) { e.preventDefault(); box.current?.blur(); player.current.hush(); void invoke("close_card"); }');
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
    expect(read("./card.tsx")).toContain("else if (keyboard) setTimeout(() => box.current?.focus(), 30);");
    expect(read("./notchChat.tsx")).not.toMatch(/autoFocus|\.focus\(/);
  });
});

describe("the sizes are one number on both sides", () => {
  const rs = read("../src-tauri/src/island.rs");
  const num = (re: RegExp) => Number(re.exec(rs)![1]);
  test("pointing: one row about 330 wide and 42 tall, inside the shell's limits", () => {
    expect([HOVER_W, HOVER_H]).toEqual([330, 42]);
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
    // The newest CHAT_MAX (3) fit the chat at the usual text size: the older ones are in Home's History.
    expect(CHAT_MAX).toBe(3);
    expect(b.map((y) => [y.who, y.words])).toEqual([
      ["squibby", S.m96.chat.failedCheck("npm test")], ["squibby", S.m96.chat.claude], ["squibby", S.m96.chat.review(2)],
    ]);
    expect(chatBubbles(m({ history: x.history }), P).map((y) => y.words)).toEqual([S.m96.chat.proven(2), "put the password check back", S.m96.chat.failedCheck("npm test")]);
  });
  test("only the newest few, never more than fit", () => {
    const many = Array.from({ length: 9 }, (_, i) => row({ id: i + 1, label: `task ${i}`, startedAt: at(10 + i, 0), endedAt: at(10 + i, 5) }));
    const b = chatBubbles(m({ history: many, review: batch(3) }), P, { hint: "Type a few words first." });
    expect(b.length).toBeLessThanOrEqual(CHAT_MAX);
    expect(b.at(-1)!.words).toBe("Type a few words first.");
    expect(b.some((y) => y.key === "sq:9")).toBe(true);   // the newest task's answer
    expect(b.some((y) => y.words === "task 0")).toBe(false);
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
    expect(b.map((y) => y.go ?? null)).toEqual(["now", "now", "review"]);
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
  test("the time line: Today and the clock of the oldest task shown", () => {
    expect(chatWhen(m({ history: [row()] }), P, NOW)).toEqual({ day: "Today", time: "2:41 pm" });
    expect(chatWhen(m({ history: [row({ startedAt: at(9, 5, 14), endedAt: at(9, 5, 14) })] }), P, NOW)?.day).toBe("Yesterday");
    expect(chatWhen(m(), P, NOW)).toBeNull();
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
    for (const stage of ["listening", "needs_model", "needs_mic", "mic_refused", "error"]) expect(chatHolds(m({ voice: { stage, message: "x" } }), ok), stage).toBe(false);
    expect(chatHolds(m({ error: "The engine stopped." }), ok)).toBe(false);
    expect(chatHolds(m({ notice: "Flow is off." }), { ...ok, freshNotice: true })).toBe(false);
    expect(chatHolds(m(), { ...ok, attached: 1 })).toBe(false);
    expect(chatHolds(m({ receipt: undoable().receipt }), { ...ok, freshResult: true })).toBe(false);
    // An old notice or result from before the chat opened does not throw it open at once.
    expect(chatHolds(m({ notice: "old", receipt: undoable().receipt }), ok)).toBe(true);
  });
});

// Changed on purpose in M112 (the founder, 16 Nov 2026: "the notch feels a lot like HeyClicky... just change up the colors"):
// the lavender, its gradients and the dotted grid are gone; the notch and the chat read the character's habitat tokens
// (habitat.test.ts holds every habitat's values and contrast). The same behaviour, states and focus rules as before.
describe("the look: the habitat's black, one glow, words in strings.ts", () => {
  const tokens = read("./ui/tokens.css");
  test("no lavender, no gradient pill and no dotted grid anywhere; the old lime never shows here", () => {
    expect(tokens).not.toMatch(/--lav-|--chat-grid/);
    const sheets = ["./ui/notch.css", "./ui/black.css", "./ui/parts.css", "./ui/home.css", "./style.css"].map(read).join("\n");
    expect(sheets).not.toMatch(/var\(--lav-|var\(--chat-grid\)/);
    for (const f of ["./ui/notch.css", "./ui/black.css", "./notchChat.tsx", "./islandPanel.tsx"]) expect(read(f)).not.toMatch(/lime/i);
  });
  test("the pill, the person's bubble, the mic and the field read the habitat's tokens: one accent, never a surface", () => {
    const sheets = ["./ui/notch.css", "./ui/black.css"].map(read).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = (sel: string) => sheets.split("}").find((r) => r.split("{")[0]!.trim() === sel) ?? "";
    // Changed on purpose (M112 review, compared with the best): the pill is the accent filled when nothing waits, like Home's
    // main button; the dark membrane with the habitat's rim is only for something that waits (amber or red).
    expect(rule(".island-panel button.nb-pill")).toMatch(/background: var\(--acc\)/);
    expect(rule(".island-panel button.nb-pill")).toMatch(/color: var\(--acc-ink\)/);
    expect(rule('.island-panel button.nb-pill[data-c="orange"], .island-panel button.nb-pill[data-c="red"]')).toMatch(/var\(--hab-rim\)/);
    expect(rule('.island-panel button.nb-pill[data-c="orange"], .island-panel button.nb-pill[data-c="red"]')).toMatch(/background: var\(--hab-surface-2\)/);
    expect(rule(".notch-chat .nc-me")).toMatch(/var\(--hab-me\).*var\(--hab-me-ink\)/);
    expect(rule(".notch-chat .nc-mic")).toMatch(/var\(--hab-/);
    expect(rule(".notch-chat .nc-field")).toMatch(/var\(--hab-rim\)/);
    // The one thing to press in the chat is send, in the accent.
    expect(rule(".notch-chat .nc-send")).toMatch(/background: var\(--acc\)/);
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

// M112 review: the pill's light says whether something waits. Calm remaps every --c- hue to the accent, so the waiting
// lights read the meaning tokens Calm never touches; and only the accent's light breathes, never amber or red.
describe("the pill's light, in every colour setting", () => {
  const css = read("./ui/notch.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = css.split("}").map((r) => { const [s, b] = r.split("{"); return { sel: (s ?? "").split("\n").pop()!.trim(), body: b ?? "" }; });
  const light = (c: string) => {
    const hits = rules.filter((r) => r.sel.includes("button.nb-pill") && r.sel.includes(`[data-c="${c}"]`) && /--pill-light:/.test(r.body));
    return hits.map((r) => r.body.match(/--pill-light:\s*([^;]+)/)![1]!.trim());
  };
  test("amber to review and red for a risk, from the meaning tokens, never a --c- hue Calm turns into the accent", () => {
    expect(light("orange")).toEqual(["var(--amber)"]);
    expect(light("red")).toEqual(["var(--bad)"]);
    const tokens = read("./ui/tokens.css").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of tokens.matchAll(/\[data-colours="calm"\][^{]*\{([^}]*)\}/g)) expect(m[1]!).not.toMatch(/--(amber|bad|acc):/);
  });
  test("no orange or red pill breathes, with or without Reduce Motion", () => {
    const breathe = rules.filter((r) => /animation:\s*nb-breathe/.test(r.body));
    expect(breathe.length).toBeGreaterThan(0);
    for (const r of breathe) {
      expect(r.sel, r.sel).toContain(':not([data-c="orange"])');
      expect(r.sel, r.sel).toContain(':not([data-c="red"])');
    }
    // The Reduce Motion rule names the same pills, so it switches off exactly what breathes.
    const off = css.match(/@media \(prefers-reduced-motion: reduce\) \{ ([^{]*nb-pill[^{]*)\{ animation: none; \}/);
    expect(off?.[1]?.trim()).toBe(breathe[0]!.sel);
  });
});
