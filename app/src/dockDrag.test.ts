import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { shellSource } from "../dom/sourceText.ts";

const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");

// M47 (the founder: "it cannot genuinely move freely in the middle. It just lags"): the page no longer asks the shell to
// place the character on every pointer move. It says once that a drag began; the shell follows the pointer itself.
describe("dragging the character", () => {
  const dock = read("./dock.tsx");
  test("tells the shell once, when the press becomes a drag, and never on each move", () => {
    const calls = [...dock.matchAll(/invoke\("drag_dock"([^)]*)\)/g)];
    expect(calls.length).toBe(1);
    expect(calls[0][1]).toBe("");
    expect(dock).toContain('if (!p.dragging && Math.hypot(e.screenX - p.x, e.screenY - p.y) > 5) { p.dragging = true; void invoke("drag_dock"); }');
    // The let go still goes once, from the release.
    expect(dock).toContain('if (p.dragging) void invoke("drop_dock"); else void invoke("toggle_card");');
  });
  test("a release that never reaches the page still lets go, and a new drag never follows an old grab (review, 31 Oct)", () => {
    expect(dock).toContain("onPointerUp={up} onPointerCancel={lost} onLostPointerCapture={lost}");
    const at = dock.indexOf("const lost = () => {");
    const body = dock.slice(at, dock.indexOf("\n  };", at));
    expect(body).toContain('if (p?.dragging) void invoke("drop_dock");');
    expect(body, "a lost press opens nothing").not.toContain("toggle_card");
    expect(body).toContain("press.current = null;");
    const main = shellSource();
    const begin = main.slice(main.indexOf("fn drag_dock("), main.indexOf("\n}\n", main.indexOf("fn drag_dock(")));
    const clear = begin.indexOf("*DRAG.lock().unwrap_or_else(|e| e.into_inner()) = None;");
    expect(clear).toBeGreaterThan(-1);
    expect(clear, "cleared before the drag is said to be live").toBeLessThan(begin.indexOf("DRAG_LIVE.store(true"));
  });
  test("the shell moves the window from its own mouse watch, setting only where it is", () => {
    const main = shellSource();
    const at = main.indexOf("fn drag_follow(");
    const body = main.slice(at, main.indexOf("\n}\n", at));
    expect(body).toContain("setFrameOrigin(");
    expect(body).not.toContain("apply_dock(");
    expect(body).not.toContain("save_prefs(");
  });
});
