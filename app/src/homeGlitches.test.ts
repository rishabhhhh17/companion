// M66 step 5: the glitches the frame strips and a read of the shell found in the notch and Home (docs/milestones/
// M66-smooth-and-flowy.md). The shape's numbers are tested in homeShape.test.ts and islandSpring.test.ts, the geometry in
// app/src-tauri/src/island.rs; these read the shell's glue as text, because it needs a real Mac to run.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { shellSource } from "../dom/sourceText.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const main = shellSource();
const fnBody = (name: string) => { const a = main.indexOf(`fn ${name}(`); expect(a, name).toBeGreaterThan(-1); return main.slice(a, main.indexOf("\n}\n", a)); };

describe("opening Home again while it folds back", () => {
  test("the open calls off the fold, so the click through and the watch keep working", () => {
    const open = fnBody("open_card_then");
    const gen = open.indexOf("HOME_CLOSE_GEN.fetch_add(1, Ordering::SeqCst);");
    expect(gen).toBeGreaterThan(-1);
    expect(open.indexOf("HOME_FOLDING.store(0, Ordering::SeqCst);")).toBeGreaterThan(gen);
  });
  test("the watch sets the click through from what the window really does now, never from a value it kept", () => {
    const watch = fnBody("watch_home");
    expect(watch).not.toContain("on_last");
    expect(watch).toContain("if HOME_PASS.load(Ordering::SeqCst) == on {");
  });
});

describe("a typing key never makes the whole window take the mouse", () => {
  test("the keyboard only makes the panel key; the click through follows the pointer", () => {
    const open = fnBody("open_card_then");
    expect(open).toContain("if keyboard { HOME_KEY_BY_KEY.store(true, Ordering::SeqCst); c.makeKeyWindow(); }");
    expect(open).not.toContain("home_pass(true)");
  });
});

describe("a Home the person took over is theirs", () => {
  test("a click on the notch or a key while a pointing opened Home is up makes it the person's", () => {
    expect(fnBody("open_card_then")).toContain('if was_open && (src != "point" || keyboard) { HOME_LEAVE.lock().unwrap_or_else(|e| e.into_inner()).pressed_inside(); }');
  });
  test("every press macOS gives Home's window makes it the person's, whatever the 50 ms watch saw", () => {
    const witness = main.slice(main.indexOf("// Native witness"), main.indexOf("addLocalMonitorForEventsMatchingMask_handler(NSEventMask::LeftMouseDown"));
    // M66 step 6: only a press on the shape; one on the clear window is dropped by the panel itself.
    expect(witness).toContain('if which == "card" && home_on_shape_now() { HOME_LEAVE.lock().unwrap_or_else(|e| e.into_inner()).pressed_inside(); }');
  });
});

describe("the pointer leaving asks the page, as a click elsewhere does", () => {
  test("the shell asks once and never folds Home itself", () => {
    const watch = fnBody("watch_home");
    expect(watch).toContain('app.emit_to("card", "home-pointer-left", ())');
    expect(watch).not.toContain('"pointer_left"');
    // Asked once: the leave grace is reset, so it does not ask again every 50 ms while the page keeps Home open.
    expect(watch).toContain("*HOME_LEAVE.lock().unwrap_or_else(|e| e.into_inner()) = island::Leave::new(false);");
  });
  test("the page folds Home only when nothing on it waits for the person, and only with Close Home when I click another app on", () => {
    const card = read("./card.tsx");
    const at = card.indexOf('listen("home-pointer-left"');
    expect(at).toBeGreaterThan(-1);
    const body = card.slice(at, card.indexOf("\n", at));
    expect(body).toContain('closesOnClickAway(nowModel.current, onboardingNow.current, setting("home.closeOnClickAway") === true, typingNow())');
    expect(body).toContain('invoke("close_card")');
  });
});

describe("the pointer leaving follows the person's settings (M66 step 6)", () => {
  test("the shell folds on leaving only with Close Home when I click another app on, after the close delay", () => {
    const watch = fnBody("watch_home");
    expect(watch).toContain("if hs.click_away && HOME_LEAVE.lock().unwrap_or_else(|e| e.into_inner()).sample(near, now() as u64, hs.hover.out_ms) {");
    expect(main).not.toContain("LEAVE_GRACE_MS");
  });
});

describe("Home's place", () => {
  test("a closed Home never moves the character's visit", () => {
    expect(fnBody("place_card")).toContain("if card_visible() { if let Some((room, _)) = card_spot(mtm, d, home_size().max_h) { roam_card_moved(mtm, room); } }");
  });
  test("the shape's measures count as told only once the page was really told", () => {
    const pc = fnBody("place_card");
    expect(pc).toContain('if let Some(app) = APP.get() { let mut g = HOME_GEOM.lock().unwrap_or_else(|e| e.into_inner()); if *g != geom { *g = geom.clone(); let _ = app.emit_to("card", "home-geom", geom); } }');
  });
  test("Home grows from, and folds back into, the wings the island shows, and hears when they change", () => {
    const pc = fnBody("place_card");
    expect(pc).toContain("island::grown_from(");
    expect(pc).toContain("ISLAND_STATE.lock()");
    expect(fnBody("island_alert")).toContain("with_panels(place_card);");
  });
});

describe("the island's hover panel", () => {
  const style = read("./style.css");
  test("it arrives once its shape is mostly there, and leaves first, fast", () => {
    expect(style).toContain(".island-panel[data-shown] { visibility: visible; opacity: 1; scale: 1; transition: opacity var(--dur-2) var(--ease-out) var(--seq-island-panel-at), scale var(--dur-2) var(--ease-out) var(--seq-island-panel-at), visibility 0s var(--seq-island-panel-at); }");
    expect(style).toMatch(/\.island-panel \{[^}]*transition: opacity var\(--dur-exit-menu\) linear, scale var\(--dur-exit-menu\) var\(--ease-exit\), visibility 0s linear var\(--dur-exit-menu\); \}/);
  });
  test("its words go as the shape starts to tuck back, never cut by the shape's edge", () => {
    const tsx = read("./island.tsx");
    // M70 step 4: also while Home grows on from it (held), its words fading as Home covers them.
    expect(tsx).toContain("shown={panelShown}");
    expect(tsx).toContain("const panelShown = parts.panel || held !== null;");
    expect(tsx).toContain("tuckHoldMs(");
  });
});
