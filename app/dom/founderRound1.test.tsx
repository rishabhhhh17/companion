// Founder round 1 (17 Nov 2026, after using the real app): "Start the practice" and Stop showed at once while the practice
// checked (screenshot 16), a second press sent a second check, Memory could wait forever on a refused list, and the Learn
// footnote sat at the column edge. Rendered here as the person meets them.
import { describe, expect, test } from "bun:test";
import { S } from "../src/strings.ts";
import { CATALOG } from "../src/practice.ts";
import { PROJECT, app, buttons, press, renderHome, runner, settle } from "./render.tsx";

const signup = CATALOG.find((c) => c.id === "signup") ?? CATALOG[0]!;
const rec = { practice_list: { practices: [{ id: signup.id, path: PROJECT, there: true, started: "2026-11-01" }], damaged: false } };

describe("a practice's check: one action at a time", () => {
  test("while it checks, the hero has only Stop, and nothing sends a second check", async () => {
    await renderHome({ answers: rec });
    await settle(150);
    const first = app.sentTypes().filter((t) => t === "problem.find").length;
    const main = S.home.needMain.practiceStart;
    if (buttons().includes(main)) await press(main);
    const cmd = app.sent().filter((c) => c.type === "problem.find").at(-1);
    expect(cmd).toBeTruthy();
    await runner({ type: "agent.state", agent: (cmd as { agent?: string }).agent ?? "point-1", state: "checking" });
    await settle(60);
    const hero = document.querySelector(".hero-main");
    const acts = hero ? [...hero.querySelectorAll("button")].map((b) => b.textContent) : [];
    expect(acts).not.toContain(main);
    expect(acts).toEqual([S.stop]);
    // Anywhere else the same words show (the practice's own card), they cannot be pressed while it checks.
    for (const b of [...document.querySelectorAll("button")].filter((b) => b.textContent === main)) expect((b as HTMLButtonElement).disabled).toBe(true);
    expect(buttons().some((b) => b.startsWith(S.stop))).toBe(true);
    const sent = app.sentTypes().filter((t) => t === "problem.find").length;
    expect(sent - first).toBeLessThanOrEqual(1);
  });
});

describe("Memory never waits forever", () => {
  test("a refused list says so with Try again, and is asked again when the engine says hello", async () => {
    await renderHome();
    app.answer("send_command", (a: { cmd?: { type?: string } }) => { if (a?.cmd?.type === "memory.list") throw "The engine is restarting."; return undefined; });
    await press("Memory");
    await settle(100);
    expect(document.body.textContent).toContain(S.tryAgain);
    app.answer("send_command", undefined);
    const before = app.sentTypes().filter((t) => t === "memory.list").length;
    await runner({ type: "runner.hello", runnerVersion: "0.0.1", sdk: "t" });
    await settle(60);
    expect(app.sentTypes().filter((t) => t === "memory.list").length).toBeGreaterThan(before);
  });
});
