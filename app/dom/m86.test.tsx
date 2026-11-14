// M86: Watch what changed, rendered. The review card plays the replay beat by beat with its sentence, Watch again starts
// it over, a still picture shows every beat at once, replay.show off hides it, and the notch's review card keeps its own
// pass or fail tile (a thumbnail there was too small to read).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { IslandPanel } from "../src/islandPanel.tsx";
import { ReplayView } from "../src/replayView.tsx";
import { initial, reduce, type Model } from "../src/model.ts";
import { replayOf, replayTimes } from "../src/replay.ts";
import { _resetForTests, startSettings } from "../src/settingsStore.ts";
import { act } from "./render.tsx";
import { S } from "../src/strings.ts";
import { PROJECT, ev, press, renderPage, screen, settle } from "./render.tsx";

const fixture = JSON.parse(readFileSync(new URL("../../protocol/fixtures/events.jsonl", import.meta.url), "utf8").split("\n").find((l) => l.includes('"id":"m86e2"'))!);
const replay = replayOf(fixture.replay)!;
/** A bare component reads the settings store, which a page starts; here the test starts it with these values. */
async function withSettings(values: Record<string, unknown>) {
  const { returning } = await import("./render.tsx");
  returning({ settings: values });
  await act(async () => { _resetForTests(); startSettings(); await new Promise((r) => setTimeout(r, 20)); });
}

describe("the replay on the review card", () => {
  test("it starts on its first beat's sentence and moves on by itself, with Watch again", async () => {
    await withSettings({ "replay.speed": "fast", "replay.reduceMotion": "moving" });
    await renderPage(<ReplayView replay={replay} rating="worth_a_look" />, { settings: { "replay.speed": "fast", "replay.reduceMotion": "moving" } });
    expect(screen.getByRole("figure", { name: S.m86.watchLabel })).toBeTruthy();
    const said = () => document.querySelector(".rp-say-line[data-on]")?.textContent;
    expect(said()).toBe(replay.beats[0].say);
    // Only the beat now is seen; the others hold its place, hidden from screen readers too.
    expect(document.querySelectorAll('.rp-say-line[aria-hidden="true"]').length).toBe(replay.beats.length - 1);
    // Every beat is in the drawing's own name, so a screen reader hears the whole replay at once.
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(replay.beats.map((b) => b.say).join(" "));
    expect(document.querySelectorAll(".rp-mark").length).toBe(replay.beats.length);
    await settle(replayTimes(replay, "fast")[1].at + 150);
    expect(said()).toBe(replay.beats[1].say);
    await press(S.m86.watchAgain);
    expect(said()).toBe(replay.beats[0].say);
    expect(screen.getByText(S.m86.byRules)).toBeTruthy();
  });
  test("a still picture: every beat drawn and every sentence listed, no Watch again", async () => {
    await withSettings({ "replay.reduceMotion": "still" });
    await renderPage(<ReplayView replay={replay} rating="worth_a_look" />, { settings: { "replay.reduceMotion": "still" } });
    for (const b of replay.beats) expect(screen.getByText(b.say)).toBeTruthy();
    expect(screen.queryByRole("button", { name: S.m86.watchAgain })).toBeNull();
    expect(document.querySelector(".rp")!.hasAttribute("data-still")).toBe(true);
  });
});

describe("the replay in the notch", () => {
  const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, ev(e) as never), from);
  test("the latest review's card keeps its pass or fail tile, never a replay too small to read", async () => {
    const m = run([
      { type: "auth.status", method: "api_key", source: "keychain" }, { type: "ui.folderShown", project: PROJECT },
      { type: "review.batch", project: PROJECT, batch: fixture.batch, files: fixture.files, count: 2, capped: false, secretFiles: [], auto: false },
      { ...fixture, project: PROJECT },
      { type: "tasks.list", project: PROJECT, tasks: [], reviews: [{ id: 1, at: new Date().toISOString(), count: 2, files: ["src/pages/Checkout.tsx", "src/api/pay.ts"], rating: "worth_a_look", touches: ["payments"], checks: "failed", did: "looks_fine", summary: fixture.summary }] },
    ]);
    expect(m.review?.result?.replay).toBeTruthy();
    await renderPage(<IslandPanel m={m} line="" shown />);
    const card = document.querySelector('.ip-card[data-kind="review"]')!;
    expect(card).toBeTruthy();
    expect(card.querySelector(".rp")).toBeNull();
    expect(card.querySelector(".ui-mtile, [data-c]")).toBeTruthy();
  });
  test("with replay.show off, the card keeps its tile", async () => {
    const m = run([
      { type: "auth.status", method: "api_key", source: "keychain" }, { type: "ui.folderShown", project: PROJECT },
      { type: "review.batch", project: PROJECT, batch: fixture.batch, files: fixture.files, count: 2, capped: false, secretFiles: [], auto: false },
      { ...fixture, project: PROJECT },
      { type: "tasks.list", project: PROJECT, tasks: [], reviews: [{ id: 1, at: new Date().toISOString(), count: 2, files: ["src/pages/Checkout.tsx"], rating: "worth_a_look", touches: ["payments"], checks: "failed", did: "looks_fine", summary: fixture.summary }] },
    ]);
    await withSettings({ "replay.show": false });
    await renderPage(<IslandPanel m={m} line="" shown />, { settings: { "replay.show": false } });
    expect(document.querySelector('.ip-card[data-kind="review"] .rp')).toBeNull();
  });
});
