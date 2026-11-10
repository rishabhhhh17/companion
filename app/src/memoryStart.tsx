// M78 (memory that is never lost): the Memory page's start block part ("What Claude Code is told at the start") and the
// two rows that export and restore every note. The words and the choices are in memoryStart.ts (tested); this draws them
// with the M71 parts. Forget is the same short Undo as the lists below it; a house rule is changed where it lives, in
// Settings. Export and restore go through the shell's own save and open dialogs, each on a press, and a restore asks first.
import { useEffect, useRef, useState } from "react";
import { S } from "./strings.ts";
import { invoke, listen } from "./tauri.ts";
import { forgetLine } from "./commands.ts";
import { memoryDate } from "./memorySettings.ts";
import { ConfirmStep } from "./confirm.tsx";
import { Button, ListGroup, ListRow, Row, Toast } from "./ui/parts.tsx";
import type { Colour } from "./meaning.ts";
import { exportCount, exportName, restoredFrom, restoredWords, START_SETTINGS, startView, type StartKind, type StartLine, type StartState } from "./memoryStart.ts";

const FORGET_MS = 6000;
const COLOUR: Record<StartKind, Colour> = { rule: "orange", decision: "blue", failed: "red", note: "pink", code: "grey" };
type Send = (cmd: unknown) => unknown;

export function StartBlockPart({ start, project, send, onSettings }: { start: StartState | null; project: string; send: Send; onSettings: (place: string) => void }) {
  const v = startView(start);
  const [pending, setPending] = useState<StartLine | null>(null);
  const waiting = useRef<StartLine | null>(null); waiting.current = pending;
  const commit = () => { const p = waiting.current; if (p?.id) void send(forgetLine(project, "project", p.id)); setPending(null); };
  const soon = (l: StartLine) => { if (waiting.current?.id) void send(forgetLine(project, "project", waiting.current.id)); setPending(l); };
  useEffect(() => () => { if (waiting.current?.id) void send(forgetLine(project, "project", waiting.current.id)); }, []);
  const rows = v.rows.filter((r) => !(pending && r.id && r.id === pending.id));
  return (
    <div className="mem-section mem-start" role="group" aria-label={S.m78.startTitle}>
      <ListGroup label={S.m78.startTitle} shown>
        {rows.map((r, i) => (
          <ListRow key={r.id ?? `rule-${i}`} colour={COLOUR[r.kind]} icon={r.kind === "rule" ? "shield" : r.kind === "failed" ? "cross" : "memory"} title={r.text}
            line={`${S.memoryFrom} ${r.source}${r.date ? `, ${memoryDate(r.date)}` : ""}`}
            action={r.action === "forget"
              ? { label: S.memoryForget, colour: "grey", ariaLabel: `${S.memoryForget}: ${r.text}`, onClick: () => soon(r) }
              : { label: S.m78.startRule, colour: "grey", ariaLabel: S.m78.startRuleLabel(r.text), onClick: () => onSettings(START_SETTINGS.rules) }} />
        ))}
      </ListGroup>
      {pending && <Toast text={S.memoryForgotten(pending.text)} action={S.memoryUndo} onAction={() => setPending(null)} onDone={commit} ms={FORGET_MS} />}
      <p className="page-caption">{rows.length ? v.line : S.m78.startEmpty}</p>
      {rows.length > 0 && v.search && <p className="page-caption">{S.m78.startSearch}</p>}
      {v.setUp && <div className="row"><Button size="sm" onClick={() => onSettings(START_SETTINGS.hook)}>{S.m78.startSetUp}</Button></div>}
      {start?.text && <details className="mem-start-raw"><summary>{S.m78.startAsSeen}</summary><pre tabIndex={0} aria-label={S.m78.startAsSeen}>{start.text}</pre></details>}
    </div>
  );
}

/** Export notes and Restore from a file, as rows of the Memory page's settings group. */
export function NotesBackupRows({ project, projectName, send, exportCommand, restoreCommand }: { project: string; projectName: string; send: Send; exportCommand: () => unknown; restoreCommand: (text: string) => unknown }) {
  const [said, setSaid] = useState("");
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<{ text: string; n: number } | null>(null);
  const wantSave = useRef(false);
  useEffect(() => {
    setSaid(""); setAsking(null); wantSave.current = false;
    const off = listen("runner-event", (e) => {
      const ev = e.payload as { type?: string; project?: string; text?: unknown };
      if (ev?.type === "memory.exported" && ev.project === project && wantSave.current && typeof ev.text === "string") {
        wantSave.current = false;
        void invoke("save_notes", { name: exportName(projectName, new Date()), text: ev.text })
          .then((n) => setSaid(n ? S.m78.exported(String(n)) : "")).catch(() => setSaid(S.m78.saveFailed)).finally(() => setBusy(false));
      }
      const r = restoredFrom(ev, project);
      if (r) { setSaid(restoredWords(r)); setBusy(false); }
    });
    return () => { off.then((f) => f()); };
  }, [project]);
  const exportNow = () => { setSaid(""); setBusy(true); wantSave.current = true; void Promise.resolve(send(exportCommand())).catch(() => { wantSave.current = false; setBusy(false); setSaid(S.m78.saveFailed); }); };
  const choose = () => {
    setSaid(""); setAsking(null);
    void invoke("open_notes_file").then((t) => {
      const text = typeof t === "string" ? t : "";
      if (!text) return;   // cancelled: nothing read
      const n = exportCount(text);
      if (n === null) setSaid(S.m78.readFailed); else if (n === 0) setSaid(S.m78.restoreNone); else setAsking({ text, n });
    }).catch(() => setSaid(S.m78.readFailed));
  };
  const restoreId = "mem-restore";
  return (<>
    <Row label={S.m78.exportLabel} description={`${S.m78.exportHelp} ${S.m78.neverLost}`} control={<Button size="sm" disabled={busy} onClick={exportNow}>{busy ? S.m78.exportSaving : S.m78.exportButton}</Button>} />
    <Row label={S.m78.restoreLabel} description={S.m78.restoreHelp} control={<Button size="sm" id={restoreId} disabled={busy} onClick={choose}>{S.m78.restoreButton}</Button>} />
    {asking && (
      <ConfirmStep className="row mem-ask" label={S.m78.restoreAsk(asking.n)} back={restoreId} onCancel={() => setAsking(null)}>
        <span className="line">{S.m78.restoreAsk(asking.n)}</span>
        <div className="row">
          <Button kind="primary" onClick={() => { const t = asking.text; setAsking(null); setBusy(true); void send(restoreCommand(t)); }}>{S.m78.restoreYes}</Button>
          <Button cancel onClick={() => setAsking(null)}>{S.m78.restoreNo}</Button>
        </div>
      </ConfirmStep>
    )}
    {said && <p className="page-caption" role="status">{said}</p>}
  </>);
}
