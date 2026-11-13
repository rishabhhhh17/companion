// The island window (F18.1) is wired the way the rules ask: a page of its own fed by the same runner events, a borderless
// non activating panel above the menu bar that can never take the keyboard, hidden in full screen apps, when the person
// hides Companion and (when that setting is on) from screen sharing, and the pointer noticed only on our own window.
// The geometry is tested in app/src-tauri/src/island.rs; these read the glue as text, because it needs a real Mac to run.
import { TOKENS_CSS } from "./ui/cssFiles.ts";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { shellSource } from "../dom/sourceText.ts";

import { characterWords, initial, motionFor, reduce, visualState, type Model } from "./model.ts";
import { TABS, characterShows, homeReduce, homeStart, need, shownOn } from "./home.ts";
import { S, PRODUCT } from "./strings.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const main = shellSource();
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
    expect(new Set(calls)).toEqual(new Set(["island_alert", "island_click", "island_state", "get_project", "quiet_now"]));   // F28 (4.3): the open project's name, for the hover panel's one true line; M68: quiet_now, the shell's presentation check before a hello (rule 7)
    expect(page).not.toMatch(/send_command|keydown|onKey/i);
  });
  test("is told what the island sits on: the notch, a pill in the menu bar, or the thin line on the top edge", () => {
    const page = read("./island.tsx");
    expect(main).toContain('let v = json!({ "mode": mode.word(), "kind": kind.word(), "w": look.frame[2], "h": look.frame[3], "core": look.core, "row": look.row, "wing": look.wing, "hover": hover });');
    expect(main).toContain('app.emit_to("island", "island-mode", v)');
    expect(fnBody("island_state")).toContain('"kind"');
    for (const k of ["notch", "pill", "edge"]) expect(page, k).toContain(`"${k}"`);
    expect(page).not.toMatch(/\.notch\b|notch: /);
  });
  test("lays the panel out at the width the app gives it, so its measured height is the height it opens at", () => {
    const rs = read("../src-tauri/src/island.rs");
    const css = read("./style.css");
    const num = (re: RegExp, text: string) => { const m = text.match(re); expect(m, String(re)).not.toBeNull(); return Number(m![1]); };
    expect(num(/\.island-panel \{[^}]*width: (\d+)px/, css)).toBe(num(/pub const PANEL_W: f64 = ([\d.]+);/, rs));
    expect(css).not.toMatch(/\.island-panel \{[^}]*display: none/);   // hidden by visibility, so it still has a height
    // The old ears are gone; the wings (27 Oct 2026) are their own small rounded shape.
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
    // Never key events, never an event tap (rule 8). M41: one global watch is allowed, and only for where the pointer moves
    // (the water ring keeps up with the cursor): its mask is exactly mouse moves and drags, nothing else.
    expect(main).not.toMatch(/NSEventMask::KeyDown|NSEventMask::KeyUp|NSEventMask::FlagsChanged|CGEventTap|NSEventMask::Any/);
    const globals = [...main.matchAll(/addGlobalMonitorForEventsMatchingMask_handler\((\w+),/g)].map((m) => m[1]);
    expect(globals).toEqual(["follow_moves"]);
    expect(main).toContain("let follow_moves = NSEventMask::MouseMoved | NSEventMask::LeftMouseDragged | NSEventMask::RightMouseDragged | NSEventMask::OtherMouseDragged;");
  });
  test(`is hidden with the rest in a full screen app and when the person hides ${PRODUCT}, and shown again after`, () => {
    const tick = fnBody("tick");
    const hide = tick.slice(tick.indexOf("if !show"), tick.indexOf("hidden_for_full_screen"));
    expect(hide).toContain("island_show(false)");
    const back = tick.slice(tick.indexOf("hidden_for_full_screen"), tick.indexOf("shown_after_full_screen"));
    expect(back).toContain("island_show(true)");
    expect(main.slice(main.indexOf('"hide" =>'), main.indexOf('"stop" =>'))).toContain("set_user_hidden(&a, !USER_HID.load(Ordering::SeqCst))");
    expect(fnBody("set_user_hidden")).toContain("island_show(!hide");
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
    // One place for Home (F18 items 1 and 2 together): placing it and the character keeping clear of it both ask card_spot,
    // which asks the tested rule in island.rs with the island's display.
    // M66: Home's window is island.rs home_panel, with card_spot's place only when there is no island.
    expect(fnBody("place_card")).toContain("island::home_panel(on.as_ref(), &sizes, home_size(), spot)");
    const spot = fnBody("card_spot");
    expect(spot).toContain("ISLAND_ON.lock()");
    expect(spot).toContain("island::card_spot(on.as_ref()");
    const rs = read("../src-tauri/src/island.rs");
    const at = rs.indexOf("pub fn card_spot(");
    const rule = rs.slice(at, rs.indexOf("\n}\n", at));
    expect(rule).toContain("if let Some(d) = on { return Some(home_frame(d, size)); }");
    expect(rule.indexOf("home_frame(")).toBeLessThan(rule.indexOf("card_frame("));
    expect(main).not.toContain("island::home_frame(");
  });
  test("opening Home brings the island to the display with the pointer, and starts the click away watch", () => {
    const open = fnBody("open_card");
    expect(open).toMatch(/place_island\(mtm, true, /);
    expect(open).toContain("watch_home(");
    const watch = fnBody("watch_home");
    expect(watch).toContain("island::ClickAway::new(");
    expect(watch).toContain("HOME_OPEN.load(");
    expect(watch).toContain('emit_to("card", "home-click-away"');
  });
  test("every way Home closes tells the island", () => {
    // Close and the island or the character again roll Home up first (close_home_rolled), then close it the same way.
    for (const f of ["close_card", "toggle_home"]) expect(fnBody(f), f).toContain("close_home_rolled(");
    // M66: every close ends in home_fold (after the page's fold, or at once), which tells the island and runs home_closed.
    expect(fnBody("close_home_rolled")).toContain("home_fold(");
    expect(fnBody("home_fold(extra")).toContain('emit_to("island", "home-state", json!({ "shown": false }))');
    expect(fnBody("home_fold(extra")).toContain("home_closed();");
    const tick = fnBody("tick");
    expect(tick.slice(tick.indexOf("if !show"), tick.indexOf("hidden_for_full_screen"))).toContain("home_stop_now(");
  });
});

// M11 area 4: Show the island in the notch (island.show) turned off. Rule 5: before Companion looks at the screen, reads
// another app's text or listens, a light the person can see is lit. The island is never that light, so with it off every
// capture is still lit first: the character for Show me, Point at the problem and hold to talk, Home itself for Prompt help
// and the error explainer (Home opens beside the character when there is no island). The shell side is checked in
// homeset.rs (the order of light, a moment, then the capture, and that none of these paths reads the island).
describe("with the island turned off", () => {
  const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
  const run = (events: Record<string, unknown>[]) => events.reduce<Model>((m, e) => reduce(m, e as never), initial());
  test("the character lights up for every look at the screen and for the microphone", () => {
    for (const [e, state, words] of [
      [ev({ type: "app.showme", stage: "looking", message: "Looking at your screen" }), "checking", "Looking at your screen"],
      [ev({ type: "app.voice", stage: "listening", message: "Listening" }), "listening", "Listening"],
    ] as const) {
      const m = run([e]);
      expect(visualState(m)).toBe(state);
      expect(characterWords(m)).toBe(words);
      expect(visualState(m)).not.toBe(visualState(initial()));
    }
    // Looking moves the character (it scans); listening has its own ring that shows with no motion at all, and so has
    // looking once motion is reduced (motion.test.ts). Either way the words under the character say it.
    expect(motionFor("checking", false)).toBe("scan");
    expect(read("./style.css")).toMatch(/\.character\[data-state="listening"\] \{ filter: drop-shadow\(/);
    // The character's page draws that state and those words. The only island or Home settings it reads are the two that
    // may add a mark to it (home.ts characterShows), and they never change these lights.
    const dock = read("./dock.tsx");
    expect(dock).toContain('const state = characterShows(m, useSetting("home.goToNeeds") === "markTab", useSetting("island.show") !== false);');
    expect(dock).toContain("data-state={state}");
    expect(dock).toContain("const label = dockWords(charLook, state, waiting, characterWords(m));");   // M65 step 4: the orb says Needs you while something waits
    // M26: the words hide only at rest with nothing waiting; every look at the screen and the microphone is not rest.
    // M66: always on the page and faded, so the character never jumps (dockStates.ts labelShows, dockStates.test.ts).
    expect(dock).toContain('<div className="dock-label" data-shown={labelShows(state, waiting, drop.s.menu?.at === "dock") ? "" : undefined} role="status" aria-live="polite">{label}</div>');
    expect([...dock.matchAll(/"(island|home)\.\w+"/g)].map((x) => x[0]).sort()).toEqual(['"home.goToNeeds"', '"island.show"']);
    for (const e of [ev({ type: "app.showme", stage: "looking", message: "Looking at your screen" }), ev({ type: "app.voice", stage: "listening", message: "Listening" }), ev({ type: "agent.state", agent: "a", state: "checking" })]) {
      const m = run([e]);
      for (const markTab of [false, true]) for (const island of [false, true]) expect(characterShows(m, markTab, island), `${markTab} ${island}`).toBe(visualState(m));
    }
  });
  test("Prompt help and the error explainer open Home on Now, saying Reading, before anything is read, from every tab", () => {
    for (const [m, panel] of [[run([ev({ type: "app.prompt_help", stage: "reading", app: "Notes" })]), "promptHelp"], [run([ev({ type: "app.explain_error", stage: "reading", app: "Terminal", req: "r1" })]), "errorHelp"]] as const) {
      const n = need(m)!;
      expect(n.tab).toBe("now");
      // Whatever tab Home was left on, and with When something needs me set to only mark the tab: Now, on screen.
      for (const t of TABS) {
        const s = homeReduce(homeReduce(homeStart(), { type: "pick", tab: t }), { type: "need", need: n, markOnly: true });
        expect(s.tab, t).toBe("now");
        expect(shownOn(panel, s.tab, m), t).toBe(true);
      }
    }
  });
  test("Home still drops down from the island only when there is one, and its keys still open it", () => {
    expect(fnBody("card_spot")).toContain(".filter(|_| hs.island_show)");
    expect(fnBody("open_card")).not.toContain("island_show");
    expect(S.floors.islandOff).toContain("its keys still open it");
  });
});


// HeyClicky v1.0.53 parity: the island says what is next. "Not connected yet" when no Claude key or plan is connected,
// and "Version X is ready" once a check found an update, each only where it would say Ready, after anything that needs the
// person, and never with the mark (F18 item 1: the mark is only for a question, listening or done). An update is installed
// only on the person's press on Home's notice, never while something runs.
describe("the island says what is next", () => {
  const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
  const run = (events: Record<string, unknown>[]) => events.reduce<Model>((x, e) => reduce(x, e as never), initial());
  const up = [ev({ type: "runner.hello", runnerVersion: "0.0.1" })];
  const none = [...up, ev({ type: "auth.status", method: "none" })];
  test("not connected yet, in place of Ready", async () => {
    const { islandLine, islandAlert } = await import("./home.ts");
    expect(islandLine(run(none))).toBe(S.islandNotConnected);
    expect(islandLine(run([...up, ev({ type: "auth.status", method: "api_key" })])), "connected and idle: nothing to say").toBe("");
    expect(islandAlert(run(none))).toBe(false);
  });
  test("a new version ready, in place of Ready, after not connected", async () => {
    const { islandLine, islandAlert } = await import("./home.ts");
    expect(islandLine(run(up), { update: "0.2.0" })).toBe(S.islandUpdate("0.2.0"));
    expect(islandLine(run(none), { update: "0.2.0" })).toBe(S.islandNotConnected);
    expect(islandAlert(run(up))).toBe(false);
  });
  test("anything that needs the person, working, done or the engine stopped still comes first", async () => {
    const { islandLine } = await import("./home.ts");
    const working = [...none, ev({ type: "checkpoint.created", agent: "builder-1", project: "/p", checkpoint: "cp_1", label: "Before: x", files: 1, skipped: [] }), ev({ type: "agent.state", agent: "builder-1", state: "working" })];
    expect(islandLine(run(working), { update: "0.2.0" })).toBe(S.islandWorkingOn("x"));
    expect(islandLine(run([ev({ type: "app.runner_down" })]), { update: "0.2.0" })).toBe(S.islandOff);
  });
  test("the island page hears of an update from the shell, and asks for nothing new", () => {
    const page = read("./island.tsx");
    expect(page).toContain('listen("update-ready"');
    expect(page).toContain("islandLine(m, { update, group:");
    const calls = [...page.matchAll(/invoke\("(\w+)"/g)].map((x) => x[1]);
    expect(new Set(calls)).toEqual(new Set(["island_alert", "island_click", "island_state", "get_project", "quiet_now"]));   // F28 (4.3): the open project's name, for the hover panel's one true line; M68: quiet_now, the shell's presentation check before a hello (rule 7)
    // The shell tells every window when a check finds (or no longer has) an update, and the island can ask on load.
    const check = fnBody("check_update");
    expect(check).toContain('app.emit("update-ready", json!({ "version": u.version }))');
    expect(check).toContain('app.emit("update-ready", Value::Null)');
    expect(fnBody("island_state")).toContain('"update"');
  });
  test("Home's notice offers Install, only when nothing is running, and only on a press", () => {
    const card = read("./card.tsx");
    expect(card).toContain('listen("update-ready"');
    // The guard is updates.ts installAllowed, tested on the model there; Home asks it and nothing else, for the button, the
    // busy line and the press (an inverted guard here once offered Install only while a task ran).
    expect(card).not.toMatch(/canInstall\(/);
    // A secondary button: the hero's main button is the one silver on Now (the overhaul spec, 2.2; review, 31 Oct).
    expect(card).toMatch(/<button className="btn" type="button" disabled=\{!installAllowed\(m\)\}[^>]*onClick=\{installUpdate\}>\{S\.updatesInstall\}<\/button>/);
    expect(card).toContain("{!installAllowed(m) && <div className=\"line muted\">{S.updatesBusy}</div>}");
    const install = card.slice(card.indexOf("const installUpdate = () =>"), card.indexOf("\n", card.indexOf("const installUpdate = () =>")));
    expect(install).toContain("if (!installAllowed(nowModel.current)) return;");
    // And the shell refuses too while the engine says something runs (updates.rs Running), so a restart never cuts it off.
    expect(fnBody("install_update")).toContain("if updates::running_now() { return Err(updates::BUSY_WORDS.into()); }");
    expect(install).toContain('invoke("install_update")');
    // The daily check only looks: it never installs.
    const daily = card.slice(card.indexOf("// The daily update check"), card.indexOf("// Draw it for me"));
    expect(daily).not.toContain("install_update");
  });
});

// HeyClicky v1.0.53 parity: the island and Home open smoothly. The timing and the rules are in island.rs (tested there);
// these read the glue, which needs a real Mac to see.
describe("the island and Home open with a short motion", () => {
  test("the island's frame goes through the one helper at once, and waits to get smaller only when island.rs says so", () => {
    const place = fnBody("place_island");
    expect(place).toContain("island::retract_ms(from, f, reduce_motion())");
    expect(fnBody("set_island_frame")).toContain("set_frame_moving(p, to_appkit(f, ph), None, None, &ISLAND_MOVES)");
  });
  test("M66: Home's window never moves, fades or resizes to open; only its page's shape moves", () => {
    const open = fnBody("open_card");
    for (const gone of ["home_drop", "setAlphaValue", "set_frame_moving", "OPEN_SECS"]) expect(open, gone).not.toContain(gone);
    // Ordered in only if something hid it; never with focus unless a typing key opened it (rule 9).
    expect(open).toContain("if !c.isVisible() { c.orderFrontRegardless(); }");
    expect(open).toContain("if keyboard { HOME_KEY_BY_KEY.store(true, Ordering::SeqCst); c.makeKeyWindow(); }");
    // A content height never resizes the window; a display or setting change places it at once through the one helper.
    expect(fnBody("resize_card")).not.toContain("set_frame_moving");
    // Only Settings opening or closing places it again (M66 step 6: the body's width in force); the window keeps its frame.
    expect(fnBody("resize_card").split("place_card").length - 1).toBe(1);
    expect(fnBody("resize_card")).toContain("if was != open { with_panels(place_card); }");
    expect(fnBody("place_card")).toContain("set_frame_moving(c, to_appkit(p.frame, ph), None, None, &CARD_MOVES)");
    // The close: no Rust sleep in step with a CSS time; the page's fold, with a longer backstop only.
    expect(main).not.toContain("HOME_CLOSE_MS");
    expect(fnBody("close_home_rolled")).toContain("HOME_FOLD_BACKSTOP_MS");
    const helper = fnBody("set_frame_moving");
    expect(helper).toContain("runAnimationGroup_completionHandler");
    // Whatever happens to the motion, Home ends fully drawn, and on the frame asked last.
    expect(helper).toMatch(/let done = RcBlock::new\(move \|\| \{\s*if let Some\(x\) = alpha \{ w2\.setAlphaValue\(x\); \}/);
  });
  test("Less motion in Settings makes them appear at once too, as Reduce motion does", () => {
    expect(main).toContain("fn reduce_motion() -> bool { home_set().less_motion || NSWorkspace::sharedWorkspace().accessibilityDisplayShouldReduceMotion() }");
  });
});

// The fun island (founder, 27 Oct 2026: "it does not always have to show Ready there", "this needs to be fun"). Idle it is
// the bare notch with no words; resting the pointer on it makes Flowflow peek out; while something happens it grows short
// wings with a tiny Flowflow on the left and one live mark on the right; a sentence only under the pointer, only when there
// is something real to say. The sizes are tested in island.rs; these test what is drawn, and the glue.
describe("the fun island", () => {
  const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
  const run = (events: Record<string, unknown>[]) => events.reduce<Model>((x, e) => reduce(x, e as never), initial());
  const up = ev({ type: "runner.hello", runnerVersion: "0.0.1" });
  const key = ev({ type: "auth.status", method: "api_key" });
  const st = (state: string) => ev({ type: "agent.state", agent: "a", state });
  const approval = ev({ type: "approval.request", approval: "ap_1", agent: "a", checkpoint: "cp", toolUseId: "t", risk: "irreversible", title: "install a package", expiresAt: "2099-01-01T00:00:00Z" });
  const listening = ev({ type: "app.voice", stage: "listening", message: "Listening" });

  test("the Ready words are gone: the strings have none, and no line ever says Ready", async () => {
    const { islandLine } = await import("./home.ts");
    expect("islandReady" in S).toBe(false);
    expect("islandWordError" in S).toBe(false);
    const models = [initial(), run([up]), run([up, key]), run([up, key, st("idle")]), run([up, key, st("done"), ev({ type: "ui.settle" })]), run([up, ev({ type: "auth.status", method: "none" })]), run([ev({ type: "app.runner_down" })])];
    for (const m of models) for (const o of [{}, { update: "0.2.0" }, { group: "Flow" }]) {
      const l = islandLine(m, o);
      expect(l, JSON.stringify(o)).not.toMatch(/^Ready\b|: Ready\b/);
      expect(l).not.toBe("Ready");
    }
    // The page never names the old words either.
    const page = read("./island.tsx");
    expect(page).not.toMatch(/islandReady|islandWord\b|stateLabel\("idle"\)/);
  });
  test("idle shows no text: no line, and the bare notch and the wings never show a sentence whatever the line is", async () => {
    const { islandLine, islandParts, islandAlert } = await import("./home.ts");
    for (const m of [run([up, key]), run([up, key, st("done"), ev({ type: "ui.settle" })])]) {
      expect(islandLine(m)).toBe("");
      expect(islandAlert(m)).toBe(false);
      expect(islandLine(m, { group: "Flow" }), "no group name on nothing").toBe("");
    }
    expect(islandParts("rest")).toEqual({ wings: false, panel: false });
    expect(islandParts("wings")).toEqual({ wings: true, panel: false });
    // Resting the pointer on it opens the panel under the notch (islandPanel.ts), never a character peeking.
    expect(islandParts("peek")).toEqual({ wings: false, panel: true });
    expect(islandParts("wingsPeek")).toEqual({ wings: true, panel: true });
  });
  test("something real to say on the bare notch: not connected, an update, the engine stopped, a failing watch", async () => {
    const { islandLine } = await import("./home.ts");
    expect(islandLine(run([up, ev({ type: "auth.status", method: "none" })]))).toBe(S.islandNotConnected);
    expect(islandLine(run([up, key]), { update: "0.2.0" })).toBe(S.islandUpdate("0.2.0"));
    expect(islandLine(run([ev({ type: "app.runner_down" })]))).toBe(S.islandOff);
  });
  test("which wing marks show for each state", async () => {
    const { islandWings } = await import("./home.ts");
    expect(islandWings(run([up, key]))).toBeNull();
    expect(islandWings(run([ev({ type: "app.runner_down" })])), "engine stopped: bare notch, the line says why").toBeNull();
    // The runner's own checking keeps the arc; only looking at the screen gets the look mark (M46).
    const want: [string, string, string][] = [["thinking", "thinking", "dots"], ["working", "working", "arc"], ["checking", "checking", "arc"], ["needsYou", "needsYou", "amber"], ["done", "done", "tick"], ["error", "error", "red"]];
    for (const [s, state, mark] of want) expect(islandWings(run([up, key, st(s)])), s).toEqual({ state, mark } as never);
    expect(islandWings(run([up, key, listening]))).toEqual({ state: "listening", mark: "bars" });
    expect(islandWings(run([up, key, st("working"), approval]))).toEqual({ state: "needsYou", mark: "amber" });
    // Rule 5: the microphone's light is never covered, not even by a question waiting.
    expect(islandWings(run([up, key, st("working"), approval, listening]))).toEqual({ state: "listening", mark: "bars" });
  });
  // M46, rule 5: the notch's own light for "looking at your screen", lit by the stage the shell announces 250 ms before each
  // capture (Show me how, and each walkthrough step). Never for Point at the problem or the runner's own checks.
  test("looking at the screen has its own mark, ahead of everything but listening", async () => {
    const { islandWings, islandLine, islandName, looksAtScreen } = await import("./home.ts");
    const looking = ev({ type: "app.showme", stage: "looking", message: "Looking at your screen" });
    expect(islandWings(run([up, key, looking]))).toEqual({ state: "checking", mark: "look" });
    expect(islandWings(run([up, key, st("working"), approval, looking])), "even with a question waiting").toEqual({ state: "checking", mark: "look" });
    expect(islandWings(run([up, key, st("working"), looking])), "even with a task working").toEqual({ state: "checking", mark: "look" });
    expect(islandWings(run([up, key, looking, listening])), "listening comes first").toEqual({ state: "listening", mark: "bars" });
    expect(looksAtScreen(run([up, key, looking]))).toBe(true);
    // Point at the problem's check and the runner's own checks are not captures: they keep the turning arc.
    expect(islandWings(run([up, key, ev({ type: "ui.findProblem" })]))).toEqual({ state: "checking", mark: "arc" });
    expect(islandWings(run([up, key, st("checking")]))).toEqual({ state: "checking", mark: "arc" });
    expect(looksAtScreen(run([up, key, ev({ type: "ui.findProblem" })]))).toBe(false);
    // The line and the name say it, ahead of what is being worked on.
    const m = run([up, key, ev({ type: "checkpoint.created", project: "/p", agent: "a", checkpoint: "cp_1", label: "Before: fix it", files: 1, skipped: [] }), st("working"), looking]);
    expect(islandLine(m)).toBe(S.islandLooking);
    expect(islandName(islandLine(m))).toContain(S.islandLooking);
    // Drawn as a still light: a ring with a dot in the middle, no animation.
    const page = read("./island.tsx"), css = read("./style.css");
    expect(page).toContain('mark === "look" ? <svg');
    const look = /\.island-wing \.mark\[data-mark="look"\][^{]*\{([^}]*)\}/.exec(css);
    expect(look, "a look mark rule").not.toBeNull();
    expect(look![1]).not.toMatch(/animation/);
    expect(css).not.toMatch(/\[data-mark="look"\][^{]*\{[^}]*animation:(?! none)/);
  });
  test("the done tick shows for four seconds, then the wings tuck back into the bare notch", async () => {
    const { islandWings, wingsAt, DONE_WINGS_MS } = await import("./home.ts");
    expect(DONE_WINGS_MS).toBe(4000);
    const done = islandWings(run([up, key, st("done")]));
    expect(done?.mark).toBe("tick");
    expect(wingsAt(done, 1000, 1000)).toEqual(done);
    expect(wingsAt(done, 1000, 1000 + DONE_WINGS_MS - 1)).toEqual(done);
    expect(wingsAt(done, 1000, 1000 + DONE_WINGS_MS)).toBeNull();
    expect(wingsAt(done, null, 99_999), "not timed yet: still shown").toEqual(done);
    // Nothing else is ever timed away: a question waits as long as it waits.
    const asking = islandWings(run([up, key, st("working"), approval]));
    expect(wingsAt(asking, 0, 10 * DONE_WINGS_MS)).toEqual(asking);
    // The page times it from when the tick first showed, and tells the app the wings are gone then.
    const page = read("./island.tsx");
    expect(page).toContain("setTimeout(() => setNow(Date.now()), DONE_WINGS_MS)");
    expect(page).toContain("const wings = wingsAt(raw, doneSince, now);");
    expect(page).toContain("const out = wings !== null;");
    expect(page).toContain('invoke("island_alert", { on: wingsOut, panel: panelH, cheer: cheering, ask: ask || helloOn, wing: wingW, proven: ticking })');
  });
  test("reduced motion: the shape is at its size at once, and every island animation stops", async () => {
    const { springStep, settled } = await import("./islandSpring.ts");
    expect(springStep({ x: 185, v: 0 }, 265, 1 / 60, true)).toEqual({ x: 265, v: 0 });
    // The usual motion: it overshoots once, a little, and settles within 400 ms (look.md: 150 to 400 ms).
    let s = { x: 185, v: 0 }, peak = 185, t = 0;
    while (t < 1 && !(s.x === 265 && s.v === 0)) { s = springStep(s, 265, 1 / 60); peak = Math.max(peak, s.x); t += 1 / 60; }
    expect(peak).toBeGreaterThan(265);
    expect(peak).toBeLessThan(265 + 0.15 * 80);
    expect(t).toBeLessThanOrEqual(0.4);
    expect(settled(s, 265)).toBe(true);
    // A slow frame never blows it up, and it can be turned around midway.
    const big = springStep({ x: 185, v: 0 }, 265, 5);
    expect(Number.isFinite(big.x) && Math.abs(big.x - 265) < 80).toBe(true);
    const page = read("./island.tsx");
    expect(page).toContain("watchReducedMotion(setReduced)");
    expect(page).toContain("springStep(");
    expect(page).toContain("followLessMotion();");
    const css = read("./style.css");
    // M66: its animations stop; its fades stay, plain and short, under the page wide rule.
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{ \.island \*, \.island \*::before, \.island \*::after \{ animation: none !important; \} \}/);
  });
  test("the island page draws Flowflow from the character's poses, never from a skin directly", () => {
    const page = read("./island.tsx");
    // M24: one Flowflow everywhere, the live water, with the character's pose as its picture fallback.
    expect(page).toContain('<FlowMini className="island-flow" state={w.state} band mood={mood} />');   // the working agent in the wings (M68: the Visor's band alone); nothing peeks on hover
    expect(read("./flowflowMini.tsx")).toContain("poseUrl(poseFor(state, { mood }))");
    expect(read("./flowflowMini.tsx")).not.toContain("skins.ts");
    expect(page).not.toContain("skins.ts");
    // Its name says the state in words even while nothing is written on it.
    expect(page).toContain("aria-label={islandName(line)}");
  });
  test("the CSS draws the wings at the width the app gives them", () => {
    const rs = read("../src-tauri/src/island.rs");
    const css = read("./style.css");
    const num = (re: RegExp, text: string) => { const m = text.match(re); expect(m, String(re)).not.toBeNull(); return Number(m![1]); };
    expect(num(/\.island \{[^}]*--wing: (\d+)px/, css)).toBe(num(/pub const WING: f64 = ([\d.]+);/, rs));
  });
});

// M15 wave 3: one number for the tuck, a celebratory bounce, hand made marks, and Home rolling back up.
describe("the island's motion agrees with the app's timing", () => {
  test("the page's tuck and the window's wait are one number, and the spring has settled by then", async () => {
    const { TUCK_MS, ISLAND_SPRING, springStep, settled } = await import("./islandSpring.ts");
    const rs = read("../src-tauri/src/island.rs");
    const retract = Number(/pub const RETRACT_MS: u64 = (\d+);/.exec(rs)?.[1]);
    expect(TUCK_MS).toBe(retract);
    // From the wings (core plus 80) back to the bare notch: within a point of the notch by the wait, and it never swings out
    // past the window's new size by more than that afterwards, so nothing you could see is cut when the window gets smaller.
    let s = { x: 265, v: 0 }, t = 0;
    for (; t < TUCK_MS / 1000; t += 1 / 120) s = springStep(s, 185, 1 / 120, false, ISLAND_SPRING.k, ISLAND_SPRING.c);
    expect(Math.abs(s.x - 185)).toBeLessThan(1);
    for (let u = 0; u < 0.5 && !settled(s, 185); u += 1 / 120) { s = springStep(s, 185, 1 / 120, false, ISLAND_SPRING.k, ISLAND_SPRING.c); expect(s.x - 185).toBeLessThan(1); }
    // M66 step 5: the panel's words leave first and fast, and the shape waits for them (homeGlitches.test.ts), so the
    // shape's edge never cuts them.
    expect(read("./island.tsx")).toContain("shown={panelShown}");
  });
  test("a proven fix widens the wings by island.rs CHEER on the softer spring, only with reactions and motion on", async () => {
    const { CHEER_SPRING, CHEER_AT_MS, CHEER_FOR_MS } = await import("./islandSpring.ts");
    expect(CHEER_SPRING).toEqual({ k: 273, c: 26.5 });   // M66: the HOVER spring
    const zeta = CHEER_SPRING.c / (2 * Math.sqrt(CHEER_SPRING.k));
    expect(zeta).toBeGreaterThan(0.4); expect(zeta).toBeLessThan(1);   // one soft overshoot, no jelly
    expect(CHEER_AT_MS).toBeGreaterThanOrEqual(120 + 280);   // after the tick has drawn (delay plus draw)
    expect(CHEER_FOR_MS).toBeLessThan(1000);
    const page = read("./island.tsx");
    expect(page).toContain("playful(reactionsOn(), reducedMotion())");
    expect(page).toContain('invoke("island_alert", { on: wingsOut, panel: panelH, cheer: cheering, ask: ask || helloOn, wing: wingW, proven: ticking })');
    const main = shellSource();
    expect(main).toContain("ISLAND_CHEER.load(Ordering::SeqCst) && !reduce_motion()");
  });
  test("the marks are drawn by hand: a turning arc, one breathing dot, and no grey", () => {
    const css = read("./style.css"), page = read("./island.tsx");
    expect(page).toContain('<circle cx="8" cy="8" r="6.5" />');
    expect(css).toMatch(/\.island-wing \.mark\[data-mark="arc"\] svg \{[^}]*stroke-width: 1\.75; stroke-linecap: round;[^}]*island-spin var\(--loop-island-spin\) var\(--ease-loop\)/);
    expect(css).toMatch(/\.island-wing \.mark\[data-mark="dots"\] i \{ width: 6px; height: 6px;[^}]*island-breathe var\(--loop-island-breathe\)/);
    expect(TOKENS_CSS()).toContain("--loop-island-breathe: 1.4s; --loop-island-spin: .8s;");
    expect(css).toContain("@keyframes island-breathe { 0%, 100% { scale: .6; } 50% { scale: 1; } }");
    expect(css).not.toMatch(/#8e8e93/i);
    expect(css).toMatch(/\.mark \{[^}]*background: var\(--notch-dot\)/);
    expect(TOKENS_CSS()).toContain("--notch-dot: rgba(255, 255, 255, .5);");
  });
  test("the hover is the panel under the notch, not a character (27 Oct: \"Flowflow is not the main guy, he is the water agent\")", () => {
    const page = read("./island.tsx"), css = read("./style.css");
    expect(page).not.toContain("island-peek");
    expect(css).not.toMatch(/\.island-peek \{|\.island-face \{|\.island-live \{/);
    // M70 step 4 (the founder: "I don't want Squibby to be there always"): no face in the panel's cards either; a small dot
    // or tick says the state. Only the opt in hello (island.hello, off by default) shows the Visor.
    expect(read("./islandPanel.tsx")).not.toContain('<FlowMini className="ip-agent" state={j.state}');
    expect(read("./islandPanel.tsx")).toContain('<span className="ip-dot" data-tone={j.tone} aria-hidden="true" />');
  });
  test("Home folds back into the notch on the page's clock, and the shell waits for it", () => {
    const main = shellSource();
    expect(main).toContain('let _ = a.emit_to("card", "closing", json!({ "reduced": reduce_motion() }));');
    expect(main).toContain("if !card_visible() { home_fold(extra); return; }");
    expect(read("./homeStage.tsx")).toContain('void invoke("home_folded")');
  });
});

describe("the island page never skips a hook (M26)", () => {
  test("no setting is read behind a condition", () => {
    const page = readFileSync(new URL("./island.tsx", import.meta.url), "utf8");
    for (const line of page.split("\n")) if (/useSetting\(/.test(line)) expect(line, line).not.toMatch(/(&&|\|\||\?)[\s(]*useSetting\(/);
  });
});

describe("the notch panel never cuts off its keys (better-interface review, 30 Oct 2026)", () => {
  const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");
  test("with questions waiting, the cards scroll inside the panel and the keys under them stay in reach", () => {
    expect(css).toMatch(/\.island-panel:not\(\[data-brief\]\) \.ip-jobs \{ max-height: \d+px; overflow: auto;/);
    expect(css).toMatch(/\.island-panel\[data-brief\] \.ip-jobs \{ max-height: \d+px; overflow: auto;/);
    const full = Number(/\.island-panel:not\(\[data-brief\]\) \.ip-jobs \{ max-height: (\d+)px/.exec(css)![1]);
    const brief = Number(/\.island-panel\[data-brief\] \.ip-jobs \{ max-height: (\d+)px/.exec(css)![1]);
    const rs = readFileSync(new URL("../src-tauri/src/island.rs", import.meta.url), "utf8");
    const max = Number(/pub const PANEL_MAX: f64 = (\d+)\.0;/.exec(rs)![1]);
    // The full panel also holds Fix something (42), the row of keys (30), two gaps (10) and its padding (22).
    expect(full + 42 + 30 + 2 * 10 + 22, "the full panel fits its window").toBeLessThanOrEqual(max);
    expect(brief + 16, "the brief panel fits its window").toBeLessThanOrEqual(max);
  });
  test("an answer that is not armed yet does not look pressed", () => {
    expect(css).toContain(".island-panel .ip-ask:not([data-armed]) .ip-answer button:active { transform: none; }");
  });
});

// M46 (F28, F18): the notch is the bare notch at rest, results drop by themselves once, a self opened card ignores clicks
// for a moment, and amber pulses three times then holds.
describe("the bare notch (M46)", () => {
  const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");
  const page = readFileSync(new URL("./island.tsx", import.meta.url), "utf8");
  test("no sun and no count at rest: the window is the notch, and the count is in the hover panel", () => {
    expect(page).not.toContain("island-sun");
    expect(page).not.toContain("sun-lime.svg");
    expect(css).not.toContain(".island-sun");
    expect(css).not.toContain("island-sun-in");
    expect(page).not.toContain("island-unseen");
    expect(page).toContain("const shapeW = shape.w;");
    // M70: in the small panel, new results are its one fact when there is nothing more useful to say.
    const panel = readFileSync(new URL("./islandPanel.tsx", import.meta.url), "utf8");
    expect(panel).toContain("const fact = fact0 === S.notch.ready && unseen > 0 ? S.panel.unseen(unseen) : fact0;");
    expect(S.panel.newCount(3)).toBe("3 new");
    expect(S.panel.newCount(12)).toBe("9+ new");
  });
  test("M52: changes ready to review are said on the hover panel only, as quietly as new results, and go out with the shell's word", () => {
    // The shell decides (island.rs ReviewReady): it lights on a batch while Home is closed and goes out when Home opens, the
    // review is asked for or closed, or the changes went away. The page only shows what it is told, on load and after.
    expect(page).toContain('listen("review-ready"');
    expect(page).toMatch(/setReview\(\(v as \{ review\?: unknown \} \| null\)\?\.review === true\)/);
    // M57 feature 5: with the instant key warning, the same quiet line says a key was written (only a count crosses over).
    expect(main).toContain('app.emit_to("island", "review-ready", json!({ "on": on, "key": key }))');
    const panel = readFileSync(new URL("./islandPanel.tsx", import.meta.url), "utf8");
    // M70: the small panel's one fact says the changes ("my-shop: 3 changes to review", notchQuick.ts), and a key written in
    // them comes first, as quietly.
    expect(panel).toContain("const fact0 = reviewKey ? S.panel.reviewKey : view.kind === \"job\" ? view.job.title : quickFact(m, now, note);");
    // Never in a panel that opened by itself, never the wings, never a sound: it does not ask for the island to open.
    expect(page).not.toMatch(/review[^\n]*island_alert|island_alert[^\n]*review/);
    expect(S.panel.reviewReady).toBe("Changes ready to review");
    expect(S.panel.reviewReady).not.toMatch(/[A-Z]{2,}|—/);
  });
  test("brief and hover panels are one width, the island's PANEL_W, and plain words under a question use the system font", () => {
    expect(css).not.toMatch(/\.island-panel\[data-brief\] \{[^}]*width:/);
    expect(css).not.toMatch(/\.ip-text span \{[^}]*ui-monospace/);
    expect(css).toMatch(/\.ip-text span code \{[^}]*font-family: var\(--font-code\)/);   // only the exact command or path
    expect(TOKENS_CSS()).toMatch(/--font-code: ui-monospace,/);
  });
  test("needs you pulses three times, then holds steady, on the notch and on the pictures; never forever", () => {
    expect(css).toMatch(/\.island-wing \.mark\[data-state="needsYou"\] \{[^}]*island-needsYou-pulse var\(--loop-island-pulse\) var\(--ease-loop\) var\(--dur-2\) 3 both/);
    expect(css).not.toMatch(/island-needsYou-pulse[^;]*infinite/);
    expect(css).toMatch(/\.character:not\(\[data-live\]\)\[data-pose\]\[data-motion="glow"\] \{ animation: pose-glow var\(--loop-glow\) var\(--ease-loop\) 3; \}/);
    expect(css).toMatch(/\.character:not\(\[data-live\]\)\[data-motion="glow"\] \{ animation: glow var\(--loop-glow\) var\(--ease-loop\) 3; \}/);
    expect(css).not.toMatch(/(pose-glow|glow) var\(--loop-glow\) var\(--ease-loop\) infinite/);
    // Each new question pulses again: the mark is keyed on how many wait.
    expect(page).toContain("key={`${mark}:${count}`}");
    expect(page).toContain("<Mark w={w} count={m.approvals.length} reduced={reduced} />");
  });
  test("the wing ignores clicks for a moment after it grows by itself, as a self opened card does", () => {
    expect(page).toContain("ARM_MS");
    expect(page).toMatch(/selfGrown/);
    expect(page).toContain("if (!armed(grownAt, Date.now())) return;");
  });
  test("the hover panel is as wide as the black behind it: one width, the island's PANEL_W (the overhaul spec, 4.3)", () => {
    const rs = readFileSync(new URL("../src-tauri/src/island.rs", import.meta.url), "utf8");
    const w = Number(/pub const PANEL_W: f64 = (\d+)\.0;/.exec(rs)![1]);
    expect(Number(/\n\.island-panel \{[^}]*width: (\d+)px;/.exec(css)![1])).toBe(w);
  });
  test("at rest the notch says nothing; on hover the small panel (M70: a greeting, one fact, a few buttons that open Home)", () => {
    const panel = readFileSync(new URL("./islandPanel.tsx", import.meta.url), "utf8");
    expect(panel).toContain("const view = panelView(m, jobs, { note, status: notchStatusLine(homeStatus(m, project, now), project), kept });");
    for (const gone of ["greeting(", "S.panel.go", "ip-pill", "PANEL_DO.find", "PANEL_DO.ship", "PANEL_DO.settings"]) expect(panel, gone).not.toContain(gone);
    // Opened by itself (brief), only a question or a result: never the greeting, the line, a button or Add your key.
    expect(panel).toContain('</div> : brief ? (');
    expect(panel).toContain('view.kind === "questions" || view.kind === "result" ? live : null');
  });
  test("it never drops by itself for a start, a step or a cost: only a proven fix or a failure (resultPeekKey)", () => {
    expect(page).toContain("resultPeekKey(islandJobs(m))");
    expect(page).not.toContain("workPeekKey");
    expect(page).toContain("const ask = out && ((questionsOpen && m.approvals.length > 0) || resultPeek);");
  });
});
