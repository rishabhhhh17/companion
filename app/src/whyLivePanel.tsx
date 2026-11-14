// M87: Why is live broken?, drawn. Each of the four parts with how it went, one plain line and its next step; the live
// address box when the pages part needs one; Check again, Copy for my AI and Close. What shows is decided in whyLive.ts
// (tested there); this only draws it. Nothing here runs by itself: every check is the person's press.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { addressOk, needsAddress, partViews, whyLiveHeadline, type WhyLive } from "./whyLive.ts";
import { S } from "./strings.ts";
import { reducedMotion } from "./motion.ts";

export function WhyLivePanel({ w, copy, onAgain, onClose }: { w: WhyLive; copy: ReactNode; onAgain: (url?: string) => void; onClose: () => void }) {
  const head = useRef<HTMLHeadingElement>(null);
  const box = useRef<HTMLElement>(null);
  // M87 review: after the press, the panel is brought into view and its heading takes the focus inside Home, so the person
  // sees where the answer is (it opens right below the button they pressed).
  useEffect(() => {
    if (w.stage !== "asked") return;
    const h = head.current;
    if (!h) return;
    h.focus({ preventScroll: true });
    // The whole panel's start, after this paint, so its heading is never left under the ask box at the bottom.
    const id = setTimeout(() => { try { box.current?.scrollIntoView?.({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" }); } catch { /* an older WebKit */ } }, 0);
    return () => clearTimeout(id);
  }, [w.stage]);
  const [typed, setTyped] = useState("");
  const [bad, setBad] = useState(false);
  const inputId = useId();
  const busy = w.stage === "asked" || w.stage === "running";
  const views = partViews(w);
  const broken = views.some((v) => v.state === "problem");
  const title = w.from === "gates" ? S.whyLive.titleBefore : S.whyLive.title;
  const check = () => { const u = addressOk(typed); if (!u) { setBad(true); return; } setBad(false); onAgain(u); };
  return (
    <section ref={box} className={`panel ${broken ? "amber" : ""}`} aria-label={title} aria-busy={busy}>
      <h2 ref={head} tabIndex={-1}>{title}</h2>
      <div className={`line${busy ? " review-busy" : ""}`} role="status"><b>{whyLiveHeadline(w)}</b></div>
      {views.map((v) => (
        <div key={v.id} data-part={v.id} data-state={v.state}>
          {/* Only the part's name and mark take the broken colour; its next step reads as plain words. */}
          <div className={`line${v.state === "problem" ? " blocked" : ""}`}>
            {v.title}: {v.mark}
            {v.line && <span className="muted"> {v.line}</span>}
          </div>
          {v.where?.map((x) => <div key={x} className="line muted">{x}</div>)}
          {v.next && <div className="line">{S.whyLive.next(v.next)}</div>}
        </div>
      ))}
      {needsAddress(w) && (
        <div className="row">
          <label htmlFor={inputId} className="line">{S.whyLive.addressLabel}</label>
          <input id={inputId} aria-label={S.whyLive.addressLabel} type="text" inputMode="url" autoComplete="off" spellCheck={false} placeholder={S.whyLive.addressHint} value={typed}
            aria-invalid={bad} onChange={(e) => { setTyped(e.target.value); setBad(false); }} onKeyDown={(e) => { if (e.key === "Enter") check(); }} />
          <button className="btn" type="button" onClick={check}>{S.whyLive.addressCheck}</button>
          {bad && <div className="line" role="alert">{S.whyLive.addressBad}</div>}
        </div>
      )}
      <div className="row">
        {!busy && <button className="btn" type="button" onClick={() => onAgain(w.liveUrl)}>{S.whyLive.again}</button>}
        {!busy && copy}
        {/* Close is always offered, even while it runs: a late answer is ignored once the panel is closed. */}
        <button className="btn" type="button" onClick={onClose}>{S.whyLive.close}</button>
      </div>
    </section>
  );
}
