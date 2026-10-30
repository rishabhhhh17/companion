// Peeking (27 Oct 2026): the shell moves the character past the edge of the screen and back (peek.rs, tested in Rust).
// The page is only told the pose and the edge, so the character leans toward the screen while it peeks.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { peekFrom, PEEK_POSES } from "./peek.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("the character's page and peeking", () => {
  test("what the shell sends is read safely: anything unknown is fully in, on the right", () => {
    expect(PEEK_POSES).toEqual(["hidden", "peek", "in"]);
    expect(peekFrom({ pose: "peek", edge: "left" })).toEqual({ pose: "peek", edge: "left" });
    expect(peekFrom({ pose: "hidden", edge: "bottom" })).toEqual({ pose: "hidden", edge: "bottom" });
    expect(peekFrom({ pose: "away", edge: "middle" })).toEqual({ pose: "in", edge: "right" });
    expect(peekFrom(null)).toEqual({ pose: "in", edge: "right" });
    expect(peekFrom("peek")).toEqual({ pose: "in", edge: "right" });
  });
  test("the page only adds the pose and the edge as data on the character, and asks the shell for nothing new", () => {
    const dock = read("./dock.tsx");
    expect(dock).toContain("const peek = usePeek();");
    expect(dock).toContain("data-peek={peek.pose} data-peek-edge={peek.edge}");
    const page = read("./peek.ts");
    expect(page).toContain('listen("peek"');
    expect(page).not.toMatch(/\binvoke\b/);
  });
  test("M46: it never tilts; the pictures move a touch toward the screen, the live drawing draws its own stick", () => {
    const css = read("./style.css");
    for (const e of ["left", "right", "top", "bottom"]) expect(css).toContain(`.character:not([data-live])[data-peek="peek"][data-peek-edge="${e}"]`);
    expect(css).not.toMatch(/\[data-peek[^{]*\{[^}]*rotate: -?\d/);
    expect(css).not.toMatch(/\.character\[data-peek="peek"\]/);   // nothing on the live drawing
    expect(css).toContain('@media (prefers-reduced-motion: reduce) { .character[data-peek] { translate: none; transition: none; } }');
    expect(css).toContain(':root[data-less-motion] .character[data-peek] { translate: none; transition: none; }');
  });
  test("the shell moves it through the one frame helper, brings it in at once for a light, and reads the setting each time", () => {
    const main = read("../src-tauri/src/main.rs");
    const body = (n: string) => { const a = main.indexOf(`fn ${n}(`); expect(a, n).toBeGreaterThan(-1); return main.slice(a, main.indexOf("\n}\n", a)); };
    const apply = body("peek_apply");
    expect(apply).toContain("set_frame_moving(d, to_appkit(f, ph), secs, None, &DOCK_MOVES)");
    expect(apply).toContain("on: hs.peek, stick: hs.stick, idle_on: hs.peek_idle");
    expect(apply).toContain('app.emit_to("dock", "peek"');
    expect(body("peek_heard")).toContain("if lit { peek_now(app, true); }");
    expect(read("../src-tauri/src/runner.rs")).toContain("crate::peek_heard(app, &v);");
  });
});
