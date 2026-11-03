// M55 section 2, live progress: the live part of the work card (homeHero.ts jobLive decides what it shows). While it fixes,
// each file the agent's tools really changed appears as it changes, newest last, with the rest counted. While it checks,
// each check shows running, passed or failed as it goes. A row that arrives grows in once (style.css .job-live li), and a
// check's mark changes when its check ends: it never spins, so nothing here moves at rest. Each state is said in words for
// VoiceOver, never only by a mark or a colour.
import { S } from "./strings.ts";
import { Icon } from "./icons.tsx";
import { splitPath } from "./changesCard.tsx";
import type { JobLive as View, LiveCheck } from "./homeHero.ts";
import type { LiveFile } from "./model.ts";

/** The same marks as the changes card on the result (+ added, ● changed, − removed). */
const KIND_MARK: Record<LiveFile["kind"], string> = { added: "+", modified: "●", deleted: "−" };
const KIND_WORD: Record<LiveFile["kind"], string> = { added: S.added, modified: S.modified, deleted: S.deleted };
const STATUS_WORD: Record<LiveCheck["status"], string> = { running: S.stepRunning, passed: S.stepPassed, failed: S.stepFailed, skipped: S.stepSkipped };

function CheckMark({ status }: { status: LiveCheck["status"] }) {
  if (status === "passed") return <Icon name="tick" size={12} />;
  if (status === "failed") return <Icon name="cross" size={12} />;
  return null;   // running: a still dot; skipped: a short dash (both drawn by the stylesheet)
}

export function JobLive({ view }: { view: View }) {
  if (view.kind === "files") return (
    <ul className="job-live job-files" aria-label={S.home.filesSoFar}>
      {view.files.map((f) => {
        const { dir, name } = splitPath(f.file);
        return (
          <li key={f.file} data-kind={f.kind}>
            <span className="job-mark" aria-hidden="true">{KIND_MARK[f.kind]}</span>
            <span className="job-file"><span className="sr">{KIND_WORD[f.kind]}: </span><b>{name}</b>{dir && <span className="job-dir">{dir}</span>}</span>
          </li>
        );
      })}
      {view.more > 0 && <li className="job-more" key="more">{S.home.moreFiles(view.more)}</li>}
    </ul>
  );
  if (view.kind === "checks") return (
    <ul className="job-live job-checks" aria-label={S.home.checksSoFar}>
      {view.checks.map((c) => (
        <li key={c.rung} data-status={c.status}>
          <span className="job-mark" aria-hidden="true"><CheckMark status={c.status} /></span>
          <span className="job-check">{c.label}<span className="sr">: {STATUS_WORD[c.status]}</span></span>
        </li>
      ))}
    </ul>
  );
  return null;
}
