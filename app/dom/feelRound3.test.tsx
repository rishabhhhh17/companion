// Feel round 3 (19 Nov 2026): rendered checks for what the founder feels every day. Sending in the small chat shows the
// words at once, History keeps one column for its actions, and the tall bar says how the project stands off Now.
import { describe, expect, test } from "bun:test";
import { S } from "../src/strings.ts";
import { PROJECT, act, app, emit, fireEvent, press, renderHome, runner, settle } from "./render.tsx";

const field = () => document.querySelector<HTMLTextAreaElement>(".notch-chat textarea");
const sinceMidnight = Date.now() - new Date(new Date().setHours(0, 0, 0, 0)).getTime();
const ago = (ms: number) => new Date(Date.now() - Math.min(ms, sinceMidnight / 2)).toISOString();
const done = { type: "tasks.list", project: PROJECT, tasks: [
  { id: 1, label: "fix the email check", status: "done", usd: 0.02, startedAt: ago(3_600_000), endedAt: ago(3_500_000), checkpoint: "cp_1", changed: 2, proof: "passed" },
] };

describe("the small chat answers the press at once", () => {
  test("Return with no answer from the engine yet: the person's words are a bubble in the same render, with the working dots", async () => {
    await renderHome();
    await emit("opened", { keyboard: false, instant: false, chat: true });
    const f = field()!;
    await act(async () => { f.value = "make the button blue"; fireEvent.input(f); });
    await act(async () => { fireEvent.keyDown(f, { key: "Enter" }); });
    expect(app.sentTypes()).toContain("agent.start");
    const mine = [...document.querySelectorAll(".notch-chat .nc-me")].map((b) => b.textContent);
    expect(mine).toEqual(["make the button blue"]);
    expect(document.querySelector(".notch-chat .nc-them .nc-dots")).toBeTruthy();
    // Newest at the foot: the pending pair are the last two bubbles.
    const all = [...document.querySelectorAll(".notch-chat .nc-b")];
    expect(all.at(-2)?.classList.contains("nc-me")).toBe(true);
  });

  test("empty: one short line just above the field with a few questions; a press only fills the field", async () => {
    await renderHome();
    await emit("opened", { keyboard: false, instant: false, chat: true });
    expect(document.querySelector(".notch-chat .nc-news")?.hasAttribute("data-empty")).toBe(true);
    expect(document.querySelector(".notch-chat .nc-them")?.textContent).toBe(S.m96.chat.empty("shop"));
    const pills = [...document.querySelectorAll(".notch-chat .nc-pill")].map((b) => b.textContent);
    expect(pills).toEqual([...S.m96.chat.suggest]);
    await act(async () => { fireEvent.click(document.querySelector(".notch-chat .nc-pill")!); });
    expect(field()?.value).toBe(S.m96.chat.suggest[0]);
    expect(app.sentTypes()).not.toContain("agent.start");
    // Rule 9: the field never takes the keys by itself.
    expect(document.activeElement).not.toBe(field());
  });

  test("the top row says the project's state under its name", async () => {
    await renderHome();
    await runner(done);
    await emit("opened", { keyboard: false, instant: false, chat: true });
    expect(document.querySelector(".notch-chat .nc-state")?.textContent).toMatch(/^Passed /);
  });
});

describe("History and the tall bar", () => {
  test("History: when it ended is in the row's one line, so the right side holds only the action", async () => {
    await renderHome({ settings: { "look.layout": "tall" } });
    await runner(done);
    await press("History");
    await settle(60);
    const row = document.querySelector(".hist .ui-mrow")!;
    expect(row.querySelector(".ui-mrow-line .hist-time")).toBeTruthy();
    expect(row.querySelector(".ui-mrow-fact .hist-time")).toBeNull();
  });

});
