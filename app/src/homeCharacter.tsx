// Flowflow in Home (27 Oct 2026): the same water as on the desktop, large, beside the job. The same pose for each state as the
// character on the edge (characters.ts poseFor, from the model's visualState), so working wobbles, done splashes and needs
// you waves. It is a picture, not a control: VoiceOver hears the job in the headline beside it. A touch makes it wobble.
// With the Mac's Reduce motion or Less motion it is calm (no wobble, no ripple, no droplets), as on the desktop.
// M65 (the Instrument look, 4 Nov 2026): when the look's character is the orb (lookfeel.ts characterOf), Home shows the small
// faceless glass orb instead, with a thin ring whose colour says the state (characters.ts ringOf, or the ring Home passes so
// it agrees with its status line). No face, no bubbles, no water: those are the friendly character's only.
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { poseFor, poseUrl, ringOf, type Ring } from "./characters.ts";
import { useFlow } from "./flow/useFlow.ts";
import { lookState, type CharacterState, type Model } from "./model.ts";
import { playful, reducedMotion, watchReducedMotion } from "./motion.ts";
import { reactionsOn } from "./reactions.ts";
import { useSetting } from "./settingsStore.ts";
import { characterOf, flowColours, livelinessOf, waterOf, type Liveliness } from "./lookfeel.ts";
import { glassOrbSvg, svgUrl } from "./orbArt.ts";
import { Orb } from "./ui/parts.tsx";
import { useRest } from "./useRest.ts";

// With "Draw live" on (character.live), the founder's live water (src/flowflow/), loaded only then, as on the desktop.
const FlowflowView = lazy(() => import("./flowflow/view.tsx").then((x) => ({ default: x.FlowflowView })));

/** M37c: Home's waterline sits a little above 70% down its box; the drop meets it just under the line (measured on Home, M40): the water
 *  joins it there and it clings to the surface, as water meeting water does. */
const ON_THE_WATER = { side: "below" as const, at: 0.72, cling: 0.6 };
// M60: the orb draws no halo of its own here (halo={false}): Home's glow sits behind it, and the mask on the top of its box
// would cut a halo into a box.

/** `as`: a state to show instead of the model's (the recorded first run, firstLook.tsx, acts each step out). `liveliness`:
 *  a choice to show at once instead of the one in force (the Settings hero, while its press reaches the shell). `rest`:
 *  out of sight (Home closed, or another place open in it), so it rests as it does during a call: one still frame, no loop.
 *  M55 (the character reacts): `askId`, Home's ask box, which its eyes go to while the person types (Gentle and Lively);
 *  `leanTo`, the card it leans toward while changes wait for a review (card.tsx), or null. M65: `ring`, the orb's ring to
 *  show instead of its state's own (null: none), so it agrees with the status line beside it. */
export function HomeCharacter({ m, as, liveliness, rest, askId, leanTo, ring }: { m?: Model; as?: CharacterState; liveliness?: Liveliness; rest?: boolean; askId?: string; leanTo?: string | null; ring?: Ring | null }) {
  const [reduced, setReduced] = useState(reducedMotion);
  useEffect(() => watchReducedMotion(setReduced), []);
  // A finished task that is not proven is drawn at rest, never with the done look (M45, model.ts lookState).
  const state = as ?? (m ? lookState(m) : "idle");
  const pose = poseFor(state);
  const liveOn = useSetting("character.live") === true;
  // The water's colour chosen in Settings (look.water).
  const water = useSetting("look.water");
  const colours = flowColours(waterOf(water));
  // M65: the faceless orb in the chosen water, drawn once per water.
  const orb = characterOf(useSetting("look.style"), useSetting("look.character")) === "orb";
  const orbSrc = useMemo(() => svgUrl(glassOrbSvg(waterOf(water))), [water]);
  const [liveFailed, setLiveFailed] = useState(false);
  const live = liveOn && !liveFailed && !orb;
  // M46 (F28): how lively it is, and the shell's rest (a call, Low Power Mode).
  const mode = liveliness ?? livelinessOf(useSetting("character.lively"));
  const resting = useRest() || !!rest;
  // M55: its small moves for what happens (character.reacts, on unless turned off).
  const reacts = useSetting("character.reacts") !== false;
  const flow = useFlow({ pose, state, calm: reduced, off: live || orb });
  const box = useRef<HTMLDivElement>(null);
  // A task that just finished: a ripple and droplets from the middle of the water, once.
  const wasDone = useRef(state === "done");
  useEffect(() => {
    const now = state === "done";
    if (now && !wasDone.current && !orb && playful(reactionsOn(), reducedMotion())) {
      const r = box.current?.getBoundingClientRect();
      if (r) flow.api.big(r.left + r.width / 2, r.top + r.height / 2);
    }
    wasDone.current = now;
  }, [state]);
  if (orb) return <div className="home-orb" data-state={state} aria-hidden="true"><Orb src={orbSrc} ring={ring === undefined ? ringOf(state) : ring} /></div>;
  return (
    <div ref={box} className="home-char" data-state={state} data-flow={flow.ready || live ? "on" : undefined} data-live={live ? "on" : undefined} aria-hidden="true"
      onPointerDown={(e) => { if (!live) flow.api.poke(e.clientX, e.clientY); }}>
      {live
        ? <>
          <Suspense fallback={<img className="home-pose" src={poseUrl(pose)} alt="" draggable={false} />}><FlowflowView state={state} reduced={reduced} followRange={0.25} className="home-flowflow" colours={colours} surface={ON_THE_WATER} halo={false} liveliness={mode} resting={resting} reacts={reacts} askId={askId} leanTo={leanTo} onFallback={() => setLiveFailed(true)} /></Suspense>
          {/* M55: the still picture of the same pose, hidden under the live drawing. A live drawing cannot be copied, so this is
              what the copy of a place that fades away shows (smoothMotion.ts ghostOf). */}
          <img className="home-pose flow-ready" src={poseUrl(pose)} alt="" draggable={false} />
        </>
        : <>
          {!flow.failed && <canvas ref={flow.canvasRef} className="home-flow" />}
          <img className={`home-pose${flow.ready ? " flow-ready" : ""}`} src={poseUrl(pose)} alt="" draggable={false} />
          {!flow.failed && <canvas ref={flow.dropRef} className="home-drops" />}
        </>}
    </div>
  );
}
