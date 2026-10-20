import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { askKey, draftToKeep, heardGoesTo, heardKind, MAX_DRAFT, putBack, sendsItself, sentOutcome, type FollowAim, type Sent } from "./askbox.ts";
import { AGENT } from "./commands.ts";

const k = (key: string, o: { shift?: boolean; composing?: boolean; alt?: boolean; meta?: boolean; ctrl?: boolean } = {}) =>
  askKey({ key, shift: !!o.shift, alt: !!o.alt, meta: !!o.meta, ctrl: !!o.ctrl, composing: !!o.composing });
const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");

describe("the ask box keys", () => {
  test("Return sends, as it always did", () => expect(k("Enter")).toBe("send"));
  test("Shift and Return starts a new line, and so does Option and Return", () => {
    expect(k("Enter", { shift: true })).toBe("newline");
    expect(k("Enter", { alt: true })).toBe("newline");
  });
  test("while an input method is composing (Japanese, Chinese, Korean), Return belongs to it", () => {
    expect(k("Enter", { composing: true })).toBeNull();
    expect(k("Enter", { composing: true, shift: true })).toBeNull();
  });
  test("other keys, and Return with Command or Control, are left alone", () => {
    expect(k("a")).toBeNull();
    expect(k("Tab")).toBeNull();
    expect(k("Enter", { meta: true })).toBeNull();
    expect(k("Enter", { ctrl: true })).toBeNull();
  });
  test("the box is several lines tall when needed, and its keys go through askKey", () => {
    expect(card).toMatch(/<textarea ref=\{box\}/);
    expect(card).toContain("askKey({");
    expect(card).not.toMatch(/<input ref=\{box\}/);
  });
});

describe("words from hold to talk", () => {
  test("sent by themselves, they go with the folder and settings of now, not of when the setting was last changed", () => {
    const heard = card.slice(card.indexOf('ev.stage === "heard"'), card.indexOf('dispatch({ type: "ui.voiceClosed" })'));
    expect(heard).toContain("setTimeout(() => submitNow.current(), 0)");
    expect(heard).not.toMatch(/setTimeout\(\(\) => submit\(\)/);
    expect(card).toContain("const submitNow = useRef(submit); submitNow.current = submit;");
  });
});

describe("the draft kept on this Mac", () => {
  test("what is typed is kept, as typed, with its new lines", () => {
    expect(draftToKeep("Make the signup button blue\nand bigger", false)).toBe("Make the signup button blue\nand bigger");
  });
  test("nothing is kept for an empty box", () => {
    expect(draftToKeep("", false)).toBeNull();
    expect(draftToKeep("  \n ", false)).toBeNull();
  });
  test("nothing is kept off the record", () => expect(draftToKeep("Fix the login page", true)).toBeNull());
  test("a draft that holds something that looks like a key or a password is never kept", () => {
    expect(draftToKeep("use this key sk-ant-api03-abcdefghijklmnopqrstuvwx to call it", false)).toBeNull();
    expect(draftToKeep("the database password=hunter22 is wrong", false)).toBeNull();
    expect(draftToKeep("connect with postgres://me:secretpw@db.example.com/app", false)).toBeNull();
  });
  test("a very long draft is cut to its first part, never split inside a character", () => {
    const long = "é".repeat(MAX_DRAFT + 50);
    const kept = draftToKeep(long, false)!;
    expect(Array.from(kept).length).toBe(MAX_DRAFT);
    expect(draftToKeep("🙂".repeat(MAX_DRAFT + 1), false)).toBe("🙂".repeat(MAX_DRAFT));
  });
  test("the card keeps the draft through these rules, and clears it whenever the box is emptied by sending", () => {
    expect(card).toContain("draftToKeep(");
    const submit = card.slice(card.indexOf("const submit = () => {"), card.indexOf("// Which task broke it"));
    expect(submit).toContain("clearBox()");
    const plan = card.slice(card.indexOf("const plan = () => {"), card.indexOf("return (", card.indexOf("const plan = () => {")));
    expect(plan).toContain("clearBox()");
    const research = card.slice(card.indexOf("const research = () => {"), card.indexOf("const plan = () => {"));
    expect(research).toContain("clearBox()");
    expect(card).not.toMatch(/box\.current\.value = ""/);
  });
});

describe("a request the engine says no to is put back", () => {
  // Start empties the box at once. If the engine then refuses (a file it will not take, no Claude connected for a picture,
  // something else working on the project, the daily limit), the words and the files come back, so the person can do what
  // the refusal says: remove the file and press Start again, without typing it all and dragging every file in again.
  const ev = (type: string, o: Record<string, unknown> = {}) => ({ v: 1, id: "e", type, ...o });
  test("the task began once its before snapshot is taken", () => {
    expect(sentOutcome(ev("checkpoint.created", { agent: AGENT, project: "/p", checkpoint: "cp_1", label: "Before: x", files: 1, skipped: [] }), AGENT)).toBe("started");
  });
  test("a refusal for that agent, Stop before it began, or the engine stopping, puts it back", () => {
    expect(sentOutcome(ev("protocol.error", { agent: AGENT, reason: "Something else is already working on this project." }), AGENT)).toBe("refused");
    expect(sentOutcome(ev("agent.state", { agent: AGENT, state: "idle" }), AGENT)).toBe("refused");
    expect(sentOutcome(ev("app.runner_down"), AGENT)).toBe("refused");
  });
  test("anything else changes nothing: other agents, other errors, looking at the pictures", () => {
    expect(sentOutcome(ev("protocol.error", { reason: "Memory is not available." }), AGENT)).toBeNull();
    expect(sentOutcome(ev("protocol.error", { agent: "lesson-1", reason: "x" }), AGENT)).toBeNull();
    expect(sentOutcome(ev("checkpoint.created", { agent: "other" }), AGENT)).toBeNull();
    expect(sentOutcome(ev("agent.state", { agent: AGENT, state: "thinking" }), AGENT)).toBeNull();
    expect(sentOutcome(ev("tasks.listed", { tasks: [] }), AGENT)).toBeNull();
    expect(sentOutcome(null, AGENT)).toBeNull();
    expect(sentOutcome("protocol.error", AGENT)).toBeNull();
  });
  const sent: Sent<string> = { prompt: "Make the header match\nthe picture", attached: ["shot.png", "notes.md"], off: false };
  test("the words go back into an empty box, the files back onto the box, as they were", () => {
    expect(putBack(sent, { text: "", attached: [] })).toEqual({ text: "Make the header match\nthe picture", attached: ["shot.png", "notes.md"], off: false });
    expect(putBack(sent, { text: "  \n", attached: [] }).text).toBe("Make the header match\nthe picture");
  });
  test("never over something typed or added since", () => {
    expect(putBack(sent, { text: "a new request", attached: [] })).toEqual({ attached: ["shot.png", "notes.md"] });
    expect(putBack(sent, { text: "", attached: ["other.md"] })).toEqual({ text: "Make the header match\nthe picture", off: false });
    expect(putBack(sent, { text: "typed", attached: ["other.md"] })).toEqual({});
  });
  test("an off the record request comes back off the record, so its words are never kept on this Mac", () => {
    expect(putBack({ ...sent, off: true }, { text: "", attached: [] }).off).toBe(true);
  });
  test("nothing to put back for an empty request", () => {
    expect(putBack({ prompt: "", attached: [], off: false }, { text: "", attached: [] })).toEqual({});
  });
  test("the card keeps what Start sent in memory only, checks the files first, and puts it back on a refusal", () => {
    const submit = card.slice(card.indexOf("const submit = () => {"), card.indexOf("// Which task broke it"));
    // The engine's own check runs on the page first: a request it would refuse is never sent, and nothing is cleared.
    expect(submit).toMatch(/const added = forRequest\(attachedNow\.current\);\s*if \("error" in checkAttachments\(added\)\)/);
    expect(submit.indexOf("checkAttachments(added)")).toBeLessThan(submit.indexOf("void send("));
    expect(submit).toContain("sent.current = { prompt, attached: attachedNow.current, off };");
    expect(submit).toMatch(/void send\(startTask\(project, prompt, off, added\)\)\.catch\(\(e\) => \{ putBackSent\(\); explainRefusal\(e\); \}\)/);
    expect(card).toMatch(/listen\("runner-event", \(e\) => onSentEvent\.current\(e\.payload\)\)/);
    expect(card).toContain("sentOutcome(payload, AGENT)");
    // Never on disk: only the box's own draft rules decide what is kept, and a new folder forgets it.
    expect(card).not.toMatch(/localStorage\.setItem\([^)]*sent/i);
    expect(card).toMatch(/useEffect\(\(\) => \{ dropGen\.current \+= 1; clearAttached\(\); sent\.current = null; \}, \[project\]\);/);
  });
});

// HeyClicky v1.0.53 parity: voice starts work only on a clear request for work, and holds off when you say wait. With
// "Send spoken words automatically" on (talk.autoSend), three words or more used to start a paid task, so "Wait, hold on
// a sec" started one. Now the words wait in the box for Start whenever they mean wait or stop, or ask about the screen.
describe("spoken words that send themselves", () => {
  test("a clear request for work of three words or more sends itself, as before", () => {
    for (const t of ["Make the signup button blue", "fix the login page please", "Add a contact form to the home page."]) {
      expect(heardKind(t), t).toBe("work");
      expect(sendsItself(t), t).toBe(true);
    }
  });
  test("fewer than three words still wait in the box, as before", () => {
    for (const t of ["", "  ", "Deploy", "fix it"]) { expect(sendsItself(t), t).toBe(false); }
    expect(heardKind("fix it")).toBe("short");
  });
  test("words that are, start with or end with wait or stop never send themselves", () => {
    for (const t of ["Wait, hold on a sec", "wait wait wait", "Hold on, one second", "one second please let me think", "Not yet, I am still looking",
      "never mind, forget it", "Never mind that", "cancel that one please", "Stop. Do not do that.", "hang on a minute", "just a sec, let me check",
      "give me a second here", "Make the button blue. No wait.", "make the button blue, actually never mind", "change the title, hold on", "add a footer, not yet"]) {
      expect(heardKind(t), t).toBe("holdOff");
      expect(sendsItself(t), t).toBe(false);
    }
  });
  test("a word that only looks like one of them is not a hold off", () => {
    for (const t of ["Add a waiting list page", "make the stopwatch start at zero", "cancellation emails go to the wrong person"]) expect(heardKind(t), t).toBe("work");
  });
  test("a plain question about the screen waits in the box, with Show me offered", () => {
    for (const t of ["Where is the settings button?", "where do I click to publish this", "How do I turn on dark mode here", "what is this red box",
      "What does this error mean on the screen", "which button saves it", "show me where the deploy button is", "Can you show me how to share this"]) {
      expect(heardKind(t), t).toBe("screenQuestion");
      expect(sendsItself(t), t).toBe(false);
    }
  });
  test("English only at first: with another speech language picked, the words wait for Start", () => {
    expect(sendsItself("Make the signup button blue", "en")).toBe(true);
    expect(sendsItself("Make the signup button blue", "auto")).toBe(true);
    expect(sendsItself("Haz el botón azul por favor", "es")).toBe(false);
    expect(heardKind("Haz el botón azul por favor", "es")).toBe("otherLanguage");
    expect(sendsItself("बटन को नीला कर दो", "hi")).toBe(false);
  });
  test("the first run, Settings and the box's own switch say the new rule, not only three words", async () => {
    const { QUESTIONS } = await import("./onboarding.ts");
    const { S } = await import("./strings.ts");
    const q = QUESTIONS.find((x) => x.key === "autoSend")!;
    for (const t of [q.yesEffect, S.set["talk.autoSend"].help, S.voiceAutoSend]) {
      expect(t, t).toMatch(/wait|stop/i);
      expect(/[–—]/.test(t), t).toBe(false);
    }
    for (const t of [S.voiceWaitsScreen, S.voiceWaitsHoldOff, S.voiceWaitsLanguage, S.followUpListening]) { expect(t.length, t).toBeGreaterThan(10); expect(/[–—]/.test(t), t).toBe(false); }
  });
  test("after the Show me key, words that mean wait or stop wait in the box too, instead of looking at the screen", () => {
    const heard = card.slice(card.indexOf('ev.stage === "heard"'), card.indexOf('dispatch({ type: "ui.voiceClosed" })', card.indexOf('ev.stage === "heard"')));
    expect(heard).toContain('if (to === "showme" && kind !== "holdOff")');
  });
  test("the card uses this rule, not the old count of three words", () => {
    const heard = card.slice(card.indexOf('ev.stage === "heard"'), card.indexOf('dispatch({ type: "ui.voiceClosed" })'));
    expect(heard).toContain("sendsItself(");
    expect(heard).not.toMatch(/split\(\/\\s\+\/\)\.length >= 3/);
  });
});

// HeyClicky v1.0.53 parity: point at a finished task's card and hold the talk keys to follow up on it. Ours: while the
// follow up box shows under a finished task's receipt and the pointer is over that receipt (a hover inside Home's own
// window), the words go into that box, never sent unless auto send is on. Off unless turned on (talk.followUpByPointing).
describe("where spoken words go", () => {
  // What was true as the keys went down (taken when listening began): the follow up box showed, Home showed, the pointer
  // was on that receipt, and the setting was on.
  const down = (o: Partial<FollowAim> = {}): FollowAim => ({ followUpShown: true, overReceipt: true, byPointing: true, homeShown: true, ...o });
  const to = (atKeysDown: FollowAim | null, followUpShownNow = true, showme = false) => heardGoesTo({ showme, atKeysDown, followUpShownNow });
  test("into the follow up box only when it shows, the pointer is on that receipt and the setting is on", () => {
    expect(to(down())).toBe("followUp");
    expect(to(down({ overReceipt: false }))).toBe("box");
    expect(to(down({ followUpShown: false }))).toBe("box");
    expect(to(down({ byPointing: false }))).toBe("box");   // off unless turned on: today's way
  });
  test("the Show me key pressed first still wins: the words are a question about the screen", () => {
    expect(to(down(), true, true)).toBe("showme");
    expect(to(null, false, true)).toBe("showme");
  });
  // Found in review (19 Oct 2026): where the words went was decided when they came back from the speech model, from a
  // hover flag that could be stale. The pointer leaving the receipt while the words were turned into text sent them to the
  // ask box (with auto send on, a new paid task); and after Home closed with the pointer resting on the receipt, a later
  // hold to talk from another app filled the hidden follow up box.
  test("decided as the keys went down: the pointer moving off the receipt afterwards changes nothing", () => {
    expect(to(down())).toBe("followUp");
    expect(to(down({ overReceipt: false }))).toBe("box");   // and moving onto it only after the keys went down does not count
  });
  test("never into a follow up box Home was not showing as the keys went down", () => {
    expect(to(down({ homeShown: false }))).toBe("box");
  });
  test("never into a follow up box that has gone by the time the words come back, and never without a start", () => {
    expect(to(down(), false)).toBe("box");
    expect(to(null)).toBe("box");
  });
});