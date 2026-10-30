// The recent fixes in Home's side list (M42, the founder picked B, Supabase's dashboard: things to do, then recent work). The
// last few tasks in this folder, newest first, each with how it ended: a tick when its checks passed, a cross when they
// failed, a dot otherwise. A press opens What I did, where each one has its own Undo and its full receipt.
import { Icon } from "./icons.tsx";
import type { HistoryItem } from "./model.ts";
import { S } from "./strings.ts";

export const RECENT_MAX = 4;

/** The tasks to list: the newest first, at most RECENT_MAX, only ones with a name. */
export function recentOf(items: HistoryItem[]): HistoryItem[] {
  return [...items].filter((i) => i.label.trim()).sort((a, b) => (b.startedAt > a.startedAt ? 1 : b.startedAt < a.startedAt ? -1 : 0)).slice(0, RECENT_MAX);
}

export function RecentList({ items, onOpen }: { items: HistoryItem[]; onOpen: () => void }) {
  const list = recentOf(items);
  if (!list.length) return null;
  return (
    <div className="recent">
      <div className="side-head">{S.sideRecent}</div>
      {list.map((i) => (
        <button key={i.id} className="side-item" type="button" onClick={onOpen} data-proof={i.proof ?? undefined}>
          {i.proof === "passed" ? <Icon name="tick" size={14} /> : i.proof === "failed" ? <Icon name="cross" size={14} /> : <span className="side-dot" aria-hidden="true" />}
          <span className="side-label">{i.label.replace(/^Before:\s*/, "")}</span>
          <span className="sr">{i.proof === "passed" ? S.proven : i.proof === "failed" ? S.notDone : ""}</span>
        </button>
      ))}
    </div>
  );
}
