// The island window (F18.1) is wired the way the rules ask: a page of its own fed by the same runner events, a borderless
// non activating panel above the menu bar that can never take the keyboard, hidden in full screen apps, when the person
// hides Companion and (when that setting is on) from screen sharing, and the pointer noticed only on our own window.
// The geometry is tested in app/src-tauri/src/island.rs; these read the glue as text, because it needs a real Mac to run.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const main = read("../src-tauri/src/main.rs");
const fnBody = (name: string) => { const a = main.indexOf(`fn ${name}`); expect(a, name).toBeGreaterThan(-1); return main.slice(a, main.indexOf("\n}\n", a)); };

describe("the island page", () => {
  test("is its own small page, built with the others", () => {
    expect(read("../island.html")).toContain('src="/src/island.tsx"');
    expect(read("../vite.config.ts")).toMatch(/island: resolve\(__dirname, "island\.html"\)/);
    const caps = JSON.parse(read("../src-tauri/capabilities/default.json"));
    expect(caps.windows).toContain("island");
  });
  test("reads the same runner events as the character and Home, and asks the app for nothing else", () => {
    const page = read("./island.tsx");
    expect(page).toContain("useModel()");
    expect(page).toContain('invoke("island_alert", { on');
    expect(page).toContain('invoke("island_click")');
    expect(page).toContain('listen("island-mode"');
    const calls = [...page.matchAll(/invoke\("(\w+)"/g)].map((m) => m[1]);
    expect(new Set(calls)).toEqual(new Set(["island_alert", "island_click", "island_state"]));
    expect(page).not.toMatch(/send_command|keydown|onKey/i);
  });
  test("is told what the island sits on: the notch, a pill in the menu bar, or the thin line on the top edge", () => {
    const page = read("./island.tsx");
    expect(main).toContain('"island-mode", json!({ "mode": mode.word(), "kind": kind.word() })');
    expect(fnBody("island_state")).toContain('"kind"');
    for (const k of ["notch", "pill", "edge"]) expect(page, k).toContain(`"${k}"`);
    expect(page).not.toMatch(/\.notch\b|notch: /);
  });
  test("draws the lip under the notch and the status lines at the sizes the app gives them", () => {
    const rs = read("../src-tauri/src/island.rs");
    const css = read("./style.css");
    const num = (re: RegExp, text: string) => { const m = text.match(re); expect(m, String(re)).not.toBeNull(); return Number(m![1]); };
    expect(num(/\.lip \{[^}]*height: (\d+)px/, css)).toBe(num(/pub const LIP: f64 = ([\d.]+);/, rs));
    expect(num(/\.peekline \{[^}]*line-height: (\d+)px/, css)).toBe(num(/pub const LINE_H: f64 = ([\d.]+);/, rs));
    expect(num(/\.peekline \{[^}]*-webkit-line-clamp: (\d+)/, css)).toBe(num(/pub const PEEK_LINES: f64 = ([\d.]+);/, rs));
    // Nothing is drawn beside the notch any more: the old ears over the menu bar are gone.
    expect(read("./island.tsx")).not.toMatch(/\bear\b/);
    expect(css).not.toMatch(/\.ear\b/);
  });
  test("the app has the commands the page uses", () => {
    for (const c of ["island_click", "island_alert", "island_state"]) expect(new RegExp(`generate_handler!\\[[^\\]]*\\b${c}\\b`).test(main), c).toBe(true);
  });
});

describe("the island window", () => {
  test("is a borderless non activating panel (it can never become the key window) above the menu bar", () => {
    expect(main).toMatch(/let island = make_panel\(mtm, island_ns, false, /);
    expect(main).toMatch(/island\.setLevel\(island::LEVEL\)/);
    expect(read("../src-tauri/src/island.rs")).toMatch(/pub const LEVEL: isize = 2[6-9];/);
    const islandLines = main.split("\n").filter((l) => /\bisland\b|ISLAND/.test(l));
    for (const l of islandLines) expect(l, l).not.toMatch(/makeKeyWindow|makeKeyAndOrderFront|set_focus|\.show\(\)/);
  });
  test("notices the pointer only through a tracking area on its own window, and never key events", () => {
    expect(main).toContain("NSTrackingArea");
    expect(main).toMatch(/NSTrackingAreaOptions::MouseEnteredAndExited \| NSTrackingAreaOptions::ActiveAlways \| NSTrackingAreaOptions::InVisibleRect/);
    expect(main).not.toMatch(/addGlobalMonitorForEvents|NSEventMask::KeyDown|CGEventTap/);
  });
  test("is hidden with the rest in a full screen app and when the person hides Companion, and shown again after", () => {
    const tick = fnBody("tick");
    const hide = tick.slice(tick.indexOf("if !show"), tick.indexOf("hidden_for_full_screen"));
    expect(hide).toContain("island_show(false)");
    const back = tick.slice(tick.indexOf("hidden_for_full_screen"), tick.indexOf("shown_after_full_screen"));
    expect(back).toContain("island_show(true)");
    const menu = main.slice(main.indexOf('"hide" =>'), main.indexOf('log("menu_hide"'));
    expect(menu).toContain("island_show(!hide");
  });
  test("follows the screen sharing setting with the card and the overlay", () => {
    expect(fnBody("apply_sharing")).toContain("ISLAND.with(");
  });
  test("goes to the display the person uses: from tick, by which display the pointer is on, not while Home is open", () => {
    const tick = fnBody("tick");
    expect(tick).toContain("follow_pointer(mtm);");
    const f = fnBody("follow_pointer");
    expect(f).toContain("ISLAND_FOLLOW.lock()");
    expect(f).toContain("NSEvent::mouseLocation()");
    expect(f).toContain("HOME_OPEN.load(");
    expect(f).toMatch(/remember_island\(&id\); place_island\(mtm, false, "followed_pointer"\)/);
    // Only where the pointer is: never a picture of the screen, never the windows under it, never keys.
    expect(f).not.toMatch(/capture|CGWindowList|on_screen_windows|screenshot|pressedMouseButtons|key/i);
  });
  test("moves when a display is plugged in or out", () => {
    const tick = fnBody("tick");
    expect(tick.slice(tick.indexOf("let sig = signature("))).toMatch(/place_island\(mtm, false, "screens_changed"\)/);
  });
  test("Home drops down from the island; beside the character only when there is no island", () => {
    const place = fnBody("place_card");
    expect(place).toContain("island::home_frame(");
    expect(place.indexOf("island::home_frame(")).toBeLessThan(place.indexOf("card_frame("));
  });
  test("opening Home brings the island to the display with the pointer, and starts the click away watch", () => {
    const open = fnBody("open_card");
    expect(open).toMatch(/place_island\(mtm, true, /);
    expect(open).toContain("watch_click_away(");
    const watch = fnBody("watch_click_away");
    expect(watch).toContain("island::ClickAway::new(");
    expect(watch).toContain("HOME_OPEN.load(");
    expect(watch).toContain('emit_to("card", "home-click-away"');
  });
  test("every way Home closes tells the island", () => {
    for (const f of ["close_card", "toggle_home"]) expect(fnBody(f), f).toContain("home_closed(");
    const tick = fnBody("tick");
    expect(tick.slice(tick.indexOf("if !show"), tick.indexOf("hidden_for_full_screen"))).toContain("home_closed(");
  });
});
