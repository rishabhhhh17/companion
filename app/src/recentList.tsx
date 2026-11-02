// The recent fixes on Home (F28, the overhaul spec 4.1): a Group with no header holding up to four Recent rows, the newest
// first. Each row is how that task ended, as the verdict says it (M45: a tick only for a proven fix, a cross when a check
// failed or it went wrong, the undo mark once undone, the stop mark when it stopped, the dot otherwise), its name, how long
// ago, and what it cost. A press opens that task's own receipt (the one on Now, or its row in History).
import { historyFacts, costWords, type HistoryItem } from "./model.ts";
import { S } from "./strings.ts";
import { verdictOf, type Verdict, type VerdictIcon, type VerdictKind } from "./verdict.ts";
import { Group, RecentRow } from "./ui/parts.tsx";
import { agoWords, recentOf, RECENT_MAX } from "./homeHero.ts";

export { recentOf, RECENT_MAX };

/** How a recent task ended: its mark and its words (for VoiceOver), from the verdict. A task still running is not a result. */
export function recentMark(i: Pick<HistoryItem, "status" | "proof" | "changed" | "undone"> & Partial<Pick<HistoryItem, "back">>): { icon: VerdictIcon; words: string; kind: VerdictKind | "running" } {
  if (i.status === "running") return { icon: "wait", words: S.historyRunning, kind: "running" };
  const v = verdictOf(historyFacts(i));
  return { icon: v.icon, words: v.headline, kind: v.kind };
}

/** A running task, drawn with the dot and its own words, never a verdict it has not reached. */
const runningVerdict = (): Verdict => ({ kind: "noChange", headline: S.historyRunning, line: null, say: S.historyRunning, tone: "plain", icon: "wait", offer: null, proven: false });

export function RecentList({ items, now, onOpen }: { items: HistoryItem[]; now: number; onOpen: (item: HistoryItem) => void }) {
  const list = recentOf(items);
  if (!list.length) return null;
  return (
    <Group id="home-recent">
      <h2 className="sr">{S.home.recentTitle}</h2>
      {list.map((i) => (
        <RecentRow key={i.id} verdict={i.status === "running" ? runningVerdict() : verdictOf(historyFacts(i))} name={i.label.replace(/^Before:\s*/, "")}
          meta={agoWords(i.endedAt ?? i.startedAt, now)} cost={costWords(i.usd)} onOpen={() => onOpen(i)} running={i.status === "running"} />
      ))}
    </Group>
  );
}
