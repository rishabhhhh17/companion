// M93: a minimal notch hover, a greeting and one action (docs/milestones/M93-minimal-hover.md). The founder, 14 Nov 2026,
// on the real app, with a shot of the M84 hover panel: "I don't like this, it's too much for just a notch. It just needs
// to be like 'Hey Rishabh' and some CTA." These tests hold the new panel: the greeting's name in every odd case, at most
// one short line and only when it matters, and the one action for every state.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initial, type HistoryItem, type Model } from "./model.ts";
import type { ReviewCard } from "./review.ts";
import { HOVER_H, NAME_SHOWN_MAX, firstName, hoverAction, hoverGreeting, hoverLine, type HoverActionId } from "./notchMinimal.ts";
import { LAYOUT_H } from "./notchQuick.ts";
import { arrivalFrom, islandLineKind } from "./home.ts";
import { S } from "./strings.ts";
import { MEANING_COLOUR } from "./meaning.ts";
import { PAGES, placeOf } from "./settingsPages.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const P = "/Users/me/signup-page";
const NOW = new Date(2026, 10, 14, 15, 0).getTime();
const at = (h: number, mi: number) => new Date(2026, 10, 14, h, mi).toISOString();
const row = (o: Partial<HistoryItem> = {}): HistoryItem => ({ id: 1, label: "Make the signup button work", status: "done", usd: 0, startedAt: at(14, 0), endedAt: at(14, 14), checkpoint: "cp_9", changed: 2, proof: "passed", ...o });
const batch = (count: number, o: Partial<ReviewCard> = {}): ReviewCard => ({ project: P, batch: "rv_1a2b", stage: "ready", files: [], count, capped: false, secretFiles: [], auto: false, proof: false, asked: false, fix: null, note: null, result: null, ...o });
const m = (o: Partial<Model> = {}): Model => ({ ...initial(), runnerUp: true, connected: "api_key", folder: P, ...o });
const approval = { id: "ap_1", agent: "a", tool: "Bash", risk: "network", summary: "curl example.com", detail: "curl example.com" } as unknown as Model["approvals"][number];
const failing = (): Model => m({ history: [row({ status: "not_done", proof: "failed" })] });

// M96 changed the greeting on purpose (the founder approved the HeyClicky style mock, 15 Nov 2026): lowercase, "hey rishabh"
// and "hey there". The first word and its cleaning are unchanged; m96Notch.test.ts holds the rest.
describe("the greeting: hey and the first name, or hey there", () => {
  test("blank, missing or not a string says hey there", () => {
    for (const v of ["", "   ", "\n\t", null, undefined, 42, {}, ["Sam"]]) {
      expect(firstName(v)).toBe("");
      expect(hoverGreeting(v)).toBe("hey there");
    }
    expect(S.m96.heyThere).toBe("hey there");
  });
  test("one word is said, in lowercase", () => {
    expect(hoverGreeting("Rishabh")).toBe("hey rishabh");
    expect(hoverGreeting("  Rishabh  ")).toBe("hey rishabh");
    expect(hoverGreeting("sam")).toBe("hey sam");
  });
  test("a full name says only its first word", () => {
    expect(hoverGreeting("Rishabh Kapadia")).toBe("hey rishabh");
    expect(hoverGreeting("Mary   Ann  Smith")).toBe("hey mary");
    expect(hoverGreeting("Jean-Luc Picard")).toBe("hey jean-luc");
    expect(hoverGreeting("O'Brien")).toBe("hey o'brien");
  });
  test("odd characters: hidden, control and direction marks go; letters of any script stay; stray punctuation at the ends goes", () => {
    expect(firstName("Ri\u200bshabh")).toBe("Ri");   // a zero width space splits the word, never joins it invisibly
    expect(firstName("\u202eRishabh")).toBe("Rishabh");
    expect(firstName("Ri\u0000shabh Kapadia")).toBe("Ri");
    expect(firstName("\"Sam\",")).toBe("Sam");
    expect(firstName("Zoë")).toBe("Zoë");
    expect(firstName("José María")).toBe("José");
    expect(firstName("ऋषभ कपाड़िया")).toBe("ऋषभ");
    expect(firstName("李雷")).toBe("李雷");
    expect(firstName("🙂")).toBe("");
    expect(hoverGreeting("🙂 ")).toBe("hey there");
    expect(firstName("<b>Sam</b>")).toBe("b>Sam</b");   // drawn as text by React, never as markup
  });
  test("a very long name is cut with an ellipsis, never splitting a letter", () => {
    const long = "Wolfeschlegelsteinhausenbergerdorff";
    const n = firstName(long);
    expect(Array.from(n).length).toBe(NAME_SHOWN_MAX);
    expect(n.endsWith("…")).toBe(true);
    expect(n.startsWith("Wolfeschlegelst")).toBe(true);
    expect(firstName("A".repeat(NAME_SHOWN_MAX))).toBe("A".repeat(NAME_SHOWN_MAX));
    const emojiish = "😀".repeat(3) + "Sam" + "x".repeat(40);
    expect(Array.from(firstName(emojiish)).length).toBeLessThanOrEqual(NAME_SHOWN_MAX);
    expect(firstName("ऋ".repeat(40)).length).toBeGreaterThan(0);
  });
  test("the name is only what the person typed: nothing reads the Mac account (F28), and it stays on this Mac", () => {
    const src = read("./notchMinimal.ts");
    for (const no of ["invoke(", "fetch(", "NSFullUserName", "whoami", "id -F", "send_command"]) expect(src).not.toContain(no);
    const panel = read("./islandPanel.tsx");
    expect(panel).toContain('const greet = hoverGreeting(useSetting("you.name"));');
  });
});

describe("at most one short line, only when it matters", () => {
  test("nothing when all is quiet", () => {
    for (const x of [m(), m({ history: [row()] }), m({ folder: null }), m({ history: [row()], sinceCheck: { project: P, changed: true } })]) expect(hoverLine(x, NOW)).toBeNull();
  });
  test("each line that matters, first that holds", () => {
    expect(hoverLine(m({ runnerUp: false }), NOW)?.words).toBe(S.m93.line.off);
    expect(hoverLine(m({ connected: "none" }), NOW)?.words).toBe(S.m93.line.notReady);
    expect(hoverLine(m({ approvals: [approval] }), NOW)?.words).toBe(S.m93.line.questions(1));
    // The M93 review (changed on purpose): one wording for Claude waiting, the same as the notch's own line and its setting.
    expect(hoverLine(m({ claudeWaiting: { project: P, message: "" } as Model["claudeWaiting"] }), NOW)?.words).toBe("Claude is waiting for you");
    expect(hoverLine(m({ review: batch(2) }), NOW)?.words).toBe("2 changes to review");
    expect(hoverLine(m({ review: batch(1) }), NOW)?.words).toBe("1 change to review");
    expect(hoverLine(failing(), NOW)?.words).toBe("A check failed");
    expect(hoverLine(m({ review: batch(2) }), NOW, { reviewKey: true })?.words).toBe(S.panel.reviewKey);
    expect(hoverLine(m({ history: [row()] }), NOW, { unseen: 2 })?.words).toBe(S.panel.unseen(2));
    expect(hoverLine(m(), NOW, { job: "Make the signup button work" })?.words).toBe("Make the signup button work");
    // A line the island has to say (listening, an update) comes before the project's own.
    expect(hoverLine(m({ review: batch(2) }), NOW, { note: "Listening" })?.words).toBe("Listening");
  });
  test("Claude Code waiting in another project is not said here", () => {
    expect(hoverLine(m({ claudeWaiting: { project: "/Users/me/other", message: "" } as Model["claudeWaiting"] }), NOW)).toBeNull();
  });
  test("each line has its meaning's colour", () => {
    expect(hoverLine(failing(), NOW)?.colour).toBe("red");
    expect(hoverLine(m({ review: batch(2) }), NOW)?.colour).toBe("orange");
    expect(hoverLine(m({ runnerUp: false }), NOW)?.colour).toBe("red");
  });
});

describe("one primary action that fits the moment, in every state", () => {
  const act = (x: Model, o: Partial<Parameters<typeof hoverAction>[2]> = {}) => hoverAction(x, NOW, { layout: "quick", ...o });
  const cases: [string, Model, HoverActionId, Record<string, string> | null, Partial<Parameters<typeof hoverAction>[2]>?][] = [
    ["the engine stopped", m({ runnerUp: false }), "seeWhy", {}],
    ["Claude not set up yet", m({ connected: "none" }), "home", {}],
    ["a question waits", m({ approvals: [approval] }), "answer", {}],
    ["Claude Code waits on you", m({ claudeWaiting: { project: P, message: "" } as Model["claudeWaiting"] }), "claude", {}],
    ["no project", m({ folder: null }), "pick", {}],
    ["changes to review", m({ review: batch(2) }), "review", { then: { do: "review" } } as never],
    ["a check failed", failing(), "fix", { then: { do: "find" } } as never],
    ["not checked yet", m(), "check", { then: { do: "find" } } as never],
    ["changed since the last check", m({ history: [row()], sinceCheck: { project: P, changed: true } }), "check", { then: { do: "find" } } as never],
    // M96 (changed on purpose): with nothing waiting the pill offers a check; asking is the small chat, from the hello.
    ["all fine", m({ history: [row()] }), "check", { then: { do: "find" } } as never],
    ["a job runs", m(), "stop", null, { layout: "job" }],
    ["a job runs with buttons off", m(), "stop", null, { layout: "job", buttons: false }],
  ];
  for (const [name, x, id, go, o] of cases) test(name, () => {
    const a = act(x, o);
    expect(a.id).toBe(id);
    expect(a.label).toBe(S.m96.act[id]);
    if (go === null) expect(a.go).toBeNull();
    else { expect(a.go).toEqual(go as never); if (a.go!.then) expect(arrivalFrom(a.go!)).not.toBeNull(); }
  });
  test("Stop is the only press that acts by itself; every other one only opens Home (island_go)", () => {
    expect(act(m(), { layout: "job" }).go).toBeNull();
    for (const [, x, id, , o] of cases) if (id !== "stop") expect(act(x, o).go).not.toBeNull();
  });
  test("an action whose tool is turned off falls back to Open Home; buttons off leaves only Open Home", () => {
    expect(act(m({ review: batch(2) }), { on: (t) => t !== "review" }).id).toBe("home");
    expect(act(m(), { on: (t) => t !== "findProblem" }).id).toBe("home");
    expect(act(m({ history: [row()] }), { on: (t) => t !== "findProblem" }).id).toBe("home");
    expect(act(m(), { buttons: false }).id).toBe("home");
    // The engine stopped and a question still lead with their one action whatever is turned off.
    expect(act(m({ runnerUp: false }), { buttons: false }).id).toBe("seeWhy");
  });
  test("M96 (changed on purpose): no quiet Open Home beside the pill; the small chat's expand button opens all of Home", () => {
    // Feel round 3 (19 Nov 2026), changed on purpose: the founder's HeyClicky reference of 18 Nov 2026 asks for a headline, one hint line and a row with the pill and a small round Open Home. Open Home is back as a small round icon button, never as words, and only when the pill is not
    // already Open Home.
    expect(read("./islandPanel.tsx")).toContain('{action.id !== "home" && <button className="nb-open"');
    expect(read("./notchChat.tsx")).toContain("onClick={onExpand}");
  });
  test("each action has a look from the meaning colours, never a new colour", () => {
    expect(act(failing()).look).toEqual({ colour: "red", icon: "wrench" });
    expect(act(m({ review: batch(2) })).look).toEqual({ colour: "orange", icon: "eye" });
    expect(act(m()).look).toEqual({ colour: "green", icon: "tick" });
  });
});

// M96 changed the size on purpose (the founder approved the HeyClicky style mock, 15 Nov 2026): one 42 point row.
describe("the panel shrinks to one row, and keeps the safety behaviour", () => {
  test("one row, inside the shell's limits; CSS and the layout say the same", () => {
    // Feel round 3 (19 Nov 2026), changed on purpose: the founder's HeyClicky reference of 18 Nov 2026 asks for a headline, one hint line and a row with the pill and a small round Open Home: 96 points.
    expect(HOVER_H).toBe(96);
    expect({ ...LAYOUT_H } as Record<string, number>).toEqual({ quick: HOVER_H, job: HOVER_H });
    const rs = read("../src-tauri/src/island.rs");
    const min = Number(/pub const PANEL_MIN: f64 = ([\d.]+);/.exec(rs)![1]), max = Number(/pub const PANEL_MAX: f64 = ([\d.]+);/.exec(rs)![1]);
    expect(HOVER_H).toBeGreaterThanOrEqual(min);
    expect(HOVER_H).toBeLessThanOrEqual(max);
    expect(HOVER_H).toBeLessThan(120);
    expect(read("./ui/notch.css")).toContain(`.island-panel[data-layout="quick"], .island-panel[data-layout="job"] { width: 330px; height: ${HOVER_H}px;`);
  });
  test("the panel draws only the face, the greeting, the line and the action; the M84 rows are gone from it", () => {
    const panel = read("./islandPanel.tsx");
    for (const gone of ["ip-ai", "ip-card", "ip-foot", "ip-key", "RunwayRing mark", "ip-word", "ip-progress", "toolsRow(", "latestReview(", "nextPeek(", "usePanelTools"]) expect(panel).not.toContain(gone);
    expect(panel).toContain('className="ip-face nb-face"');
    expect(panel).toContain('className="nb-greet"');
    expect(panel).toContain('className="nb-pill"');
    // Every press but Stop goes through island_go; Stop sends the stop command as before. M96: the face and the hello open
    // the small chat (island_chat) in place of the quiet Open Home.
    expect(panel).toContain('invoke("island_go", action.go)');
    expect(panel).toContain('invoke("island_chat")');
    expect(panel).toContain("cmd: stopAgent()");
    // The panel sends nothing on opening (the M84 ask for the AI tools moved to Home, which already asks).
    expect(panel).not.toContain("showDoneSignal");
  });
  test("the words and colours live in strings.ts and tokens.css, never in the logic", () => {
    const src = read("./notchMinimal.ts").replace(/^\s*(\/\/|\/\*\*|\*).*$/gm, "");
    expect(src).not.toMatch(/"(Hey|Stop|Open Home|Fix it|Check my project)/);
    expect(src).not.toMatch(/#[0-9a-f]{3,6}\b|rgb\(/i);
  });
});

describe("nothing is lost: each fact the old hover showed has a place in Home", () => {
  test("the AI tools, the practice offer, the key, the review, Settings and the usage ring", () => {
    const card = read("./card.tsx");
    // The AI tools: Home's side list (M84) and Now's Connect row (M82).
    expect(card).toContain("sideTools(m, doneTools)");
    expect(card).toContain("<AiToolsNowRow");
    // The latest review and its Undo: Now's timeline of today and the receipt.
    expect(card).toContain("todayLine(");
    // The key to press: at the foot of the ask box.
    expect(card).toContain("barKeyChord(keys)");
    // Settings: Home's own place. The practice offer: Learn.
    expect(read("./homeSide.tsx")).toContain('tabId("settings")');
    // M93: the usage ring moves to Now.
    expect(card).toContain("<NowRunway m={m} />");
  });
});

// The M93 review: words and places that still described the M84 panel, one wording for one signal, and leftovers.
describe("the M93 review", () => {
  const set = S.set as Record<string, { label: string; help: string }>;
  test("Claude waiting has one wording everywhere, and the note is known by its kind, never by its words", () => {
    expect<string>(S.m93.line.claude).toBe(S.guard.waitingWhy(""));
    const here = m({ claudeWaiting: { project: P, message: "" } as Model["claudeWaiting"] });
    const said = `${S.needsYouTitle}: ${S.guard.waitingWhy("signup-page")}`;
    expect(hoverLine(here, NOW, { note: said, noteKind: "claudeWaiting" })).toEqual(hoverLine(here, NOW)!);
    expect(hoverLine(here, NOW)!.words).toBe(S.m93.line.claude);
    // A note that only happens to hold the same words is said as it is.
    expect(hoverLine(here, NOW, { note: said })?.words).toBe(said);
    expect(read("./notchMinimal.ts")).not.toContain("S.guard.waitingWhy(\"\")");
    // The island tells the panel which line it says (home.ts islandLineKind), and the panel passes it on.
    expect(islandLineKind(here)).toBe("claudeWaiting");
    expect(islandLineKind(m({ approvals: [approval], claudeWaiting: { project: P, message: "" } as Model["claudeWaiting"] }))).toBeNull();
    expect(islandLineKind(m({ runnerUp: false, claudeWaiting: { project: P, message: "" } as Model["claudeWaiting"] }))).toBeNull();
    expect(islandLineKind(m())).toBeNull();
    expect(read("./islandPanel.tsx")).toContain("noteKind");
  });
  test("Fix it takes the failing meaning's colour, never a bare colour", () => {
    expect(hoverAction(failing(), NOW, { layout: "quick" }).look.colour).toBe(MEANING_COLOUR.problem);
    expect(read("./notchMinimal.ts")).not.toMatch(/colour: "red"/);
  });
  test("the usage ring's setting says Now in Home and sits beside the warning, not under Notch", () => {
    expect(set["runway.mark"].help).toContain("Now in Home");
    expect(set["runway.mark"].help).toContain(S.m93.runwayLabel);
    expect(set["runway.mark"].help).not.toMatch(/notch's panel/);
    expect((S.short as Record<string, string>)["runway.mark"]).not.toMatch(/notch/i);
    expect(placeOf("runway.mark")).toMatchObject({ topic: "more.account.spending" });
    const spending = PAGES.account.more.find((t) => t.id === "more.account.spending")!.items;
    expect(spending.indexOf("runway.mark")).toBe(spending.indexOf("runway.warnAt") - 1);
    expect(PAGES.general.more.find((t) => t.id === "more.general.notch")!.items).not.toContain("runway.mark");
  });
  test("the notch's settings describe the M93 hover", () => {
    const buttons = set["panel.showButtons"];
    expect(buttons.label).toBe("Show an action in the notch");
    expect(buttons.help).toContain("Open Home");
    expect(buttons.help).toContain("Stop");
    expect(buttons.help).not.toMatch(/Settings|foot|Check before going live/);
    expect(set["island.showStep"].help).not.toContain("The small panel always shows the step");
    expect(set["island.showStep"].help).toContain("Home's work card always shows the step.");
    const work = set["panel.showWork"].help;
    expect(work).not.toContain("a card for each piece of work");
    expect(work).toMatch(/question/);
    expect(work).toContain("only in Home");
  });
  test("no leftover styles from the removed panel", () => {
    expect(read("./ui/notch.css")).not.toContain(".island-panel .ip-dot[data-tone] { flex: none; }");
    expect(read("./style.css")).not.toContain(".island-panel .ip-status {");
  });
});
