// M96: the small chat out of the notch (notchChat.ts decides what is in it; docs/milestones/M96-heyclicky-notch.md). Home
// draws it while the shell says Home opened small (main.rs open_card_then "chat"): a top row (Flowflow, the lowercase hello,
// Settings and Open all of Home), the recent news as bubbles under a small time line, and at the foot the mic and the ask
// field. The field is Home's one ask box (card.tsx hands its ref here while the chat shows), so Return asks exactly as Home
// does, and voice words land in it as they do there. It never takes the keys by itself: card.tsx focuses it only when the
// ask key opened Home (rule 9). Words in strings.ts, colours in tokens.css (black.css draws it).
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type Ref } from "react";
import { FlowMini } from "./flowflowMini.tsx";
import { Icon } from "./icons.tsx";
import type { Model } from "./model.ts";
import { chatAsk, chatAskFull, chatBubbles, chatProject, chatRowProject, chatWhen, fitRowProject, type Bubble } from "./notchChat.ts";
import { S } from "./strings.ts";
import { invoke } from "./tauri.ts";
import { useSetting } from "./settingsStore.ts";
import { useDragOut } from "./tuck.ts";
import { characterName } from "./companion.ts";

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
  onMic: () => void; onSend: () => void; onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void; onInput: () => void; onFocus: () => void;
  onSettings: () => void; onExpand: () => void;
  /** The chat's own Close: folds it back into the notch, as Esc does. */
  onClose: () => void;
};

export function NotchChat({ m, project, greet, now, hint, boxRef, working, talk, stop, onStop, onBubble, onMic, onSend, onKeyDown, onInput, onFocus, onSettings, onExpand, onClose }: Props) {
  const C = S.m96.chat;
  // M111: tucked into the notch, Flowflow's face can be dragged out onto the screen, and one small button brings it out.
  const tucked = useSetting("character.lives") === "notch";
  const out = useDragOut(tucked);
  // Round 1 (the founder: "I don't want the Flowflow symbol to be on there"): the face is in the top row only while Flowflow
  // lives in the notch (it is the handle to drag it out), and is hidden the moment it is pulled out. Otherwise the hello
  // leads. Round 2: the handle itself stays for the whole drag (it holds the pointer, so the let go is never lost); only
  // the face drawn inside it hides (data-out, black.css).
  const who = characterName(useSetting("character.name"));
  const bubbles = chatBubbles(m, project, { hint });
  const when = chatWhen(m, project, now);
  // Which project an ask goes to: Return starts a task there (the M96 review).
  const name = chatProject(project), shown = chatRowProject(project), ask = chatAsk(project), askFull = chatAskFull(project);
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
  return (
    <section className="notch-chat" aria-label={C.label}>
      <div className="nc-top">
        {tucked && <span className="nc-face-hold" data-tucked="" data-out={out.dragging ? "" : undefined} title={S.m111.tucked(who)}
          onPointerDown={out.onPointerDown} onPointerMove={out.onPointerMove} onPointerUp={out.onPointerUp} onPointerCancel={out.onPointerCancel} onLostPointerCapture={out.onLostPointerCapture}>
          <FlowMini className="nc-face" state={m.character} />
        </span>}
        <span className="nc-hi" title={greet}>{greet}</span>
        {name && <span className="nc-proj" ref={projRef} title={C.project(name)}><span aria-hidden="true">{fit ?? shown}</span><span className="sr">{name}</span></span>}
        {stop && <button type="button" className="nc-stop" aria-label={stop.label} title={stop.title} onClick={onStop}><Icon name="stop" size={12} />{C.stop}</button>}
        {tucked && <button type="button" className="nc-ico nc-out" aria-label={S.m111.bringOut(who)} title={S.m111.bringOut(who)} onClick={() => void invoke("untuck").catch(() => {})}><Icon name="bringOut" size={14} /></button>}
        <button type="button" className="nc-ico" aria-label={C.settings} title={C.settings} onClick={onSettings}><Icon name="gear" size={14} /></button>
        <button type="button" className="nc-ico" aria-label={C.expand} title={C.expand} onClick={onExpand}><Icon name="expand" size={13} /></button>
        <button type="button" className="nc-ico" aria-label={C.close} title={C.close} onClick={onClose}><Icon name="close" size={14} /></button>
      </div>
      <div className="nc-news" ref={news} role="log" aria-label={C.history} data-few={bubbles.length <= 1 ? "" : undefined}>
        {when && <p className="nc-when"><b>{when.day}</b> {when.time}</p>}
        {bubbles.map((b) => b.go
          ? <button key={b.key} type="button" className="nc-b nc-them nc-go" onClick={() => onBubble(b.go!)}>{b.words}</button>
          : <p key={b.key} className={`nc-b ${b.who === "you" ? "nc-me" : "nc-them"}`}>{b.words}</p>)}
      </div>
      <div className="nc-bar">
        {talk.on && <button type="button" className="nc-mic" aria-label={talk.label} title={talk.title} onClick={onMic}><Icon name="mic" size={15} /></button>}
        <div className="nc-field">
          <textarea ref={boxRef} rows={1} autoComplete="off" spellCheck={false} placeholder={ask} aria-label={askFull} onKeyDown={onKeyDown} onInput={onInput} onFocus={onFocus} />
          <button type="button" className="nc-send" aria-label={C.send} title={C.send} disabled={working} onClick={onSend}><Icon name="send" size={14} /></button>
        </div>
      </div>
    </section>
  );
}
