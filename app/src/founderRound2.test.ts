// Founder round 2: the rules behind the fixes, as plain checks (the DOM side is dom/founderRound2.test.tsx).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { undoBusy, undoSettled, type UndoState } from "./model.ts";
import { CHAT_ROW_MAX, fitRowProject } from "./notchChat.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const rule = (css: string, sel: string) => { const at = css.indexOf(`${sel} {`); expect(at, sel).toBeGreaterThanOrEqual(0); return css.slice(at, css.indexOf("}", at)); };

describe("the small chat's top row stays one line", () => {
  const css = read("./ui/black.css");
  test("the hello never breaks inside a word, and never squeezes below it", () => {
    const hi = rule(css, ".notch-chat .nc-hi");
    expect(hi).not.toContain("overflow-wrap: anywhere");
    expect(hi).not.toContain("min-width: 0");
  });
  test("the name takes only the room left, shortened to fit it, with its full name kept for its tooltip and VoiceOver", () => {
    const proj = rule(css, ".notch-chat .nc-proj");
    for (const d of ["flex: 1 1 0", "min-width: 0"]) expect(proj, d).toContain(d);
    const name = "/Users/me/projects/my-very-long-customer-onboarding-dashboard-project";
    // About 7 points a letter: 70 points of room fits a few letters and the ellipsis.
    const fits = (room: number) => (t: string) => t.length * 7 <= room;
    expect(fitRowProject(name, fits(70))).toBe("my-very-l…");
    expect(fitRowProject(name, fits(1000)).length).toBeLessThanOrEqual(CHAT_ROW_MAX);
    expect(fitRowProject(name, fits(20)), "not even a few letters fit: none").toBe("");
    expect(fitRowProject("/Users/me/shop", fits(70))).toBe("shop");
    const chat = read("./notchChat.tsx");
    expect(chat).toContain('<span className="nc-proj" ref={projRef} title={C.project(name)}><span aria-hidden="true">{fit ?? shown}</span><span className="sr">{name}</span></span>');
  });
});

describe("an undo that holds the other Undo buttons back", () => {
  const u = (o: Partial<UndoState>): UndoState => ({ stage: "done", checkpoint: "cp_1", ...o });
  test("only while it is asked, runs, or puts files back", () => {
    expect(undoBusy(null)).toBe(false);
    expect(undoBusy(u({ stage: "confirm" }))).toBe(true);
    expect(undoBusy(u({ stage: "working" }))).toBe(true);
    expect(undoBusy(u({ stage: "failed", note: "x" }))).toBe(false);
    expect(undoBusy(u({ stage: "done" }))).toBe(false);
    expect(undoBusy(u({ stage: "done", yours: ["a"], putBack: "confirm" }))).toBe(true);
  });
  test("failed, or done with nothing left to answer, is settled and clears itself", () => {
    expect(undoSettled(u({ stage: "failed" }))).toBe(true);
    expect(undoSettled(u({ stage: "done" }))).toBe(true);
    expect(undoSettled(u({ stage: "done", yours: ["a"] })), "files of yours to put back: it waits").toBe(false);
    expect(undoSettled(u({ stage: "working" }))).toBe(false);
  });
});

describe("the drag out of the notch", () => {
  test("captures on the handle that carries the handlers, and lets go from anywhere in the page", () => {
    const tuck = read("./tuck.ts");
    expect(tuck).toContain("(e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId)");
    expect(tuck).not.toContain("(e.target as HTMLElement | null)?.setPointerCapture");
    expect(tuck).toContain('window.addEventListener("pointerup", up);');
    expect(tuck).toContain('window.addEventListener("pointercancel", lost);');
  });
  test("the face hides while it is out, the handle stays (colours untouched)", () => {
    const css = read("./ui/notch.css");
    expect(css).toContain(".island-panel button.nb-hi[data-out] .nb-face, .notch-chat .nc-face-hold[data-out] .nc-face { visibility: hidden; }");
  });
});
