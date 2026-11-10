// M76: the pages' parts for features batch two. Share report (the go live report, saved where the person picks), and Walk
// me through it (a plain words tour of a change). Each only draws what goLiveReport.ts and tour.ts decided, and sends a press.
import { useEffect, useRef, useState } from "react";
import { buildReport, readPalette, reportFileName, reportHtml, reportPdf, type ReportInput } from "./goLiveReport.ts";
import { Icon } from "./icons.tsx";
import { changeSetting, useSetting } from "./settingsStore.ts";
import { S } from "./strings.ts";
import { invoke, proCommands } from "./tauri.ts";
import { tourMove, type Tour, type TourStep } from "./tour.ts";
import { Field, Switch } from "./ui/parts.tsx";
import { planProblem, reportOffer, reportStatusFrom, tidyKey, type ReportStatus } from "./plan.ts";

const css = (name: string) => (typeof document === "undefined" ? "" : getComputedStyle(document.documentElement).getPropertyValue(name));
const b64 = (bytes: Uint8Array) => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const utf8b64 = (text: string) => b64(new TextEncoder().encode(text));

/** Share report: a button, then a small panel with the answer as the report will say it, the two saves and the code lines
 *  switch. Saving opens the Mac's own save dialog (main.rs save_report); nothing is sent anywhere. */
export function ShareReport({ input, id = "share-report" }: { input: Omit<ReportInput, "when" | "codeLines">; id?: string }) {
  const [open, setOpen] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const codeLines = useSetting("report.codeLines") === true;
  const doc = open ? buildReport({ ...input, when: new Date(), codeLines }) : null;
  // M79: the one time report. Asked once as the panel opens; with payments off (today) nothing is offered and the saves
  // stay exactly as they were. The answer above is never sold, only saving the file to share.
  const [paid, setPaid] = useState<ReportStatus>({ paymentsOn: false, needed: false, checkout: false });
  const [key, setKey] = useState("");
  useEffect(() => { if (open) void proCommands.reportStatus().then((v) => setPaid(reportStatusFrom(v)), () => setPaid(reportStatusFrom(null))); }, [open]);
  const offer = reportOffer(paid);
  const turnOnKey = () => {
    const k = tidyKey(key);
    setKey("");   // emptied at once; nothing on the page keeps a copy
    if (!k || busy) return;
    setBusy(true); setSaid(null);
    void proCommands.reportActivate(k).then((v) => { setPaid(reportStatusFrom(v)); setSaid(S.m79.reportOn); }, (e) => setSaid(planProblem(e))).finally(() => setBusy(false));
  };
  const save = (kind: "html" | "pdf") => {
    if (!doc || busy) return;
    const palette = readPalette(css);
    const data = kind === "html" ? utf8b64(reportHtml(doc, palette)) : b64(reportPdf(doc, palette));
    setBusy(true); setSaid(null);
    void invoke("save_report", { kind, name: reportFileName(doc, kind), data })
      .then((name) => setSaid(typeof name === "string" && name ? S.goLive.saved(name) : S.goLive.notSaved), (e) => setSaid(String(e ?? "") ? S.goLive.failed(String(e)) : S.goLive.notSaved))
      .finally(() => setBusy(false));
  };
  if (!open) return <button id={id} className="btn" type="button" title={S.goLive.shareHelp} onClick={() => { setOpen(true); setSaid(null); }}><Icon name="pdf" size={14} />{S.goLive.share}</button>;
  return (
    <div className="golive" role="group" aria-labelledby={`${id}-title`}>
      <div className="golive-head"><b id={`${id}-title`}>{S.goLive.panelTitle}</b><span className="muted">{S.goLive.panelLine}</span></div>
      <div className="golive-answer" data-answer={doc!.answer}><b>{doc!.answerWords}</b><span>{doc!.answerLine}</span></div>
      {offer.show ? (<>
        <p className="line">{offer.line}</p>
        <div className="row">
          <button className="btn" type="button" disabled={busy || !offer.ready} onClick={() => { void proCommands.openCheckout("report").catch((e) => setSaid(planProblem(e))); }}>{offer.buy}</button>
          <button className="btn" type="button" onClick={() => setOpen(false)}>{S.goLive.close}</button>
        </div>
        <p className="line muted">{S.m79.reportHaveKey}</p>
        <div className="row">
          <Field type="password" value={key} label={S.m79.reportKeyLabel} disabled={busy} wide onChange={setKey} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) turnOnKey(); }} />
          <button className="btn" type="button" disabled={busy || !key} onClick={turnOnKey}>{S.m79.reportTurnOn}</button>
        </div>
      </>) : (
      <div className="row">
        <button className="btn" type="button" disabled={busy} onClick={() => save("html")}>{S.goLive.saveHtml}</button>
        <button className="btn" type="button" disabled={busy} onClick={() => save("pdf")}>{S.goLive.savePdf}</button>
        <button className="btn" type="button" onClick={() => setOpen(false)}>{S.goLive.close}</button>
      </div>)}
      <label className="golive-switch"><Switch checked={codeLines} label={S.goLive.codeLines} onChange={(on) => { void changeSetting("report.codeLines", on); }} /><span>{S.goLive.codeLines}</span></label>
      <span className={said || busy ? "line muted" : "sr"} role="status">{busy ? S.goLive.saving : said ?? ""}</span>
    </div>
  );
}

/** Walk me through it: one place at a time, Back and Next, then the summary. Open in my editor uses the existing open in
 *  editor path (main.rs open_in_editor); Circle it is Point at the problem's own ring, offered when the line is known. */
export function WalkThrough({ tour, project, onCircle, id = "walk" }: { tour: Tour | null; project: string; onCircle?: (s: TourStep) => void; id?: string }) {
  const [at, setAt] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const live = useRef<HTMLDivElement>(null);
  useEffect(() => { setAt(null); }, [tour?.steps.length, tour?.from]);
  if (!tour || !tour.steps.length || !project) return null;
  if (at === null) return <button id={id} className="btn" type="button" title={S.tour.help} onClick={() => { setAt(0); setNote(null); }}><Icon name="explain" size={14} />{S.tour.button}</button>;
  const step = tour.steps[at];
  const open = (s: TourStep) => { setNote(S.tour.opening); void invoke("open_in_editor", { project, file: s.file, line: s.line ?? 1 }).then((w) => setNote(typeof w === "string" && w ? w : null), (e) => setNote(String(e ?? ""))); };
  const move = (by: 1 | -1) => { setAt(tourMove(tour, at, by)); setNote(null); };
  return (
    <div className="tour" role="group" aria-labelledby={`${id}-title`} ref={live}>
      <div className="tour-head"><b id={`${id}-title`}>{S.tour.title}</b>{step && <span className="muted">{S.tour.step(at + 1, tour.steps.length)}</span>}</div>
      {step ? (
        <div className="tour-step" key={at} aria-live="polite">
          <div className="tour-place"><span className="mono">{step.file}{step.line ? `:${step.line}` : ""}</span></div>
          {step.lineText && <pre className="tour-code mono">{step.lineText}</pre>}
          <p className="tour-what">{step.what}</p>
          <p className="tour-why muted">{step.why}</p>
          <div className="row">
            <button className="btn" type="button" onClick={() => open(step)}>{S.tour.open}</button>
            {step.line && step.lineText && onCircle && <button className="btn" type="button" onClick={() => onCircle(step)}>{S.tour.circle}</button>}
          </div>
        </div>
      ) : (
        <div className="tour-step" key="end" aria-live="polite">
          <b className="tour-what">{S.tour.summaryTitle}</b>
          <p className="tour-why">{tour.summary}</p>
          {tour.more > 0 && <p className="tour-why muted">{S.tour.more(tour.more)}</p>}
        </div>
      )}
      {note && <div className="line muted" role="status">{note}</div>}
      <div className="row tour-nav">
        <button className="btn" type="button" disabled={at === 0} onClick={() => move(-1)}>{S.tour.back}</button>
        {step ? <button className="btn primary" type="button" onClick={() => move(1)}>{S.tour.next}</button>
          : <button className="btn primary" type="button" onClick={() => setAt(null)}>{S.tour.done}</button>}
        {step && <button className="btn" type="button" onClick={() => setAt(null)}>{S.tour.close}</button>}
      </div>
    </div>
  );
}
