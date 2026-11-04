// M69 (the YC benchmark spec 3.11, corrected by F29): the setup list on Now (setupList.ts has the rules). One numbered
// list, done steps ticked, the open step with its one button; the practice is a one tap start whenever no project is open.
import { Icon } from "./icons.tsx";
import { S } from "./strings.ts";
import { setupNow, type SetupAct, type SetupRow } from "./setupList.ts";
import { Button } from "./ui/parts.tsx";
import type { Blocker } from "./homeHero.ts";

const LABEL: Record<Exclude<SetupAct, null>, string> = { retry: S.tryAgain, getParts: S.home.blocked.claude.main, pickFolder: S.screens.pickFolder, practice: S.screens.startPractice };

/** M69 step 3: the open "Getting ready" step says what is happening or what went wrong and what to do, never Try again alone. */
export function SetupList({ rows, blocker, onAct }: { rows: SetupRow[]; blocker: Blocker | null; onAct: (a: Exclude<SetupAct, null>) => void }) {
  const readyLine = blocker === "claudeGetting" ? S.screens.setupGetting : blocker === "key" ? S.screens.setupWhy.key : blocker === "claude" ? S.screens.setupWhy.claude : S.screens.setupSteps.ready.line;
  const now = setupNow(rows);
  const ready = rows[0]?.state === "done";
  return (
    <section className="setup" aria-labelledby="setup-title">
      <div className="setup-head">
        <h2 id="setup-title" className="setup-title">{S.screens.setupTitle}</h2>
        {now && <span className="setup-count">{S.screens.setupStep(now.n, now.of)}</span>}
      </div>
      <ol className="setup-list">
        {rows.map((r, i) => {
          const w = S.screens.setupSteps[r.id];
          // The practice can start as soon as this Mac is ready, even while no project is picked (spec 3.11).
          const act = r.state === "now" ? r.act : r.id === "practice" && ready && r.state !== "done" ? r.act : null;
          return (
            <li key={r.id} className="setup-row" data-state={r.state} aria-current={r.state === "now" ? "step" : undefined}>
              <span className="setup-mark" aria-hidden="true">{r.state === "done" ? <Icon name="tick" size={12} /> : i + 1}</span>
              <div className="setup-words">
                <span className="setup-name">{r.state === "done" ? w.done : w.title}</span>
                {r.state === "now" && <span className="setup-line">{r.id === "ready" ? readyLine : w.line}</span>}
              </div>
              {r.state === "done" && <span className="sr">{S.screens.setupDone}</span>}
              {act && <Button kind={r.state === "now" ? "primary" : "secondary"} size="sm" onClick={() => onAct(act)}>{LABEL[act]}</Button>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
