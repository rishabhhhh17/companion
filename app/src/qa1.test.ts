// QA1 (the 19 Nov 2026 functionality check, docs/milestones/QA1-fixes.md): the page's own decisions behind what it found.
// The chat shows the AI's answer and keeps a plain answer in the chat; a send still waiting for the engine holds the next
// one; the busy line goes once nothing works and never shows above the newest ask; talking from the chat stays in the chat;
// Explain an error with no shortcut says to paste; with fixing off nothing is sent; a fix from the review card has a plain
// name; Bring back is offered on a History row after an Undo, in words that fit what the task did; a click on the notch's
// news opens Home; and Tab goes round the chat instead of getting lost.
import { describe, expect, test } from "bun:test";
import { initial, type HistoryItem, type Model, type Receipt } from "./model.ts";
import { chatBubbles, chatFocusNext, chatHolds, resultStaysInChat, type ChatLocal } from "./notchChat.ts";
import { withPending } from "./notchChat.tsx";
import { askHintNow, askRoute } from "./homeHero.ts";
import { explainBoxHint, KEYS_START, type Keys } from "./keys.ts";
import { taskName } from "./itemLook.ts";
import { bringBackOffer } from "./history.ts";
import { rowPressOpens } from "./notchMinimal.ts";
import { verdictOf } from "./verdict.ts";
import { historyFacts } from "./model.ts";
import { S } from "./strings.ts";

const P = "/Users/me/shop";
const row = (o: Partial<HistoryItem> = {}): HistoryItem => ({ id: 1, label: "What changed today?", status: "done", usd: 0, startedAt: new Date(Date.now() - 60_000).toISOString(), endedAt: new Date().toISOString(), checkpoint: "cp_4", changed: 0, proof: null, ...o });
const receipt = (o: Partial<Receipt> = {}): Receipt => ({ checkpoint: "cp_4", changed: [], commands: 0, notUndoable: [], usdEstimate: 0, ...o });
const m = (o: Partial<Model> = {}): Model => ({ ...initial(), runnerUp: true, connected: "api_key", folder: P, ...o });
const local: ChatLocal = { onboarded: true, vague: false, noProject: false, handoff: false, attached: 0, freshNotice: false, freshResult: false };

describe("QA1: the chat shows the AI's answer", () => {
  test("a finished question shows what the AI said, as Squibby's bubble under the ask", () => {
    const b = chatBubbles(m({ history: [row()], receipt: receipt({ said: "Two files changed today: index.html and sum.js." }) }), P);
    expect(b.map((x) => [x.who, x.words])).toEqual([["you", "What changed today?"], ["squibby", "Two files changed today: index.html and sum.js."]]);
  });
  test("before its History row arrives, the answer still shows under the ask", () => {
    const task = { agent: "builder-1", label: "What changed today?", checkpoint: "cp_4", project: P } as unknown as Model["task"];
    // Changed on purpose (QA1 review): the receipt says the task ended done; one that did not say gets its proof line too.
    const b = chatBubbles(m({ task, receipt: receipt({ said: "Nothing changed today.", end: "done" }) }), P);
    expect(b.map((x) => x.words)).toEqual(["What changed today?", "Nothing changed today."]);
  });
  test("a task that changed files keeps its checked words after the answer", () => {
    const b = chatBubbles(m({ history: [row({ label: "Make the button blue", changed: 1, proof: "passed" })], receipt: receipt({ said: "The button is blue now.", changed: [{ file: "a.css", kind: "modified" }], proof: "passed" }) }), P);
    expect(b.map((x) => x.words)).toEqual(["Make the button blue", "The button is blue now.", S.m96.chat.proven(1)]);
  });
  test("an answer that changed nothing stays in the chat; one that changed files or asks something opens Home", () => {
    // Changed on purpose (QA1 review): a plain answer stays in the chat only when the engine said the task ended done; a
    // receipt that did not say how it ended is never read as done (M45).
    expect(resultStaysInChat(receipt({ said: "Yes.", end: "done" }))).toBe(true);
    expect(resultStaysInChat(receipt({ changed: [{ file: "a.css", kind: "modified" }] }))).toBe(false);
    expect(resultStaysInChat(receipt({ said: "Which colour?", asks: true }))).toBe(false);
    expect(resultStaysInChat(receipt({ notUndoable: ["sent an email"] }))).toBe(false);
  });
});

describe("QA1 review: the chat never shows the AI's claim with no proof line (rule 14)", () => {
  const ended = (r: Partial<Receipt>, label = "Fix the tests") => {
    const task = { agent: "builder-1", label, checkpoint: "cp_4", project: P } as unknown as Model["task"];
    return m({ task, receipt: receipt({ said: "Fixed, all tests pass.", ...r }) });
  };
  test("a task whose last words claim the checks pass, with nothing changed, shows what its proof found after the claim", () => {
    const b = chatBubbles(ended({ end: "done", proof: "failed", claimedPassed: true }), P);
    expect(b.map((x) => x.words)).toEqual(["Fix the tests", "Fixed, all tests pass.", S.m96.chat.checksFailed]);
    expect(resultStaysInChat(receipt({ said: "Fixed, all tests pass.", end: "done", proof: "failed", claimedPassed: true }))).toBe(false);
    // The claim alone is enough, whatever the proof said.
    expect(resultStaysInChat(receipt({ said: "Fixed, all tests pass.", end: "done", claimedPassed: true }))).toBe(false);
  });
  test("a task that ended in an error or a limit says so after its words, never a done", () => {
    for (const r of [{ end: "failed" as const, failWhy: "error" as const }, { end: "limit" as const, limit: "spending" as const }, {}]) {
      const b = chatBubbles(ended(r), P);
      expect(b.map((x) => x.words)).toEqual(["Fix the tests", "Fixed, all tests pass.", S.m96.chat.notDone]);
      expect(resultStaysInChat(receipt({ said: "Fixed, all tests pass.", ...r }))).toBe(false);
    }
    const stopped = chatBubbles(ended({ end: "stopped" }), P);
    expect(stopped.at(-1)!.words).toBe(S.m96.chat.stopped);
  });
  test("a plain answer that ended done and claims nothing stays only the answer", () => {
    const b = chatBubbles(ended({ end: "done", said: "Nothing changed today." }, "What changed today?"), P);
    expect(b.map((x) => x.words)).toEqual(["What changed today?", "Nothing changed today."]);
  });
  test("once its History row arrives, a claim with failed proof keeps its proof line", () => {
    const h = row({ label: "Fix the tests", proof: "failed" });
    const b = chatBubbles(m({ history: [h], receipt: receipt({ said: "Fixed, all tests pass.", end: "done", proof: "failed", claimedPassed: true }) }), P);
    expect(b.map((x) => x.words)).toEqual(["Fix the tests", "Fixed, all tests pass.", S.m96.chat.checksFailed]);
  });
});

describe("QA1: the order of the chat's words", () => {
  test("the busy line comes after the newest ask, never above it", () => {
    const given = [{ key: "hint", who: "squibby" as const, words: S.askBusy }];
    expect(withPending(given, "Add a footer").map((b) => b.key)).toEqual(["you:pending", "sq:pending", "hint"]);
  });
  test("the busy line goes once nothing works; any other line stays", () => {
    expect(askHintNow(S.askBusy, false)).toBeNull();
    expect(askHintNow(S.askBusy, true)).toBe(S.askBusy);
    expect(askHintNow(S.typeFirst, false)).toBe(S.typeFirst);
    expect(askHintNow(null, true)).toBeNull();
  });
});

describe("QA1: a send still waiting for the engine", () => {
  test("holds the next ask, as work does", () => {
    expect(askRoute({ prompt: "Add a footer", project: P, newFolder: false, working: false, starting: true })).toBe("busy");
    expect(askRoute({ prompt: "Add a footer", project: P, newFolder: false, working: false, starting: false })).toBe("here");
  });
});

describe("QA1: with fixing off", () => {
  test("an ask is never sent: it stays in the box with the reason", () => {
    expect(askRoute({ prompt: "make it blue", project: P, newFolder: false, fixOff: true })).toBe("fixOff");
    expect(askRoute({ prompt: "make it blue", project: "", newFolder: true, fixOff: true })).toBe("fixOff");
    expect(askRoute({ prompt: "", project: P, newFolder: false, fixOff: true })).toBe("needWords");
    // F29: nobody adds a key, so the reason never asks for one.
    expect(S.askFixOff).not.toMatch(/key|API|sign in/i);
    // QA1 review: short, and never reads as if a check were running now.
    expect(S.askFixOff).not.toContain("Checking your project still works");
    expect(S.askFixOff).toContain("Your words are kept.");
    expect(S.sendFixOff).not.toMatch(/key|API|sign in/i);
  });
});

describe("QA1: talking from the small chat", () => {
  test("listening, writing the words down and the words heard stay in the chat", () => {
    for (const stage of ["listening", "transcribing", "heard"]) expect([stage, chatHolds(m({ voice: { stage, message: "" } as Model["voice"] }), local)]).toEqual([stage, true]);
  });
  test("a model to download, a blocked microphone or silence still open Home, where their buttons are", () => {
    for (const stage of ["needs_model", "downloading", "blocked", "silent"]) expect([stage, chatHolds(m({ voice: { stage, message: "x" } as Model["voice"] }), local)]).toEqual([stage, false]);
  });
  test("while it listens the chat says so", () => {
    const b = chatBubbles(m({ voice: { stage: "listening", message: "Listening." } as Model["voice"] }), P);
    expect(b.at(-1)?.words).toBe("Listening.");
  });
});

describe("QA1: Explain an error with the box empty", () => {
  test("with no shortcut it says to paste the error, never to add a shortcut", () => {
    const none: Keys = { ...KEYS_START, using: { ...KEYS_START.using, explain: null } };
    expect(explainBoxHint(none)).toBe(S.explainChipHintNoKeys);
  });
  test("with a shortcut it names it", () => {
    const k: Keys = { ...KEYS_START, using: { ...KEYS_START.using, explain: "cmd+shift+e" } };
    expect(explainBoxHint(k)).toContain("Paste an error in the box");
    expect(explainBoxHint(k)).not.toBe(S.explainChipHintNoKeys);
  });
});

describe("QA1: a fix from the review card has a plain name", () => {
  test("an older row named by the internal request reads as the plain name", () => {
    expect(taskName("Another AI tool just changed files in this project, and a review of that change found problems. Fix them. The lines that")).toBe(S.reviewFixName);
    expect(taskName("Before: Another AI tool just changed files in this project, and a review")).toBe(S.reviewFixName);
    expect(taskName("Before: Make the Join button green")).toBe("Make the Join button green");
  });
});

describe("QA1: Bring back after an Undo from History or Now", () => {
  // A list of one row: that row is the newest change in the project.
  const one = (h: HistoryItem) => bringBackOffer([h], h);
  test("a row an Undo took back, with its safety copy kept, offers Bring back", () => {
    expect(one(row({ changed: 2, proof: "passed", undone: true, undoSafety: "cp_9" }))).toEqual({ safety: "cp_9", fix: true });
  });
  test("a task that did not pass offers to bring its changes back, never a fix", () => {
    expect(one(row({ changed: 2, proof: "failed", status: "not_done", undone: true, undoSafety: "cp_9" }))).toEqual({ safety: "cp_9", fix: false });
  });
  test("nothing is offered once it is back, with no safety copy, or for a task that changed nothing", () => {
    expect(one(row({ changed: 2, undone: true, back: true, undoSafety: "cp_9" }))).toBeNull();
    expect(one(row({ changed: 2, undone: true }))).toBeNull();
    expect(one(row({ changed: 0, undone: true, undoSafety: "cp_9" }))).toBeNull();
    expect(one(row({ changed: 2, undoSafety: "cp_9" }))).toBeNull();
  });
  test("nothing is offered once a later task changed files: bringing back would take that later work away", () => {
    const old = row({ id: 1, changed: 2, proof: "passed", undone: true, undoSafety: "cp_9" });
    const later = row({ id: 2, label: "Make the footer grey", changed: 1, proof: "passed", checkpoint: "cp_10" });
    expect(bringBackOffer([later, old], old)).toBeNull();
    // A later question that changed nothing does not stand in the way.
    const asked = row({ id: 3, label: "What changed today?", changed: 0, checkpoint: "cp_11" });
    expect(bringBackOffer([asked, old], old)).toEqual({ safety: "cp_9", fix: true });
  });
  test("nothing is offered while a task is working on the project, or for a row that is not in the list", () => {
    const old = row({ id: 1, changed: 2, proof: "passed", undone: true, undoSafety: "cp_9" });
    const running = row({ id: 2, status: "running", changed: 0, checkpoint: "cp_10" });
    expect(bringBackOffer([running, old], old)).toBeNull();
    expect(bringBackOffer([], old)).toBeNull();
  });
  test("one Undo that took back several tasks offers Bring back once, on the newest of them", () => {
    const a = row({ id: 1, changed: 2, proof: "passed", undone: true, undoSafety: "cp_9" });
    const b = row({ id: 2, changed: 1, proof: "passed", undone: true, undoSafety: "cp_9", checkpoint: "cp_5" });
    const list = [b, a];
    expect(list.map((h) => bringBackOffer(list, h))).toEqual([{ safety: "cp_9", fix: true }, null]);
  });
  test("the result of a task that failed says its changes are back, never the fix", () => {
    const v = verdictOf({ ...historyFacts({ status: "not_done", proof: "failed", changed: 2, undone: true, back: true }) });
    expect(v.headline).toBe(S.verdict.backChanges);
    const ok = verdictOf({ ...historyFacts({ status: "done", proof: "passed", changed: 2, undone: true, back: true }) });
    expect(ok.headline).toBe(S.verdict.back);
  });
});

describe("QA1: a click on the notch's news", () => {
  test("opens Home on that news; the plain hello opens the chat", () => {
    expect(rowPressOpens({ words: "The button is blue now.", news: true })).toBe("home");
    expect(rowPressOpens({ words: "hey sam", news: false })).toBe("chat");
  });
});

describe("QA1: Tab in the small chat", () => {
  test("goes round: past the last control back to the first, and back from the first to the last", () => {
    expect(chatFocusNext(6, 5, false)).toBe(0);
    expect(chatFocusNext(6, 0, true)).toBe(5);
    expect(chatFocusNext(6, 2, false)).toBeNull();
    expect(chatFocusNext(6, -1, false)).toBe(0);
    expect(chatFocusNext(0, 0, false)).toBeNull();
  });
});

describe("QA1: Bring back on Now's last fix", () => {
  test("the last fix an Undo took back offers Bring back on its row", async () => {
    const { lastFix, nowRows } = await import("./homeRest.ts");
    const h = row({ label: "Add a contact form", changed: 2, proof: "passed", undone: true, undoSafety: "cp_9" });
    const fix = lastFix([h], Date.now());
    const rows = nowRows({ fix, since: [], practice: false, undo: false, bringBack: bringBackOffer([h], h), now: Date.now() });
    expect(rows.find((r) => r.id.startsWith("fix:"))?.action).toBe("bringBack");
    const plain = nowRows({ fix, since: [], practice: false, undo: false, now: Date.now() });
    expect(plain.find((r) => r.id.startsWith("fix:"))?.action).toBeNull();
  });
});

describe("QA1: the shared fixture", () => {
  test("the engine's undone row with its safety copy reaches History as a Bring back, and the plain name reads as is", async () => {
    const { readFileSync } = await import("node:fs");
    const { reduce } = await import("./model.ts");
    const line = readFileSync(new URL("../../protocol/fixtures/events.jsonl", import.meta.url), "utf8").split("\n").find((l) => l.includes('"id":"eqa1u"'))!;
    const after = reduce(m(), JSON.parse(line));
    expect(after.history.map((h) => bringBackOffer(after.history, h))).toEqual([{ safety: "cp_0004", fix: true }, null]);
    expect(taskName(after.history[1]!.label)).toBe(S.reviewFixName);
  });
});

describe("QA1: fixing off in the chat says it once", () => {
  test("the line about the words not sent replaces the plain line, never adds a second one", () => {
    const off = m({ connected: "none" as Model["connected"] });
    expect(chatBubbles(off, P).map((b) => b.words)).toEqual([S.m96.chat.notReady]);
    expect(chatBubbles(off, P, { hint: S.askFixOff }).map((b) => b.words)).toEqual([S.askFixOff]);
  });
});

describe("QA1 review: the news headline's cover under it", () => {
  test("is there only with a hint line, and never sits over the pill or Open Home", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(new URL("./ui/notch.css", import.meta.url), "utf8");
    const after = css.split("\n").filter((l) => l.includes("button.nb-hi::after"));
    expect(after.length).toBe(1);
    expect(after[0]).toContain(".nb-row[data-news]:has(> .nb-hint)");
    expect(css).toMatch(/\.nb-row\[data-news\] :is\(button\.nb-pill, button\.nb-open\) \{ position: relative; z-index: 1; \}/);
  });
});
