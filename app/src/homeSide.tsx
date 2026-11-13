// The wide Home's list on the left (look.layout wide; M51 step 2, after HeyClicky's window, which the founder liked): the
// places with their small drawings (Now, Learn, History, Memory), then the recent work, each with how it ended, and Settings
// at the foot. Each place keeps the id the top row's button had, so focus.ts finds it the same way; Now has none, as before,
// so the keyboard goes back to the ask box on Now (card.tsx placeEl), not to the list. Settings, once open, has
// its own list of sections in this place instead (card.tsx draws this only when homeLayout.ts sideOn says so).
// M51 step 3: each recent task has its tile (itemMarks.tsx), and a badge when it is working, new, proven or needs you;
// without a badge (or with badges off in Settings) the mark of how it ended shows at the row's end instead. M51 polish (next
// to HeyClicky): one line per task, its name cut with an ellipsis (the whole name is in its tooltip and what VoiceOver
// reads, and History shows it in full), the badge or mark on the right, so the list holds about ten tasks, not three.
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { historyFacts, type HistoryItem } from "./model.ts";
import { reducedMotion } from "./motion.ts";
import { S } from "./strings.ts";
import { verdictOf } from "./verdict.ts";
import { tabId, type Tab } from "./home.ts";
import type { SidePlace } from "./homeLayout.ts";
import { Icon } from "./icons.tsx";
import { Dot, SidebarItem, Tile } from "./ui/parts.tsx";
import { historyStamp, sideStamp, taskName } from "./itemLook.ts";
import { Stamp } from "./itemMarks.tsx";
import { verdictMark } from "./ui/partsLogic.ts";
import type { Go, ToolsRow } from "./notchPeek.ts";
import { reviewStamp, type ReviewCard } from "./review.ts";
import { MEANING_COLOUR, PLACE_COLOUR, PLACE_ICON, VERDICT_MEANING } from "./meaning.ts";
import type { VerdictKind } from "./verdict.ts";

type Props = {
  places: SidePlace[]; tab: Tab; waits: Tab | null; recent: HistoryItem[]; now: number;
  onPick: (t: Tab) => void; onSettings: () => void; onOpen: (item: HistoryItem) => void;
  /** M52: the review card when Home shows it (review.ts reviewShown), first in the recent work; its press opens Now there. */
  review?: ReviewCard | null; onReview?: () => void;
  /** M69 step 2: how many things wait on a place (the review card's findings on Now), drawn as a small count. */
  counts?: Partial<Record<SidePlace, number>>;
  /** M84 (HeyClicky's pattern, never its look): a slim list of the person's AI tools, each with what it is doing now (waiting
   *  on you, connected and watching, half connected), or one Connect row. A press opens Now or Your AI tools in Settings. */
  tools?: ToolsRow | null; onTool?: (g: Go) => void;
};

// M71: each place has its own colour tile (meaning.ts PLACE_COLOUR), so the gems of the old rooms are gone.

/** M73 (fluid, item 5): one highlight behind the places, on the place you are on, moved by transform (ui/parts.css
 *  .side-glide). It is placed from the open place's own row, so it follows a change of text size too. Its first place is
 *  set without motion. */
function useGlide(tab: Tab, places: readonly SidePlace[]) {
  const list = useRef<HTMLUListElement>(null);
  const [g, setG] = useState<{ y: number; h: number; still: boolean } | null>(null);
  const placed = useRef(false);
  useLayoutEffect(() => {
    const row = list.current?.querySelector<HTMLElement>('[aria-current="page"]')?.closest("li");
    if (!row || !(places as readonly string[]).includes(tab)) { setG(null); return; }
    const still = !placed.current || reducedMotion();
    placed.current = true;
    setG({ y: row.offsetTop, h: row.offsetHeight, still });
    // With Reduce motion or Less motion it stays still: it is simply on the new place.
    if (still && !reducedMotion()) { const id = requestAnimationFrame(() => setG((x) => x && { ...x, still: false })); return () => cancelAnimationFrame(id); }
  }, [tab, places.join(",")]);
  return { list, g };
}

export function HomeSide({ places, tab, waits, recent, now, onPick, onSettings, onOpen, review, onReview, counts, tools, onTool }: Props) {
  const { list, g } = useGlide(tab, places);
  const on = (places as readonly string[]).includes(tab) ? (tab as SidePlace) : null;
  return (
    <nav className="side" aria-label={S.look.placesLabel}>
      <ul className="side-list" ref={list} data-glide="">
        {g && on && <li className="side-glide" role="presentation" aria-hidden="true" data-c={PLACE_COLOUR[on]} data-still={g.still || undefined} style={{ "--glide-y": `${g.y}px`, "--glide-h": `${g.h}px` } as CSSProperties} />}
        {places.map((t) => (
          <li key={t}><SidebarItem id={t === "now" ? undefined : tabId(t)} icon={PLACE_ICON[t]} colour={PLACE_COLOUR[t]} label={S.homeTabs[t]} selected={t === tab} attention={waits === t && t !== tab} count={counts?.[t]} onClick={() => onPick(t)} /></li>
        ))}
      </ul>
      {/* M84: the AI tools, each with what it is doing now (notchPeek.ts sideTools). Nothing while the engine has not said. */}
      {tools && (tools.kind === "tools" || tools.kind === "connect") && (
        <section className="side-tools" aria-labelledby="side-tools-title">
          <h2 id="side-tools-title" className="side-title">{S.m84.sideTitle}</h2>
          <ul className="side-list">
            {tools.kind === "tools" ? tools.tools.map((t) => (
              <li key={t.tool}>
                <button type="button" className="sb-item side-work side-tool" data-state={t.state} title={`${t.name}: ${t.words}`} aria-label={S.m84.toolSay(t.name, t.words)} onClick={() => onTool?.(t.go)}>
                  <span className="ui-mtile side-tool-mark" data-c={t.state === "waiting" ? "orange" : "grey"} data-size="place" aria-hidden="true">{t.mark}</span>
                  <span className="side-tool-text" aria-hidden="true"><span className="side-name">{t.name}</span><span className="side-tool-state"><Dot colour={t.colour} />{t.words}</span></span>
                </button>
              </li>
            )) : (
              <li key="connect">
                <button type="button" className="sb-item side-work side-tool" data-state="connect" onClick={() => onTool?.(tools.go)}>
                  <Tile colour="blue" icon="plug" size="place" />
                  <span className="side-name">{S.m84.connect}</span>
                </button>
              </li>
            )}
          </ul>
        </section>
      )}
      {/* Changes waiting for a review sit under their own heading, above the recent work (the audit, item 11). */}
      {review && (
        <section className="side-waiting" aria-labelledby="side-waiting-title">
          <h2 id="side-waiting-title" className="side-title">{S.look.sideWaiting}</h2>
          <ul className="side-list">
            <li key="review">
              <button type="button" className="sb-item side-work side-review" title={`${S.review.sideItem}. ${S.look.stamp[reviewStamp(review)]}`} aria-label={S.review.sideLabel(S.look.stamp[reviewStamp(review)])} onClick={() => onReview?.()}>
                <Tile colour={MEANING_COLOUR.review} icon="eye" size="place" />
                {/* M71: the tile already says take a look (orange), and the label says the rest: no second mark at the end. */}
                <span className="side-name" aria-hidden="true">{S.review.sideItem}</span>
              </button>
            </li>
          </ul>
        </section>
      )}
      {recent.length > 0 && (
        <section className="side-recent" aria-labelledby="side-recent-title">
          <h2 id="side-recent-title" className="side-title">{S.look.sideRecent}</h2>
          <ul className="side-list">
            {recent.map((i) => {
              const name = taskName(i.label);
              // A task still running has not reached a verdict: the dot and its own words, never one it has not earned.
              const v = i.status === "running" ? { headline: S.historyRunning, icon: "wait" as const, tone: "plain" as const } : verdictOf(historyFacts(i));
              const { tone } = verdictMark(v);
              const mark = i.status === "running" ? "spin" : verdictMark(v).mark;
              const stamp = sideStamp(historyStamp(i, now));
              return (
                <li key={i.id}>
                  <button type="button" className="sb-item side-work" data-tone={tone} title={stamp ? `${name}. ${S.look.stamp[stamp]}` : name} aria-label={`${S.ui.openReceipt(name)}. ${v.headline}`} onClick={() => onOpen(i)}>
                    {/* M71: the tile says how it ended, in its meaning's colour (green proven, red failed, grey stopped, orange undone). */}
                    <Tile colour={MEANING_COLOUR[i.status === "running" ? "working" : VERDICT_MEANING[(v as { kind: VerdictKind }).kind]]} icon={mark} size="place" />
                    <span className="side-name" aria-hidden="true">{name}</span>
                    {stamp && <Stamp kind={stamp} dot />}
                    <span className={`side-mark${stamp ? " unstamped" : ""}`} aria-hidden="true"><Icon name={mark} size={12} /></span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <div className="side-foot">
        <SidebarItem id={tabId("settings")} icon="gear" colour="grey" label={S.homeTabs.settings} selected={false} attention={waits === "settings"} onClick={onSettings} />
      </div>
    </nav>
  );
}
