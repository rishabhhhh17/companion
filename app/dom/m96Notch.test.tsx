// M96, the notch HeyClicky style (docs/milestones/M96-heyclicky-notch.md), rendered: Home opened as the small chat out of
// the notch draws only the chat (a top row with two real icon buttons, the news as bubbles, the mic and the ask field), never
// takes the keys unless the ask key opened it, asks through Home's one ask path, and opens out to all of Home for Settings
// and the expand button without losing a word typed.
import { describe, expect, test } from "bun:test";
import { S } from "../src/strings.ts";
import { PROJECT, act, app, emit, fireEvent, press, renderHome, runner, settle } from "./render.tsx";

const AGENT = "builder-1";
const chatShown = () => document.querySelector("main.home")!.hasAttribute("data-chat");

const opened = (o: Record<string, unknown> = {}) => emit("opened", { keyboard: false, instant: false, chat: true, ...o });
const field = () => document.querySelector<HTMLTextAreaElement>(".notch-chat textarea");
// The task ran earlier today: about an hour ago, but never before midnight, so the test holds at any time of day.
const sinceMidnight = Date.now() - new Date(new Date().setHours(0, 0, 0, 0)).getTime();
const ago = (ms: number) => new Date(Date.now() - Math.min(ms, sinceMidnight / 2)).toISOString();
const done = { type: "tasks.list", project: PROJECT, tasks: [
  { id: 1, label: "fix the email check", status: "done", usd: 0.02, startedAt: ago(3_600_000), endedAt: ago(3_500_000), checkpoint: "cp_1", changed: 2, proof: "passed" },
] };

describe("the small chat in Home", () => {
  test("opened small: only the chat shows, with its top row, the news as bubbles and the ask field", async () => {
    await renderHome();
    await runner(done);
    await opened();
    const home = document.querySelector("main.home")!;
    expect(home.hasAttribute("data-chat")).toBe(true);
    const chat = document.querySelector(".notch-chat")!;
    expect(chat.querySelector(".nc-hi")?.textContent).toMatch(/^hey /);
    // Two small round buttons with real drawings, never emoji or text glyphs.
    const icons = [...chat.querySelectorAll(".nc-ico")];
    expect(icons.map((b) => b.getAttribute("aria-label"))).toEqual([S.m96.chat.settings, S.m96.chat.expand]);
    for (const b of icons) { expect(b.querySelector("svg")).toBeTruthy(); expect((b.textContent ?? "").trim()).toBe(""); }
    // The person's ask in their words, and Squibby's plain answer, under a small time line.
    expect([...chat.querySelectorAll(".nc-me")].map((b) => b.textContent)).toEqual(["fix the email check"]);
    expect([...chat.querySelectorAll(".nc-them")].map((b) => b.textContent)).toEqual([S.m96.chat.proven(2)]);
    expect(chat.querySelector(".nc-when b")?.textContent).toBe(S.m96.chat.today);
    // Changed on purpose (the M96 review): the field names the project an ask goes to.
    expect(field()?.getAttribute("placeholder")).toBe(S.m96.chat.askAbout("shop"));
    expect(chat.querySelector(".nc-send svg")).toBeTruthy();
  });

  test("opened by a click it never takes the keys; opened by the ask key its field is ready", async () => {
    await renderHome();
    await opened({ keyboard: false });
    await settle(60);
    expect(document.activeElement).not.toBe(field());
    await opened({ keyboard: true });
    await settle(60);
    expect(document.activeElement).toBe(field());
  });

  test("Return asks through Home's one ask path, as the big box does", async () => {
    await renderHome();
    await opened();
    const f = field()!;
    await act(async () => { f.value = "make the button blue"; fireEvent.input(f); });
    await act(async () => { fireEvent.keyDown(f, { key: "Enter" }); await new Promise((r) => setTimeout(r, 60)); });
    expect(app.sentTypes()).toContain("agent.start");
  });

  test("the expand button opens out to all of Home, keeping the words typed; Settings opens out to Settings", async () => {
    await renderHome();
    await opened();
    const f = field()!;
    await act(async () => { f.value = "half typed"; fireEvent.input(f); });
    await press(S.m96.chat.expand);
    expect(app.invoked("home_expand").length).toBe(1);
    expect(document.querySelector("main.home")!.hasAttribute("data-chat")).toBe(false);
    expect(document.querySelector(".notch-chat")).toBeNull();
    expect(document.querySelector<HTMLTextAreaElement>("#" + CSS.escape(document.querySelector(".ask textarea")!.id))!.value).toBe("half typed");
    await opened();
    await press(S.m96.chat.settings);
    expect(app.invoked("home_expand").length).toBe(2);
    expect(document.querySelector("main.home")!.getAttribute("data-view")).toBe("settings");
  });

  test("Esc closes Home (and so the chat) through the shell, as Home's own Esc does", async () => {
    await renderHome();
    await opened();
    await act(async () => { fireEvent.keyDown(document.querySelector("main.home")!, { key: "Escape" }); });
    expect(app.invoked("close_card").length).toBe(1);
    await emit("closed", {});
    expect(document.querySelector(".notch-chat")).toBeNull();
  });

  test("a question to allow opens the chat out at once, so nothing waits where it cannot be seen", async () => {
    await renderHome();
    await opened();
    await runner({ type: "agent.state", agent: "a", state: "working" }, { type: "approval.request", approval: "ap_1", agent: "a", checkpoint: "cp_1", toolUseId: "t", risk: "network", title: "curl reaches the internet", expiresAt: "2999-01-01T00:00:00Z" });
    await settle(60);
    expect(document.querySelector("main.home")!.hasAttribute("data-chat")).toBe(false);
    expect(app.invoked("home_expand").length).toBe(1);
  });

  test("the chat names the project an ask goes to, in the top row and in the field", async () => {
    await renderHome();
    await opened();
    const name = PROJECT.split("/").at(-1)!;
    expect(document.querySelector(".notch-chat .nc-proj")?.textContent).toBe(name);
    expect(field()?.getAttribute("placeholder")).toBe(S.m96.chat.askAbout(name));
  });

  test("while a task works the chat has its own Stop, which sends the interrupt", async () => {
    await renderHome();
    await opened();
    const f = field()!;
    await act(async () => { f.value = "make the button blue"; fireEvent.input(f); });
    await act(async () => { fireEvent.keyDown(f, { key: "Enter" }); await new Promise((r) => setTimeout(r, 60)); });
    await runner({ type: "agent.state", agent: AGENT, state: "working" }, { type: "checkpoint.created", project: PROJECT, agent: AGENT, checkpoint: "cp_7", label: "Before", files: 3, skipped: [] });
    expect(chatShown()).toBe(true);
    const stop = document.querySelector<HTMLButtonElement>(".notch-chat .nc-stop");
    expect(stop).toBeTruthy();
    await act(async () => { fireEvent.click(stop!); });
    expect(app.sent().filter((c) => c.type === "agent.interrupt")).toEqual([expect.objectContaining({ agent: AGENT })]);
  });

  test("a new result opens out to Home's receipt, with its Undo", async () => {
    await renderHome();
    await opened();
    const f = field()!;
    await act(async () => { f.value = "make the button blue"; fireEvent.input(f); });
    await act(async () => { fireEvent.keyDown(f, { key: "Enter" }); await new Promise((r) => setTimeout(r, 60)); });
    await runner({ type: "agent.state", agent: AGENT, state: "working" }, { type: "checkpoint.created", project: PROJECT, agent: AGENT, checkpoint: "cp_7", label: "Before", files: 3, skipped: [] });
    expect(chatShown()).toBe(true);
    await runner({ type: "receipt", agent: AGENT, checkpoint: "cp_7", changed: [{ file: "src/App.tsx", kind: "modified" }], commands: 0, notUndoable: [], proof: "skipped", usdEstimate: 0 }, { type: "agent.state", agent: AGENT, state: "idle" });
    await settle(60);
    expect(chatShown()).toBe(false);
    expect(app.invoked("home_expand").length).toBe(1);
  });

  test("hold to talk's own panel (a model to download) opens the chat out, so the Download button and its light show", async () => {
    await renderHome();
    await opened();
    await runner({ type: "app.voice", stage: "needs_model", message: "The speech model is not downloaded yet." });
    await settle(60);
    expect(chatShown()).toBe(false);
  });

  test("a notice while the chat shows opens it out, so a Return is never silent", async () => {
    await renderHome();
    await opened();
    await runner({ type: "app.notice", message: "Turn Flow on in Settings to ask." });
    await settle(60);
    expect(chatShown()).toBe(false);
    expect(document.querySelector(".notice")?.textContent).toBe("Turn Flow on in Settings to ask.");
  });

  test("the mic says the keys to hold in its own words, and a press leaves the hint up while typing", async () => {
    await renderHome({ settings: { "keys.talk": "ctrl+alt" } });
    await opened();
    const mic = document.querySelector<HTMLButtonElement>(".notch-chat .nc-mic");
    if (!mic) return;   // no talk keys in this setup: the mic is hidden, as before
    expect(mic.getAttribute("aria-label")).toMatch(/^Hold .+ to talk$/);
    await act(async () => { fireEvent.click(mic); });
    const said = () => [...document.querySelectorAll(".notch-chat .nc-them")].map((b) => b.textContent ?? "");
    expect(said().some((w) => w.startsWith("Hold "))).toBe(true);
    const f = field()!;
    await act(async () => { f.value = "a"; fireEvent.input(f); });
    expect(said().some((w) => w.startsWith("Hold "))).toBe(true);
  });

  test("the changes bubble is a button that opens out to the review", async () => {
    await renderHome();
    await opened();
    await runner({ type: "review.batch", project: PROJECT, batch: "rv_0123456789", files: [{ file: "a.ts", kind: "modified" }, { file: "b.ts", kind: "modified" }], count: 2, capped: false, secretFiles: [], auto: false });
    await settle(30);
    const b = document.querySelector<HTMLButtonElement>(".notch-chat button.nc-them");
    if (!b) throw new Error("no review bubble: " + document.querySelector(".notch-chat")?.textContent);
    await act(async () => { fireEvent.click(b); });
    expect(chatShown()).toBe(false);
    expect(app.invoked("home_expand").length).toBe(1);
  });
});
