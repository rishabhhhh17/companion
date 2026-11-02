// M52 (F30): the review card on Home's Now, for the changes another AI tool made in the open project. What this shows and
// when is decided in review.ts (tested in review.test.ts); this only draws it. The order follows the receipt: the rating
// first, in words and with its own drawing (never colour alone), then what changed in plain words, what it touches as small
// labels, why it got that rating (each with its file and line in mono), the project's own checks when they ran, and the
// files. Three presses: Fix it (a question first, which says a safety copy is kept and Undo puts it back), Send back to my
// AI (copies a ready message and says it is copied; nothing is ever typed into another app), and Looks fine. The gel pill
// (the one glossy thing, beside Home's own main button) is kept for the final yes of Fix it.
import { useState } from "react";
import { ConfirmStep } from "./confirm.tsx";
import { ChangesCard } from "./changesCard.tsx";
import { copyable } from "./copytext.ts";
import { Icon } from "./icons.tsx";
import { formatUsd } from "./model.ts";
import { canFix, checksLook, ratingLook, sendBackCopy, type ReviewCard } from "./review.ts";
import { S } from "./strings.ts";
import { invoke } from "./tauri.ts";
import { ProofChip } from "./ui/parts.tsx";

export const REVIEW_ID = "home-review";
const FIX_ID = "home-review-fix";

type Props = {
  r: ReviewCard;
  onReview: (proof: boolean) => void; onDismiss: () => void;
  onAskFix: () => void; onFix: () => void; onCancelFix: () => void;
};

/** Send back to my AI: copies the engine's ready message (secrets hidden again) on a press, and says it is copied. The Mac
 *  side writes the clipboard (copy_text); the page's own clipboard is the fallback, only for text the Mac side would take. */
function SendBack({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  if (!text) return null;
  const copy = () => {
    setState("idle");
    const ok = copyable(text);
    if (ok === null) { setState("failed"); return; }
    void invoke("copy_text", { text: ok }).catch(() => navigator.clipboard?.writeText(ok) ?? Promise.reject(new Error("no clipboard")))
      .then(() => { setState("copied"); setTimeout(() => setState("idle"), 4000); }).catch(() => setState("failed"));
  };
  return <>
    <button className="btn" type="button" title={S.review.sendBackHelp} onClick={copy}><Icon name="send" size={14} />{S.review.sendBack}</button>
    <span className={state === "idle" ? "sr" : "line review-copied"} role="status">{state === "copied" ? S.review.copied : state === "failed" ? S.copyFailed : ""}</span>
  </>;
}

export function ReviewCardView({ r, onReview, onDismiss, onAskFix, onFix, onCancelFix }: Props) {
  const res = r.result;
  const look = res ? ratingLook(res.rating) : null;
  const checks = res && res.checks ? checksLook(res.checks) : null;
  return (
    <section id={REVIEW_ID} tabIndex={-1} className="panel review" data-stage={r.stage} data-rating={res?.rating} aria-labelledby={`${REVIEW_ID}-title`}>
      {look && (
        <div className="result-verdict">
          <div className="ui-verdict review-rating" data-size="card" data-tone={look.tone}>
            <span className="ui-verdict-mark" aria-hidden="true"><Icon name={look.icon} size={20} /></span>
            <span className="ui-verdict-words">{look.words}</span>
            <span className="ui-verdict-sub">{look.line}</span>
          </div>
        </div>
      )}
      <h2 id={`${REVIEW_ID}-title`}>{S.review.title}</h2>
      <div className="answer">
        <div className="answer-lead">{S.review.whatChanged}</div>
        <p className="answer-words">{res?.summary || S.review.lead(r.count)}</p>
        {res?.notes.map((n, i) => <div className="line muted" key={i}>{n}</div>)}
      </div>
      {res && res.touches.length > 0 && (
        <div className="review-touches">
          <span className="review-label" id={`${REVIEW_ID}-touches`}>{S.review.touchesLabel}</span>
          <ul aria-labelledby={`${REVIEW_ID}-touches`}>{res.touches.map((t) => <li key={t} className="review-tag" data-touch={t}>{S.review.touches[t]}</li>)}</ul>
        </div>
      )}
      {res && res.reasons.length > 0 && (
        <div className="review-why">
          <span className="review-label" id={`${REVIEW_ID}-why`}>{S.review.whyLabel}</span>
          <ul className="review-reasons" aria-labelledby={`${REVIEW_ID}-why`}>
            {res.reasons.map((x, i) => <li key={i} data-kind={x.kind}><span>{x.say}</span>{x.file && <code className="review-at">{S.review.at(x.file, x.line)}</code>}</li>)}
          </ul>
        </div>
      )}
      {checks && (
        <div className="review-checks" role="group" aria-label={S.review.checksLabel}>
          {checks.kind === "notRun"
            ? <span className="ui-chip" data-kind="notRun"><span className="ui-chip-mark" aria-hidden="true"><Icon name="dash" size={12} /></span><span>{checks.label}</span></span>
            : <ProofChip kind={checks.kind} label={checks.label} />}
          {res?.checksNote && <span className="review-checks-note">{res.checksNote}</span>}
        </div>
      )}
      <ChangesCard changed={r.files} />
      {r.capped && <div className="line muted">{S.review.capped(r.files.length, r.count)}</div>}
      {r.secretFiles.length > 0 && <div className="line review-secret"><Icon name="lock" size={14} /><span>{S.review.secretFiles(r.secretFiles.join(", "))}</span></div>}
      {res?.note && <div className="line muted">{res.note}</div>}
      {res && <ul className="facts"><li>{res.usdEstimate > 0 ? S.review.cost(formatUsd(res.usdEstimate)) : S.review.noCost}</li></ul>}
      {r.note && <div className="line" role="status">{r.note}</div>}
      {r.later && <div className="line muted" role="status">{S.review.later(r.later.count)}</div>}
      {r.stage === "reviewing" && <div className="line review-busy" role="status">{r.proof ? S.review.reviewingChecks : S.review.reviewing}</div>}
      {r.stage === "ready" && r.asked && <div className="line review-busy" role="status">{S.review.asked}</div>}
      {r.fix === "sent" && <div className="line review-busy" role="status">{S.review.fixSent}</div>}
      {r.stage === "ready" && !r.asked && (
        <>
          <div className="line muted">{r.auto ? S.review.autoLine : S.review.askFirst}</div>
          <div className="row result-actions">
            <button className="btn primary" type="button" onClick={() => onReview(true)}>{S.review.reviewNow}</button>
            <button className="btn quiet" type="button" onClick={() => onReview(false)}>{S.review.quickLook}</button>
            <button className="btn" type="button" onClick={onDismiss}>{S.review.looksFine}</button>
          </div>
        </>
      )}
      {r.stage === "reviewed" && r.fix !== "sent" && (
        <div className="row result-actions">
          {canFix(r) && <button id={FIX_ID} className={r.fix === "confirm" ? "btn" : "btn primary"} type="button" aria-expanded={r.fix === "confirm"} onClick={onAskFix}><Icon name="wrench" size={14} />{S.review.fix}</button>}
          <SendBack text={sendBackCopy(r)} />
          <button className="btn" type="button" onClick={onDismiss}>{S.review.looksFine}</button>
        </div>
      )}
      {r.fix === "confirm" && (
        <ConfirmStep className="line" label={S.review.fixSure} back={FIX_ID} onCancel={onCancelFix}>
          <div>{S.review.fixSure}</div>
          <div className="row">
            <button className="btn primary gel" type="button" onClick={onFix}>{S.review.fixYes}</button>
            <button className="btn" type="button" data-cancel onClick={onCancelFix}>{S.review.fixNo}</button>
          </div>
        </ConfirmStep>
      )}
    </section>
  );
}
