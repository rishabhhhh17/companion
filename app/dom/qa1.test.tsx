// QA1 (the 19 Nov 2026 functionality check, docs/milestones/QA1-fixes.md), rendered and clicked through: the small chat
// holds a second quick send and keeps every word, keeps a draft across Close, shows a plain answer in the chat, stays the
// chat while hold to talk listens and folds away for Stop everything, goes round with Tab; Home sends nothing with fixing
// off, says how to paste an error, closes More ways to ask before itself on Esc; Memory's Return saves once and closes; and
// History offers Bring back after an Undo, in words that fit the task.
import { describe, expect, test } from "bun:test";
import { S } from "../src/strings.ts";
import { PROJECT, act, app, emit, fireEvent, press, renderHome, runner, screen, settle } from "./render.tsx";

const AGENT = "builder-1";
const chatShown = () => document.querySelector("main.home")!.hasAttribute("data-chat");
const opened = (o: Record<string, unknown> = {}) => emit("opened", { keyboard: false, instant: false, chat: true, ...o });
const field = () => document.querySelector<HTMLTextAreaElement>(".notch-chat textarea");
const typeIn = async (f: HTMLTextAreaElement, words: string) => { await act(async () => { f.value = words; fireEvent.input(f); }); };
const returnIn = async (f: HTMLTextAreaElement) => { await act(async () => { fireEvent.keyDown(f, { key: "Enter" }); await new Promise((r) => setTimeout(r, 60)); }); };
const starts = () => app.sent().filter((c) => c.type === "agent.start");
const words = (sel: string) => [...document.querySelectorAll(sel)].map((b) => (b.textContent ?? "").trim());

describe("QA1: the small chat", () => {
  test("a second quick send is held: one task goes out, the first ask stays, the second words stay in the field", async () => {
    await renderHome();
    await opened();
    const f = field()!;
    await typeIn(f, "Make the Join button green");
    await returnIn(f);
    await typeIn(f, "Add a footer");
    await returnIn(f);
    expect(starts().length).toBe(1);
    expect(words(".notch-chat .nc-me")).toEqual(["Make the Join button green"]);
    expect(field()!.value).toBe("Add a footer");
    // The engine starts the first: the second words are still there, with why.
    await runner({ type: "agent.state", agent: AGENT, state: "working" }, { type: "checkpoint.created", project: PROJECT, agent: AGENT, checkpoint: "cp_7", label: "Before: Make the Join button green", files: 3, skipped: [] });
    expect(field()!.value).toBe("Add a footer");
    expect(starts().length).toBe(1);
  });

  test("the busy line goes once the work stops", async () => {
    await renderHome();
    await opened();
    const f = field()!;
    await typeIn(f, "make the button blue");
    await returnIn(f);
    await runner({ type: "agent.state", agent: AGENT, state: "working" }, { type: "checkpoint.created", project: PROJECT, agent: AGENT, checkpoint: "cp_7", label: "Before: make the button blue", files: 3, skipped: [] });
    await typeIn(field()!, "and the footer");
    await returnIn(field()!);
    expect(words(".notch-chat .nc-them")).toContain(S.askBusy);
    // The newest words in the thread come before the busy line, never after it.
    const all = words(".notch-chat .nc-b");
    expect(all.indexOf(S.askBusy)).toBe(all.length - 1);
    await runner({ type: "agent.state", agent: AGENT, state: "idle" }, { type: "tasks.list", project: PROJECT, tasks: [{ id: 1, label: "make the button blue", status: "interrupted", usd: 0, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), checkpoint: "cp_7", changed: 0, proof: null }] });
    await settle(60);
    expect(words(".notch-chat .nc-them")).not.toContain(S.askBusy);
  });

  test("a draft survives Close: the next chat has the words", async () => {
    await renderHome();
    await opened();
    await typeIn(field()!, "half typed");
    await press(S.m96.chat.close);
    await emit("closed", {});
    expect(field()).toBeNull();
    await opened();
    expect(field()!.value).toBe("half typed");
  });

  test("a question's answer shows in the chat, and the chat stays", async () => {
    await renderHome();
    await opened();
    const f = field()!;
    await typeIn(f, "What changed today?");
    await returnIn(f);
    await runner({ type: "agent.state", agent: AGENT, state: "working" }, { type: "checkpoint.created", project: PROJECT, agent: AGENT, checkpoint: "cp_8", label: "Before: What changed today?", files: 3, skipped: [] });
    await runner({ type: "receipt", agent: AGENT, checkpoint: "cp_8", changed: [], commands: 0, notUndoable: [], usdEstimate: 0, said: "Two files changed today: index.html and sum.js.", ended: "done" }, { type: "agent.state", agent: AGENT, state: "done" });
    await settle(60);
    expect(chatShown()).toBe(true);
    expect(app.invoked("home_expand").length).toBe(0);
    expect(words(".notch-chat .nc-them")).toContain("Two files changed today: index.html and sum.js.");
  });

  test("hold to talk from the chat stays in the chat, and says it listens", async () => {
    await renderHome();
    await opened();
    await runner({ type: "app.voice", stage: "listening", message: "Listening." });
    await settle(60);
    expect(chatShown()).toBe(true);
    expect(app.invoked("home_expand").length).toBe(0);
    expect(words(".notch-chat .nc-them")).toContain("Listening.");
    await runner({ type: "app.voice", stage: "idle", message: "" });
    expect(chatShown()).toBe(true);
  });

  test("while it listens, the chat's mic is lit as Home's is, and goes back to rest after", async () => {
    await renderHome();
    await opened();
    const mic = () => document.querySelector<HTMLButtonElement>(".notch-chat .nc-mic");
    expect(mic()?.hasAttribute("data-on") ?? false).toBe(false);
    await runner({ type: "app.voice", stage: "listening", message: "Listening." });
    await settle(60);
    expect(document.querySelector(".notch-chat")!.hasAttribute("data-talking")).toBe(true);
    expect(mic()!.hasAttribute("data-on")).toBe(true);
    expect(mic()!.getAttribute("aria-label")).toBe(S.m96.chat.micListening);
    await runner({ type: "app.voice", stage: "idle", message: "" });
    await settle(30);
    expect(document.querySelector(".notch-chat")!.hasAttribute("data-talking")).toBe(false);
    expect(mic()?.hasAttribute("data-on") ?? false).toBe(false);
  });

  test("Stop everything while a task works folds the chat away, never opening all of Home", async () => {
    await renderHome();
    await opened();
    const f = field()!;
    await typeIn(f, "make the button blue");
    await returnIn(f);
    await runner({ type: "agent.state", agent: AGENT, state: "working" }, { type: "checkpoint.created", project: PROJECT, agent: AGENT, checkpoint: "cp_7", label: "Before: make the button blue", files: 3, skipped: [] });
    await runner({ type: "app.stop_everything" });
    await settle(60);
    expect(app.invoked("home_expand").length).toBe(0);
    expect(app.invoked("close_card").length).toBe(1);
  });

  test("Tab from Send goes round to the top row, and Shift Tab from the first control back to Send", async () => {
    await renderHome();
    await opened({ keyboard: true });
    await settle(60);
    const chat = document.querySelector<HTMLElement>(".notch-chat")!;
    const send = chat.querySelector<HTMLButtonElement>(".nc-send")!;
    // Send is greyed only while work runs; here it can take the keys.
    await typeIn(field()!, "x");
    send.focus();
    await act(async () => { fireEvent.keyDown(send, { key: "Tab" }); });
    const first = chat.querySelector<HTMLElement>(".nc-top button")!;
    expect(document.activeElement).toBe(first);
    await act(async () => { fireEvent.keyDown(first, { key: "Tab", shiftKey: true }); });
    expect(document.activeElement).toBe(send);
  });

  test("with fixing off, Return sends nothing and the words stay, with why", async () => {
    await renderHome({ answers: { replay_events: [{ v: 1, id: "h", type: "runner.hello", runnerVersion: "0.0.1", sdk: "test" }, { v: 1, id: "a", type: "auth.status", method: "none" }] } });
    await opened();
    const f = field()!;
    await typeIn(f, "hello");
    await returnIn(f);
    expect(starts()).toEqual([]);
    expect(field()!.value).toBe("hello");
    expect(words(".notch-chat .nc-them")).toContain(S.askFixOff);
  });

  test("with fixing off, the chat's Send is greyed, with why in its name, as it can never send", async () => {
    await renderHome({ answers: { replay_events: [{ v: 1, id: "h", type: "runner.hello", runnerVersion: "0.0.1", sdk: "test" }, { v: 1, id: "a", type: "auth.status", method: "none" }] } });
    await opened();
    await typeIn(field()!, "hello");
    const send = document.querySelector<HTMLButtonElement>(".notch-chat .nc-send")!;
    expect(send.disabled).toBe(true);
    expect(send.title).toBe(S.sendFixOff);
  });
});

describe("QA1: Home", () => {
  test("with fixing off, Send sends nothing, no Stop shows, and the box says why", async () => {
    await renderHome({ answers: { replay_events: [{ v: 1, id: "h", type: "runner.hello", runnerVersion: "0.0.1", sdk: "test" }, { v: 1, id: "a", type: "auth.status", method: "none" }] } });
    const box = document.querySelector<HTMLTextAreaElement>(".ask textarea")!;
    await act(async () => { box.value = "make it blue"; fireEvent.input(box); });
    await act(async () => { fireEvent.keyDown(box, { key: "Enter" }); await new Promise((r) => setTimeout(r, 60)); });
    expect(starts()).toEqual([]);
    expect(box.value).toBe("make it blue");
    expect(screen.getAllByText(S.askFixOff).length).toBeGreaterThan(0);
    expect(document.querySelector(".stop, button[aria-label^='Stop']")).toBeNull();
  });

  test("with fixing off, Home's Send is greyed, with why in its name", async () => {
    await renderHome({ answers: { replay_events: [{ v: 1, id: "h", type: "runner.hello", runnerVersion: "0.0.1", sdk: "test" }, { v: 1, id: "a", type: "auth.status", method: "none" }] } });
    const box = document.querySelector<HTMLTextAreaElement>(".ask textarea")!;
    await act(async () => { box.value = "make it blue"; fireEvent.input(box); });
    const send = document.querySelector<HTMLButtonElement>(".ask-row > .send")!;
    expect(send.disabled).toBe(true);
    expect(send.title).toBe(S.sendFixOff);
  });

  test("Explain an error with the box empty and no shortcut says to paste the error", async () => {
    await renderHome();
    await act(async () => { document.querySelector<HTMLDetailsElement>("details.more")!.open = true; });
    await press(S.look.chipExplain);
    expect(screen.getAllByText(S.explainChipHintNoKeys).length).toBeGreaterThan(0);
  });

  test("Esc with More ways to ask open closes the popover first, never Home", async () => {
    await renderHome();
    await emit("opened", { keyboard: false, instant: true, chat: false });
    const more = document.querySelector<HTMLDetailsElement>("details.more")!;
    await act(async () => { more.open = true; more.querySelector("summary")!.focus(); });
    await act(async () => { fireEvent.keyDown(more.querySelector("summary")!, { key: "Escape" }); });
    expect(more.open).toBe(false);
    expect(app.invoked("close_card").length).toBe(0);
  });

  test("Memory Edit: Return saves once and the row goes back to plain text", async () => {
    const A = { id: "m_1a2b3c4d", text: "Uses React and Vite", source: "package.json", date: "2026-10-09" };
    await renderHome();
    await press("Memory");
    await runner({ type: "memory.state", project: PROJECT, paused: false, projectLines: [A], profileLines: [], problems: [] });
    await press(`${S.memoryEdit}: ${A.text}`);
    const input = screen.getByRole("textbox", { name: `${S.memoryEdit}: ${A.text}` });
    await act(async () => { fireEvent.change(input, { target: { value: "Uses React 19 and Vite" } }); });
    let notCancelled = true;
    await act(async () => { notCancelled = fireEvent.keyDown(input, { key: "Enter" }); });
    // The Return is used up by the save, so the same key never presses the Edit button the keys move back to.
    expect(notCancelled).toBe(false);
    expect(app.sent().filter((c) => c.type === "memory.edit").length).toBe(1);
    expect(document.querySelector(".mem-editing")).toBeNull();
  });
});

describe("QA1: Bring back after an Undo from History", () => {
  const iso = (ago: number) => new Date(Date.now() - ago).toISOString();
  const list = (o: Record<string, unknown>) => ({ type: "tasks.list", project: PROJECT, tasks: [{ id: 3, label: "Add a contact form", status: "done", usd: 0.04, startedAt: iso(120_000), endedAt: iso(60_000), checkpoint: "cp_0001", changed: 2, proof: "passed", ...o }] });
  test("the row of a task an Undo took back offers Bring the fix back, asks first, then restores the safety copy", async () => {
    await renderHome();
    await press("History");
    await runner(list({ undone: true, undoSafety: "cp_0009" }));
    await press(`${S.bringBack}: Add a contact form`);
    expect(app.sentTypes()).not.toContain("checkpoint.restore");
    await press(S.bringBackYes);
    expect(app.sent().filter((c) => c.type === "checkpoint.restore")).toEqual([expect.objectContaining({ project: PROJECT, checkpoint: "cp_0009" })]);
  });
  test("a task that did not pass offers to bring its changes back", async () => {
    await renderHome();
    await press("History");
    await runner(list({ status: "not_done", proof: "failed", undone: true, undoSafety: "cp_0009" }));
    expect(screen.queryAllByRole("button", { name: `${S.bringBack}: Add a contact form` }).length).toBe(0);
    expect(screen.getAllByRole("button", { name: `${S.bringBackChanges}: Add a contact form` }).length).toBe(1);
  });
});

describe("QA1: a result after Bring the fix back", () => {
  test("says the files are the fix's again, never that they were put back", async () => {
    await renderHome();
    const f = document.querySelector<HTMLTextAreaElement>(".ask textarea")!;
    await act(async () => { f.value = "make the button blue"; fireEvent.input(f); });
    await act(async () => { fireEvent.keyDown(f, { key: "Enter" }); await new Promise((r) => setTimeout(r, 60)); });
    await runner({ type: "agent.state", agent: AGENT, state: "working" }, { type: "checkpoint.created", project: PROJECT, agent: AGENT, checkpoint: "cp_0007", label: "Before: make the button blue", files: 3, skipped: [] });
    await runner({ type: "receipt", agent: AGENT, checkpoint: "cp_0007", changed: [{ file: "src/App.css", kind: "modified" }], commands: 0, notUndoable: [], proof: "passed", usdEstimate: 0, ended: "done" }, { type: "agent.state", agent: AGENT, state: "done" });
    await press(/^Undo$/);
    await press(S.undoYes);
    await runner({ type: "checkpoint.restored", project: PROJECT, checkpoint: "cp_0007", safety: "cp_0008", restored: ["src/App.css"] });
    await press(S.bringBack);
    await press(S.bringBackYes);
    await runner({ type: "checkpoint.restored", project: PROJECT, checkpoint: "cp_0008", restored: ["src/App.css"] });
    await settle(60);
    expect(document.querySelector(".changes-head")?.textContent).toBe(S.changedFiles(1));
    expect(document.querySelector(".putback-note")).toBeNull();
  });
});

describe("QA1: Bring back on Now", () => {
  test("Now's last fix an Undo took back offers Bring the fix back, asks first, then restores the safety copy", async () => {
    await renderHome();
    await runner({ type: "tasks.list", project: PROJECT, tasks: [{ id: 3, label: "Add a contact form", status: "done", usd: 0.04, startedAt: new Date(Date.now() - 120_000).toISOString(), endedAt: new Date(Date.now() - 60_000).toISOString(), checkpoint: "cp_0001", changed: 2, proof: "passed", undone: true, undoSafety: "cp_0009" }] });
    await settle(60);
    await press(`${S.bringBack}: ${screen.getAllByRole("button", { name: new RegExp(`^${S.bringBack}: `) })[0]!.getAttribute("aria-label")!.slice(S.bringBack.length + 2)}`);
    expect(app.sentTypes()).not.toContain("checkpoint.restore");
    await press(S.bringBackYes);
    expect(app.sent().filter((c) => c.type === "checkpoint.restore")).toEqual([expect.objectContaining({ checkpoint: "cp_0009" })]);
  });
});

describe("QA1: a click on the notch's news", () => {
  test("the headline and the line under it open Home on that news, never the small chat", async () => {
    const { IslandPanel } = await import("../src/islandPanel.tsx");
    const { initial, reduce } = await import("../src/model.ts");
    const { ev, renderPage } = await import("./render.tsx");
    const m = [{ type: "auth.status", method: "api_key", source: "keychain" }, { type: "ui.folderShown", project: PROJECT }, { type: "hook.waiting", project: PROJECT, waiting: true, message: "Claude needs your permission" }]
      .reduce((x, e) => reduce(x, ev(e) as never), initial());
    await renderPage(<IslandPanel m={m} line="" shown />);
    await settle(400);
    const hi = document.querySelector<HTMLButtonElement>(".nb-hi")!;
    await act(async () => { fireEvent.click(hi); });
    expect(app.invoked("island_chat").length).toBe(0);
    expect(app.invoked("island_click").length).toBe(1);
    // The headline's button covers the quiet line under it too (notch.css .nb-row[data-news]; checked in Chromium, where a
    // point on the line is the button).
    expect(document.querySelector(".nb-row")?.hasAttribute("data-news")).toBe(true);
  });
});
