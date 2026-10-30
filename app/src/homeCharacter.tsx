// Flowflow in Home (27 Oct 2026): the same water as on the desktop, large, beside the job. The same pose for each state as the
// character on the edge (characters.ts poseFor, from the model's visualState), so working wobbles, done splashes and needs
// you waves. It is a picture, not a control: VoiceOver hears the job in the headline beside it. A touch makes it wobble.
// With the Mac's Reduce motion or Less motion it is calm (no wobble, no ripple, no droplets), as on the desktop.
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { poseFor, poseUrl } from "./characters.ts";
import { useFlow } from "./flow/useFlow.ts";
import { visualState, type CharacterState, type Model } from "./model.ts";
import { playful, reducedMotion, watchReducedMotion } from "./motion.ts";
import { reactionsOn } from "./reactions.ts";
import { useSetting } from "./settingsStore.ts";
import { flowColours, waterOf } from "./lookfeel.ts";

// With "Draw live" on (character.live), the founder's live water (src/flowflow/), loaded only then, as on the desktop.
const FlowflowView = lazy(() => import("./flowflow/view.tsx").then((x) => ({ default: x.FlowflowView })));

/** M37c: Home's waterline sits a little above 70% down its box; the drop meets it just under the line (measured on Home, M40): the water
 *  joins it there and it clings to the surface, as water meeting water does. */
const ON_THE_WATER = { side: "below" as const, at: 0.72, cling: 0.6 };

/** `as`: a state to show instead of the model's (the recorded first run, firstLook.tsx, acts each step out). */
export function HomeCharacter({ m, as }: { m?: Model; as?: CharacterState }) {
  const [reduced, setReduced] = useState(reducedMotion);
  useEffect(() => watchReducedMotion(setReduced), []);
  const state = as ?? (m ? visualState(m) : "idle");
  const pose = poseFor(state);
  const liveOn = useSetting("character.live") === true;
  // The water's colour chosen in Settings (look.water).
  const water = useSetting("look.water");
  const colours = flowColours(waterOf(water));
  const [liveFailed, setLiveFailed] = useState(false);
  const live = liveOn && !liveFailed;
  const flow = useFlow({ pose, state, calm: reduced, off: live });
  const box = useRef<HTMLDivElement>(null);
  // A task that just finished: a ripple and droplets from the middle of the water, once.
  const wasDone = useRef(state === "done");
  useEffect(() => {
    const now = state === "done";
    if (now && !wasDone.current && playful(reactionsOn(), reducedMotion())) {
      const r = box.current?.getBoundingClientRect();
      if (r) flow.api.big(r.left + r.width / 2, r.top + r.height / 2);
    }
    wasDone.current = now;
  }, [state]);
  return (
    <div ref={box} className="home-char" data-state={state} data-flow={flow.ready || live ? "on" : undefined} data-live={live ? "on" : undefined} aria-hidden="true"
      onPointerDown={(e) => { if (!live) flow.api.poke(e.clientX, e.clientY); }}>
      {live
        ? <Suspense fallback={<img className="home-pose" src={poseUrl(pose)} alt="" draggable={false} />}><FlowflowView state={state} reduced={reduced} followRange={0.25} className="home-flowflow" colours={colours} surface={ON_THE_WATER} onFallback={() => setLiveFailed(true)} /></Suspense>
        : <>
          {!flow.failed && <canvas ref={flow.canvasRef} className="home-flow" />}
          <img className={`home-pose${flow.ready ? " flow-ready" : ""}`} src={poseUrl(pose)} alt="" draggable={false} />
          {!flow.failed && <canvas ref={flow.dropRef} className="home-drops" />}
        </>}
    </div>
  );
}
