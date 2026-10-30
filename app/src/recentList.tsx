// The recent fixes in Home's side list (M42, the founder picked B, Supabase's dashboard: things to do, then recent work). The
// last few tasks in this folder, newest first, each with how it ended, as the verdict says it (M45): a tick only for a
// proven fix, a cross when a check failed or it went wrong, the undo mark once undone, the stop mark when it stopped, a dot
// otherwise. A press opens What I did, where each one has its own Undo and its full receipt.
import { Icon } from "./icons.tsx";
import { historyFacts, type HistoryItem } from "./model.ts";
import { S } from "./strings.ts";
import { verdictOf, type VerdictIcon, type VerdictKind } from "./verdict.ts";

export const RECENT_MAX = 4;

/** The tasks to list: the newest first, at most RECENT_MAX, only ones with a name. */
export function recentOf(items: HistoryItem[]): HistoryItem[] {
  return [...items].filter((i) => i.label.trim()).sort((a, b) => (b.startedAt > a.startedAt ? 1 : b.startedAt < a.startedAt ? -1 : 0)).slice(0, RECENT_MAX);
}

/** How a recent task ended: its mark and its words (for VoiceOver), from the verdict. A task still running is not a result. */
export function recentMark(i: Pick<HistoryItem, "status" | "proof" | "changed" | "undone"> & Partial<Pick<HistoryItem, "back">>): { icon: VerdictIcon; words: string; kind: VerdictKind | "running" } {
  if (i.status === "running") return { icon: "wait", words: S.historyRunning, kind: "running" };
  const v = verdictOf(historyFacts(i));
  return { icon: v.icon, words: v.headline, kind: v.kind };
}

export function RecentList({ items, onOpen }: { items: HistoryItem[]; onOpen: () => void }) {
  const list = recentOf(items);
  if (!list.length) return null;
  return (
    <div className="recent">
      <div className="side-head">{S.sideRecent}</div>
      {list.map((i) => { const mark = recentMark(i); return (
        <button key={i.id} className="side-item" type="button" onClick={onOpen} data-proof={mark.kind}>
          {mark.icon === "wait" ? <span className="side-dot" aria-hidden="true" /> : <Icon name={mark.icon} size={14} />}
          <span className="side-label">{i.label.replace(/^Before:\s*/, "")}</span>
          <span className="sr">{mark.words}</span>
        </button>
      ); })}
    </div>
  );
}
