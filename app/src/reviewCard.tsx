// M52 (F30): the review card on Home's Now, for the changes another AI tool made in the open project. What this shows and
// when is decided in review.ts (tested in review.test.ts); this only draws it. The order follows the receipt: the rating
// first, in words and with its own drawing (never colour alone), then what changed in plain words, what it touches as small
// labels, why it got that rating (each with its file and line in mono), the project's own checks when they ran, and the
// files. Three presses: Fix it (a question first, which says a safety copy is kept and Undo puts it back), Copy for my AI
// (copies a ready message and says it is copied; nothing is ever typed into another app), and Looks fine (Skip this one
// before any review has run). The gel pill
// (the one glossy thing, beside Home's own main button) is kept for the final yes of Fix it.
import { useState, type ReactNode } from "react";
import { ConfirmStep } from "./confirm.tsx";
import { ChangesCard } from "./changesCard.tsx";
import { keyFiles } from "./changeRows.ts";
import { copyable } from "./copytext.ts";
import { Icon } from "./icons.tsx";
import { canFix, checksLook, keyWarned, ratingLook, sendBackCopy, silenceOffered, type ReviewCard } from "./review.ts";
import type { ReviewReasonKind } from "../../protocol/index.ts";
import { S } from "./strings.ts";
import { invoke } from "./tauri.ts";
import { ProofChip, Said } from "./ui/parts.tsx";
import { reviewHead, type ReviewHead } from "./reviewHead.ts";
import { CodePoint } from "./codePoint.tsx";
import { keepWords, readinessOf, shapeFindings, type Shaped } from "./findingShape.ts";
import { FindingList, LeadParts, ReadinessLine } from "./findingList.tsx";

export const REVIEW_ID = "home-review";
const FIX_ID = "home-review-fix";

type Props = {
  r: ReviewCard;
  onReview: (proof: boolean) => void; onDismiss: () => void;
  /** M69: Fix it on a key warning before any review: the review runs with checks, then Fix it's own question shows. */
  onReviewFix?: () => void;
  onAskFix: () => void; onFix: () => void; onCancelFix: () => void;
  /** M57 feature 7: Don't flag this kind here again, on a worth a look reason it may silence. */
  onSilence?: (kind: ReviewReasonKind) => void;
  /** M57 feature 1: Copy for my AI put its text on the clipboard (counted, and History says it was sent back). */
  onSentBack?: () => void;
  /** Home's top already says the rating in big words (homeHero.ts reviewLead), so the card leads with its one line only. */
  heroSays?: boolean;
  /** M71 part 2: the words Home's lead says as its headline over this card ("3 files changed in this project."), so the
   *  card never says the same words again under What changed. */
  heroHeadline?: string;
  /** M69: when the card leads Now (reviewHead.ts), the character drawn at its top right, and the id its headline takes as
   *  the page's title (Home's own hero steps aside then: card.tsx). */
  mark?: ReactNode; titleId?: string;
};

/** Send back to my AI: copies the engine's ready message (secrets hidden again) on a press, and says it is copied. The Mac
 *  side writes the clipboard (copy_text); the page's own clipboard is the fallback, only for text the Mac side would take. */
export function SendBack({ text, onCopied, label = S.review.sendBack }: { text: string; onCopied?: () => void; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  if (!text) return null;
  const copy = () => {
    setState("idle");
    const ok = copyable(text);
    if (ok === null) { setState("failed"); return; }
    void invoke("copy_text", { text: ok }).catch(() => navigator.clipboard?.writeText(ok) ?? Promise.reject(new Error("no clipboard")))
      .then(() => { setState("copied"); onCopied?.(); setTimeout(() => setState("idle"), 4000); }).catch(() => setState("failed"));
  };
  return <>
    <button className="btn" type="button" title={S.review.sendBackHelp} onClick={copy}><Icon name="copy" size={14} />{label}</button>
    <span className={state === "idle" ? "sr" : "line review-copied"} role="status">{state === "copied" ? S.review.copied : state === "failed" ? S.copyFailed : ""}</span>
  </>;
}

/** M58 shortlist 3: what a finding's row adds under its four parts: Don't flag this kind here again where review.ts
 *  silenceOffered allows it (never for a key, correction 4), and the line that says it was saved. */
function silenceExtra(r: ReviewCard, onSilence?: (kind: ReviewReasonKind) => void) {
  const reasons = r.result?.reasons ?? [];
  return (f: Shaped) => {
    const i = f.i;
    if (i < 0 || f.kind === "checks_unchecked" || !reasons[i]) return null;
    const kind = f.kind as ReviewReasonKind;
    return <>
      {onSilence && silenceOffered(r, i) && <button className="btn quiet" type="button" title={S.review.silenceHelp} onClick={() => onSilence(kind)}>{S.review.silence}</button>}
      {(r.silenced ?? []).includes(kind) && reasons.findIndex((y) => y.kind === kind) === i && <span className="line muted" role="status">{S.review.silenced}</span>}
    </>;
  };
}

export function ReviewCardView(p: Props) {
  const head = reviewHead(p.r);
  return head ? <ReviewLeadView {...p} head={head} /> : <ReviewPlainView {...p} />;
}

/** M69 step 2 (the YC benchmark spec 3.3): the card that leads Now when changes found something. The tag and the two tone
 *  headline (plain words before code), the place Squibby points at (file and line only, never its text), the presses in one
 *  key shape, the reassurance under them, and Why does this matter? opening the review's own words. The other findings
 *  follow as one line cards (Then, Fine); See opens the files. Nothing of the older card is dropped: it sits behind Why and
 *  See. */
function ReviewLeadView({ r, onReview, onReviewFix, onDismiss, onAskFix, onFix, onCancelFix, onSilence, onSentBack, mark, titleId, head }: Props & { head: ReviewHead }) {
  const res = r.result;
  const [open, setOpen] = useState<"why" | "files" | null>(null);
  const toggle = (k: "why" | "files") => setOpen((o) => (o === k ? null : k));
  const checks = res && res.checks ? checksLook(res.checks, res.rating, res.reasons.some((x) => x.kind === "secret_in_code")) : null;
  const whyId = `${REVIEW_ID}-more`;
  return (
    <>
      <section id={REVIEW_ID} tabIndex={-1} className="panel review rv-lead" data-stage={r.stage} data-rating={res?.rating} data-tone={head.tone} aria-labelledby={`${REVIEW_ID}-title`}>
        <div className="rv-head">
          <div className="rv-words">
            <p className="ui-status" data-tone={head.tone === "stop" ? "stop" : "needs"}><span className="ui-status-dot" aria-hidden="true" />{head.tag}</p>
            {/* The headline is the title; what it means is a paragraph at the card's width, not part of a 40 point heading. */}
            <h1 id={`${REVIEW_ID}-title`} className="rv-title"><span id={titleId}>{head.headline}</span></h1>
            {head.why && <p className="rv-why-line">{head.why}</p>}
          </div>
          {mark && <div className="rv-mark" aria-hidden="true">{mark}</div>}
        </div>
        {/* M58 shortlist 3: the readiness line, in words, under the headline that already has its own tag. */}
        <ReadinessLine r={readinessOf(r)} quiet />
        {res && <LeadParts f={shapeFindings(r)[0]} />}
        <div className="sr" role="status">{res ? S.review.arrived(S.review.rating[res.rating], head.headline) : ""}</div>
        {/* M69 step 3: the place, as the engine named it, with the line and the lines either side of it (masked by the engine
            and again by review.ts: a key keeps only its prefix). Without lines, the file and the line number only. */}
        {head.pointed && <CodePoint file={head.pointed.file} line={head.pointed.line} lines={head.pointed.lines} tone={head.tone} />}
        {/* m67 bug 14: a key warning before any review says when the changes were made, as the plain card does. */}
        {!res && r.away && <div className="line muted">{S.review.away[r.away]}</div>}
        {r.note && <div className="line" role="status">{r.note}</div>}
        {r.later && <div className="line muted" role="status">{S.review.later(r.later.count)}</div>}
        {/* m67 bug 12: Fix it on a key warning runs the review first; the card says it is running, as the plain card does. */}
        {r.stage === "reviewing" && <div className="line review-busy" role="status">{r.proof ? S.review.reviewingChecks : S.review.reviewing}</div>}
        {r.stage === "ready" && r.asked && <div className="line review-busy" role="status">{S.review.asked}</div>}
        {r.fix === "sent" && <div className="line review-busy" role="status">{S.review.fixSent}</div>}
        {/* M69 step 3: a key warning has the same three presses as the review that found a key (Fix it, Copy for my AI,
            Keep it anyway), even before the review ran: Fix it runs the review with checks first, then asks its own question.
            Review all the changes is a quiet link under them. */}
        {r.stage === "ready" && !r.asked && keyWarned(r) && (
          <>
            <div className="row result-actions rv-actions">
              {onReviewFix && <button id={FIX_ID} className="btn primary" type="button" onClick={onReviewFix}>{S.review.fix}</button>}
              <SendBack text={S.homeNow.keyCopy((r.keys ?? []).map((k) => S.review.at(k.file, k.line)).join("; "))} label={S.fixRun.copyForAi} />
              <button className="btn quiet" type="button" onClick={onDismiss}>{keepWords(r)}</button>
              <button className="btn quiet rv-whylink" type="button" onClick={() => onReview(true)}>{S.homeNow.reviewAll}</button>
            </div>
          </>
        )}
        {r.stage === "ready" && !r.asked && !keyWarned(r) && (
          <div className="row result-actions rv-actions">
            <button className="btn primary" type="button" onClick={() => onReview(true)}>{S.review.reviewNow}</button>
            <button className="btn" type="button" onClick={() => onReview(false)}>{S.review.quickLook}</button>
            <button className="btn" type="button" onClick={onDismiss}>{S.review.skipThis}</button>
          </div>
        )}
        {r.stage === "reviewed" && r.fix !== "sent" && (
          <div className="row result-actions rv-actions">
            {canFix(r) && r.fix !== "confirm" && <button id={FIX_ID} className="btn primary" type="button" onClick={onAskFix}>{S.review.fix}</button>}
            <SendBack text={sendBackCopy(r)} onCopied={onSentBack} />
            <button className="btn" type="button" onClick={onDismiss}>{res?.rating === "stop" ? keepWords(r) : S.review.looksFine}</button>
            <button className="btn quiet rv-whylink" type="button" aria-expanded={open === "why"} aria-controls={whyId} onClick={() => toggle("why")}>{S.homeNow.whyMatters}</button>
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
        {/* While the review runs, nothing waits on a press, so "Nothing changes until you press a button" is not said. */}
        {r.stage !== "reviewing" && <p className="rv-reassure">{r.stage === "ready" && keyWarned(r) ? S.homeNow.reassure : r.stage === "ready" ? (r.auto ? S.review.autoLine : S.review.askFirst) : head.reassure}</p>}
        {/* Why does this matter: the review's own words, its reasons (with Don't flag this kind here again only where
            review.ts silenceOffered allows it: never for a key, correction 4), and what it touches. */}
        <div id={whyId} className="rv-more" hidden={open !== "why"}>
          {/* M69 step 3: Why does this matter? says why first, in a fixed sentence for the kind. */}
          <div className="answer">
            <div className="answer-lead">{S.homeNow.whyTitle}</div>
            <p className="answer-words">{head.whyMore}</p>
          </div>
          {res && (
            <div className="answer">
              <div className="answer-lead">{S.review.whatChanged}</div>
              <p className="answer-words">{res.summary || S.review.lead(r.count)}</p>
              {r.away && <div className="line muted">{S.review.away[r.away]}</div>}
              {res.notes.map((n, i) => <div className="line muted" key={i}>{n}</div>)}
            </div>
          )}
          {/* M58 shortlist 3: every finding in its fixed shape, Must fix first (findingShape.ts). */}
          {res && <FindingList items={shapeFindings(r)} id={`${REVIEW_ID}-lead`} extra={silenceExtra(r, onSilence)} />}
          {keyWarned(r) && <div className="line muted">{S.review.keyWarningLine}</div>}
          {res?.hidden ? <div className="line muted">{S.review.hidden(res.hidden)}</div> : null}
          {res && res.touches.length > 0 && <ul className="review-touches-list" aria-label={S.review.touchesLabel}>{res.touches.map((t) => <li key={t} className="review-tag" data-touch={t}>{S.review.touches[t]}</li>)}</ul>}
          {res?.note && <div className="line muted">{res.note}</div>}
          {res?.ruleFiles && res.ruleFiles.length > 0 && <div className="line muted">{S.review.ruleFiles(res.ruleFiles.join(", "))}</div>}
        </div>
      </section>
      {/* The other findings, one line each with one quiet action; Fine opens the files. */}
      {head.others.length > 0 && (
        <ul className="rv-others" aria-label={S.review.whyLabel}>
          {head.others.map((f) => (
            <li key={f.id} className="panel rv-other" data-tag={f.tag}>
              <span className="ui-status" data-tone={f.tag === "then" ? "needs" : "proven"}>{f.tag === "then" ? S.homeNow.then : S.homeNow.fineTag}</span>
              <span className="rv-other-words"><span className="rv-other-title">{f.title}</span>{f.line && <span className="rv-other-line">{f.line}</span>}</span>
              <button className="btn quiet" type="button" aria-expanded={open === (f.act === "see" ? "files" : "why")} onClick={() => toggle(f.act === "see" ? "files" : "why")}>
                {open === (f.act === "see" ? "files" : "why") ? S.homeNow.hide : f.act === "see" ? S.homeNow.see : S.homeNow.look}
              </button>
            </li>
          ))}
        </ul>
      )}
      {/* The files: behind See on the Fine card, or with Why when there is no Fine card. */}
      <div className="panel rv-files" hidden={!(open === "files" || (open === "why" && !head.others.some((f) => f.act === "see")))}>
        {/* M69 step 3: "Tests passed. The key still needs fixing." is plain words, not a chip that looks like a field, and
            the checks' own note is not said a second time under it. */}
        {checks && (
          checks.kind === "plain"
            ? <p className="rv-checks-line">{checks.label}</p>
            : <div className="review-checks" role="group" aria-label={S.review.checksLabel}>
              {checks.kind === "notRun"
                ? <span className="ui-chip" data-kind="notRun"><span className="ui-chip-mark" aria-hidden="true"><Icon name="dash" size={12} /></span><span>{checks.label}</span></span>
                : <ProofChip kind={checks.kind} label={checks.label} />}
              {res?.checksNote && <span className="review-checks-note">{res.checksNote}</span>}
            </div>
        )}
        <ChangesCard changed={r.files} keys={keyFiles(r)} />
        {r.capped && <div className="line muted">{S.review.capped(r.files.length, r.count)}</div>}
        {r.secretFiles.length > 0 && <div className="line review-secret"><Icon name="lock" size={14} /><span>{S.review.secretFiles(r.secretFiles.join(", "))}</span></div>}
      </div>
    </>
  );
}

function ReviewPlainView({ r, onReview, onDismiss, onAskFix, onFix, onCancelFix, onSilence, onSentBack, heroSays = false, heroHeadline }: Props) {
  const res = r.result;
  const look = res ? ratingLook(res.rating) : null;
  const checks = res && res.checks ? checksLook(res.checks, res.rating, res.reasons.some((x) => x.kind === "secret_in_code")) : null;
  return (
    <section id={REVIEW_ID} tabIndex={-1} className="panel review" data-stage={r.stage} data-rating={res?.rating} aria-labelledby={`${REVIEW_ID}-title`}>
      {look && (
        <div className="result-verdict">
          {/* When Home's top already says the rating, the card says it once more only as its one line (the review, 2 Nov
              2026: Fix this first three times over). */}
          {heroSays
            ? <div className="ui-verdict review-rating" data-tone={look.tone}>
              <span className="ui-verdict-mark" aria-hidden="true"><Icon name={look.icon} size={20} /></span>
              <span className="ui-verdict-words">{look.line}</span>
            </div>
            : <div className="ui-verdict review-rating" data-size="card" data-tone={look.tone}>
              <span className="ui-verdict-mark" aria-hidden="true"><Icon name={look.icon} size={20} /></span>
              {/* The heading says the rating too (the audit, item 37), so its words here are for the eye only. */}
              <span className="ui-verdict-words" aria-hidden="true">{look.words}</span>
              <span className="ui-verdict-sub">{look.line}</span>
            </div>}
        </div>
      )}
      {/* M57 feature 5, the instant key warning: before any review ran, only the key check found a key on an added line. It
          leads the card as Fix this first, in words and with its own drawing, with where each key is (never its text). A quiet
          status, never an alert: no sound and no focus change (rules 9 and 12). */}
      {keyWarned(r) && (
        <div className="result-verdict review-keywarn">
          {/* When Home's top already says Fix this first, the card says only its line (as for a rating, heroSays). */}
          {heroSays
            ? <div className="ui-verdict review-rating" data-tone="bad" role="status">
              <span className="ui-verdict-mark" aria-hidden="true"><Icon name="halt" size={20} /></span>
              <span className="ui-verdict-words"><span className="sr">{S.review.rating.stop}: </span><Said text={S.review.keyMove} friendly={S.review.keyWarning} /></span>
            </div>
            : <div className="ui-verdict review-rating" data-size="card" data-tone="bad" role="status">
              <span className="ui-verdict-mark" aria-hidden="true"><Icon name="halt" size={20} /></span>
              <span className="ui-verdict-words">{S.review.rating.stop}</span>
              <span className="ui-verdict-sub">{S.review.keyWarning}</span>
            </div>}
          <ul className="review-reasons" aria-label={S.review.keyWarning}>
            {r.keys!.map((k) => <li key={`${k.file}:${k.line}`} data-kind="secret_in_code"><code className="review-at">{S.review.keyAt(k.file, k.line)}</code></li>)}
          </ul>
          <div className="line muted">{S.review.keyWarningLine}</div>
        </div>
      )}
      {/* M58 shortlist 3: the readiness line on top: Ready only when nothing was found and the checks passed. */}
      {res && <ReadinessLine r={readinessOf(r)} />}
      {/* Jumping by heading lands here and hears the rating with it (the audit, item 37); the rating's arrival is said once. */}
      {/* Once rated, the rating leads the card, so this heading is for VoiceOver only (the review, 2 Nov 2026: Changes to
          review sat over What changed). */}
      <h2 id={`${REVIEW_ID}-title`} className={look || heroSays ? "sr" : undefined}>{S.review.title}{look && <span className="sr">: {look.words}</span>}</h2>
      <div className="sr" role="status">{look ? S.review.arrived(look.words, look.line) : ""}</div>
      {/* Before a review, Home's top already says how much changed (M65 step 4: it was said three times), so the card goes
          straight to its presses and its list of files. */}
      {(res || !heroSays) && (res?.summary || S.review.lead(r.count)) !== heroHeadline && (
        <div className="answer">
          <div className="answer-lead">{S.review.whatChanged}</div>
          <p className="answer-words">{res?.summary || S.review.lead(r.count)}</p>
          {r.away && <div className="line muted">{S.review.away[r.away]}</div>}
          {res?.notes.map((n, i) => <div className="line muted" key={i}>{n}</div>)}
        </div>
      )}
      {/* The presses come right after what changed (the audit, item 13): in Home's 480 points a card of a thousand points
          never hides its buttons at its foot. The reasons, the checks and the files follow as the evidence. */}
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
            {/* Nothing was looked at yet, so closing it is skipping it, never a judgement (the audit, item 16). */}
            <button className="btn" type="button" onClick={onDismiss}>{S.review.skipThis}</button>
          </div>
        </>
      )}
      {r.stage === "reviewed" && r.fix !== "sent" && (
        <div className="row result-actions">
          {/* While its question is open, Fix it steps aside (the audit, item 7): the question has the keyboard, and Escape
              closes only it. It comes back, with the keyboard, when the question is answered or put away. */}
          {canFix(r) && r.fix !== "confirm" && <button id={FIX_ID} className="btn primary" type="button" onClick={onAskFix}><Icon name="wrench" size={14} />{S.review.fix}</button>}
          <SendBack text={sendBackCopy(r)} onCopied={onSentBack} />
          {/* On a stop it keeps the change as it is, so it says so, as a quiet text button (M65 step 4). */}
          <button className={res?.rating === "stop" ? "btn quiet" : "btn"} type="button" onClick={onDismiss}>{res?.rating === "stop" ? keepWords(r) : S.review.looksFine}</button>
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
      {/* Why comes straight after the presses (the review, 2 Nov 2026: in the wide Home the key written into pay.ts was
          below the fold, under What it touches). */}
      {/* M58 shortlist 3: every finding in its fixed shape, Must fix first, with checks that did not run as a thing to
          check (findingShape.ts). M57: one that no longer holds says so in words; Don't flag this kind here again only where
          review.ts silenceOffered allows it. */}
      {res && shapeFindings(r).length > 0 && (
        <div className="review-why">
          <span className="review-label">{S.review.whyLabel}</span>
          <FindingList items={shapeFindings(r)} id={`${REVIEW_ID}-why`} extra={silenceExtra(r, onSilence)} />
        </div>
      )}
      {res?.hidden ? <div className="line muted">{S.review.hidden(res.hidden)}</div> : null}
      {res && res.touches.length > 0 && (
        <div className="review-touches">
          <span className="review-label" id={`${REVIEW_ID}-touches`}>{S.review.touchesLabel}</span>
          <ul aria-labelledby={`${REVIEW_ID}-touches`}>{res.touches.map((t) => <li key={t} className="review-tag" data-touch={t}>{S.review.touches[t]}</li>)}</ul>
        </div>
      )}
      {checks && (
        <div className="review-checks" role="group" aria-label={S.review.checksLabel}>
          {checks.kind === "notRun"
            ? <span className="ui-chip" data-kind="notRun"><span className="ui-chip-mark" aria-hidden="true"><Icon name="dash" size={12} /></span><span>{checks.label}</span></span>
            : checks.kind === "plain"
            ? <span className="ui-chip" data-kind="plain"><span>{checks.label}</span></span>
            : <ProofChip kind={checks.kind} label={checks.label} />}
          {res?.checksNote && <span className="review-checks-note">{res.checksNote}</span>}
        </div>
      )}
      <ChangesCard changed={r.files} keys={keyFiles(r)} />
      {r.capped && <div className="line muted">{S.review.capped(r.files.length, r.count)}</div>}
      {r.secretFiles.length > 0 && <div className="line review-secret"><Icon name="lock" size={14} /><span>{S.review.secretFiles(r.secretFiles.join(", "))}</span></div>}
      {res?.note && <div className="line muted">{res.note}</div>}
      {res?.ruleFiles && res.ruleFiles.length > 0 && <div className="line muted">{S.review.ruleFiles(res.ruleFiles.join(", "))}</div>}
    </section>
  );
}
