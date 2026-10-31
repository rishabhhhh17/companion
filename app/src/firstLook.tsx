// The recorded first run on screen (firstLook.ts has the rules and the real practice it shows). It plays by itself, a few
// seconds a step; with Reduce motion or Less motion it waits for Next step instead. The dots jump to any step. Nothing
// here talks to the engine or the Mac: it is a picture of a run, and it says so.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { BEATS, BEAT_MS, BEAT_STATE, RECORDING, beatAt, beatIndex, shown, type Beat } from "./firstLook.ts";
import { HomeCharacter } from "./homeCharacter.tsx";
import { Icon } from "./icons.tsx";
import { reducedMotion, watchReducedMotion } from "./motion.ts";
import { S } from "./strings.ts";

const W = S.firstLook;

/** `goLabel`: the last button's words (the first run's Continue; Done on Learn's tour). */
export function FirstLook({ onGo, goLabel = W.go }: { onGo: () => void; goLabel?: string }) {
  const [reduced, setReduced] = useState(reducedMotion);
  useEffect(() => watchReducedMotion(setReduced), []);
  // Where the run is: a step chosen by hand, or the time since it started playing.
  const [picked, setPicked] = useState<Beat | null>(null);
  const [startedAt, setStartedAt] = useState(() => performance.now());
  const [now, setNow] = useState(() => performance.now());
  const [paused, setPaused] = useState(false);
  const playing = !reduced && !paused && picked === null;
  const beat: Beat = picked ?? (reduced ? "broken" : beatAt(now - startedAt));
  const done = beat === BEATS[BEATS.length - 1];
  // M26: one update at each step's start, not one per screen refresh (the step's own bar fills in CSS meanwhile).
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (reduced || paused || picked !== null || done) return;
    const left = BEAT_MS - ((now - startedAt) % BEAT_MS);
    timer.current = setTimeout(() => setNow(performance.now()), left + 5);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [reduced, paused, picked, done, now, startedAt]);
  const again = () => { setPicked(reduced ? "broken" : null); setPaused(false); const t = performance.now(); setStartedAt(t); setNow(t); };
  const step = () => setPicked(BEATS[Math.min(BEATS.length - 1, beatIndex(beat) + 1)]);
  const i = beatIndex(beat);
  const fixed = shown(beat, "fixed"), proven = shown(beat, "proven");

  return (
    <section className="first-look" aria-label={W.tagline} data-beat={beat}>
      <div className="fl-head">
        <HomeCharacter as={BEAT_STATE[beat]} />
        <div className="fl-say" aria-live="polite">
          <p className="fl-tagline">{W.tagline}</p>
          <h2><span key={beat}>{W.beats[beat]}</span></h2>
          <p className="muted">{W.more[beat]}</p>
        </div>
      </div>

      <div className="fl-stage" aria-hidden="true">
        <div className={`fl-page${proven ? " ok" : ""}`}>
          <div className="fl-chrome"><span /><span /><span /><b>{RECORDING.pageTitle}</b></div>
          <div className="fl-body">
            <div className="fl-h">{RECORDING.pageTitle}</div>
            <div className="fl-form"><span className="fl-input">{W.email}</span><span className={`fl-join${beat === "broken" ? " press" : ""}`}>{W.join}</span></div>
            <div className={`fl-msg${proven ? " ok" : " bad"}`}>{proven ? RECORDING.fixedMsg : RECORDING.brokenMsg}</div>
          </div>
          {proven && <div className="fl-caption">{W.picture}</div>}
        </div>

        <div className="fl-side">
          <div className={`fl-code${shown(beat, "found") ? " in" : ""}`}>
            <div className="fl-file">{RECORDING.file}<span className="muted"> · line {RECORDING.line}</span></div>
            <code className={`fl-line${fixed ? " gone" : " bad"}`}><span className="fl-n">{RECORDING.line}</span>{RECORDING.codeBefore}</code>
            {fixed && <code className="fl-line ok"><span className="fl-n">{RECORDING.line}</span>{RECORDING.codeAfter}</code>}
          </div>
          <div className={`fl-check${shown(beat, "found") ? " in" : ""}${proven ? " ok" : " bad"}`}>
            <span className="fl-mark"><Icon name={proven ? "tick" : "cross"} size={14} /></span>
            <span>{W.check}</span>
            <b>{proven ? W.passes : W.fails}</b>
          </div>
          <div className={`fl-undo${shown(beat, "undo") ? " in" : ""}`}><span className="fl-undo-ic"><Icon name="undo" size={14} /></span>{W.undo}</div>
        </div>
      </div>

      <div className="fl-dots" role="group" aria-label={W.recorded}>
        {BEATS.map((b, n) => (
          <button key={b} type="button" className={`fl-dot${n < i || (n === i && !playing) ? " on" : ""}${n === i && playing ? " now" : ""}`} aria-current={b === beat ? "step" : undefined}
            style={{ "--beat": `${BEAT_MS}ms` } as CSSProperties}
            aria-label={W.stepOf(n + 1, BEATS.length, W.stepNames[b])} onClick={() => setPicked(b)} />
        ))}
      </div>
      <p className="muted fl-recorded">{W.recorded}</p>
      <div className="row fl-actions">
        {!done && (reduced || picked !== null) && <button className="btn" type="button" onClick={step}>{W.nextStep}</button>}
        {!done && !reduced && picked === null && <button className="btn" type="button" onClick={() => { setPaused((p) => !p); if (paused) { const t = performance.now() - (now - startedAt); setStartedAt(t); setNow(performance.now()); } }}>{paused ? W.play : W.pause}</button>}
        {done && <button className="btn" type="button" onClick={again}>{W.again}</button>}
        <button className="btn primary lg fl-go" type="button" onClick={onGo}>{goLabel}</button>
      </div>
    </section>
  );
}
