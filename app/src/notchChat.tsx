// M96: the small chat out of the notch (notchChat.ts decides what is in it; docs/milestones/M96-heyclicky-notch.md). Home
// draws it while the shell says Home opened small (main.rs open_card_then "chat"): a top row (Flowflow, the lowercase hello,
// Settings and Open all of Home), the recent news as bubbles under a small time line, and at the foot the mic and the ask
// field. The field is Home's one ask box (card.tsx hands its ref here while the chat shows), so Return asks exactly as Home
// does, and voice words land in it as they do there. It never takes the keys by itself: card.tsx focuses it only when the
// shell says a key or a click on Squibby opened Home (opened.keyboard: the ask key, or QA1's click on the notch; rule 9). Words in strings.ts, colours in tokens.css (black.css draws it).
import { Fragment, useLayoutEffect, useRef, useState, type KeyboardEvent, type Ref } from "react";
import { FlowMini } from "./flowflowMini.tsx";
import { Icon } from "./icons.tsx";
import type { Model } from "./model.ts";
import { chatAskFull, chatBubbles, chatFocusNext, chatProject, chatRowProject, chatWhen, fitRowProject, type Bubble } from "./notchChat.ts";
import { S } from "./strings.ts";
import { invoke } from "./tauri.ts";
import { useSetting } from "./settingsStore.ts";
import { useDragOut } from "./tuck.ts";
import { characterName } from "./companion.ts";
import { Dot } from "./ui/parts.tsx";
import type { Colour } from "./meaning.ts";
import { NotchFeed } from "./notchFeed.tsx";

type Props = {
  m: Model; project: string; greet: string; now: number;
  /** A line the ask box would say under itself (a word is needed, the keys to hold to talk), said as Squibby's bubble. */
  hint: string | null;
  /** Home's ask box, while the chat shows. */
  boxRef: Ref<HTMLTextAreaElement>;
  working: boolean;
  /** Hold to talk is on and has keys: the mic says which to hold in its own words (a click never opens the microphone,
   *  rule 5). */
  talk: { on: boolean; title: string; label: string };
  /** While a task works: the chat's own Stop (the same stop as Home's), or null. */
  stop: { label: string; title: string } | null;
  onStop: () => void;
  /** A press on a bubble that points somewhere: opens out to that place. */
  onBubble: (go: NonNullable<Bubble["go"]>) => void;
  /** M113: a press on a line of the live feed (its session's key). */
  onFeed: (key: string) => void;
  onMic: () => void; onSend: () => void; onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void; onInput: () => void; onFocus: () => void;
  onSettings: () => void; onExpand: () => void;
  /** The chat's own Close: folds it back into the notch, as Esc does. */
  onClose: () => void;
  /** Feel round 3 (19 Nov 2026): the words just sent from the field, shown as the person's bubble at once (with Squibby's
   *  working dots) until the engine's task with those words arrives. */
  pending?: string | null;
  /** QA1 review: Send can never send (fixing is off): greyed, with why as its name. Return still says why in the thread. */
  sendOff?: string | null;
  /** The project's state after its name in the top row: a word or three and its dot, as Home's project chip has. */
  state?: { words: string; dot: Colour } | null;
};

export function NotchChat({ m, project, greet, now, hint, boxRef, working, talk, stop, onStop, onBubble, onFeed, onMic, onSend, onKeyDown, onInput, onFocus, onSettings, onExpand, onClose, pending = null, state = null, sendOff = null }: Props) {
  const C = S.m96.chat;
  const listening = m.voice?.stage === "listening";
  // M111: tucked into the notch, Flowflow's face can be dragged out onto the screen, and one small button brings it out.
  const tucked = useSetting("character.lives") === "notch";
  const out = useDragOut(tucked);
  // Round 1 (the founder: "I don't want the Flowflow symbol to be on there"): the face is in the top row only while Flowflow
  // lives in the notch (it is the handle to drag it out), and is hidden the moment it is pulled out. Otherwise the hello
  // leads. Round 2: the handle itself stays for the whole drag (it holds the pointer, so the let go is never lost); only
  // the face drawn inside it hides (data-out, black.css).
  const who = characterName(useSetting("character.name"));
  // Feel round 2 (19 Nov 2026): the recent thread, each day under its own time line (stamped from its own tasks).
  const given = chatBubbles(m, project, { hint, now });
  const bubbles = withPending(given, pending);
  const empty = given.length === 1 && given[0]!.key === "empty" && !pending;
  const when = bubbles.some((b) => b.when) ? null : chatWhen(m, project, now);
  // The newest bubble of each run by one side has the small tail, so it is clear who said what.
  const tail = (i: number) => bubbles[i + 1]?.who !== bubbles[i]!.who || !!bubbles[i + 1]?.when;
  // Which project an ask goes to: Return starts a task there (the M96 review).
  // Feel round 3: the top row names the project, so the field's hint is the short ask; its spoken name keeps the project.
  const name = chatProject(project), shown = chatRowProject(project), askFull = chatAskFull(project);
  // The field, for the suggestions (Home's ref is handed on as it was).
  const field = useRef<HTMLTextAreaElement | null>(null);
  const setBox = (el: HTMLTextAreaElement | null) => {
    field.current = el;
    if (typeof boxRef === "function") boxRef(el); else if (boxRef) (boxRef as { current: HTMLTextAreaElement | null }).current = el;
  };
  // The words go in the field and Send lights; the field never takes the keys by itself (rule 9).
  const fill = (q: string) => { const el = field.current; if (!el) return; el.value = q; onInput(); };
  // Round 2: the name shortened to the room the top row has left at the text size in force, so the row stays one line.
  // A canvas measures a hair narrower than the page draws, so a name measured to the last point could still wrap.
  const FIT_SLACK = 3;
  const projRef = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState<string | null>(null);
  useLayoutEffect(() => {
    const el = projRef.current;
    const ctx = el && typeof ResizeObserver !== "undefined" ? document.createElement("canvas").getContext?.("2d") : null;
    if (!el || !ctx) { setFit(null); return; }
    const measure = () => { const cs = getComputedStyle(el); ctx.font = cs.font || `${cs.fontSize} ${cs.fontFamily}`; const room = el.clientWidth; setFit(room > 0 ? fitRowProject(project, (t) => Math.ceil(ctx.measureText(t).width) + FIT_SLACK <= room) : null); };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [project]);
  // The newest is at the foot, by the field: kept in view as news arrives (the older scroll up).
  const news = useRef<HTMLDivElement>(null);
  const last = bubbles.at(-1)?.key ?? "";
  useLayoutEffect(() => { const el = news.current; if (el) el.scrollTop = el.scrollHeight; }, [last, bubbles.length]);
  // QA1: Tab goes round the chat's own controls (past Send back to the top row), so the keys are never lost on the page.
  const tabRound = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Tab" || e.altKey || e.metaKey || e.ctrlKey) return;
    const all = [...e.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")].filter((el) => !el.closest("[hidden]"));
    const next = chatFocusNext(all.length, all.indexOf(document.activeElement as HTMLElement), e.shiftKey);
    if (next === null) return;
    e.preventDefault();
    all[next]!.focus();
  };
  return (
    <section className="notch-chat" aria-label={C.label} onKeyDown={tabRound} data-talking={listening ? "" : undefined}>
      <div className="nc-top">
        {tucked && <span className="nc-face-hold" data-tucked="" data-out={out.dragging ? "" : undefined} title={S.m111.tucked(who)}
          onPointerDown={out.onPointerDown} onPointerMove={out.onPointerMove} onPointerUp={out.onPointerUp} onPointerCancel={out.onPointerCancel} onLostPointerCapture={out.onLostPointerCapture}>
          <FlowMini className="nc-face" state={m.character} />
        </span>}
        {/* Feel round 2: the project's name is the row's title; the hello only with no project (the greeting was said twice). */}
        {!name && <span className="nc-hi" title={greet}>{greet}</span>}
        {name && <span className="nc-title">
          <span className="nc-line">{state && <Dot colour={state.dot} />}<span className="nc-proj" ref={projRef} title={C.project(name)}><span aria-hidden="true">{fit ?? shown}</span><span className="sr">{name}</span></span></span>
          {state?.words && <span className="nc-state">{state.words}</span>}
        </span>}
        {stop && <button type="button" className="nc-stop" aria-label={stop.label} title={stop.title} onClick={onStop}><Icon name="stop" size={12} />{C.stop}</button>}
        {tucked && <button type="button" className="nc-ico nc-out" aria-label={S.m111.bringOut(who)} title={S.m111.bringOut(who)} onClick={() => void invoke("untuck").catch(() => {})}><Icon name="bringOut" size={14} /></button>}
        <button type="button" className="nc-ico nc-gear" aria-label={C.settings} title={C.settings} onClick={onSettings}><Icon name="gear" size={14} /></button>
        <button type="button" className="nc-ico" aria-label={C.expand} title={C.expand} onClick={onExpand}><Icon name="expand" size={13} /></button>
        <button type="button" className="nc-ico" aria-label={C.close} title={C.close} onClick={onClose}><Icon name="close" size={14} /></button>
      </div>
      {/* M113: what the person's own AI tools are doing, above the thread; a press opens this work's review, or says when it comes. */}
      <NotchFeed m={m} project={project} where="chat" onOpen={onFeed} />
      <div className="nc-news" ref={news} role="log" aria-label={C.history} data-few={bubbles.length <= 1 ? "" : undefined} data-empty={empty ? "" : undefined}>
        {when && <p className="nc-when"><b>{when.day}</b> {when.time}</p>}
        {bubbles.map((b, i) => <Fragment key={b.key}>
          {b.when && <p className="nc-when"><b>{b.when.day}</b> {b.when.time}</p>}
          {b.go
            ? <button type="button" className="nc-b nc-them nc-go" data-tail={tail(i) ? "" : undefined} onClick={() => onBubble(b.go!)}>{b.words}</button>
            : <p className={`nc-b ${b.who === "you" ? "nc-me" : "nc-them"}`} data-tail={tail(i) ? "" : undefined}>{b.words}{b.who === "squibby" && b.words === C.working && <span className="nc-dots" aria-hidden="true"><i /><i /><i /></span>}</p>}
          {b.fix && <button type="button" className="nc-fix" title={C.fixTitle} onClick={() => onBubble("now")}>{C.fix}</button>}
        </Fragment>)}
        {/* Feel round 3: with nothing said yet, a few questions to start from; a press only puts the words in the field. */}
        {empty && <div className="nc-suggest">{C.suggest.map((q) => <button key={q} type="button" className="nc-pill" title={C.suggestLabel} onClick={() => fill(q)}>{q}</button>)}</div>}
      </div>
      <div className="nc-bar">
        {/* QA1 review (rule 5): while the microphone is open the mic is lit, as Home's is (the light is drawn here too when
            the chat is the only thing showing), and it shows then even if the keys were changed meanwhile. */}
        {(talk.on || listening) && <button type="button" className="nc-mic" data-on={listening ? "" : undefined} aria-label={listening ? C.micListening : talk.label} title={listening ? C.micListening : talk.title} onClick={onMic}><Icon name="mic" size={15} /></button>}
        <div className="nc-field">
          <textarea ref={setBox} rows={1} autoComplete="off" spellCheck={false} placeholder={C.ask} aria-label={askFull} onKeyDown={onKeyDown} onInput={onInput} onFocus={onFocus} />
          <button type="button" className="nc-send" aria-label={sendOff ? `${C.send}. ${sendOff}` : C.send} title={sendOff ?? C.send} disabled={working || !!sendOff} onClick={onSend}><Icon name="send" size={14} /></button>
        </div>
      </div>
    </section>
  );
}

/** Feel round 3 (19 Nov 2026): the words just sent, as the person's bubble with Squibby's working one under it, until a
 *  bubble of the person's with the same words arrives from the engine (then it is that one, in its place). */
export function withPending(bubbles: Bubble[], pending: string | null): Bubble[] {
  const words = pending?.trim() ?? "";
  if (!words || bubbles.some((b) => b.who === "you" && b.words.trim() === words)) return bubbles;
  const kept = bubbles.filter((b) => b.key !== "empty");
  // QA1: a hint the field gave (the busy line) was said about this send, so it comes after it, never above it.
  const hint = kept.filter((b) => b.key === "hint");
  return [...kept.filter((b) => b.key !== "hint"), { key: "you:pending", who: "you", words }, { key: "sq:pending", who: "squibby", words: S.m96.chat.working }, ...hint];
}
