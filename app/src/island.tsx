import { StrictMode, useEffect, useRef, useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { startSettings, useSetting } from "./settingsStore.ts";
import { followLessMotion, playful, reducedMotion, watchReducedMotion } from "./motion.ts";
import { invoke, listen } from "./tauri.ts";
import { DONE_WINGS_MS, ISLAND_MODES, islandLine, islandName, islandParts, islandWings, wingsAt, type IslandMode, type Wings } from "./home.ts";
import { readyVersion } from "./updates.ts";
import { CHEER_AT_MS, CHEER_FOR_MS, CHEER_SPRING, ISLAND_SPRING, TUCK_MS, springStep, type Spring } from "./islandSpring.ts";
import { reactionsOn } from "./reactions.ts";
import { useModel } from "./useModel.ts";
import { S } from "./strings.ts";
import { useDrop } from "./dropRing.tsx";
import { activeGroup } from "./groups.ts";
import { running } from "./dropmenu.ts";
import "./style.css";

// The island in the notch (F18, made fun on 27 Oct 2026). The app decides its size and what it sits on (island.rs): the
// notch itself, a small pill in the middle of the menu bar, or a thin line on the top edge where no menu bar shows. Idle it
// is only that, black, with no words. Resting the pointer on it opens the panel under it (islandPanel.tsx). While something
// happens it grows short wings: a tiny Flowflow on the left, one live mark on the right. A sentence shows only under the
// pointer, and only when there is something real to say (home.ts). The black shape moves on a small spring
// (islandSpring.ts) toward the size the app gives; the window itself changes at once, and shrinks only after the shape has
// tucked back. A click opens Home below it. The island never takes the keyboard (it is a borderless panel).
import { useLook } from "./useLook.ts";
import { IslandPanel } from "./islandPanel.tsx";
import { islandJobs, workPeekKey, WORK_PEEK_MS } from "./islandPanel.ts";
import { FlowMini } from "./flowflowMini.tsx";
type Kind = "notch" | "pill" | "edge";
const KINDS: readonly Kind[] = ["notch", "pill", "edge"];
type Shape = { mode: IslandMode; kind: Kind; w: number; h: number; core: number; row: number; hover: boolean };
const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : 0);
const shapeFrom = (v: unknown): Shape | null => {
  const o = v as { mode?: unknown; kind?: unknown; w?: unknown; h?: unknown; core?: unknown; row?: unknown; hover?: unknown } | null;
  if (!o || !ISLAND_MODES.includes(o.mode as IslandMode) || !KINDS.includes(o.kind as Kind)) return null;
  return { mode: o.mode as IslandMode, kind: o.kind as Kind, w: num(o.w), h: num(o.h), core: num(o.core), row: num(o.row), hover: o.hover !== false };
};

/** Springs the black shape toward the size the app asked for, drawing straight into its style (no React render per frame).
 *  The window is centred on the notch at every size, so a shape centred in it stays put on the screen when the window
 *  changes. Size 0 (not told yet): the whole window. */
function useSpringBox(w: number, h: number, reduced: boolean, soft: boolean) {
  const box = useRef<HTMLSpanElement>(null);
  const at = useRef<{ x: Spring; y: Spring } | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // The size goes straight on the shape (M25), not through inherited variables, so a frame restyles the shape alone and not
    // everything inside it.
    const draw = () => { const s = at.current; if (!s) return; el.style.width = `${Math.max(0, s.x.x)}px`; el.style.height = `${Math.max(0, s.y.x)}px`; };
    if (!w || !h) { at.current = null; el.style.removeProperty("width"); el.style.removeProperty("height"); return; }
    if (!at.current || reduced) { at.current = { x: { x: w, v: 0 }, y: { x: h, v: 0 } }; draw(); return; }
    let raf = 0, last = performance.now();
    const tick = (t: number) => {
      const s = at.current!, dt = (t - last) / 1000;
      last = t;
      const { k, c } = soft ? CHEER_SPRING : ISLAND_SPRING;
      s.x = springStep(s.x, w, dt, reducedMotion(), k, c);
      s.y = springStep(s.y, h, dt, reducedMotion(), k, c);
      draw();
      if (s.x.x !== w || s.y.x !== h || s.x.v !== 0 || s.y.v !== 0) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [w, h, reduced, soft]);
  return box;
}

/** The live mark on the right wing (home.ts WingMark). Drawn only, never read: the island's name says it in words. */
function Mark({ w, count }: { w: Wings; count: number }) {
  // Thinking: one dot that breathes. Working and looking: a thin round arc (13 points across) that turns.
  const inner = w.mark === "dots" ? <i />
    : w.mark === "arc" ? <svg viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="6.5" /></svg>
    : w.mark === "bars" ? <><i /><i /><i /><i /></>
    : w.mark === "tick" ? <svg viewBox="0 0 14 14" width="14" height="14"><path d="M3 7.5l3 3 5-6.5" /></svg>
    : null;
  return <><span className="mark" data-state={w.state} data-mark={w.mark}>{inner}</span>{w.mark === "amber" && count > 1 && <b className="island-count">{count}</b>}</>;
}

function Island() {
  useLook();   // the water's colour for the work cards (M19)
  const [m] = useModel();
  const [shape, setShape] = useState<Shape>({ mode: "rest", kind: "pill", w: 0, h: 0, core: 0, row: 0, hover: true });
  // A new version a check found (the shell's "update-ready"): said under the pointer when nothing else is going on.
  const [update, setUpdate] = useState<string | null>(null);
  const [unseen, setUnseen] = useState(0);
  const [reduced, setReduced] = useState(reducedMotion);
  useEffect(() => watchReducedMotion(setReduced), []);
  useEffect(() => {
    void invoke("island_state").then((v) => { const s = shapeFrom(v); if (s) setShape(s); setUpdate(readyVersion((v as { update?: unknown } | null)?.update ?? null)); setUnseen(Math.max(0, Math.min(9, Number((v as { unseen?: unknown } | null)?.unseen) || 0))); }).catch(() => {});
    const off = listen("island-mode", (e) => { const s = shapeFrom(e.payload); if (s) setShape(s); });
    const offUp = listen("update-ready", (e) => setUpdate(readyVersion(e.payload)));
    // M34: results finished while Home was closed, counted on the notch until Home opens.
    const offSeen = listen("unseen", (e) => setUnseen(Math.max(0, Math.min(9, Number((e.payload as { n?: unknown } | null)?.n) || 0))));
    return () => { off.then((f) => f()); offUp.then((f) => f()); offSeen.then((f) => f()); };
  }, []);
  // With Show the working group on the island (groups.islandName, usual on), the line starts with the name of the group at work.
  const drop = useDrop();
  const g = activeGroup(m, running(drop.s));
  const showGroup = useSetting("groups.islandName") !== false;
  const line = islandLine(m, { update, group: showGroup && g && g !== "core" ? S.groups.names[g] : null });
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
  // M26: and the work cards drop down for a moment at each change (a job starts, moves a step, ends with its proof), with
  // Show work under the notch on; then they tuck back so nothing stays over the person's windows.
  const showWork = useSetting("island.showWork") !== false;
  const peekKey = showWork ? workPeekKey(islandJobs(m)) : "";
  const [workPeek, setWorkPeek] = useState(false);
  useEffect(() => {
    if (!peekKey) { setWorkPeek(false); return; }
    setWorkPeek(true);
    const id = setTimeout(() => setWorkPeek(false), WORK_PEEK_MS);
    return () => clearTimeout(id);
  }, [peekKey]);
  const questionsOpen = useSetting("island.openForQuestions") !== false;   // read every render: a hook is never skipped
  const ask = out && ((questionsOpen && m.approvals.length > 0) || workPeek);
  useEffect(() => { void invoke("island_alert", { on: out, panel: panelH, cheer: cheering, ask }).catch(() => {}); }, [out, panelH, cheering, ask]);
  // What was out last stays drawn while the shape tucks back over it, so Flowflow and the mark slide away, never blink out.
  const lastWings = useRef<Wings | null>(null);
  if (wings) lastWings.current = wings;
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
  const w = wings ?? lastWings.current;
  const [soft, setSoft] = useState(false);
  useEffect(() => { if (cheering) { setSoft(true); return; } const id = setTimeout(() => setSoft(false), TUCK_MS); return () => clearTimeout(id); }, [cheering]);
  // At rest on a notch the window is wider than the notch (island.rs MARK) and the black grows into it (M20): the sun sits on
  // that black, in lime, sharp on any wallpaper, like the notch apps do.
  const shapeW = shape.w;
  const box = useSpringBox(shapeW, shape.h, reduced, soft);
  // F19: a file dragged over the island lights it; dropping it opens its choices in Home.
  const vars = { "--core": `${shape.core}px`, "--row": `${shape.row}px` } as CSSProperties;
  return (
    <main className={`island ${shape.kind}`} data-mode={shape.mode} data-tuck={tucking ?? undefined} data-drop={drop.s.hover ? "over" : undefined} style={vars}>
      {/* Squibby's mark on the menu bar beside the notch (M16): drawn only, the island's name says what it is. */}
      {/* The mark (app/brand/make_logo.py): white on a dark menu bar, black on a light one, like the Mac's own menu bar icons. */}
      {shape.kind === "notch" && <picture>
        <img className="island-sun" src="./brand/sun-lime.svg" alt="" aria-hidden="true" draggable={false} />
      </picture>}
      <span className="island-shape" ref={box}>
        {/* The notch's own row: a click opens Home, as always. The wings are drawn in it while something happens. */}
        <button className="island-hit" type="button" aria-label={islandName(line)} title={unseen > 0 ? S.panel.unseen(unseen) : undefined} onClick={() => void invoke("island_click")}>
          {unseen > 0 && !showWings && <b className="island-unseen" aria-hidden="true">{unseen}</b>}
          {showWings && w && <span aria-hidden="true">
            <span className="island-wing left"><FlowMini className="island-flow" state={w.state} /></span>
            <span className="island-wing right"><Mark w={w} count={m.approvals.length} /></span>
          </span>}
        </button>
        <IslandPanel ref={panelRef} m={m} line={line} shown={parts.panel || tucking === "peek" || tucking === "wingsPeek"} brief={!shape.hover} />
      </span>
    </main>
  );
}
// The settings in force, kept in step with every change (settingsStore.ts), so the island reads them the same way.
startSettings();
followLessMotion();
createRoot(document.getElementById("root")!).render(<StrictMode><Island /></StrictMode>);
