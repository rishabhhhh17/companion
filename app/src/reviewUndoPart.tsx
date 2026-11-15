// M101: Put these files back, drawn on the review card (reviewCard.tsx) and under a review's row in History (card.tsx).
// What shows and when is decided in reviewUndo.ts (tested in reviewUndo.test.ts); this only draws it. The press asks the
// engine to look first, so the confirm step can name the files; nothing is put back before the person's yes. A git command
// is only ever shown, with Copy, for the person to run (rule 10, F13).
import { useState } from "react";
import { ConfirmStep } from "./confirm.tsx";
import { copyable } from "./copytext.ts";
import { Icon } from "./icons.tsx";
import { confirmLines, doneLines, nameList, whyLine, type ReviewUndo } from "./reviewUndo.ts";
import { undoLimitsLine } from "./savePoints.ts";
import { S } from "./strings.ts";
import { invoke } from "./tauri.ts";

/** The most file names the confirm step lists; the rest are counted. */
const LISTED = 8;

type Props = {
  u: ReviewUndo | null; project: string; batch: string; idBase: string;
  onAsk: () => void; onOverwrite: (on: boolean) => void; onYes: () => void; onCancel: () => void; onClose: () => void;
  /** History only: the button is already drawn on the row, so only the flow under it is drawn here. */
  flowOnly?: boolean;
};

function Files({ files, count, label }: { files: string[]; count: number; label: string }) {
  const more = Math.max(0, count - Math.min(files.length, LISTED));
  return <ul className="rvu-files" aria-label={label}>
    {files.slice(0, LISTED).map((f) => <li key={f}><code>{f}</code></li>)}
    {more > 0 && <li className="rvu-more">{S.history.reviewMore(more)}</li>}
  </ul>;
}

/** The fixed command, with its own Copy (the Mac side writes the clipboard; the page's own is the fallback). */
function CommitCommand() {
  const [said, setSaid] = useState<"" | "copied" | "failed">("");
  const copy = () => {
    const ok = copyable(S.reviewUndo.command);
    if (ok === null) { setSaid("failed"); return; }
    void invoke("copy_text", { text: ok }).catch(() => navigator.clipboard?.writeText(ok) ?? Promise.reject(new Error("no clipboard")))
      .then(() => { setSaid("copied"); setTimeout(() => setSaid(""), 4000); }).catch(() => setSaid("failed"));
  };
  return <div className="rvu-commit">
    <div>{S.reviewUndo.commitAfter}</div>
    <div className="row rvu-command"><code>{S.reviewUndo.command}</code><button className="btn quiet" type="button" onClick={copy}><Icon name="copy" size={14} />{S.reviewUndo.copy}</button></div>
    <div className="muted">{S.reviewUndo.commitNote}</div>
    <span className={said ? "line" : "sr"} role="status">{said === "copied" ? S.copied : said === "failed" ? S.copyFailed : ""}</span>
  </div>;
}

export function ReviewUndoPart({ u, project, batch, idBase, onAsk, onOverwrite, onYes, onCancel, onClose, flowOnly = false }: Props) {
  const mine = u && u.batch === batch && u.project === project ? u : null;
  const btnId = `${idBase}-btn`;
  // While its question is open the button steps aside (the audit, item 7), and comes back with the keyboard after.
  const button = !flowOnly && (!mine || mine.stage === "refused") && (
    <button id={btnId} className="btn quiet rvu-btn" type="button" title={S.reviewUndo.help} onClick={onAsk}><Icon name="undo" size={14} />{S.reviewUndo.button}</button>
  );
  if (!mine) return button ? <div className="row rvu">{button}</div> : null;
  const back = flowOnly ? `${idBase}-row` : btnId;
  return <div className="rvu" data-stage={mine.stage}>
    {mine.stage === "looking" && <div className="line review-busy" role="status">{S.reviewUndo.looking}</div>}
    {mine.stage === "confirm" && mine.plan && (() => {
      const l = confirmLines(mine.plan, mine.overwrite);
      return <ConfirmStep className="line rvu-confirm" label={l.sure} back={back} onCancel={onCancel}>
        <div className="rvu-sure">{l.sure}</div>
        {mine.plan.files.length > 0 && <Files files={mine.plan.files} count={mine.plan.count} label={S.reviewUndo.filesLabel} />}
        {l.later && <div className="rvu-later">
          <div>{l.later}</div>
          <Files files={mine.plan.later} count={mine.plan.later.length} label={l.later} />
          <label className="rvu-toggle"><input type="checkbox" checked={mine.overwrite} onChange={(e) => onOverwrite(e.target.checked)} />{S.reviewUndo.laterToo}</label>
          {l.laterOn && <div className="muted" role="status">{l.laterOn}</div>}
        </div>}
        {l.env && <div className="muted">{l.env}</div>}
        {l.cannot && <div className="muted">{l.cannot}</div>}
        {l.commit && <div className="muted">{l.commit}</div>}
        <div className="muted">{undoLimitsLine([])}</div>
        <div className="row">
          <button className="btn danger" type="button" disabled={!l.canYes} onClick={onYes}>{S.reviewUndo.yes}</button>
          <button className="btn" type="button" data-cancel onClick={onCancel}>{S.reviewUndo.no}</button>
        </div>
      </ConfirmStep>;
    })()}
    {mine.stage === "working" && <div className="line review-busy" role="status">{S.reviewUndo.working}</div>}
    {mine.stage === "done" && mine.done && <div className="rvu-done" role="status">
      {doneLines(mine.done).map((t, i) => <div key={t} className={i ? "muted" : "rvu-sure"}>{t}{i === 0 && mine.done!.reverted.length > 0 && <span className="rvu-names">{nameList(mine.done!.reverted)}</span>}</div>)}
      {mine.done.committed && <CommitCommand />}
      <div className="row"><button className="btn" type="button" onClick={onClose}>{S.reviewUndo.close}</button></div>
    </div>}
    {mine.stage === "refused" && <div className="rvu-refused">
      <div className="line" role="status">{whyLine(mine.why)}</div>
      <div className="row">{button}<button className="btn quiet" type="button" onClick={onClose}>{S.reviewUndo.close}</button></div>
    </div>}
  </div>;
}
