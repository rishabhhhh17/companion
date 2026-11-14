// M88: the pages' parts for Your numbers (a row and page in History) and Share what my AI did (a preview, then Save). Each
// only draws what yourNumbers.ts and shareReceipt.ts decided, and sends a press. Nothing is asked for before a press;
// nothing leaves the Mac by itself (the mail draft and the saved file are the person's own taps).
import { useEffect, useMemo, useRef, useState } from "react";
import type { WeekView } from "../../protocol/index.ts";
import { showDoneSignal } from "./commands.ts";
import { doneStateFrom } from "./doneSignal.ts";
import { readPalette } from "./goLiveReport.ts";
import { useSetting } from "./settingsStore.ts";
import { receiptFileName, receiptHtml, type ShareDoc } from "./shareReceipt.ts";
import { S } from "./strings.ts";
import { invoke, listen } from "./tauri.ts";
import { Button, ListGroup, ListRow } from "./ui/parts.tsx";
import { weekAsk, weekFrom, weekPage } from "./weekSummary.ts";
import { mailArgs, NUMBERS_TO, numbersJson, numbersOf, numbersRows, toolsConnected, type YourNumbers } from "./yourNumbers.ts";

const css = (name: string) => (typeof document === "undefined" ? "" : getComputedStyle(document.documentElement).getPropertyValue(name));

/** Your numbers: a row in History; on its press the week's counts and the tools connected are asked for, and shown. "Send
 *  these numbers" shows the exact JSON; only "Open a mail draft" hands it to the shell. Off with numbers.yours. */
export function NumbersPart({ project, send }: { project: string; send: (cmd: unknown) => unknown }) {
  const on = useSetting("numbers.yours") !== false;
  const [open, setOpen] = useState(false);
  const [week, setWeek] = useState<WeekView | null>(null);
  const [tools, setTools] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const asked = useRef({ week: false, tools: false });
  useEffect(() => {
    setOpen(false); setWeek(null); setTools(null); setSending(false); setSaid(null); asked.current = { week: false, tools: false };
    const off = listen("runner-event", (e) => {
      if (asked.current.week) { const w = weekFrom(e.payload, project); if (w) { asked.current.week = false; setWeek(w); } }
      if (asked.current.tools) { const st = doneStateFrom(e.payload, project); if (st) { asked.current.tools = false; setTools(toolsConnected(st)); } }
    });
    return () => { void off.then((f) => f()); };
  }, [project]);
  if (!on) return null;
  const press = () => {
    if (open) { setOpen(false); return; }
    setOpen(true); setWeek(null); setTools(null); setSending(false); setSaid(null);
    asked.current = { week: true, tools: true };
    void send(weekAsk(project)); void send(showDoneSignal(project));
  };
  const n: YourNumbers | null = week ? numbersOf(week, tools) : null;
  const openMail = () => { if (!n) return; void invoke("numbers_mail", mailArgs(n)).then(() => setSaid(S.m88.numbers.opened), () => setSaid(S.m88.numbers.notOpened)); };
  const copy = () => { if (!n) return; void invoke("copy_text", { text: numbersJson(n) }).then(() => setSaid(S.m88.numbers.copied), () => setSaid(S.m88.numbers.notOpened)); };
  const t = S.m88.numbers;
  return (
    <div className="hist-week-part" role="group" aria-label={t.rowTitle}>
      <ListGroup label={t.rowTitle}>
        <ListRow colour="blue" icon="grid" title={t.rowTitle} line={t.rowLine} expanded={open}
          action={{ label: open ? t.close : t.open, colour: "blue", ariaLabel: open ? t.close : t.openLabel, onClick: press }} />
      </ListGroup>
      {open && (
        <section className="week-page numbers-page" aria-label={t.title}>
          {!n ? <p className="line muted" role="status">{t.counting}</p> : (<>
            <p className="ui-lead-title" role="heading" aria-level={3}>{t.title}</p>
            {week && <p className="line muted">{weekPage(week).range}</p>}
            <table className="numbers-table"><tbody>{numbersRows(n).map((r) => <tr key={r.id}><td>{r.label}</td><td className="numbers-n">{r.value}</td></tr>)}</tbody></table>
            <p className="line muted">{t.fromRows}</p>
            {!sending ? (
              <div className="row"><Button size="sm" onClick={() => { setSending(true); setSaid(null); }}>{t.send}</Button><Button size="sm" onClick={() => setOpen(false)}>{t.close}</Button></div>
            ) : (
              <div className="numbers-send" role="group" aria-label={t.sendTitle}>
                <p className="line"><b>{t.sendTitle}</b></p>
                <p className="line muted">{t.sendLine}</p>
                <p className="line muted">{NUMBERS_TO ? t.goesTo(NUMBERS_TO) : t.noAddress}</p>
                <pre className="numbers-json" aria-label={t.sendTitle}>{numbersJson(n)}</pre>
                <div className="row">
                  <Button size="sm" kind="primary" onClick={openMail}>{t.openMail}</Button>
                  <Button size="sm" onClick={copy}>{t.copy}</Button>
                  <Button size="sm" onClick={() => { setSending(false); setSaid(null); }}>{t.cancel}</Button>
                </div>
              </div>
            )}
            {said && <p className="line" role="status">{said}</p>}
          </>)}
        </section>
      )}
    </div>
  );
}

/** Share what my AI did: the preview, then Save (the Mac's own save dialog) or Close. The preview is the very string that is
 *  saved, shown in a frame that runs nothing (sandbox without scripts; same origin only so its height can be read), so
 *  the two can never differ. */
export function SharePreview({ doc, onClose, id = "share-receipt" }: { doc: ShareDoc; onClose: () => void; id?: string }) {
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const s = S.m88.share;
  const html = useMemo(() => receiptHtml(doc, readPalette(css)), [doc]);
  const fit = (f: HTMLIFrameElement) => {
    // The page's own height; the stylesheet caps it (.share-frame max-height), and past that the frame scrolls inside.
    try { const h = f.contentDocument?.documentElement?.scrollHeight ?? 0; if (h > 0) f.style.setProperty("height", `${h}px`); } catch { /* the frame could not be read: it keeps the stylesheet's height and scrolls */ }
  };
  const save = () => {
    if (busy) return;
    setBusy(true); setSaid(s.saving);
    void invoke("save_receipt", { name: receiptFileName(doc), html })
      .then((name) => setSaid(typeof name === "string" && name ? s.saved(name) : null), (e) => setSaid(e === "notSaved" ? s.notSaved : s.notAllowed))
      .finally(() => setBusy(false));
  };
  return (
    <section className="share-receipt" id={id} role="group" aria-labelledby={`${id}-title`}>
      <p className="line"><b id={`${id}-title`}>{s.previewTitle}</b></p>
      <p className="line muted">{s.previewLine}</p>
      <iframe className="share-frame" title={doc.title} sandbox="allow-same-origin" srcDoc={html} onLoad={(e) => fit(e.currentTarget)} />
      <div className="row">
        <Button size="sm" kind="primary" disabled={busy} onClick={save}>{s.save}</Button>
        <Button size="sm" onClick={onClose}>{s.close}</Button>
      </div>
      {said && <p className="line" role="status">{said}</p>}
    </section>
  );
}
