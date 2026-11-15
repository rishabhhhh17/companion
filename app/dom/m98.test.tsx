// M98 (F29): Home as a customer sees it today, with fixing not switched on for this Mac: the founder's words, no Try again,
// Check my project as the one button (it runs without the engine), and the developer key row only behind its switch.
import { describe, expect, test } from "bun:test";
import { _resetForTests, startSettings } from "../src/settingsStore.ts";
import { PROJECT, act, app, buttons, ev, hasButton, press, renderHome, runner, screen, settle, type } from "./render.tsx";
import { S } from "../src/strings.ts";

async function notOn(o: { settings?: Record<string, unknown>; project?: string } = {}) {
  await renderHome({
    ...o,
    answers: { replay_events: [ev({ type: "runner.hello", runnerVersion: "0.0.1", sdk: "test" }), ev({ type: "auth.status", method: "none" })], data_inventory: { keySaved: false } },
  });
  // The page reads its settings once as it loads (settingsStore.ts): read them again as a page opened with these.
  await act(async () => { _resetForTests(); startSettings(); });
  await settle();
}

describe("fixing not switched on for this Mac yet", () => {
  test("Home says the approved words, never getting ready, and has no Try again", async () => {
    await notOn();
    const text = document.body.textContent ?? "";
    expect(text).toContain("Fixing is not switched on for this Mac yet");
    expect(text).toContain("Checking your project still works.");
    expect(text).not.toMatch(/getting ready|add your key|your own Claude|API key/i);
    expect(buttons()).not.toContain("Try again");
  });
  test("the one main button is Check my project, and it runs the project's own checks", async () => {
    await notOn();
    expect(buttons()).toContain("Check my project");
    await press("Check my project");
    const sent = app.invoked("send_command").map((c) => (c.args as { cmd?: { type?: string; project?: string } }).cmd);
    expect(sent.some((c) => c?.type === "problem.find" && c.project === PROJECT)).toBe(true);
    expect(app.invoked("restart_engine").length).toBe(0);
  });
  test("what comes back: a found problem offers no Fix it and no Why, and says fixing comes later (review of M98)", async () => {
    await notOn();
    await press("Check my project");
    const find = app.sent().filter((c) => c.type === "problem.find").at(-1)!;
    const problem = { kind: "line", file: "src/math.test.ts", line: 5, column: 21, lineText: "expect(add(2, 3)).toBe(5);", message: "AssertionError: expected -1 to be 5", from: "tests" };
    await runner({ type: "problem.found", project: PROJECT, agent: find.agent, verdict: "failed", label: "Running the tests", detail: "The tests did not pass.", problem });
    await settle();
    expect(screen.getAllByText("AssertionError: expected -1 to be 5").length).toBeGreaterThan(0);
    expect(hasButton(S.pointFix)).toBe(false);
    expect(hasButton(S.drawWhy)).toBe(false);
    expect(document.body.textContent).toContain(S.pointFixOff);
    expect(hasButton(S.askChips.found)).toBe(false);
  });
  test("the status tag is the project's own colour, never the problem red (review of M98)", async () => {
    await notOn();
    const tag = document.querySelector(".hero .ui-mtag");
    expect(tag?.textContent).toMatch(/not checked yet/i);
    expect(tag?.getAttribute("data-meaning")).toBe("notChecked");
    expect(document.querySelector(".hero")?.getAttribute("data-meaning")).toBe("notChecked");
  });
  test("with no project open: no line about your project, and the tick says only checking is ready (review of M98)", async () => {
    await notOn({ project: "" });
    const text = document.body.textContent ?? "";
    expect(text).toContain(S.home.blocked.key.lineNoProject);
    expect(text).not.toContain(S.home.blocked.key.line);
    expect(text).toContain("Checking is ready on this Mac");
    expect(text).not.toContain(S.screens.setupSteps.ready.done);
    expect(text).not.toContain(S.screens.setupSteps.practice.title);
  });
});

describe("the developer key row", () => {
  const keyRowShown = () => screen.queryAllByText("Claude key").length > 0;
  test("hidden while Developer tools is off, in search too", async () => {
    await notOn();
    await press("Settings");
    await type(screen.getByRole("searchbox", { name: "Search settings" }), "claude key");
    await settle(60);
    expect(keyRowShown()).toBe(false);
    expect(screen.queryAllByLabelText("Anthropic API key").length).toBe(0);
  });
  test("shown once Developer tools is on", async () => {
    await notOn({ settings: { "developer.tools": true } });
    await press("Settings");
    await type(screen.getByRole("searchbox", { name: "Search settings" }), "claude key");
    await settle(60);
    expect(keyRowShown()).toBe(true);
  });
});
