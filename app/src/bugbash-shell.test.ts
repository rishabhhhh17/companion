import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const fnBody = (src: string, head: string, end = "\n  };") => { const at = src.indexOf(head); expect(at, head).toBeGreaterThan(-1); return src.slice(at, src.indexOf(end, at)); };

// Bug bash, 5 Nov 2026: the shell's confirmed bugs.
describe("a right click or Control click on the character", () => {
  const dock = read("./dock.tsx");
  test("only a primary button press toggles Home or starts a drag", () => {
    const down = fnBody(dock, "const down = (e: React.PointerEvent) => {", "};\n");
    expect(down).toContain("e.button !== 0");
    expect(down).toContain("e.ctrlKey");
    // The secondary press is refused before anything is recorded, so its release toggles nothing and its move drags nothing.
    expect(down.indexOf("return")).toBeLessThan(down.indexOf("press.current ="));
    expect(down.indexOf("return")).toBeLessThan(down.indexOf('invoke("char_click")'));
  });
  test("the shell's let go saves nothing for a drag it never followed", () => {
    const docking = read("../src-tauri/src/docking.rs");
    const rel = fnBody(docking, "pub fn release_at(", "\n    }\n");
    expect(rel).toContain("if !self.moved");
  });
});

describe("Home's hover nudge after the shell forgets the hover", () => {
  test("reset_hover tells Home's page the hover is off", () => {
    const main = read("../src-tauri/src/main.rs");
    const body = fnBody(main, "fn reset_hover() {", "\n}\n");
    expect(body).toContain('emit_to("card", "home-hover", json!({ "on": false }))');
  });
  test("closed by the shell, the page drops the nudge too", () => {
    const stage = read("./homeStage.tsx");
    const closed = stage.slice(stage.indexOf('listen("closed"'), stage.indexOf("\n", stage.indexOf('listen("closed"')));
    expect(closed).toContain("setHover(false)");
  });
});
