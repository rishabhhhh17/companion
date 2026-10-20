// The pointer overlay (overlay.ts), run for real on a stand in page in a process of its own (overlayHarness.ts).
// Found in the M11 audit (A63): a ring cleared while its arrow was still flying (Esc, Stop everything, the window changed)
// still landed: its caption was drawn after the clear and stayed, and a celebration later showed it over another app. A new
// ring during an old flight let the old one flash its caption too. Rule 22: nothing is drawn over the wrong app.
import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const run = Bun.spawnSync(["bun", "run", join(import.meta.dir, "overlayHarness.ts")], { cwd: join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
const seen = new Map<string, { captionOn: boolean; caption: string; drawn: number }>(
  run.stdout.toString().split("\n").filter((l) => l.startsWith("{")).map((l) => { const o = JSON.parse(l); return [o.name, o]; }),
);

describe("a ring that is cleared never lands", () => {
  test("the harness ran", () => {
    expect(run.exitCode, run.stderr.toString()).toBe(0);
    expect(seen.size).toBe(6);
  });
  test("cleared while flying: no caption and nothing drawn, then or later", () => {
    expect(seen.get("cleared while flying")).toMatchObject({ captionOn: false, drawn: 0 });
    expect(seen.get("party after the clear")?.captionOn).toBe(false);
  });
  test("the confetti never shows a caption with no ring under it, and leaves one that has its ring", () => {
    expect(seen.get("party with the ring there")).toMatchObject({ captionOn: true, caption: "Your turn: Click Publish" });
    expect(seen.get("party with a caption and no ring")?.captionOn).toBe(false);
  });
  test("a new ring during an old flight: the old one never shows its caption, the new one does", () => {
    expect(seen.get("the old ring's landing time")?.captionOn).toBe(false);
    expect(seen.get("a new ring during the flight")).toMatchObject({ captionOn: true, caption: "Your turn: Click Publish" });
  });
});
