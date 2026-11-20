// GLASS (the founder, 19 Nov 2026, direction B): the top of Home in the glass material. Two rows over the panel's full
// width: the notch's black strip with Flowflow small beside the notch and a one line greeting built from real state
// (glass.ts glassGreeting), Stop while work runs, Settings and the X in the top right corner; then the places as a real
// tablist in the middle, in place of the coloured tile sidebar. The keys are the same as before (Command 1 to 4, homeKeys.ts),
// and each tab keeps the id the place had (home.ts tabId), so focus.ts finds it the same way. Words from strings.ts only.
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { S } from "./strings.ts";
import { tabId, type Tab } from "./home.ts";
import { tabStep } from "./glass.ts";
import { FlowMini } from "./flowflowMini.tsx";
import type { CharacterState } from "./model.ts";

/** Each tab's id: the place's own (home.ts tabId), so focus.ts finds it as before; Now's is its own, as Now had none. */
export const glassTabId = (t: Tab): string => (t === "now" ? "gl-tab-now" : tabId(t));
/** The one panel every tab controls: Home's content column (card.tsx .work). */
export const GLASS_PANEL_ID = "gl-panel";

const word = (t: Tab): string => (t === "now" ? S.look.now : S.home.places[t as "did" | "memory" | "settings" | "learn"]);

/** The tabs. Roving focus: only the open tab is in the Tab order; arrows, Home and End move and open (the panels draw at once,
 *  so automatic activation). Settings is no tab: from there no tab is selected, and the first arrow lands on Now. */
export function GlassTabs({ places, tab, waits, onPick }: { places: readonly Tab[]; tab: Tab; waits: Tab | null; onPick: (t: Tab) => void }) {
  const list = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = tabStep(places, tab, e.key);
    if (!next) return;
    e.preventDefault();
    onPick(next);
    // The tab moved: so does the focus, once React has drawn the new tab as selected (a focus move, not a motion).
    setTimeout(() => list.current?.querySelector<HTMLElement>(`[data-tab="${next}"]`)?.focus(), 0);
  };
  const on = places.includes(tab);
  return (
    <div className="gl-tabs" role="tablist" aria-label={S.glass.tabsLabel} ref={list} onKeyDown={onKey}>
      {places.map((t, i) => {
        const selected = t === tab;
        const attention = waits === t && !selected;
        return (
          <button key={t} type="button" role="tab" data-tab={t} id={glassTabId(t)} aria-controls={GLASS_PANEL_ID} className="gl-tab"
            aria-selected={selected} tabIndex={selected || (!on && i === 0) ? 0 : -1} onClick={() => onPick(t)}>
            <span className="gl-tab-word">{word(t)}</span>
            {attention && <><span className="tabdot" aria-hidden="true" /><span className="sr">, {S.homeTabWaiting}</span></>}
          </button>
        );
      })}
    </div>
  );
}

/** The black strip at the top: Flowflow small beside the notch, the greeting, and the corner's buttons (`end`). The
 *  greeting is one line; when it is cut, its whole words are its tooltip and what VoiceOver reads. */
export function GlassTop({ state, greeting, whole = greeting, end, children }: { state: CharacterState; greeting: string; whole?: string; end: ReactNode; children?: ReactNode }) {
  return (
    <div className="gl-top">
      <div className="gl-strip">
        {/* Flowflow's own art, as a still picture: the panel stays idle while nothing happens (no live drawing loop). */}
        <FlowMini className="gl-flow" state={state} still />
        {/* A long task name is cut in words (glass.ts clipWords); the whole greeting is the tooltip and what VoiceOver reads. */}
        <p className="gl-greet" title={whole}>{whole === greeting ? greeting : <><span aria-hidden="true">{greeting}</span><span className="sr">{whole}</span></>}</p>
        <div className="gl-end">{end}</div>
      </div>
      {children}
    </div>
  );
}
