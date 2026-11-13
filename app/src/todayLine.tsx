// M84: Now's calm timeline of today (notchPeek.ts todayLine): what was reviewed, caught, fixed and undone in this project
// today, newest first, each with its clock time and its meaning's tile. When nothing happened yet, it says what will appear
// here, with one action. It replaces the empty room under Now's list; it never runs anything itself.
import { S } from "./strings.ts";
import type { TodayEntry } from "./notchPeek.ts";
import { EmptyRow, ListGroup, Tile } from "./ui/parts.tsx";

export function TodayLine({ entries, act }: { entries: TodayEntry[]; act: { label: string; onClick: () => void } | null }) {
  return (
    <section className="today" aria-label={S.m84.todayLabel}>
      <h3 className="today-title">{S.m84.today}</h3>
      {entries.length === 0
        ? <ListGroup label={S.m84.todayLabel}><EmptyRow icon="now" title={S.m84.todayEmpty} line={S.m84.todayEmptyLine} action={act} /></ListGroup>
        : <ol className="today-list">
          {entries.map((e) => (
            <li key={e.key} className="today-row" data-kind={e.kind}>
              <time className="today-time">{e.when}</time>
              <span className="today-mark" aria-hidden="true"><Tile colour={e.colour} icon={e.icon} size="btn" /></span>
              <span className="today-words">{e.words}</span>
            </li>
          ))}
        </ol>}
    </section>
  );
}
