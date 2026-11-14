// M90 (F32), rendered: Flowflow peeking out of the notch. The page asks the shell to be out only when something goes on,
// draws only once the shell allows it too, says what it is doing for VoiceOver, opens Home on a click (the notch's own
// click), hides on Stop everything and when turned off, and runs no animation frame while it is away.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { PeekOut, UNMOUNT_MS } from "../src/peekOutPage.tsx";
import { HELLO_MS } from "../src/peekOut.ts";
import { _resetForTests, startSettings } from "../src/settingsStore.ts";
import { S } from "../src/strings.ts";
import { PROJECT, act, app, emit, renderPage, returning, runner, screen, settle } from "./render.tsx";

const PICTURES = { "character.live": false };
const wants = (): unknown[] => app.invoked("peekout_want").map((c) => (c.args as { show: unknown }).show);
const head = () => screen.queryByRole("button", { name: /Point at it as you would the notch/ });
async function open(settings: Record<string, unknown> = PICTURES) {
  app.reset();
  app.answer("peekout_state", { on: false });
  // The settings are read before the page draws, as the page's own start does (startSettings, then render).
  returning({ settings });
  await act(async () => { _resetForTests(); startSettings(); await new Promise((r) => setTimeout(r, 30)); });
  await renderPage(<PeekOut />, { settings });
  await settle();
}
const allow = (on: boolean) => emit("peekout-allow", { on });

describe("out only when both the page and the shell say so", () => {
  test("hello once at launch: wanted at once, drawn once allowed, and back behind the notch when it is over", async () => {
    await open();
    expect(wants().at(-1)).toBe(true);
    expect(head()).toBeNull();
    await allow(true);
    await settle(40);
    expect(head()?.getAttribute("aria-label")).toBe(S.m90.name(S.m90.look.hello));
    expect(document.querySelector(".peekout")?.hasAttribute("data-in")).toBe(true);
    // Nothing went on: once the hello is over it asks to go back, slides out, and the drawing is given back.
    await settle(HELLO_MS + 100);
    expect(wants().at(-1)).toBe(false);
    expect(document.querySelector(".peekout")?.hasAttribute("data-in")).toBe(false);
    await settle(UNMOUNT_MS + 50);
    expect(head()).toBeNull();
  }, 10_000);
  test("the shell saying no (a call, a capture, Home open) keeps it in, even with something going on", async () => {
    await open();
    await allow(false);
    await runner({ type: "hook.busy", project: PROJECT, busy: true });
    expect(wants().at(-1)).toBe(true);
    expect(head()).toBeNull();
  });
});

describe("what it shows", () => {
  test("a connected tool working: watching; Claude Code waiting: the waiting look with the amber dot", async () => {
    await open();
    await allow(true);
    await runner({ type: "hook.busy", project: PROJECT, busy: true });
    await settle(40);
    expect(head()?.getAttribute("aria-label")).toBe(S.m90.name(S.m90.look.watching));
    expect(document.querySelector(".peekout-dot")).toBeNull();
    // Draw live off: the existing glance picture.
    expect(document.querySelector(".peekout-pic")?.getAttribute("src")).toContain("glance");
    await runner({ type: "hook.waiting", project: PROJECT, waiting: true });
    await settle(40);
    expect(head()?.getAttribute("aria-label")).toBe(S.m90.name(S.m90.look.waiting));
    expect(document.querySelector(".peekout-dot")).not.toBeNull();
  });
  test("a click opens Home through the notch's own click, and sends nothing to the engine", async () => {
    await open();
    await allow(true);
    await settle(40);
    await act(async () => { head()!.click(); await new Promise((r) => setTimeout(r, 30)); });
    expect(app.invoked("island_click")).toHaveLength(1);
    expect(app.sent()).toEqual([]);
  });
});

describe("the hide rules on the page", () => {
  test("Stop everything hides it at once, while the tool is still said busy", async () => {
    await open();
    await allow(true);
    await runner({ type: "hook.busy", project: PROJECT, busy: true });
    await settle(40);
    expect(head()).not.toBeNull();
    await runner({ type: "app.stop_everything" });
    expect(wants().at(-1)).toBe(false);
    await settle(UNMOUNT_MS + 50);
    expect(head()).toBeNull();
  });
  test("turned off in Settings: it never asks to be out", async () => {
    await open({ ...PICTURES, "notch.peek": false });
    await allow(true);
    await runner({ type: "hook.waiting", project: PROJECT, waiting: true });
    expect(wants().every((w) => w === false)).toBe(true);
    expect(head()).toBeNull();
  });
  test("Show me how or a look at the screen being on hides it (rule 5)", async () => {
    await open();
    await allow(true);
    await runner({ type: "hook.busy", project: PROJECT, busy: true });
    await runner({ type: "app.showme", stage: "looking", message: "" });
    expect(wants().at(-1)).toBe(false);
  });
});

describe("no animation frames while it is away", () => {
  test("hidden, the page asks for no frame at all", async () => {
    await open();
    await allow(true);
    await act(async () => { app.fire("runner-event", { v: 1, id: "s1", type: "app.stop_everything" }); await new Promise((r) => setTimeout(r, UNMOUNT_MS + 100)); });
    const g = globalThis as unknown as { requestAnimationFrame: (f: FrameRequestCallback) => number };
    const real = g.requestAnimationFrame;
    let frames = 0;
    g.requestAnimationFrame = (f) => { frames++; return real(f); };
    try { await settle(500); } finally { g.requestAnimationFrame = real; }
    expect(frames).toBe(0);
    expect(document.querySelector("canvas")).toBeNull();
  });
});

describe("the page's source", () => {
  const src = readFileSync(new URL("../src/peekOutPage.tsx", import.meta.url), "utf8");
  test("it asks the shell for only its own state, its wish, and the notch's click", () => {
    const cmds = [...src.matchAll(/invoke\("([\w]+)"/g)].map((x) => x[1]).sort();
    expect([...new Set(cmds)]).toEqual(["island_click", "peekout_state", "peekout_want"]);
    expect(src).not.toContain("send_command");
  });
  test("it draws Flowflow itself (the Draw live renderer or the pictures), never another character", () => {
    expect(src).toContain('import("./flowflow/view.tsx")');
    expect(src).not.toContain("FlowMini");
  });
});
