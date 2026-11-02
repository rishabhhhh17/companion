// The wide Home's list on the left (look.layout wide; M51 step 2, after HeyClicky's window, which the founder liked): the
// places with their small drawings (Now, Learn, History, Memory), then the recent work, each with how it ended, and Settings
// at the foot. Each place keeps the id the top row's button had, so focus.ts finds it the same way; Now has none, as before,
// so the keyboard goes back to the ask box on Now (card.tsx placeEl), not to the list. Settings, once open, has
// its own list of sections in this place instead (card.tsx draws this only when homeLayout.ts sideOn says so).
// M51 step 3: each recent task has its tile (itemMarks.tsx), and a badge when it is working, new, proven or needs you;
// without a badge (or with badges off in Settings) the mark of how it ended shows at the row's end instead. M51 polish (next
// to HeyClicky): one line per task, its name cut with an ellipsis (the whole name is in its tooltip and what VoiceOver
// reads, and History shows it in full), the badge or mark on the right, so the list holds about ten tasks, not three.
import { historyFacts, type HistoryItem } from "./model.ts";
import { S } from "./strings.ts";
import { verdictOf } from "./verdict.ts";
import { tabId, type Tab } from "./home.ts";
import type { SidePlace } from "./homeLayout.ts";
import { Icon } from "./icons.tsx";
import { SidebarItem } from "./ui/parts.tsx";
import { historyStamp, sideStamp, taskName } from "./itemLook.ts";
import { ItemTile, Stamp } from "./itemMarks.tsx";
import { verdictMark } from "./ui/partsLogic.ts";
import type { ElementId } from "./element.ts";
import { reviewStamp, type ReviewCard } from "./review.ts";

type Props = {
  places: SidePlace[]; tab: Tab; waits: Tab | null; recent: HistoryItem[]; now: number;
  onPick: (t: Tab) => void; onSettings: () => void; onOpen: (item: HistoryItem) => void;
  /** M52: the review card when Home shows it (review.ts reviewShown), first in the recent work; its press opens Now there. */
  review?: ReviewCard | null; onReview?: () => void;
};

/** A place that is a group's own room shows that group's gem in place of a drawing (the brand language). */
const PLACE_GEM: Partial<Record<SidePlace, ElementId>> = { now: "flow", learn: "guide" };

export function HomeSide({ places, tab, waits, recent, now, onPick, onSettings, onOpen, review, onReview }: Props) {
  return (
    <nav className="side" aria-label={S.look.placesLabel}>
      <ul className="side-list">
        {places.map((t) => (
          <li key={t} data-gem={PLACE_GEM[t] ? "" : undefined} data-element={PLACE_GEM[t]}><SidebarItem id={t === "now" ? undefined : tabId(t)} icon={t} label={S.homeTabs[t]} selected={t === tab} attention={waits === t && t !== tab} onClick={() => onPick(t)} /></li>
        ))}
      </ul>
      {(recent.length > 0 || !!review) && (
        <section className="side-recent" aria-labelledby="side-recent-title">
          <h2 id="side-recent-title" className="side-title">{S.look.sideRecent}</h2>
          <ul className="side-list">
            {review && (
              <li key="review">
                <button type="button" className="sb-item side-work side-review" title={`${S.review.sideItem}. ${S.look.stamp[reviewStamp(review)]}`} aria-label={S.review.sideLabel(S.look.stamp[reviewStamp(review)])} onClick={() => onReview?.()}>
                  <span className="tile" data-tint="sky" aria-hidden="true"><Icon name="find" size={12} /></span>
                  <span className="side-name" aria-hidden="true">{S.review.sideItem}</span>
                  <Stamp kind={reviewStamp(review)} dot />
                </button>
              </li>
            )}
            {recent.map((i) => {
              const name = taskName(i.label);
              // A task still running has not reached a verdict: the dot and its own words, never one it has not earned.
              const v = i.status === "running" ? { headline: S.historyRunning, icon: "wait" as const, tone: "plain" as const } : verdictOf(historyFacts(i));
              const { mark, tone } = verdictMark(v);
              const stamp = sideStamp(historyStamp(i, now));
              return (
                <li key={i.id}>
                  <button type="button" className="sb-item side-work" data-tone={tone} title={stamp ? `${name}. ${S.look.stamp[stamp]}` : name} aria-label={`${S.ui.openReceipt(name)}. ${v.headline}`} onClick={() => onOpen(i)}>
                    <ItemTile label={name} />
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
        <SidebarItem id={tabId("settings")} icon="settings" label={S.homeTabs.settings} selected={false} attention={waits === "settings"} onClick={onSettings} />
      </div>
    </nav>
  );
}
