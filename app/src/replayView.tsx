// M86 (a), Watch what changed: the review's replay, drawn beat by beat with the hand drawn pen (replay.ts lays it out and
// times it), on Home's review card with each beat's sentence under it and Watch again. The board fills the card's text
// column (320 to 640 wide), drawn one to one so its words keep their size. A still picture with every beat drawn when the
// Mac asks for less motion or the person chose it (replay.reduceMotion). The notch keeps its own pass or fail tile: a
// replay too small to read there said less than the tile did. Colours are meanings, from the tokens through data-c; the
// look is in ui/replay.css.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReviewRating } from "../../protocol/index.ts";
import { reducedMotion } from "./motion.ts";
import { replayScene, replayStill, replayTimes, REPLAY_BOARD, type ReplayView as Replay } from "./replay.ts";
import { useSetting } from "./settingsStore.ts";
import { S } from "./strings.ts";
import { toolOn } from "./groups.ts";
import { spokenReplayTimes, statusSays } from "./spokenStatus.ts";
import { invoke, listen } from "./tauri.ts";
import { spokenSpeed } from "./voicesettings.ts";
import "./ui/replay.css";

export function ReplayView({ replay, rating, id }: { replay: Replay; rating: ReviewRating; id?: string }) {
  const speed = useSetting("replay.speed");
  const still = replayStill(useSetting("replay.reduceMotion"), reducedMotion());
  const box = useRef<HTMLElement>(null);
  const [width, setWidth] = useState<number>(REPLAY_BOARD.w);
  // The card's own width: the board is laid out for it, so it never leaves an empty gap beside or under it.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => { const w = Math.floor(el.clientWidth); if (w > 0) setWidth(w); };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scene = useMemo(() => replayScene(replay, rating, width), [replay, rating, width]);
  // M88 (d): said out loud as it draws (speak.status "replay", with voice on, never for the still picture): each beat waits
  // for its words at the voice's speed, and its sentence shows under the board while it is said. Stop everything silences
  // the rest of this run (the shell has already silenced the voice).
  const statusChoice = useSetting("speak.status");
  const voice = toolOn("speak");
  const aloud = !still && statusSays("replay", statusChoice, voice);
  const times = useMemo(() => (aloud ? spokenReplayTimes(replay, speed, spokenSpeed()) : replayTimes(replay, speed)), [replay, speed, aloud]);
  const hushed = useRef(false);
  useEffect(() => {
    const off = listen("runner-event", (e) => { if ((e.payload as { type?: string } | null)?.type === "app.stop_everything") hushed.current = true; });
    const offHush = listen("hush", () => { hushed.current = true; });
    return () => { void off.then((f) => f()); void offHush.then((f) => f()); };
  }, []);
  const last = replay.beats.length - 1;
  const [run, setRun] = useState(0);
  const [beat, setBeat] = useState(still ? last : 0);
  useEffect(() => {
    if (still) { setBeat(last); return; }
    setBeat(0);
    hushed.current = false;
    const say = (i: number) => { if (aloud && !hushed.current) void invoke("speak", { text: replay.beats[i].say }).catch(() => {}); };
    const ts = times.map((t, i) => setTimeout(() => { setBeat(i); say(i); }, t.at));
    return () => ts.forEach(clearTimeout);
  }, [run, still, times, last, aloud]);
  const all = replay.beats.map((b) => b.say).join(" ");
  return (
    <figure className="rp" id={id} ref={box} data-still={still ? "" : undefined} aria-label={S.m86.watchLabel}>
      <div className="rp-cap-head">{S.m86.watch}</div>
      <svg key={run} className="rp-board" width={scene.width} height={scene.height} viewBox={`0 0 ${scene.width} ${scene.height}`} role="img" aria-label={all}>
        {scene.rows.map((r) => (
          <g key={`${r.y}`} className="rp-row">
            <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={5} />
            <text x={r.x + 7} y={r.y + 15}>{r.file === null ? S.m86.more(Number(r.name.slice(1))) : r.name}</text>
            {r.part && <text className="rp-part" x={r.x + r.w - 6} y={r.y + 15} textAnchor="end">{S.m86.parts[r.part as keyof typeof S.m86.parts]}</text>}
          </g>
        ))}
        {scene.chips.map((c) => (
          <g key={c.label} className="rp-chip">
            <rect x={c.x} y={c.y} width={c.w} height={c.h} rx={5} />
            <text x={c.x + 24} y={c.y + 15}>{c.label}</text>
            {c.exit !== undefined && <text className="rp-part" x={c.x + c.w - 6} y={c.y + 15} textAnchor="end">{S.m86.exit(c.exit)}</text>}
          </g>
        ))}
        {scene.marks.map((m) => (
          <path key={m.beat} className="rp-mark" data-c={m.colour} d={m.d} pathLength={1}
            style={still ? undefined : { animationDelay: `${times[m.beat].at}ms`, animationDuration: `${Math.min(900, Math.round(times[m.beat].dur * 0.6))}ms` }} />
        ))}
      </svg>
      {still
        ? <ol className="rp-says">{replay.beats.map((b, i) => <li key={i}>{b.say}</li>)}</ol>
        // Every sentence sits in the same place, only the current one seen: as tall as the longest, so nothing jumps and
        // there is no empty line kept for a short one.
        : <figcaption className="rp-say" aria-live="polite">{replay.beats.map((b, i) => <span key={i} className="rp-say-line" aria-hidden={i !== beat || undefined} data-on={i === beat ? "" : undefined}>{b.say}</span>)}</figcaption>}
      <div className="rp-foot">
        <span className="rp-by">{replay.by === "model" ? S.m86.byModel : S.m86.byRules}</span>
        {!still && <button type="button" className="btn quiet" onClick={() => setRun((n) => n + 1)}>{S.m86.watchAgain}</button>}
      </div>
    </figure>
  );
}
