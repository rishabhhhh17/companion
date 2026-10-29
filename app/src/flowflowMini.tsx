// One Flowflow everywhere (M24, 29 Oct 2026, the founder: the live water is Flowflow; the notch and the first run showed a
// different picture of it). The small Flowflow in the notch, in its panel and in the first run is the same live water as on
// the desktop and in Home, in the water colour chosen in Settings. With Draw live off (character.live), or where the live
// water cannot run, the picture pose instead, as on the desktop. `still`: one still frame on each change, no loop (a panel
// that is not on screen, or a small mark that should not pull the eye).
import { Suspense, lazy, useEffect, useState } from "react";
import { poseFor, poseUrl } from "./characters.ts";
import { flowColours, hueTurn, waterOf, type Water } from "./lookfeel.ts";
import type { CharacterState } from "./model.ts";
import { reducedMotion, watchReducedMotion } from "./motion.ts";
import { useSetting } from "./settingsStore.ts";

const FlowflowView = lazy(() => import("./flowflow/view.tsx").then((x) => ({ default: x.FlowflowView })));

/** `water`: show this water colour instead of the chosen one (the character picks in Settings, M35). */
export function FlowMini({ state, className, still, water }: { state: CharacterState; className: string; still?: boolean; water?: Water }) {
  const liveOn = useSetting("character.live") === true;
  const chosen = waterOf(useSetting("look.water"));
  const colours = flowColours(water ?? chosen);
  const [reduced, setReduced] = useState(reducedMotion);
  useEffect(() => watchReducedMotion(setReduced), []);
  const [failed, setFailed] = useState(false);
  const picture = <img className={className} src={poseUrl(poseFor(state))} alt="" draggable={false} style={water ? { filter: `hue-rotate(${hueTurn(water)}deg)` } : undefined} />;
  if (!liveOn || failed) return picture;
  return (
    <span className={`${className} ff-mini`} data-live="on" aria-hidden="true">
      <Suspense fallback={picture}>
        <FlowflowView state={state} reduced={!!still || reduced} followRange={0} colours={colours} className="ff-mini-canvas" onFallback={() => setFailed(true)} />
      </Suspense>
    </span>
  );
}
