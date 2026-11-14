// M58 UI 6 and UI 13: the check before going live with its finish line, and the Sign in to Vercel step. What shows is
// decided in shipFinish.ts and findingShape.ts (tested there); this only draws it. Nothing here starts work by itself:
// Put it online, Fix it, Check again and Sign in to Vercel are the person's presses, and nothing runs on a timer.
import { useEffect, useState, type ReactNode } from "react";
import { gatesReadiness } from "./findingShape.ts";
import { ReadinessLine } from "./findingList.tsx";
import { gateAction, signInView, type Gate } from "./shipFinish.ts";
import type { ShipFlow } from "./model.ts";
import { S } from "./strings.ts";

const STATUS = { passed: "Passed", blocked: "Blocked", could_not_check: "Could not check", not_applicable: "Not needed" } as const;

type GatesProps = {
  ship: { gates: Gate[]; canShip: boolean };
  /** The one sentence: may this go on the internet? (model.ts shipWords) */
  words: string | null;
  /** Put it online is shown (shipFinish.ts putOnlineShown): every gate passed, outside a practice copy. */
  online: boolean;
  /** A practice copy: its own Fix it is on its own card, so the rows offer none here. */
  practice: boolean;
  onPutOnline: () => void; onFix: (g: Gate) => Promise<boolean>; onCheck: () => void; onConfirm: (id: string) => void; onClose: () => void;
  /** M76: Share report, the go live report built from these gates, the last check and the review. */
  share?: ReactNode;
  /** M87: Why is live broken?, the read only check of the live setup, on the person's press. */
  whyLive?: ReactNode;
};

/** The check before going live. Every gate passed: one main button, Put it online. A blocked gate: its own Fix it, which
 *  says Starting the fix at once and leaves the panel on screen until the task's first event takes its place. */
export function ShipGatesPanel({ ship, words, online, practice, onPutOnline, onFix, onCheck, onConfirm, onClose, share, whyLive }: GatesProps) {
  const [fixing, setFixing] = useState<string | null>(null);
  // A new report (the check ran again) starts with no fix asked; a refused fix gives its row back at once.
  useEffect(() => setFixing(null), [ship]);
  return (
    <section className={`panel ${ship.canShip ? "" : "amber"}`} aria-label={S.shipTitle}>
      <h2>{S.shipTitle}</h2>
      <ReadinessLine r={gatesReadiness(ship)} />
      {words && <div className="line"><b>{words}</b></div>}
      {ship.gates.map((g) => {
        const act = gateAction(g);
        return (
          <div key={g.id} className={`line ${g.status === "blocked" ? "blocked" : ""}`}>
            {g.label}: {STATUS[g.status]}
            <span className="muted"> {g.detail}</span>
            {act === "confirm" && <div className="row"><button className="btn" type="button" aria-label={`${S.shipConfirm}: ${g.label}`} onClick={() => onConfirm(g.id)}>{S.shipConfirm}</button></div>}
            {act === "fix" && !practice && (fixing === g.id
              ? <div className="line review-busy" role="status">{S.going.fixStarting}</div>
              : <div className="row"><button className="btn primary" type="button" aria-label={`${S.going.fix}: ${g.label}`} disabled={!!fixing} onClick={() => { setFixing(g.id); void onFix(g).then((ok) => { if (!ok) setFixing(null); }); }}>{S.going.fix}</button></div>)}
            {act === "check" && !practice && <div className="row"><button className="btn" type="button" aria-label={`${S.going.checkFirst}: ${g.label}`} onClick={onCheck}>{S.going.checkFirst}</button></div>}
          </div>
        );
      })}
      {online && (
        <div className="ship-finish">
          <div className="line muted">{S.going.putOnlineLine}</div>
          <div className="row"><button className="btn primary" type="button" onClick={onPutOnline}>{S.going.putOnline}</button></div>
        </div>
      )}
      <div className="row">{share}{whyLive}<button className="btn" type="button" onClick={onClose}>{S.shipClose}</button></div>
    </section>
  );
}

/** Sign in to Vercel, as a step the person starts: the one line first, then the button. Their press runs their own sign in
 *  (ship.signIn); when Vercel's own page is ready, its Open button opens it in their browser on their press (a link opens
 *  only from a button, card.tsx OpenButton). Done: Check again is their next press. Could not run here: the step by step
 *  lesson (lessons/vercel-sign-in.json). */
export function SignInStep({ f, onSignIn, onCheckAgain, onLesson, open }: { f: ShipFlow; onSignIn: () => void; onCheckAgain: () => void; onLesson: () => void; open: (url: string) => ReactNode }) {
  const v = signInView(f);
  if (v.show === "none") return null;
  return (
    <div className="ship-finish" role="group" aria-label={S.going.signIn}>
      {v.show === "ask" && <>
        <div className="line muted">{S.going.signInLine}</div>
        <div className="row"><button className="btn primary" type="button" onClick={onSignIn}>{S.going.signIn}</button></div>
      </>}
      {v.show === "busy" && <div className="line review-busy" role="status">{S.going.signInAsked}</div>}
      {v.show === "opened" && <>
        <div className="line" role="status">{S.going.signInOpened}</div>
        <div className="row">{open(v.url)}</div>
      </>}
      {v.show === "done" && <>
        <div className="line" role="status">{S.going.signInDone}</div>
        <div className="row"><button className="btn primary" type="button" onClick={onCheckAgain}>{S.going.checkAgain}</button></div>
      </>}
      {v.show === "failed" && <>
        {v.reason && <div className="line" role="status">{v.reason}</div>}
        <div className="row">
          <button className="btn primary" type="button" onClick={onSignIn}>{S.going.tryAgain}</button>
          {v.lesson && <button className="btn" type="button" data-lesson="vercel-sign-in" onClick={onLesson}>{S.going.showSteps}</button>}
        </div>
      </>}
    </div>
  );
}
