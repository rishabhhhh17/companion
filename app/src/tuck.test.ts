// M111: tucking Flowflow into the notch, the pages' side (the rules are in docking.rs, tested there).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { DRAG_OUT_PX, SWALLOW_MS, TUCK_FADE_MS, TUCK_MS, dragOutStep, hintFrom, swallowClick, tuckFrom, tuckMs, tuckStep, type DragOut, type TuckLook } from "./tuck.ts";
import { S } from "./strings.ts";

const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");

describe("the tuck's motion", () => {
  test("a short spring under 300 ms, the same as the shell's, and a plain fade with Reduce Motion", () => {
    expect(TUCK_MS).toBeLessThan(300);
    const rust = read("../src-tauri/src/docking.rs");
    expect(rust).toContain(`pub const TUCK_MS: u64 = ${TUCK_MS};`);
    expect(rust).toContain(`pub const TUCK_FADE_MS: u64 = ${TUCK_FADE_MS};`);
    expect(tuckMs(true)).toBe(TUCK_FADE_MS);
    expect(tuckMs(false)).toBe(TUCK_MS);
    const tokens = read("./ui/tokens.css");
    expect(tokens).toContain(`--dur-tuck: ${TUCK_MS}ms;`);
    expect(tokens).toContain(`--dur-tuck-fade: ${TUCK_FADE_MS}ms;`);
    const css = read("./ui/tuck.css");
    // With Reduce Motion only the fade: no scale or move.
    expect(css).toMatch(/\.dock\[data-tuck="in"\]\[data-calm\] \.character \{[^}]*opacity: 0;[^}]*scale: none;/);
  });
  test("the shell's words are read safely", () => {
    expect(tuckFrom({ on: true, calm: true })).toEqual({ on: true, calm: true });
    // Feel round 1: where the notch is from the character (docking.rs tuck_aim), when the shell knows it; never a wild value.
    expect(tuckFrom({ on: true, calm: false, dx: -40.5, dy: -170 })).toEqual({ on: true, calm: false, aim: { dx: -40.5, dy: -170 } });
    for (const bad of [{ dx: "1", dy: 2 }, { dx: Number.NaN, dy: 2 }, { dx: 1 }, { dx: 1e7, dy: 0 }]) expect(tuckFrom({ on: true, ...bad }).aim).toBeUndefined();
    for (const bad of [null, 3, "on", { on: "yes" }]) expect(tuckFrom(bad)).toEqual({ on: false, calm: false });
    expect(hintFrom({ on: true })).toBe(true);
    for (const bad of [null, {}, { on: 1 }]) expect(hintFrom(bad)).toBe(false);
  });
});

describe("the character's look (M111 review)", () => {
  test("out, then the pointer over the notch, then the out timer fires: it keeps shrinking toward the notch", () => {
    let look: TuckLook = null;
    look = tuckStep(look, { kind: "tuck", on: false });
    expect(look).toBe("out");
    look = tuckStep(look, { kind: "hint", on: true });
    expect(look).toBe("take");
    look = tuckStep(look, { kind: "clear" });
    expect(look).toBe("take");
  });
  test("the timer clears only the out look; the hint comes and goes; a tuck goes in", () => {
    expect(tuckStep("out", { kind: "clear" })).toBeNull();
    expect(tuckStep("in", { kind: "clear" })).toBe("in");
    expect(tuckStep(null, { kind: "hint", on: true })).toBe("take");
    expect(tuckStep("take", { kind: "hint", on: false })).toBeNull();
    expect(tuckStep("in", { kind: "hint", on: false })).toBe("in");
    expect(tuckStep("take", { kind: "tuck", on: true })).toBe("in");
  });
  test("useTuck uses the step for every change, and a hint stops the out timer", () => {
    const src = read("./tuck.ts");
    expect(src).toContain("setTimeout(() => setLook((was) => tuckStep(was, { kind: \"clear\" }))");
    expect(src).toMatch(/listen\("tuck-hint", \(e\) => \{ clearTimeout\(clear\);/);
  });
});

describe("dragging Flowflow out of the notch", () => {
  const step = (s: DragOut, kind: "down" | "move" | "up" | "lost", x: number, y = 0, on = true) => dragOutStep(s, { kind, x, y, on });
  test("a move past the threshold begins the drag once; the let go lets it go and swallows the click", () => {
    let r = step(null, "down", 0);
    expect(r.say).toBeNull();
    r = step(r.s, "move", DRAG_OUT_PX - 1);
    expect(r.say).toBeNull();
    r = step(r.s, "move", DRAG_OUT_PX + 1);
    expect(r.say).toBe("untuck_drag");
    r = step(r.s, "move", 200);
    expect(r.say).toBeNull();
    r = step(r.s, "up", 200);
    expect(r).toEqual({ s: null, say: "drop_dock", click: false });
  });
  test("a plain click stays a click; a lost capture after a drag still lets go", () => {
    let r = step(null, "down", 0);
    r = step(r.s, "up", 1);
    expect(r).toEqual({ s: null, say: null, click: true });
    r = step(null, "down", 0);
    r = step(r.s, "move", 40);
    expect(step(r.s, "lost", 40).say).toBe("drop_dock");
  });
  test("only a click right after a drag's let go is swallowed; a later click on the face opens the chat (M111 review)", () => {
    expect(SWALLOW_MS).toBeLessThanOrEqual(300);
    expect(swallowClick(1000, 1000 + SWALLOW_MS)).toBe(true);
    expect(swallowClick(1000, 1001)).toBe(true);
    expect(swallowClick(1000, 1001 + SWALLOW_MS)).toBe(false);
    expect(swallowClick(null, 1000)).toBe(false);
    // The next press forgets the let go, so no later click is ever eaten.
    const src = read("./tuck.ts");
    expect(src).toContain('if (kind === "down") dropAt.current = null;');
  });
  test("not tucked, the face is only a button: no drag", () => {
    let r = step(null, "down", 0, 0, false);
    r = step(r.s, "move", 100);
    expect(r.say).toBeNull();
  });
});

describe("where it shows", () => {
  test("the words are in strings.ts", () => {
    // The founder's words, with the character's own name (never "Flowflow", M72 item 7).
    expect(S.m111.take("Squibby")).toBe("Let go to tuck Squibby in");
    expect(S.m111.bringOut("Squibby")).toBe("Bring Squibby out");
    expect(S.m111.inNotch("Squibby")).toBe("Squibby is in the notch. Point here to see it.");
    for (const f of Object.values(S.m111)) expect(f("Squibby")).not.toMatch(/\u2014|flowflow/i);
  });
  test("the notch's row, the chat's button and both faces are wired", () => {
    const island = read("./island.tsx"), panel = read("./islandPanel.tsx"), chat = read("./notchChat.tsx"), dock = read("./dock.tsx");
    expect(island).toContain("data-take={take ? \"\" : undefined}");
    expect(island).toContain("S.m111.take(");
    // After a tuck the notch says for a moment where it went (the shell sends take "tucked").
    expect(island).toContain("S.m111.inNotch(");
    // The face in the hover row, the one way to drag it out there, says so on hover, as the chat's face does.
    expect(panel).toContain("title={tucked ? S.m111.tucked(who) : undefined}");
    expect(panel).toContain("useDragOut(");
    expect(chat).toContain("useDragOut(");
    expect(chat).toContain('invoke("untuck")');
    expect(chat).toContain("S.m111.bringOut(");
    expect(dock).toContain("useTuck()");
    // Colours only in tokens.css.
    for (const f of ["./tuck.ts", "./island.tsx", "./notchChat.tsx"]) expect(read(f)).not.toMatch(/#[0-9a-f]{3,6}\b|rgba?\(/i);
  });
});
