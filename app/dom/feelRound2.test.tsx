// Feel round 2 (19 Nov 2026): rendered checks for the states a daily user hits that used to have no next step: Memory's
// look up that never answers, and an engine that has not said hello yet.
import { describe, expect, test } from "bun:test";
import { act } from "@testing-library/react";
import { press, renderHome, screen } from "./render.tsx";
import { S } from "../src/strings.ts";

const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

describe("states with a plain next step", () => {
  test("Memory: with no answer after two seconds the quiet rows give way to a plain line and Try again", async () => {
    await renderHome();
    await press("Memory");
    // Feel round 3 (19 Nov 2026): the quiet rows wait 150 ms, so a quick answer never flashes them (this expectation
    // changed on purpose: they used to show at once).
    expect(document.querySelector(".mem-skel")).toBeNull();
    await wait(200);
    expect(document.querySelector(".mem-skel")).toBeTruthy();
    expect(screen.queryByText(S.homeMemorySlow, { exact: false })).toBeNull();
    await wait(2100);
    expect(document.querySelector(".mem-skel")).toBeNull();
    expect(screen.getByText(S.homeMemorySlow, { exact: false })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: S.tryAgain }).length).toBeGreaterThan(0);
    // One stacked block: its line and Try again inside one status, the button under the line, never run together.
    const slow = document.querySelector(".mem-slow")!;
    expect(slow.querySelector(".mem-slow-line")?.textContent).toBe(S.homeMemorySlow);
    expect(slow.querySelector("button")?.textContent).toBe(S.tryAgain);
  }, 10_000);

  test("an engine that has not said hello: Home says it is starting, with Restart, and the send arrow waits", async () => {
    // This page's replay has no hello (only the key's state).
    await renderHome({ answers: { replay_events: [{ v: 1, id: "k1", type: "auth.status", method: "api_key", source: "keychain" }] } });
    await wait(2100);
    expect(screen.getAllByText(S.home.blocked.starting.headline).length).toBeGreaterThan(0);
    expect(screen.getAllByText(S.home.blockedTag.starting).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: S.home.blocked.starting.main }).length).toBeGreaterThan(0);
    const send = document.querySelector<HTMLButtonElement>(".ask-row > .send");
    if (send) expect(send.disabled).toBe(true);
  }, 10_000);
});
