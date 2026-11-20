// M114 (docs/milestones/M114-approve-from-notch.md): the card for the person's own AI tool's ask, drawn in the notch's question
// list (islandPanel.tsx) with the notch's own card and buttons (style.css .ip-job, .ip-answer; notch.css .ta-*). One card at a
// time, oldest first, with how many more wait. A permission card: what the tool wants and its short command or file, then
// Don't allow, Always allow (its rule shown on the card first) and Allow. A question card: one question at a time, its choices
// as buttons; several allowed, they toggle and Send sends. Answer in the tool is always there. Every press is the person's
// (rule 13) and only a click: the notch never takes the keys (rule 9). A press waits until the card is armed (ARM_MS, as
// every question in the notch), and each later question of a question card waits its own ARM_MS from when it shows, so a
// quick double click or a resting pointer never answers it. A picked choice has a tick inside it. A choice's own words show
// under its label (three choices or fewer), or on one muted line for the pointed or focused choice (more). Words from
// strings.ts (notchAsk.ts), colours from tokens.css. A new question fades in.
import { useEffect, useState, type FocusEvent, type PointerEvent } from "react";
import { askCard, askStep, ASK_START, ASKS_SHOWN, type AskStep, type ToolAsk } from "./notchAsk.ts";
import { ARM_MS, armed as armedSince } from "./islandPanel.ts";
import { S } from "./strings.ts";
import { Button } from "./ui/parts.tsx";
import { Icon } from "./icons.tsx";

/** Up to this many choices, each shows its own words under its label; more share one line under them. */
const ABOUT_INLINE_MAX = 3;
/** The choice a pointer or focus event is on, by its place among the choices. */
const choiceAt = (e: { target: EventTarget | null; currentTarget: HTMLElement }): number | null => {
  const b = (e.target as Element | null)?.closest?.("button");
  if (!b || !e.currentTarget.contains(b)) return null;
  const i = [...e.currentTarget.querySelectorAll(":scope > button")].indexOf(b);
  return i < 0 ? null : i;
};

export type AskChoice = "allow" | "always" | "deny" | "tool" | "answer";
type Props = {
  asks: ToolAsk[];
  tabIndex: number;
  /** Whether the card with this key is armed now (drawn as ready), and whether a press on it may go now. */
  armedNow: (key: string) => boolean;
  canPress: (key: string) => boolean;
  onAnswer: (ask: string, choice: AskChoice, picks?: number[][]) => void;
};

/** The key the notch keeps each card's first sight under (islandPanel.tsx seen). */
export const askKey = (a: Pick<ToolAsk, "ask">) => `ta:${a.ask}`;

export function NotchAsks({ asks, tabIndex, armedNow, canPress, onAnswer }: Props) {
  if (!asks.length) return null;
  const shown = asks.slice(0, ASKS_SHOWN), more = asks.length - shown.length;
  return <>
    {shown.map((a) => <li key={a.ask}><AskCardView a={a} tabIndex={tabIndex} armed={armedNow(askKey(a))} canPress={() => canPress(askKey(a))} onAnswer={onAnswer} /></li>)}
    {more > 0 && <li className="ta-more" role="status">{S.m114.more(more)}</li>}
  </>;
}

function AskCardView({ a, tabIndex, armed, canPress, onAnswer }: { a: ToolAsk; tabIndex: number; armed: boolean; canPress: () => boolean; onAnswer: Props["onAnswer"] }) {
  const c = askCard(a);
  const [step, setStep] = useState<AskStep>(ASK_START);
  // M114 review: when the question shown now came up (null for the first, which waits on the card's own arming).
  const [stepAt, setStepAt] = useState<number | null>(null);
  const [, redraw] = useState(0);
  useEffect(() => {
    if (stepAt === null) return;
    const id = setTimeout(() => redraw((n) => n + 1), ARM_MS + 20);
    return () => clearTimeout(id);
  }, [stepAt]);
  const stepReady = (t: number) => stepAt === null || armedSince(stepAt, t);
  const ok = () => canPress() && stepReady(Date.now());
  // The pointed and the focused choice, for the shared line of words under four or more choices.
  const [hover, setHover] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const go = (choice: AskChoice, picks?: number[][]) => { if (ok()) onAnswer(a.ask, choice, picks); };
  const press = (p: { pick: number } | { next: true }) => {
    if (!ok()) return;
    const r = askStep(a, step, p);
    if (r.step.at !== step.at) { setStepAt(Date.now()); setHover(null); setFocus(null); }
    setStep(r.step);
    if (r.send) onAnswer(a.ask, "answer", r.send);
  };
  const q = c.questions?.[step.at] ?? null;
  const last = !!c.questions && step.at + 1 >= c.questions.length;
  const ready = armed && stepReady(Date.now());
  const inline = !!q && q.options.length <= ABOUT_INLINE_MAX;
  const shared = !!q && !inline && q.options.some((o) => o.about);
  const pointed = hover ?? focus;
  const hint = shared ? (pointed !== null && q!.options[pointed]?.about) || S.m114.aboutHint : null;
  return (
    <div className="ip-job ip-ask ta-card" data-tone="needsYou" data-kind={a.kind} data-armed={ready ? "yes" : undefined} role="group" aria-label={q ? `${c.title} ${c.where}. ${q.question}` : c.say}>
      <span className="ip-dot" data-tone="needsYou" aria-hidden="true" />
      <span className="ip-text" aria-hidden="true">
        {/* break-ui: a long question is cut at three lines here; its whole text is the tooltip and what VoiceOver hears. */}
        <b title={q ? q.question : undefined}>{q ? q.question : c.title}</b>
        <span>{q ? <>{c.title} {c.where}{c.counter(step.at) && <span className="ta-count">{c.counter(step.at)}</span>}</> : <>{c.target && <code>{c.target}</code>}{c.target ? " " : ""}{c.where}</>}</span>
      </span>
      {q ? (
        // One question: its choices, newest question fading in (keyed by its place).
        <div key={step.at} className="ta-q">
          <div className="ta-choices" role="group" aria-label={q.multi ? `${q.question} ${S.m114.pickSome}` : q.question}
            onPointerOver={(e: PointerEvent<HTMLDivElement>) => setHover(choiceAt(e))}
            onPointerOut={(e: PointerEvent<HTMLDivElement>) => { const to = e.relatedTarget as Node | null; if (!to || !e.currentTarget.contains(to)) setHover(null); }}
            onFocus={(e: FocusEvent<HTMLDivElement>) => setFocus(choiceAt(e))}
            onBlur={(e: FocusEvent<HTMLDivElement>) => { const to = e.relatedTarget as Node | null; if (!to || !e.currentTarget.contains(to)) setFocus(null); }}>
            {q.options.map((o, i) => {
              const on = q.multi && step.chosen.includes(i);
              const name = on ? S.m114.picked(o.label) : o.label;
              return <Button key={o.label} size="sm" className="ta-choice" tabIndex={tabIndex} pressed={q.multi ? on : undefined} title={o.about} label={o.about ? `${name}. ${o.about}` : name} onClick={() => press({ pick: i })}>
                {on && <span className="ta-tick" aria-hidden="true"><Icon name="tick" size={12} /></span>}
                <span className="ta-label">{o.label}</span>
                {inline && o.about && <span className="ta-about">{o.about}</span>}
              </Button>;
            })}
          </div>
          {/* The shared line sits beside Send when there is one, so it never makes the card taller than the notch's room. */}
          {q.multi ? <div className="ta-foot">
            {hint !== null && <p className="ta-hint" aria-hidden="true">{hint}</p>}
            <span className="ip-answer ta-send"><Button kind="primary" size="sm" className="ip-yes" tabIndex={tabIndex} disabled={step.chosen.length === 0} onClick={() => press({ next: true })}>{last ? S.m114.send : S.m114.next}</Button></span>
          </div> : hint !== null && <p className="ta-hint" aria-hidden="true">{hint}</p>}
        </div>
      ) : <>
        {/* Always allow's rule, on the card before any press: exactly what it saves, and where. */}
        {c.always && <p className="ta-rule" title={c.alwaysLine ?? undefined}>{S.m114.alwaysBefore} <code>{c.always}</code> {S.m114.alwaysAfter}</p>}
        <span className="ip-answer">
          {c.buttons.map((b) => <Button key={b} size="sm" kind={b === "allow" ? "primary" : "secondary"} className={b === "allow" ? "ip-yes" : "ip-no"} tabIndex={tabIndex} label={`${c.labels[b]}: ${c.say}`} onClick={() => go(b)}>{c.labels[b]}</Button>)}
        </span>
      </>}
      <button type="button" className="ta-intool" tabIndex={tabIndex} aria-label={c.inToolSay} onClick={() => go("tool")}>{c.inTool}</button>
    </div>
  );
}
