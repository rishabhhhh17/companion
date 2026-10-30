// The pointer overlay (overlay.ts), run for real on a stand in page in a process of its own (overlayHarness.ts).
// Found in the M11 audit (A63): a ring cleared while its arrow was still flying (Esc, Stop everything, the window changed)
// still landed: its caption was drawn after the clear and stayed, and a celebration later showed it over another app. A new
// ring during an old flight let the old one flash its caption too. Rule 22: nothing is drawn over the wrong app.
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { S } from "./strings.ts";

const run = Bun.spawnSync(["bun", "run", join(import.meta.dir, "overlayHarness.ts")], { cwd: join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
const seen = new Map<string, { captionOn: boolean; caption: string; drawn: number; ellipses: number; pending: number; splash?: number }>(
  run.stdout.toString().split("\n").filter((l) => l.startsWith("{")).map((l) => { const o = JSON.parse(l); return [o.name, o]; }),
);

describe("a ring that is cleared never lands", () => {
  test("the harness ran", () => {
    expect(run.exitCode, run.stderr.toString()).toBe(0);
    expect(seen.size).toBe(12);
  });
  test("cleared while flying: no caption and nothing drawn, then or later", () => {
    expect(seen.get("cleared while flying")).toMatchObject({ captionOn: false, drawn: 0 });
    expect(seen.get("party after the clear")?.captionOn).toBe(false);
  });
  test("the confetti never shows a caption with no ring under it, and leaves one that has its ring", () => {
    expect(seen.get("party with the ring there")).toMatchObject({ captionOn: true, caption: S.pointer.yourTurn("Click Publish") });
    expect(seen.get("party with a caption and no ring")?.captionOn).toBe(false);
  });
  test("a new ring during an old flight: the old one never shows its caption, the new one does", () => {
    expect(seen.get("the old ring's landing time")?.captionOn).toBe(false);
    expect(seen.get("a new ring during the flight")).toMatchObject({ captionOn: true, caption: S.pointer.yourTurn("Click Publish") });
  });
});

// M46 (F28): the Show me how ring lands at once; the flight is the opt in Fly to the place first.
describe("the ring shows at the place at once (M46)", () => {
  test("with Fly to the place first off, the caption is on as soon as the ring is ordered, with no drop drawn", () => {
    expect(seen.get("no fly: at once")).toMatchObject({ captionOn: true, caption: S.pointer.yourTurn("Click Save"), ellipses: 1 });
  });
  test("a ring that is not exact says so in its own sentence", () => {
    expect(seen.get("not exact")).toMatchObject({ captionOn: true, caption: "Your turn: Open the Format menu. Somewhere around here." });
  });
  test("outside Lively the held ring draws in and then schedules nothing while it waits", () => {
    expect(seen.get("no fly: held still")).toMatchObject({ captionOn: true, pending: 0 });
  });
  test("the flight is still there when chosen: a drop on the way and no caption yet", () => {
    expect(seen.get("fly: on the way")).toMatchObject({ captionOn: false, ellipses: 2 });
  });
  test("Lively keeps the held ring's gentle wobble", () => {
    expect(seen.get("lively: wobbles")!.pending).toBeGreaterThan(0);
  });
  test("a right click outside Lively: the green ring, the tick and the words, no splash and no flight home", () => {
    expect(seen.get("celebrate: still")).toMatchObject({ captionOn: true, caption: S.pointer.done, splash: 0 });
  });
});
