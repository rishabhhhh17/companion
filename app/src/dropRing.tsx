// F19, drop a file on the companion: the ring around the character (the dock's window) and the same choices as a list in
// Home, where the keyboard reaches them (the character's window never takes the keyboard, rule 9) and where a trim's two
// times can be typed. Both follow the shell's news through one reducer (dropmenu.ts). The page never sees a path: it
// sends the menu's number and the chosen action, and the shell does the rest (convert.rs).
import { useEffect, useReducer, useRef, useState } from "react";
import { invoke, listen } from "./tauri.ts";
import { EMPTY, actionWords, clearsSaid, dropReduce, jobFrom, jobLine, keyMove, madeOf, menuFrom, namesLine, refusedLine, ringSpots, running, trimFrom, type DropState } from "./dropmenu.ts";
import { S } from "./strings.ts";

type Dispatch = (a: Parameters<typeof dropReduce>[1]) => void;
/** The drop's state, how to change it, and a line the shell's refusal of a choice left to say (busy, bad times). */
export type Drop = { s: DropState; d: Dispatch; said: string; say: (line: string) => void };

/** The drop's state in this page, kept in step with the shell. */
export function useDrop(): Drop {
  const [s, dispatch] = useReducer(dropReduce, EMPTY);
  // A refusal from the shell for a choice (busy, bad times), said once on the live line.
  const [said, setSaid] = useState("");
  useEffect(() => {
    void invoke("drop_now").then((v) => {
      const o = v as { menu?: unknown; job?: unknown } | null;
      const menu = menuFrom(o?.menu);
      if (menu) { dispatch({ type: "menu", menu }); const job = jobFrom(o?.job); if (job) dispatch({ type: "job", job }); }
    }).catch(() => {});
    const offs = [
      listen("drop-hover", (e) => dispatch({ type: "hover", over: (e.payload as { over?: unknown } | null)?.over === true })),
      listen("drop-menu", (e) => { setSaid(""); dispatch({ type: "menu", menu: menuFrom(e.payload) }); }),
      // A line left by a refused second drop or a double click belongs to the job that was running: it goes when that ends.
      listen("drop-job", (e) => { const job = jobFrom(e.payload); if (clearsSaid(job)) setSaid(""); dispatch({ type: "job", job }); }),
      // A drop while a job still runs changes nothing; it is only said.
      listen("drop-said", (e) => setSaid(whyLine((e.payload as { why?: unknown } | null)?.why))),
    ];
    return () => { for (const o of offs) void o.then((f) => f()); };
  }, []);
  const d: Dispatch = (a) => { if (a.type !== "hover" && a.type !== "focus") setSaid(""); dispatch(a); };
  return { s, d, said, say: setSaid };
}

const whyLine = (e: unknown): string => (S.drop.why as Record<string, string>)[String(e)] ?? S.drop.why.other;

/** Chooses an action. Trim first asks for its two times (in Home; from the ring, Home opens for them). */
function choose({ s, d, say }: Drop, action: string, inHome: boolean) {
  const m = s.menu;
  if (!m || running(s)) return;
  if (action === "trim") {
    if (inHome) d({ type: "trim", open: true }); else void invoke("drop_trim", { id: m.id });
    return;
  }
  void invoke("drop_pick", { id: m.id, action, trim: null }).catch((e) => say(whyLine(e)));
}

const close = (s: DropState, d: Dispatch) => { if (!s.menu || running(s)) return; void invoke("drop_close", { id: s.menu.id }); d({ type: "close" }); };

/** Keys in the menu: the arrows move round, Home and End jump, Return or Space choose, Escape closes. */
function onKey(e: React.KeyboardEvent, drop: Drop) {
  const { s, d } = drop;
  const k = keyMove(e.key);
  // Return and Space press the button that has the keyboard, as any button does (its own click handler runs).
  if (!k || k === "pick" || !s.menu) return;
  e.preventDefault();
  e.stopPropagation();
  if (k === "close") close(s, d);
  else d({ type: "move", to: k });
}

/** After a job: the line, and Show in Finder for what was made, also before a Stop (the shell shows only what it made itself). */
function Outcome({ s, d }: { s: DropState; d: Dispatch }) {
  const j = s.job;
  if (!j || !s.menu) return null;
  const id = s.menu.id;
  const made = madeOf(j);
  return (
    <div className="drop-outcome">
      <div className="line" role="status" aria-live="polite">{jobLine(j)}</div>
      {j.phase === "running" && <button className="btn" type="button" onClick={() => void invoke("drop_stop")}>{S.drop.stop}</button>}
      {j.phase === "running" && j.percent !== null && <progress className="drop-progress" max={100} value={j.percent} aria-hidden="true" />}
      {made.slice(0, 3).map((m) => <button key={m.i} className="btn" type="button" aria-label={`${S.drop.showInFinder}: ${m.name}`} onClick={() => void invoke("drop_reveal", { id, i: m.i })}>{S.drop.showInFinder}</button>)}
      {j.phase !== "running" && <button className="btn" type="button" onClick={() => close(s, d)}>{S.drop.close}</button>}
    </div>
  );
}

/** The ring around the character, in the character's own window. A drop on the island shows its choices in Home only. */
export function DropRing({ drop }: { drop: Drop }) {
  const { s, d, said } = drop;
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const m = s.menu;
  // Focus follows the reducer's place, so VoiceOver and Full Keyboard Access stay on the button that is current.
  useEffect(() => { if (m && !s.job && document.activeElement && items.current.includes(document.activeElement as HTMLButtonElement)) items.current[s.focus]?.focus(); }, [s.focus, m, s.job]);
  if (!m || m.at !== "dock") return null;
  if (m.refused) return (
    <div className="drop-outcome drop-over-character"><div className="line" role="status" aria-live="polite">{refusedLine(m.refused)}</div><button className="btn" type="button" onClick={() => close(s, d)}>{S.drop.close}</button></div>
  );
  if (s.job) return <div className="drop-over-character"><Outcome s={s} d={d} /></div>;
  if (said) return <div className="drop-outcome drop-over-character"><div className="line" role="status" aria-live="polite">{said}</div><button className="btn" type="button" onClick={() => d({ type: "trim", open: false })}>{S.drop.trimBack}</button></div>;
  const all = [...m.actions, "close"];
  const spots = ringSpots(all.length, 58);
  return (
    <div className="drop-ring" role="menu" aria-label={S.drop.menuLabel(namesLine(m))} onKeyDown={(e) => onKey(e, drop)}>
      {all.map((a, i) => {
        const w = a === "close" ? { short: "×", label: S.drop.close } : actionWords(a)!;
        return (
          <button key={a} ref={(el) => { items.current[i] = el; }} className={`drop-item${a === "close" ? " drop-close" : ""}`} type="button" role="menuitem"
            tabIndex={i === s.focus ? 0 : -1} aria-label={w.label} title={w.label}
            style={{ transform: `translate(${spots[i].x}px, ${spots[i].y}px)` }}
            onFocus={() => { if (a !== "close") d({ type: "focus", i }); }}
            onClick={() => (a === "close" ? close(s, d) : choose(drop, a, false))}>
            <span aria-hidden="true">{w.short}</span>
          </button>
        );
      })}
      <div className="sr">{S.drop.pickInHome}</div>
    </div>
  );
}

/** The same choices in Home, on Now: reachable with the keyboard, with the trim's two times and the outcome. */
export function DropList({ drop }: { drop: Drop }) {
  const { s, d, said, say } = drop;
  const m = s.menu;
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [bad, setBad] = useState(false);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => { setStart(""); setEnd(""); setBad(false); }, [m?.id]);
  useEffect(() => { if (m && document.activeElement && items.current.includes(document.activeElement as HTMLButtonElement)) items.current[s.focus]?.focus(); }, [s.focus, m]);
  if (!m) return null;
  const trimNow = () => {
    const t = trimFrom(start, end);
    if (!t) { setBad(true); return; }
    setBad(false);
    void invoke("drop_pick", { id: m.id, action: "trim", trim: t }).catch((e) => say(whyLine(e)));
  };
  return (
    <section className="panel drop-list" aria-label={S.drop.menuLabel(namesLine(m))}>
      <div className="row between"><b>{S.drop.title}</b><span className="muted">{namesLine(m)}</span></div>
      <div className="muted">{S.drop.local}</div>
      {m.refused && <><div className="line" role="status">{refusedLine(m.refused)}</div><div className="row"><button className="btn" type="button" onClick={() => close(s, d)}>{S.drop.close}</button></div></>}
      {!m.refused && !s.job && !s.trim && (
        <div className="row" role="menu" aria-label={S.drop.menuLabel(namesLine(m))} aria-describedby="drop-keys" onKeyDown={(e) => onKey(e, drop)}>
          {m.actions.map((a, i) => (
            <button key={a} ref={(el) => { items.current[i] = el; }} className="btn" type="button" role="menuitem" tabIndex={i === s.focus ? 0 : -1}
              onFocus={() => d({ type: "focus", i })}
              onClick={() => choose(drop, a, true)}>{actionWords(a)!.label}</button>
          ))}
          <span id="drop-keys" className="sr">{S.drop.keyHint}</span>
        </div>
      )}
      {!m.refused && !s.job && !s.trim && <div className="row"><button className="btn" type="button" onClick={() => close(s, d)}>{S.drop.close}</button></div>}
      {!m.refused && !s.job && s.trim && (
        <form className="drop-trim" onSubmit={(e) => { e.preventDefault(); trimNow(); }} aria-label={S.drop.trimTitle}>
          <label>{S.drop.trimStart} <input type="text" inputMode="decimal" value={start} placeholder="0:00" onChange={(e) => setStart(e.currentTarget.value)} aria-describedby="drop-trim-hint" /></label>
          <label>{S.drop.trimEnd} <input type="text" inputMode="decimal" value={end} placeholder="0:30" onChange={(e) => setEnd(e.currentTarget.value)} aria-describedby="drop-trim-hint" aria-invalid={bad} /></label>
          <div id="drop-trim-hint" className="muted">{S.drop.trimHint}</div>
          {bad && <div className="line blocked" role="alert">{S.drop.trimBad}</div>}
          <div className="row"><button className="btn primary" type="submit">{S.drop.trimGo}</button><button className="btn" type="button" onClick={() => d({ type: "trim", open: false })}>{S.drop.trimBack}</button></div>
        </form>
      )}
      {said && <div className="line" role="status" aria-live="polite">{said}</div>}
      <Outcome s={s} d={d} />
    </section>
  );
}
