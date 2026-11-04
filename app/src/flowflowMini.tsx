// One Flowflow everywhere (M24, 29 Oct 2026, the founder: the live water is Flowflow; the notch and the first run showed a
// different picture of it). The small Flowflow in the notch, in its panel and in the first run is the same live water as on
// the desktop and in Home, in the water colour chosen in Settings. With Draw live off (character.live), or where the live
// water cannot run, the picture pose instead, as on the desktop. `still`: one still frame on each change, no loop (a panel
// that is not on screen, or a small mark that should not pull the eye).
// M65 (the Instrument look): under Instrument, or with Glass orb picked, it is the faceless glass orb with its state ring
// instead (chromeLook.ts miniShows): no face, no bubbles, no water scene.
// M68: with the Visor (the usual under Instrument) it is the Visor: the full one in the notch's panel and the practice peek,
// the band alone in the notch's wing (`band`), its lights and the scan only. The notch stays quiet: no glance and no hop.
// M66: a small one mounts as something opens (History, the notch's wings, a panel), so it never starts or compiles a drawing
// then: it shows its still picture until a warm drawing is ready (flowflow/pool.ts), made in an idle moment.
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { poseFor, poseUrl, ringOf, type Pose } from "./characters.ts";
import { characterOf, flowColours, hueTurn, livelinessOf, waterOf, type CharacterLook, type Water } from "./lookfeel.ts";
import { miniShows } from "./chromeLook.ts";
import { glassOrbSvg, svgUrl } from "./orbArt.ts";
import { Orb, Visor } from "./ui/parts.tsx";
import type { CharacterState } from "./model.ts";
import { reducedMotion, watchReducedMotion } from "./motion.ts";
import { useSetting } from "./settingsStore.ts";
import { useRest } from "./useRest.ts";

const FlowflowView = lazy(() => import("./flowflow/view.tsx").then((x) => ({ default: x.FlowflowView })));

/** `water`: show this water colour instead of the chosen one (the character picks in Settings, M35). */
/** `pose`: always the still picture in that pose, never a live drawing. Rows of choices (Settings' water and how lively)
 *  use it, so a page never holds a live drawing per tile: Macs cap how many a page may hold, and past the cap the tiles
 *  went blank (31 Oct). */
export function FlowMini({ state, className, still, water, pose, band, glance }: { state: CharacterState; className: string; still?: boolean; water?: Water; pose?: Pose; band?: boolean;
  /** M68: the Visor's lights glance once toward the right when this changes (the notch's word at rest). */
  glance?: string | null }) {
  const liveOn = useSetting("character.live") === true;
  const chosen = waterOf(useSetting("look.water"));
  const colours = flowColours(water ?? chosen);
  const [reduced, setReduced] = useState(reducedMotion);
  useEffect(() => watchReducedMotion(setReduced), []);
  const [failed, setFailed] = useState(false);
  // M46 (F28): how lively, and rest. Small, so working draws at WORK_INTERVAL in every choice (controller.ts small). M55: the
  // notch stays quiet, so the small one makes none of the character's small moves (reacts={false}); its states still show.
  const mode = livelinessOf(useSetting("character.lively"));
  const resting = useRest();
  const reactsOn = useSetting("character.reacts") !== false;   // read every render: a hook is never skipped
  const look = useCharacterLook();
  const orbSrc = useMemo(() => svgUrl(glassOrbSvg(water ?? chosen)), [water, chosen]);
  const shows = miniShows(look, { live: liveOn, failed, pose: !!pose });
  if (shows === "visor") return <span className={`${className} ff-orb`} data-character="visor" aria-hidden="true"><Visor state={state} ring={ringOf(state)} band={band} still={!!still || resting} lively={mode} reacts={glance !== undefined && reactsOn} glance={glance} toward={1} /></span>;
  if (shows === "orb") return <span className={`${className} ff-orb`} data-character="orb" aria-hidden="true"><Orb src={orbSrc} ring={ringOf(state)} /></span>;
  const picture = <img className={className} src={pose ? poseUrl(pose) : poseUrl(poseFor(state))} alt="" draggable={false} style={water ? { filter: `hue-rotate(${hueTurn(water)}deg)` } : undefined} />;
  if (shows === "picture") return picture;
  return (
    <span className={`${className} ff-mini`} data-live="on" aria-hidden="true">
      <Suspense fallback={picture}>
        <FlowflowView state={state} reduced={!!still || reduced} followRange={0} colours={colours} className="ff-mini-canvas" liveliness={mode} resting={resting} small reacts={false} onFallback={() => setFailed(true)} waitForWarm placeholder={picture} />
      </Suspense>
    </span>
  );
}

/** The character the look shows (look.style and look.character, lookfeel.ts characterOf): the orb or the friendly one. */
export function useCharacterLook(): CharacterLook {
  return characterOf(useSetting("look.style"), useSetting("look.character"));
}
