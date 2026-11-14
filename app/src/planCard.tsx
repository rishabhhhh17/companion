// Pro on the pages (the payments spec, sections 3, 4, 8 and 9a; T17). The Plan card on Account, the Get Pro sheet, the
// limit card on Home and the small Pro tag. What each shows is decided in plan.ts; this file only draws it and sends the
// person's presses to the shell (tauri.ts proCommands). There is no card form, no login form and no web view: checkout and
// billing open in the person's own browser. The clipboard is read only when Paste key is pressed (rule 5). The key the
// person pastes goes to the shell once and the field is emptied at once; the page never keeps it or shows more than its
// last 4 characters. Every word is in strings.ts.
import { useId, useRef, useState } from "react";
import { Button, Card, Field, Sheet } from "./ui/parts.tsx";
import { ConfirmStep } from "./confirm.tsx";
import { getProSheet, limitCard, offerLines, planCard, planIncludes, planProblem, tidyKey, TRIAL_DAYS, type LimitView, type PlanButton, type PlanStatus, type Term, type Usage } from "./plan.ts";
import { notePlan } from "./usePlan.ts";
import { proCommands } from "./tauri.ts";
import { S } from "./strings.ts";

/** What a press needs: a line to say what happened (Settings' foot line, or Home's notice). */
type Say = (line: string) => void;

/** The presses every Pro card shares: the trial, Get Pro, billing, Check again, Paste new key. */
function usePresses(say: Say) {
  const [sheet, setSheet] = useState<"" | "buy" | "key">("");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const run = (p: Promise<unknown>, done?: (v: unknown) => void) => {
    setProblem(""); setBusy(true);
    void p.then((v) => { if (v !== undefined) notePlan(v); done?.(v); }).catch((e) => setProblem(planProblem(e))).finally(() => setBusy(false));
  };
  const press = (id: PlanButton["id"], extra?: { notNow?: () => void; otherMac?: () => void }) => {
    switch (id) {
      case "trial": run(proCommands.startTrial(), () => say(S.plan.trialOn(TRIAL_DAYS))); break;
      case "getPro": setProblem(""); setSheet("buy"); break;
      case "pasteKey": setProblem(""); setSheet("key"); break;
      case "billing": setProblem(""); void proCommands.openPortal().catch((e) => setProblem(planProblem(e))); break;
      case "checkAgain": run(proCommands.checkNow(), () => say(S.plan.checked)); break;
      case "otherMac": extra?.otherMac?.(); break;
      case "notNow": extra?.notNow?.(); break;
    }
  };
  return { sheet, setSheet, problem, setProblem, busy, run, press };
}

const Problem = ({ text }: { text: string }) => (text ? <p className="set-problem" role="alert">{text}</p> : null);

/** The Plan card on Account (section 9a): one line, at most two facts, its buttons. With payments off: Early access. */
export function PlanCardView({ status, usage, say, anchor }: { status: PlanStatus; usage: Usage | null; say: Say; anchor?: string }) {
  const card = planCard(status, usage);
  const p = usePresses(say);
  const [askOff, setAskOff] = useState(false);
  const otherId = useId();
  const turnOff = () => { setAskOff(false); p.run(proCommands.deactivate(), () => say(S.plan.otherMacDone)); };
  return (
    <div className="plan" id={anchor}>
      <p className="plan-line" data-mark={card.mark === "none" ? undefined : card.mark}>{card.line}</p>
      {card.facts.map((f) => <p className="plan-fact" key={f}>{f}</p>)}
      {card.buttons.length > 0 && !askOff && <div className="set-buttons">{card.buttons.map((b) => (
        <Button key={b.id} id={b.id === "otherMac" ? otherId : undefined} kind={b.kind} disabled={p.busy} onClick={() => p.press(b.id, { otherMac: () => setAskOff(true) })}>{b.label}</Button>
      ))}</div>}
      {askOff && (
        <ConfirmStep className="set-confirm" label={S.plan.otherMacSure} back={otherId} onCancel={() => setAskOff(false)}>
          <p>{S.plan.otherMacSure}</p>
          <div className="set-buttons"><Button kind="danger" disabled={p.busy} onClick={turnOff}>{S.plan.otherMacYes}</Button><Button cancel onClick={() => setAskOff(false)}>{S.ui.cancel}</Button></div>
        </ConfirmStep>
      )}
      <Problem text={p.problem} />
      {p.sheet && <GetProSheet status={status} keyFirst={p.sheet === "key"} say={say} onClose={() => p.setSheet("")} />}
    </div>
  );
}

/** Reads the clipboard for the key field. Called only from the Paste key button's own press, never on a timer, a focus or
 *  an open (rule 5). If the page may not read it, the person is told to paste with Command V instead. */
async function pasteFromClipboard(): Promise<string | null> {
  try { return (await navigator.clipboard?.readText()) ?? null; } catch { return null; }
}

/** Get Pro (section 4): Yearly, then Monthly, each opening Dodo's checkout in the browser; the US prices line; then
 *  "Waiting for your key" with the key field and Paste key. keyFirst: only the key (Paste new key, a key not active). */
export function GetProSheet({ status, keyFirst, say, onClose }: { status: PlanStatus; keyFirst?: boolean; say: Say; onClose: () => void }) {
  const sheet = getProSheet(status);
  const [waiting, setWaiting] = useState(false);
  const [key, setKey] = useState("");
  const [problem, setProblem] = useState("");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const open = (t: Term) => {
    setProblem("");
    void proCommands.openCheckout(t).then(() => { setWaiting(true); field.current?.focus(); }).catch((e) => setProblem(planProblem(e)));
  };
  const paste = () => {
    setHint("");
    void pasteFromClipboard().then((text) => {
      const k = text ? tidyKey(text) : "";
      if (k) setKey(k); else { setHint(S.plan.pasteHint); field.current?.focus(); }
    });
  };
  const turnOn = () => {
    const k = tidyKey(key);
    setKey("");   // emptied at once, whatever happens next; nothing on the page keeps a copy
    if (!k || busy) return;
    setProblem(""); setHint(""); setBusy(true);
    void proCommands.activate(k).then((v) => {
      notePlan(v);
      const email = v && typeof v === "object" ? String((v as Record<string, unknown>).activatedFor ?? "") : "";
      say(S.plan.proOnFor(email));
      onClose();
    }).catch((e) => setProblem(planProblem(e))).finally(() => setBusy(false));
  };
  return (
    <Sheet title={keyFirst ? S.plan.keyLabel : S.plan.getProTitle} dirty={!!key && !busy} saveLabel={busy ? S.plan.turningOn : S.plan.turnOn}
      onSave={turnOn} onClose={() => { setKey(""); onClose(); }}>
      {!keyFirst && (<>
        <div className="pro-choices">
          {sheet.choices.map((c) => <Button key={c.term} size="lg" disabled={!c.ready || busy} onClick={() => open(c.term)}>{c.label}</Button>)}
        </div>
        {sheet.lines.map((l) => <p className="plan-fact" key={l}>{l}</p>)}
        {/* M88 (F31): yearly, students and invite and earn, only while payments are on (offerLines is empty when off). */}
        {offerLines(status).map((l) => <p className="plan-fact" key={l}>{l}</p>)}
        {/* M79: what each plan includes, the one list, shown only while payments are on (planIncludes is empty when off). */}
        {planIncludes(status).map((p) => (
          <div className="plan-includes" key={p.id} role="group" aria-label={p.title}>
            <p className="plan-line">{p.price ? `${p.title}, ${p.price}` : p.title}</p>
            <ul>{p.lines.map((l) => <li className="plan-fact" key={l}>{l}</li>)}</ul>
          </div>
        ))}
        {planIncludes(status).length > 0 && <p className="plan-fact">{S.m79.alwaysWork}</p>}
      </>)}
      {waiting
        ? <div className="pro-wait" role="status"><p className="plan-line">{S.plan.waitingTitle}</p><p className="plan-fact">{S.plan.waitingLine}</p></div>
        : <p className="plan-fact">{keyFirst ? S.plan.notActiveWhy : S.plan.haveKey}</p>}
      <div className="set-pair pro-key">
        <Field type="password" value={key} label={S.plan.keyLabel} disabled={busy} error={problem || undefined} inputRef={field} wide
          onChange={setKey} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) turnOn(); }} />
        <Button size="sm" disabled={busy} onClick={paste}>{S.plan.pasteKey}</Button>
      </div>
      {hint && <p className="set-note" role="status">{hint}</p>}
    </Sheet>
  );
}

/** The limit card on Home, in place of the result (section 3), and the card behind a Pro tag. Calm: Flowflow keeps its
 *  own state, nothing is red, and Not now always closes it. */
export function LimitPanel({ view, status, usage, say, onClose }: { view: LimitView; status: PlanStatus; usage: Usage | null; say: Say; onClose: () => void }) {
  const card = limitCard(view, status, usage);
  const p = usePresses((line) => { say(line); onClose(); });
  return (
    <Card className="panel pro-limit">
      <p className="plan-line">{card.lines[0]}</p>
      {card.lines.slice(1).map((l) => <p className="plan-fact" key={l}>{l}</p>)}
      <div className="set-buttons">{card.buttons.map((b) => <Button key={b.id} kind={b.kind} disabled={p.busy} onClick={() => p.press(b.id, { notNow: onClose })}>{b.label}</Button>)}</div>
      <Problem text={p.problem} />
      {p.sheet && <GetProSheet status={status} keyFirst={p.sheet === "key"} say={(l) => { say(l); onClose(); }} onClose={() => p.setSheet("")} />}
    </Card>
  );
}

/** The small Pro tag on a Pro feature (section 3). Drawn only where plan.ts proTag says, so never with payments off. */
export const ProTag = ({ corner }: { corner?: boolean }) => <span className={corner ? "pro-tag corner" : "pro-tag"}><span aria-hidden="true">{S.plan.proTag}</span><span className="sr">, {S.plan.proTagSay}</span></span>;
