import { StrictMode, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { setting, settingsReady, startSettings, useSetting } from "./settingsStore.ts";
import { hushReview, quietNow } from "./review.ts";
import { followLessMotion, playful, reducedMotion, watchReducedMotion } from "./motion.ts";
import { invoke, listen } from "./tauri.ts";
import { DONE_WINGS_MS, ISLAND_MODES, SAVED_LINE_MS, wingMarkShown, islandLine, islandName, islandParts, islandWings, wingsAt, type IslandMode, type Wings } from "./home.ts";
import { readyVersion } from "./updates.ts";
import { CHEER_AT_MS, CHEER_FOR_MS, TUCK_MS, openness, springFor, springStep, tuckHoldMs, type Spring } from "./islandSpring.ts";
import { latched, rowMarkShown } from "./notchQuick.ts";
import { reactionsOn } from "./reactions.ts";
import { useModel } from "./useModel.ts";
import { useMood } from "./useMood.ts";
import { S } from "./strings.ts";
import { useDrop } from "./dropRing.tsx";
import { activeGroup } from "./groups.ts";
import { running } from "./dropmenu.ts";
import { PartBoundary } from "./partBoundary.tsx";
import "./style.css";
import "./ui/chrome.css";
import "./ui/homeShape.css";
import "./ui/notch.css";
import "./ui/fix.css";

// The island in the notch (F18, made fun on 27 Oct 2026). The app decides its size and what it sits on (island.rs): the
// notch itself, a small pill in the middle of the menu bar, or a thin line on the top edge where no menu bar shows. Idle it
// is only that, black, with no words. Resting the pointer on it opens Home itself (2 Nov 2026, island.pointOpens, decided in
// the shell: island.rs on_point), or with Status line chosen the panel under it (islandPanel.tsx). While something
// happens it grows short wings: a tiny Flowflow on the left, one live mark on the right. A sentence shows only under the
// pointer, and only when there is something real to say (home.ts). The black shape moves on a small spring
// (islandSpring.ts) toward the size the app gives; the window itself changes at once, and shrinks only after the shape has
// tucked back. A click always opens Home below it, at once, and never closes it (main.rs island_click). The island never takes the keyboard (it is a borderless panel).
import { useLook } from "./useLook.ts";
import { IslandPanel } from "./islandPanel.tsx";
import { armed, islandJobs, notchStep, resultPeekKey, RESULT_PEEK_MS, type NotchStep } from "./islandPanel.ts";
import { FlowMini } from "./flowflowMini.tsx";
import { HELLO_SHOW_MS, LAST_HELLO_KEY, WAKE_TICK_MS, cleanName, helloFact, helloGate, helloLine, lastHelloFrom, restWings, restWingState, wokeAfter, type HelloWhy, type RestWings } from "./notchHello.ts";
type Kind = "notch" | "pill" | "edge";
const KINDS: readonly Kind[] = ["notch", "pill", "edge"];
type Shape = { mode: IslandMode; kind: Kind; w: number; h: number; core: number; row: number; wing: number; hover: boolean };
const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : 0);
const shapeFrom = (v: unknown): Shape | null => {
  const o = v as { mode?: unknown; kind?: unknown; w?: unknown; h?: unknown; core?: unknown; row?: unknown; wing?: unknown; hover?: unknown } | null;
  if (!o || !ISLAND_MODES.includes(o.mode as IslandMode) || !KINDS.includes(o.kind as Kind)) return null;
  return { mode: o.mode as IslandMode, kind: o.kind as Kind, w: num(o.w), h: num(o.h), core: num(o.core), row: num(o.row), wing: num(o.wing), hover: o.hover !== false };
};

/** Springs the black shape toward the size the app asked for, drawing straight into its style (no React render per frame).
 *  The window is centred on the notch at every size, so a shape centred in it stays put on the screen when the window
 *  changes. Size 0 (not told yet): the whole window. The spring is chosen once for each new size (islandSpring.ts
 *  springFor), and a shape getting smaller as the hover panel stops showing (`panelWas`, `panelNow`) waits for its words to
 *  leave first (tuckHoldMs). M70 step 4: each frame also says how far the panel is out (--open, from `look`: the row's
 *  height and the panel's), so the corner follows the same spring. */
function useSpringBox(w: number, h: number, reduced: boolean, soft: boolean, panelWas: boolean, panelNow: boolean, look: { current: { row: number; panel: number } }) {
  const box = useRef<HTMLSpanElement>(null);
  const at = useRef<{ x: Spring; y: Spring } | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // The size goes straight on the shape (M25), not through inherited variables, so a frame restyles the shape alone and not
    // everything inside it.
    const draw = () => {
      const s = at.current; if (!s) return;
      el.style.width = `${Math.max(0, s.x.x)}px`; el.style.height = `${Math.max(0, s.y.x)}px`;
      el.style.setProperty("--open", String(openness(s.y.x, look.current.row, look.current.panel)));
    };
    if (!w || !h) { at.current = null; el.style.removeProperty("width"); el.style.removeProperty("height"); el.style.removeProperty("--open"); return; }
    if (!at.current || reduced) { at.current = { x: { x: w, v: 0 }, y: { x: h, v: 0 } }; draw(); return; }
    // M66: growing on WORK, tucking back on CLOSE (never past the notch), the done pulse on HOVER. Chosen here, once for
    // this target (M66 step 5: chosen on every frame, a grow switched to CLOSE the moment it first passed its target).
    const sx = springFor(at.current.x.x, w, soft), sy = springFor(at.current.y.x, h, soft);
    const hold = tuckHoldMs(panelWas, panelNow, w < at.current.x.x || h < at.current.y.x, reducedMotion());
    let raf = 0, wait = 0, last = performance.now();
    const tick = (t: number) => {
      const s = at.current!, dt = Math.max(0, t - last) / 1000;
      last = t;
      s.x = springStep(s.x, w, dt, reducedMotion(), sx.k, sx.c);
      s.y = springStep(s.y, h, dt, reducedMotion(), sy.k, sy.c);
      draw();
      if (s.x.x !== w || s.y.x !== h || s.x.v !== 0 || s.y.v !== 0) raf = requestAnimationFrame(tick);
    };
    const start = () => { last = performance.now(); raf = requestAnimationFrame(tick); };
    if (hold > 0) wait = window.setTimeout(start, hold); else start();
    return () => { window.clearTimeout(wait); cancelAnimationFrame(raf); };
  }, [w, h, reduced, soft]);
  return box;
}

/** The live mark on the right wing (home.ts WingMark). Drawn only, never read: the island's name says it in words. */
function Mark({ w, count, reduced }: { w: Wings; count: number; reduced?: boolean }) {
  const mark = wingMarkShown(w.mark, !!reduced);
  // Thinking: one dot that breathes. Working and checking: a thin round arc (13 points across) that turns. Looking at the
  // screen (M46, rule 5): a ring with a dot in the middle that holds still, a light rather than a spinner.
  const inner = mark === "dots" ? <i />
    : mark === "arc" ? <svg viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="6.5" /></svg>
    : mark === "look" ? <svg viewBox="0 0 16 16" width="16" height="16"><circle className="look-ring" cx="8" cy="8" r="6.25" /><circle className="look-dot" cx="8" cy="8" r="2.5" /></svg>
    : mark === "bars" ? <><i /><i /><i /><i /></>
    : mark === "tick" ? <svg viewBox="0 0 14 14" width="14" height="14"><path d="M3 7.5l3 3 5-6.5" /></svg>
    : null;
  // M46: keyed on how many questions wait, so each new one pulses the amber three more times, then it holds.
  return <><span className="mark" key={`${mark}:${count}`} data-state={w.state} data-mark={mark}>{inner}</span>{w.mark === "amber" && count > 1 && <b className="island-count">{count}</b>}</>;
}

/** The usual wing (island.rs WING): the step shows only once the app has drawn the wings wider for it. */
const WING_USUAL = 40;
/** The room in a wing beside the word: the mark (20), the gap before it (6), and the space at each end (10 and 6). */
const STEP_ROOM = 42;

/** M68: the room in the right wing beside a word at rest: the space at each end (10 and 6). */
const REST_ROOM = 16;
/** M68: how long after the page starts the first hello may come, so the settings and the engine's state have arrived. */
const HELLO_START_MS = 1500;

/** The time the last hello showed, kept in this page's own storage (a number only). */
const lastHello = (): number | null => { try { return lastHelloFrom(localStorage.getItem(LAST_HELLO_KEY)); } catch { return null; } };
const keepHello = (t: number) => { try { localStorage.setItem(LAST_HELLO_KEY, String(t)); } catch { /* not kept: at worst a second hello within the hour */ } };

/** M55: the step in a word, with a thin line of the four steps under it (done, now, ahead). Drawn only: the island's name
 *  says what is happening in words. It changes only when a step changes, by colour, and never loops. */
function StepWord({ step }: { step: NotchStep }) {
  return (
    <span className="island-step">
      <span className="island-step-word">{step.word}</span>
      <span className="island-step-line">{step.marks.map((k, i) => <i key={i} data-mark={k} />)}</span>
    </span>
  );
}

function Island() {
  useLook({ keepNight: true });   // the water's colour for the work cards (M19); the notch keeps Night in every theme
  const [mAll, dispatch] = useModel();
  // M74, quiet hours for the notch (quiet.on, quiet.from, quiet.to): looked at again each minute while they are on. During
  // them the notch says nothing about changes to review (review.ts hushReview); Home still shows everything.
  const quietOn = useSetting("quiet.on"), quietFrom = useSetting("quiet.from"), quietTo = useSetting("quiet.to");
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    if (quietOn !== true) return;
    setClock(new Date());
    const id = setInterval(() => setClock(new Date()), 60_000);
    return () => clearInterval(id);
  }, [quietOn]);
  const hushed = quietNow(quietOn, quietFrom, quietTo, clock);
  const m = hushReview(mAll, hushed);
  // The project open now, for the hover panel's one true line when nothing is live (F28, 4.3: "test-shop works. Last fix
  // proven 2 hours ago."). Its History rows come with the engine's own events, as Home's do.
  useEffect(() => {
    void invoke("get_project").then((p) => dispatch({ type: "ui.folderShown", project: String(p ?? "") })).catch(() => {});
    const off = listen("project-changed", (e) => dispatch({ type: "ui.projectChanged", project: String(e.payload ?? "") }));
    return () => { off.then((f) => f()); };
  }, []);
  const [shape, setShape] = useState<Shape>({ mode: "rest", kind: "pill", w: 0, h: 0, core: 0, row: 0, wing: 0, hover: true });
  // A new version a check found (the shell's "update-ready"): said under the pointer when nothing else is going on.
  const [update, setUpdate] = useState<string | null>(null);
  const [unseen, setUnseen] = useState(0);
  // M52: changes another AI tool made, ready to review (the shell's island.rs ReviewReady decides when it is on).
  const [review, setReview] = useState(false);
  // M57 feature 5: that batch carries the instant key warning, so the quiet line says a key was written.
  const [reviewKey, setReviewKey] = useState(false);
  const [reduced, setReduced] = useState(reducedMotion);
  // M66: Home's own shape grows out of the notch under this one; once it has, this one stops drawing (homeShape.css, a short
  // delay so the two never leave a gap), and it draws again when Home has folded back into it.
  const [homeUp, setHomeUp] = useState(false);
  useEffect(() => watchReducedMotion(setReduced), []);
  useEffect(() => {
    void invoke("island_state").then((v) => { const s = shapeFrom(v); if (s) setShape(s); setUpdate(readyVersion((v as { update?: unknown } | null)?.update ?? null)); setUnseen(Math.max(0, Math.min(99, Number((v as { unseen?: unknown } | null)?.unseen) || 0))); setReview((v as { review?: unknown } | null)?.review === true); setReviewKey((v as { reviewKey?: unknown } | null)?.reviewKey === true); setHomeUp((v as { home?: unknown } | null)?.home === true); }).catch(() => {});
    const offHome = listen("home-state", (e) => setHomeUp((e.payload as { shown?: unknown } | null)?.shown === true));
    const off = listen("island-mode", (e) => { const s = shapeFrom(e.payload); if (s) setShape(s); });
    const offUp = listen("update-ready", (e) => setUpdate(readyVersion(e.payload)));
    // M34: results finished while Home was closed, counted until Home opens. M46: said on the hover panel only.
    const offSeen = listen("unseen", (e) => setUnseen(Math.max(0, Math.min(99, Number((e.payload as { n?: unknown } | null)?.n) || 0))));
    const offReview = listen("review-ready", (e) => { const p = e.payload as { on?: unknown; key?: unknown } | null; setReview(p?.on === true); setReviewKey(p?.on === true && p?.key === true); });
    return () => { off.then((f) => f()); offUp.then((f) => f()); offSeen.then((f) => f()); offReview.then((f) => f()); offHome.then((f) => f()); };
  }, []);
  // With Show the working group on the island (groups.islandName, usual on), the line starts with the name of the group at work.
  const drop = useDrop();
  const g = activeGroup(m, running(drop.s));
  const showGroup = useSetting("groups.islandName") !== false;
  // M77: the saved copy's line (home.ts SAVED_LINE_MS) goes away by itself: one tick when its time is up.
  const [, savedTick] = useState(0);
  useEffect(() => {
    if (!m.guardSaved) return;
    const id = setTimeout(() => savedTick((n) => n + 1), Math.max(0, m.guardSaved.at + SAVED_LINE_MS - Date.now()) + 50);
    return () => clearTimeout(id);
  }, [m.guardSaved]);
  // M85 review: the ask's line goes away the same way.
  useEffect(() => {
    if (!m.guardAsked) return;
    const id = setTimeout(() => savedTick((n) => n + 1), Math.max(0, m.guardAsked.at + SAVED_LINE_MS - Date.now()) + 50);
    return () => clearTimeout(id);
  }, [m.guardAsked]);
  const line = islandLine(m, { update, group: showGroup && g && g !== "core" ? S.groups.names[g] : null, now: Date.now() });
  // The wings, and the done tick put away after a few seconds. With When something needs me set to only mark the tab
  // (home.goToNeeds), anything that needs the person shows the amber mark too.
  const raw = islandWings(m, useSetting("home.goToNeeds") === "markTab");
  const ticking = raw?.mark === "tick";
  const [doneSince, setDoneSince] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) { setDoneSince(null); return; }
    const t0 = Date.now();
    setDoneSince(t0); setNow(t0);
    const id = setTimeout(() => setNow(Date.now()), DONE_WINGS_MS);
    return () => clearTimeout(id);
  }, [ticking]);
  const wings = wingsAt(raw, doneSince, now);
  // M55, live progress: while a job works, the right wing says its step in a word with a thin line of the four steps under
  // it (islandPanel.ts notchStep: the work card's own steps). Off with Show the step on the notch (island.showStep).
  const showStep = useSetting("island.showStep") !== false;
  const tries = Number(useSetting("work.tries")) || 3;   // read every render: a hook is never skipped
  // M70: with Show wings at rest off (the usual), a job shows only its mark; the step is in the small panel instead.
  const wingsAtRest = useSetting("island.wings") === true;
  const step = showStep && wingsAtRest ? notchStep(m, wings, tries) : null;
  // The wings are as wide as the longest of the four words needs (measured below, hidden), so they grow once when work starts
  // and never at each step. 0 when no step shows: the app's usual wings.
  const measure = useRef<HTMLSpanElement>(null);
  const [stepW, setStepW] = useState(0);
  useLayoutEffect(() => {
    const el = measure.current;
    if (!el) return;
    const put = () => setStepW(Math.ceil(el.offsetWidth));
    put();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(put);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const wing = step && stepW > 0 ? stepW + STEP_ROOM : 0;
  // M68 step 2b: at rest, on a real notch, small wings with the Visor's lights on the left and one short word or a tick on
  // the right (notchHello.ts restWings); the live wings take over while something happens. M70 (the founder, 4 Nov 2026: "I
  // don't want Squibby to be there always"): off by default (island.wings), so the notch looks like the hardware; a stored
  // true brings the M68 wings back exactly.
  const restAt = restWings(m, now, { on: wingsAtRest, kind: shape.kind });
  const rest = wings ? null : restAt;
  // The word's own width, measured, so the right wing is as wide as it needs (island.rs keeps it within WING_MAX).
  const restMeasure = useRef<HTMLSpanElement>(null);
  const [restW, setRestW] = useState(0);
  useLayoutEffect(() => { setRestW(rest?.word && restMeasure.current ? Math.ceil(restMeasure.current.offsetWidth) : 0); }, [rest?.word]);
  const wingW = Math.max(wing, restW > 0 ? restW + REST_ROOM : 0);
  // The app sizes the window: wings out or not, and whether a peek has a line to show.
  const out = wings !== null;
  // The panel that hangs from it: always laid out (hidden until the pointer rests on the island), so its height is known and
  // the app can size the window before it opens (island.rs PANEL_MIN to PANEL_MAX).
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelH, setPanelH] = useState(0);
  useEffect(() => {
    const el = panelRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setPanelH(Math.ceil(el.offsetHeight)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // A proven fix: once the tick has drawn, the wings widen a little on a softer spring and settle back (island.rs cheered).
  // Only with reactions on and motion allowed, as every celebration.
  const [cheer, setCheer] = useState(false);
  useEffect(() => {
    if (!ticking || !playful(reactionsOn(), reducedMotion())) { setCheer(false); return; }
    const on = setTimeout(() => setCheer(true), CHEER_AT_MS);
    const off = setTimeout(() => setCheer(false), CHEER_AT_MS + CHEER_FOR_MS);
    return () => { clearTimeout(on); clearTimeout(off); setCheer(false); };
  }, [ticking]);
  const cheering = cheer && out;
  // M23: a question waiting opens the panel under the wings by itself (island.rs mode), with Open the notch for questions on.
  // M46 (F28): the only other thing that drops by itself is a result that matters, a proven fix or a failure, once, for as
  // long as the tick shows, with Show results under the notch on; then it tucks back. A start, a step, a cost, a partly
  // checked or plain result and Undo stay up in the notch for the pointer. While quiet (a call, or hidden) the shell keeps
  // even these closed (island.rs quiet).
  const showWork = useSetting("island.showWork") !== false;
  const peekKey = showWork ? resultPeekKey(islandJobs(m)) : "";
  const [resultPeek, setResultPeek] = useState(false);
  // M69: Keep on the mini receipt folds the panel back at once and keeps that result out of it (islandPanel.ts panelView).
  const [kept, setKept] = useState<string | null>(null);
  const keep = (key: string) => { setKept(key); setResultPeek(false); };
  useEffect(() => {
    if (!peekKey) { setResultPeek(false); return; }
    setResultPeek(true);
    const id = setTimeout(() => setResultPeek(false), RESULT_PEEK_MS);
    return () => clearTimeout(id);
  }, [peekKey]);
  const questionsOpen = useSetting("island.openForQuestions") !== false;   // read every render: a hook is never skipped
  const ask = out && ((questionsOpen && m.approvals.length > 0) || resultPeek);
  // M68: the hello. When the app starts, when the Mac wakes (a timer that fired far too late: the Mac slept), or when this
  // page comes back after more than an hour hidden (the screen locked or asleep), the notch widens for about 3 seconds with
  // the Visor and one line (notchHello.ts). Only on a real notch, at most once an hour, never while a call app is in front
  // (the shell's presentation check, rule 7, asked at that moment), never while this page is hidden, never over Home or a
  // question. One gate (notchHello.ts helloGate): one try at a time, and the time kept in memory too. It is the panel under the wings,
  // which the app never opens by itself while quiet or hidden (island.rs mode). No sound, no focus (the island is a
  // borderless panel that never takes the keyboard). Only the time of the last hello is kept.
  const [hello, setHello] = useState<ReturnType<typeof helloLine> | null>(null);
  const helloOn = hello !== null;
  const helloNow = useRef({ m, homeUp, ask });
  helloNow.current = { m, homeUp, ask };
  const shapeKind = useRef(shape.kind);
  shapeKind.current = shape.kind;
  const gate = useRef(helloGate({ read: lastHello, write: keepHello })).current;
  const tryHello = useRef(async (why: HelloWhy, awayMs?: number) => {
    const ok = await gate.attempt((last) => {
      const r = helloNow.current;
      return { why, now: Date.now(), last, on: setting("island.hello") === true, quiet: false, homeOpen: r.homeUp, asking: r.ask, kind: shapeKind.current, hidden: document.hidden, awayMs };
    }, () => invoke("quiet_now").then((q) => q === true).catch(() => true));   // not known: stay quiet
    if (ok) setHello(helloLine(cleanName(setting("you.name")), helloFact(helloNow.current.m, Date.now())));
  }).current;
  useEffect(() => {
    let away: number | null = typeof document !== "undefined" && document.hidden ? Date.now() : null;
    let prev = Date.now();
    let start = 0;
    void settingsReady().then(() => { start = window.setTimeout(() => void tryHello("start"), HELLO_START_MS); });
    // A hidden page's timers are slowed (WebKit), so a late tick there is no wake: skip it, and start the clock again on
    // coming back, so the first tick after is not taken for one either.
    const tick = window.setInterval(() => {
      const t = Date.now();
      if (document.hidden) { prev = t; return; }
      if (wokeAfter(prev, t, WAKE_TICK_MS) > 0) void tryHello("wake");
      prev = t;
    }, WAKE_TICK_MS);
    const vis = () => {
      if (document.hidden) { away = Date.now(); return; }
      prev = Date.now();
      if (away !== null) { const was = Date.now() - away; away = null; void tryHello("back", was); }
    };
    document.addEventListener("visibilitychange", vis);
    return () => { window.clearTimeout(start); window.clearInterval(tick); document.removeEventListener("visibilitychange", vis); };
  }, []);
  useEffect(() => {
    if (!hello) return;
    // The time is kept once the panel has opened (the hello is on screen), not when it was decided.
    gate.shown(Date.now());
    const id = window.setTimeout(() => setHello(null), HELLO_SHOW_MS);
    return () => window.clearTimeout(id);
  }, [hello]);
  // Home opening or a question arriving puts the hello away at once.
  useEffect(() => { if (homeUp || ask) setHello(null); }, [homeUp, ask]);
  const wingsOut = out || rest !== null || helloOn;
  // M73 (fluid, item 11): `proven` while a proven fix's tick shows, so the shell can tap the trackpad once as it lands
  // (haptic.rs, only with island.haptics on).
  useEffect(() => { void invoke("island_alert", { on: wingsOut, panel: panelH, cheer: cheering, ask: ask || helloOn, wing: wingW, proven: ticking }).catch(() => {}); }, [wingsOut, panelH, cheering, ask, helloOn, wingW, ticking]);
  // What was out last stays drawn while the shape tucks back over it, so Flowflow and the mark slide away, never blink out.
  const lastWings = useRef<Wings | null>(null);
  if (wings) lastWings.current = wings;
  // M68: which of the two was out last, the live wings or the wings at rest, so the right one tucks back.
  const lastRest = useRef<RestWings | null>(null);
  const lastWasRest = useRef(false);
  if (wings) lastWasRest.current = false;
  else if (rest) { lastRest.current = rest; lastWasRest.current = true; }
  const lastStep = useRef<NotchStep | null>(null);
  if (wings) lastStep.current = step;
  const lastOut = useRef<IslandMode>("rest");
  if (shape.mode !== "rest") lastOut.current = shape.mode;
  const [restSettled, setRestSettled] = useState(true);
  useEffect(() => {
    if (shape.mode !== "rest") { setRestSettled(false); return; }
    const id = setTimeout(() => setRestSettled(true), TUCK_MS);
    return () => clearTimeout(id);
  }, [shape.mode]);
  const tucking = shape.mode === "rest" && !restSettled ? lastOut.current : null;
  const parts = islandParts(shape.mode);
  const showWings = parts.wings || tucking === "wings" || tucking === "wingsPeek";
  const w = wings ?? (rest || lastWasRest.current ? null : lastWings.current);
  const r = wings ? null : rest ?? (lastWasRest.current ? lastRest.current : null);
  // M83: the pointer coming to rest on the notch (the panel opening under it) is a hello, once per arrival; the lights in the
  // wing take the same reactions as the character elsewhere (moods.ts), in the band's own still shapes (no hop in the notch).
  const pointedAt = shape.hover && (shape.mode === "peek" || shape.mode === "wingsPeek");
  const helloN = useRef(0), wasPointed = useRef(false);
  if (pointedAt && !wasPointed.current) helloN.current++;
  wasPointed.current = pointedAt;
  const mood = useMood(mAll, { state: w ? w.state : r ? restWingState(r) : "idle", hello: helloN.current });
  const [soft, setSoft] = useState(false);
  useEffect(() => { if (cheering) { setSoft(true); return; } const id = setTimeout(() => setSoft(false), TUCK_MS); return () => clearTimeout(id); }, [cheering]);
  // M46 (F28, F18): at rest on a notch the window is exactly the notch (island.rs), bare black, with no sun and no count.
  const shapeW = shape.w;
  // M46: grown by itself (a question, a result), not by the pointer: the wing ignores clicks for its first ARM_MS, as a
  // card that opened by itself does, so a pointer that happened to be there presses nothing.
  const grownRef = useRef(0);
  const lastMode = useRef<IslandMode>(shape.mode);
  useEffect(() => {
    const was = lastMode.current; lastMode.current = shape.mode;
    const selfGrown = was === "rest" && (shape.mode === "wings" || shape.mode === "wingsPeek") && !shape.hover;
    if (selfGrown) grownRef.current = Date.now();
  }, [shape.mode, shape.hover]);
  const tap = () => { const grownAt = grownRef.current; if (!armed(grownAt, Date.now())) return; void invoke("island_click"); };
  // M66 step 5: the hover panel shows only in its own modes; on the way back its words fade first and fast (style.css), and
  // the shape waits for them (useSpringBox), so its edge never cuts them. Whether it showed is read as last drawn.
  const panelNow = parts.panel;
  const panelWas = useRef(panelNow);
  useEffect(() => { panelWas.current = panelNow; });
  // M70 step 4: Home grows from the small panel (main.rs open_card_then sends its size), but the shell forgets the hover in
  // the same moment, and Home's page draws the panel's shape only a frame or two later. So while Home is up, a shape that
  // was the panel (showing, or still tucking back from it) holds that size, under its words fading out, until it stops
  // drawing once Home's shape covers it (homeShape.css, --seq-island-hide-at). Without this, for a frame or more neither
  // window showed the panel: a blink to the bare notch. Hidden, it then settles at the shell's
  // size, out of sight.
  // The hold ends with the tuck (TUCK_MS), well after the island has stopped drawing (240 ms).
  const heldBox = useRef<{ w: number; h: number } | null>(null);
  if (panelNow && !homeUp) heldBox.current = { w: shapeW, h: shape.h };
  const fromPanel = panelNow || tucking === "peek" || tucking === "wingsPeek";
  const held = homeUp && fromPanel ? heldBox.current : null;
  // The panel's height, for the corner (--open): measured, as the shell sizes the window from it.
  const lookNow = useRef({ row: shape.row, panel: panelH });
  lookNow.current = { row: shape.row, panel: panelH };
  const box = useSpringBox(held ? held.w : shapeW, held ? held.h : shape.h, reduced, soft, panelWas.current, panelNow, lookNow);
  // M70 step 4: what the panel shows is kept while it fades out (notchQuick.ts latched): `brief` and the hello follow the
  // pointer, which has already gone in the frame the panel starts to leave, so without this the words switched to another
  // view (or to nothing) and the fade had nothing left to fade.
  // While Home grows from it, the panel stays laid out with its words, which fade as Home's shape covers them (ui/notch.css
  // .island[data-home]): Home's own words arrive once its body is there, so the two overlap instead of leaving a gap.
  const panelShown = parts.panel || held !== null;
  const briefRef = useRef(!shape.hover);
  // Latched on the pointer's panel, not on the held one: holding is exactly when the pointer has gone.
  briefRef.current = latched(briefRef.current, parts.panel, !shape.hover);
  const helloRef = useRef<typeof hello>(null);
  helloRef.current = latched(helloRef.current, parts.panel, helloOn && !shape.hover ? hello : null);
  // The live mark in the notch's row hides while the panel says the same in words, except listening and looking (rule 5).
  const rowMode = tucking ?? shape.mode;
  // F19: a file dragged over the island lights it; dropping it opens its choices in Home.
  // The wing the app drew the window for (island.rs Look.wing); the usual 40 points until it says.
  // The step is as wide as the longest of the four words, so its line keeps one length from Finding to Proven.
  const vars = { "--core": `${shape.core}px`, "--row": `${shape.row}px`, ...(shape.wing > 0 ? { "--wing": `${shape.wing}px` } : {}), ...(stepW > 0 ? { "--step-w": `${stepW}px` } : {}) } as CSSProperties;
  const st = wings ? step : lastStep.current;
  return (
    <main className={`island ${shape.kind}`} data-mode={shape.mode} data-tuck={tucking ?? undefined} data-home={homeUp ? "" : undefined} data-drop={drop.s.hover ? "over" : undefined} data-step={st && shape.wing > WING_USUAL ? "" : undefined} data-style="instrument" style={vars}>
      <span className="island-shape" ref={box}>
        {/* The notch's own row: a click opens Home, as always. The wings are drawn in it while something happens. */}
        <button className="island-hit" type="button" aria-label={islandName(line)} title={unseen > 0 ? S.panel.unseen(unseen) : undefined} onClick={tap}>
          {showWings && w && <span aria-hidden="true">
            {/* M70: the Visor's lights only with Show wings at rest on; otherwise the left wing is plain black. */}
            <span className="island-wing left">{wingsAtRest && <FlowMini className="island-flow" state={w.state} band mood={mood} />}</span>
            <span className="island-wing right">{st && shape.wing > WING_USUAL && <StepWord step={st} />}{rowMarkShown(rowMode, w.mark) && <Mark w={w} count={m.approvals.length} reduced={reduced} />}</span>
          </span>}
          {/* M68: the wings at rest. The lights glance once toward a new word on the right. */}
          {showWings && !w && r && <span aria-hidden="true" data-rest="">
            <span className="island-wing left"><FlowMini className="island-flow" state={restWingState(r)} band glance={r.word ?? (r.tick ? "tick" : null)} mood={mood} /></span>
            <span className="island-wing right">{r.word ? <span className="island-rest-word">{r.word}</span> : r.tick ? <span className="mark" data-state="done" data-mark="tick"><svg viewBox="0 0 14 14" width="14" height="14"><path d="M3 7.5l3 3 5-6.5" /></svg></span> : null}</span>
          </span>}
        </button>
        {/* The four step words, laid out but never shown, so the wings are asked for once, as wide as the longest needs. */}
        <span className="island-step island-step-measure" ref={measure} aria-hidden="true">{S.home.steps.map((word) => <span key={word} className="island-step-word">{word}</span>)}</span>
        {/* M68: the word at rest, laid out but never shown, so the right wing is asked for as wide as it needs. */}
        <span className="island-rest-word island-step-measure" ref={restMeasure} aria-hidden="true">{rest?.word ?? ""}</span>
        <IslandPanel ref={panelRef} m={m} line={line} shown={panelShown} brief={briefRef.current} unseen={unseen} review={review && !hushed} reviewKey={reviewKey} hello={helloRef.current} kept={kept} onKeep={keep} />
      </span>
    </main>
  );
}
// The settings in force, kept in step with every change (settingsStore.ts), so the island reads them the same way.
startSettings();
followLessMotion();
// Must fix 4: a draw error never leaves this window blank for good (partBoundary.tsx).
createRoot(document.getElementById("root")!).render(<StrictMode><PartBoundary part="island" auto><Island /></PartBoundary></StrictMode>);
