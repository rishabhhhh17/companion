// Founder round 2 (17 Nov 2026): pulling Flowflow out of the notch lost its let go (the face that held the pointer left the
// page as the drag began), the hello drew Flowflow while it lived on an edge, a question that opened by itself turned into
// the greeting row under the pointer, a failed or finished Undo never ended, the hold to talk panel could have no way out,
// and Forget then Erase showed a false error. Rendered here as the person meets them.
import { describe, expect, test } from "bun:test";
import { IslandPanel } from "../src/islandPanel.tsx";
import { NotchChat } from "../src/notchChat.tsx";
import { initial, reduce, type Model } from "../src/model.ts";
import { helloLine } from "../src/notchHello.ts";
import { S } from "../src/strings.ts";
import { _resetForTests, startSettings } from "../src/settingsStore.ts";
import { DRAG_OUT_PX } from "../src/tuck.ts";
import { PROJECT, act, app, buttons, ev, fireEvent, press, renderHome, renderPage, runner, screen, settle } from "./render.tsx";

const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, ev(e) as never), from);
const atRest = () => run([{ type: "auth.status", method: "api_key", source: "keychain" }, { type: "ui.folderShown", project: PROJECT }]);
/** Settings read afresh, so the page sees where Flowflow lives (as the m93 hover tests do). */
const readSettings = async () => { await act(async () => { _resetForTests(); startSettings(); }); await settle(); };
const noop = () => {};
const chatProps = { m: initial(), project: PROJECT, greet: "hey there", now: Date.now(), hint: null, boxRef: null, working: false, talk: { on: false, title: "", label: "" }, stop: null, onStop: noop, onBubble: noop, onMic: noop, onSend: noop, onKeyDown: noop, onInput: noop, onFocus: noop, onSettings: noop, onExpand: noop, onClose: noop };

/** Press the handle, move past DRAG_OUT_PX, and let go somewhere else on the page (the pointer is out on the screen). */
async function dragOut(handle: HTMLElement) {
  await act(async () => { fireEvent.pointerDown(handle, { button: 0, pointerId: 1, screenX: 700, screenY: 10 }); });
  await act(async () => { fireEvent.pointerMove(handle, { pointerId: 1, screenX: 700, screenY: 10 + DRAG_OUT_PX + 30 }); });
  await settle(20);
  expect(app.invoked("untuck_drag").length).toBe(1);
  expect(handle.isConnected, "the handle holds the drag to its let go").toBe(true);
  expect(handle.hasAttribute("data-out"), "only the face hides while it is out").toBe(true);
  await act(async () => { fireEvent.pointerUp(document.body, { pointerId: 1, screenX: 700, screenY: 400 }); });
  await settle(20);
  expect(app.invoked("drop_dock").length).toBe(1);
  expect(handle.hasAttribute("data-out"), "the face is back after the let go").toBe(false);
}

describe("pulling Flowflow out of the notch always lets go", () => {
  test("from the hover row, pressed on the face: exactly one drop_dock", async () => {
    app.reset();
    await renderPage(<IslandPanel m={atRest()} line="" shown />, { settings: { "character.lives": "notch" } });
    await readSettings();
    const face = document.querySelector(".island-panel .ip-face") as HTMLElement;
    expect(face).toBeTruthy();
    const handle = face.closest("button") as HTMLElement;
    // Pressed on the face drawn inside: the capture goes on the button, never on the face.
    await act(async () => { fireEvent.pointerDown(face, { button: 0, pointerId: 1, screenX: 700, screenY: 10 }); });
    await act(async () => { fireEvent.pointerMove(handle, { pointerId: 1, screenX: 700, screenY: 60 }); });
    await settle(20);
    expect(app.invoked("untuck_drag").length).toBe(1);
    expect(face.isConnected).toBe(true);
    await act(async () => { fireEvent.pointerUp(document.body, { pointerId: 1, screenX: 700, screenY: 400 }); });
    await settle(20);
    expect(app.invoked("drop_dock").length).toBe(1);
    // A second let go finds no drag and says nothing more.
    await act(async () => { fireEvent.pointerUp(document.body, { pointerId: 1, screenX: 700, screenY: 400 }); });
    expect(app.invoked("drop_dock").length).toBe(1);
  });
  test("from the opened chat: exactly one drop_dock, and the face is back after", async () => {
    app.reset();
    await renderPage(<NotchChat {...(chatProps as unknown as Parameters<typeof NotchChat>[0])} />, { settings: { "character.lives": "notch" } });
    await readSettings();
    await dragOut(document.querySelector(".nc-face-hold") as HTMLElement);
    expect(document.querySelectorAll(".notch-chat .nc-face").length).toBe(1);
  });
});

describe("the hello under the notch draws Flowflow only while it lives there", () => {
  test("on the screen edge, the line alone", async () => {
    await renderPage(<IslandPanel m={initial()} line="" shown hello={helloLine("Sam", null)} />, { settings: { "character.lives": "edge" } });
    await readSettings();
    expect(document.querySelector(".island-panel .ip-hello")).toBeTruthy();
    expect(document.querySelectorAll(".island-panel .ip-agent").length).toBe(0);
  });
  test("tucked into the notch, the face with the line", async () => {
    await renderPage(<IslandPanel m={initial()} line="" shown hello={helloLine("Sam", null)} />, { settings: { "character.lives": "notch" } });
    await readSettings();
    expect(document.querySelectorAll(".island-panel .ip-agent").length).toBe(1);
  });
});

describe("a question under the notch keeps its buttons under the pointer", () => {
  const asking = () => run([{ type: "auth.status", method: "api_key", source: "keychain" }, { type: "ui.folderShown", project: PROJECT },
    { type: "agent.state", agent: "builder-1", state: "working" },
    { type: "approval.request", approval: "ap_1", agent: "builder-1", checkpoint: "cp_1", toolUseId: "t", risk: "network", title: "curl reaches the internet", expiresAt: "2999-01-01T00:00:00Z" }]);
  const named = () => [...document.querySelectorAll(".island-panel button")].map((b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").trim());
  test("opened by itself: only the question", async () => {
    await renderPage(<IslandPanel m={asking()} line="" shown brief />);
    await settle(50);
    expect(named().some((b) => b.startsWith(S.allow))).toBe(true);
    expect(named().some((b) => b.startsWith(S.dontAllow))).toBe(true);
    expect(document.querySelector(".nb-row")).toBeNull();
  });
  test("with the whole panel open, Allow and Don't allow are still there", async () => {
    await renderPage(<IslandPanel m={asking()} line="" shown brief={false} />);
    await settle(50);
    expect(named().some((b) => b.startsWith(S.allow))).toBe(true);
    expect(named().some((b) => b.startsWith(S.dontAllow))).toBe(true);
  });
  test("brief with nothing left to show falls back to the row, never an empty panel", async () => {
    await renderPage(<IslandPanel m={atRest()} line="" shown brief />);
    await settle(50);
    expect(document.querySelector(".island-panel .nb-row")).toBeTruthy();
  });
});

describe("an Undo always ends", () => {
  const now = Date.now();
  const iso = (ms: number) => new Date(now - ms).toISOString();
  const tasks = { type: "tasks.list", project: PROJECT, tasks: [
    { id: 4, label: "Fix the header", status: "done", usd: 0.04, startedAt: iso(100_000), endedAt: iso(50_000), checkpoint: "cp_0002", changed: 1, proof: "passed" },
    { id: 3, label: "Add a contact form", status: "done", usd: 0.04, startedAt: iso(220_000), endedAt: iso(160_000), checkpoint: "cp_0001", changed: 2, proof: "passed" },
  ] };
  test("a failed History undo offers Try again and Close, and Star and Name it still opens", async () => {
    await renderHome(); await press(S.home.places.did); await runner(tasks);
    await press(`${S.historyUndo}: Fix the header`);
    await press(S.undoYes);
    await runner({ type: "protocol.error", failed: "checkpoint.restore", reason: "busy" });
    expect(screen.queryAllByRole("alert").length).toBe(1);
    expect(buttons()).toContain(S.undoAgain);
    expect(buttons()).toContain(S.undoDismiss);
    // Every other Undo is back beside it.
    expect(buttons()).toContain(`${S.historyUndo}: Fix the header`);
    await press(`${S.fix.star}, ${S.fix.nameIt}: Fix the header`);
    expect(buttons().some((b) => b.startsWith(`${S.fix.star}: `))).toBe(true);
    // Try again asks the same question again.
    await press(S.undoAgain);
    expect(buttons()).toContain(S.undoYes);
    await press(S.undoNo);
    expect(screen.queryAllByRole("alert").length).toBe(0);
  });
  test("Close puts a failed undo away", async () => {
    await renderHome(); await press(S.home.places.did); await runner(tasks);
    await press(`${S.historyUndo}: Fix the header`);
    await press(S.undoYes);
    await runner({ type: "protocol.error", failed: "checkpoint.restore", reason: "busy" });
    await press(S.undoDismiss);
    expect(screen.queryAllByRole("alert").length).toBe(0);
  });
  test("a finished undo leaves Star and Name it working, and clears when the person goes elsewhere", async () => {
    await renderHome(); await press(S.home.places.did); await runner(tasks);
    await press(`${S.historyUndo}: Fix the header`);
    await press(S.undoYes);
    await runner({ type: "checkpoint.restored", project: PROJECT, checkpoint: "cp_0002" });
    await runner(tasks);
    await press(`${S.fix.star}, ${S.fix.nameIt}: Fix the header`);
    expect(buttons().some((b) => b.startsWith(`${S.fix.star}: `))).toBe(true);
    await press("Now"); await press(S.home.places.did);
    expect(screen.queryAllByRole("status").map((a) => a.textContent)).not.toContain(S.undone);
  });
});

describe("the hold to talk panel always has a way out", () => {
  // Every stage the shell sends (shell_voice.rs, dictate.rs) but idle, which takes the panel away.
  const STAGES = ["listening", "transcribing", "downloading", "needs_model", "needs_access", "refused", "typed", "copied", "error", "mic_refused", "blocked", "needs_mic", "silent", "model_ready"];
  const busy = new Set(["listening", "transcribing", "downloading"]);
  for (const stage of STAGES) test(stage, async () => {
    await renderHome();
    await runner({ type: "app.voice", stage, message: `Words for ${stage}` });
    await settle(50);
    expect(document.body.textContent).toContain(`Words for ${stage}`);
    const ways = buttons().filter((b) => b === S.voiceClose || b === S.voiceNotNow);
    if (busy.has(stage)) expect(ways, stage).toEqual([]);
    else expect(ways.length, stage).toBe(1);
    if (stage === "needs_access") expect(buttons()).toContain(S.settingsOpenSystem);
    if (stage === "needs_model") expect(buttons()).toContain(S.voiceDownload);
    if (ways.length) { await press(ways[0]!); expect(document.body.textContent).not.toContain(`Words for ${stage}`); }
  });
  test("a typed line clears by itself", async () => {
    await renderHome();
    await runner({ type: "app.voice", stage: "typed", message: "Typed where you were." });
    await settle(4200);
    expect(document.body.textContent).not.toContain("Typed where you were.");
  });
});

describe("Memory: Forget, then Erase", () => {
  const A = { id: "m_1a2b3c4d", text: "Uses React and Vite", source: "package.json", date: "2026-10-09" };
  const state = (l: unknown[]) => ({ type: "memory.state", project: PROJECT, paused: false, projectLines: l, profileLines: [], problems: [] });
  test("Erase is never offered beside the example line", async () => {
    await renderHome(); await press(S.home.places.memory); await runner(state([A]));
    expect(buttons().some((b) => b.startsWith("Erase"))).toBe(true);
    await press(`${S.memoryForget}: ${A.text}`);
    expect(buttons().some((b) => b.startsWith("Erase"))).toBe(false);
  });
  test("an Erase drops the Forget still waiting, so no late forget is ever sent", async () => {
    const B = { ...A, id: "m_5e6f7a8b", text: "Deploys to Vercel" };
    await renderHome(); await press(S.home.places.memory); await runner(state([A, B]));
    await press(`${S.memoryForget}: ${A.text}`);
    const erase = buttons().find((b) => b.startsWith("Erase"))!;
    await press(erase);
    await press(S.memoryEraseYes);
    await settle(50);
    expect(app.sent().filter((c) => c.type === "memory.erase").length).toBe(1);
    expect(app.sent().filter((c) => c.type === "memory.forget").length).toBe(0);
  });
});
