// Copy on replies and receipts: the text a Copy button puts on the clipboard, the same lines the card shows. Anything that
// looks like a key or a password is hidden again first (the clipboard can be read by every app), as on the card.
import { blockedNote, ehLines, slLines, formatUsd, receiptHeading, receiptVerdict, type About, type Explain, type Model, type RescueCard, type ResearchCard } from "./model.ts";
import { redact } from "../../runner/src/redact.ts";
import { S } from "./strings.ts";

/** The most a Copy button puts on the clipboard, in characters: the Mac side's own cap (share.rs MAX_COPY). */
export const MAX_COPY = 20_000;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/;

/** The text Copy may put on the clipboard, or null: the Mac side's own check (share.rs copyable), made on the page too, so
 *  the page's own clipboard, used only when the Mac side cannot be reached, never takes what the Mac side would refuse.
 *  Not empty, at most MAX_COPY characters, no control characters but new lines and tabs (a terminal control in model or
 *  test output is refused). Windows line ends become plain new lines first. */
export function copyable(text: string): string | null {
  const t = String(text ?? "").replace(/\r\n?/g, "\n");
  if (!t.trim() || Array.from(t).length > MAX_COPY || CONTROL.test(t)) return null;
  return t;
}

const lines = (l: (string | null | undefined | false)[]) => redact(l.filter((x): x is string => typeof x === "string" && x.length > 0).join("\n"));

/** The receipt as the card shows it: what changed, what cannot be undone, the proof, what was not done, commands and cost. */
export function receiptCopy(m: Model, project: string): string {
  const r = m.receipt;
  if (!r) return "";
  const changed = r.changed.length === 0 ? [S.nothingChanged] : r.changed.map((c) => `${(S as Record<string, unknown>)[c.kind] ?? c.kind}: ${c.file}`);
  return lines([
    receiptHeading(r), ...changed,
    r.notUndoable.length > 0 && `${S.cannotUndo}: ${r.notUndoable.join("; ")}`,
    // The result, as the verdict says it (M45), whether or not files changed.
    receiptVerdict(m)?.say,
    blockedNote(m, project),
    r.usdEstimate > 0 ? `${r.commands} ${S.commands} · ${S.cost}: ${formatUsd(r.usdEstimate)}` : `${r.commands} ${S.commands} · ${S.noCost}`,
  ]);
}

/** A research answer, its notes with where each came from, and where it was filed. */
export function researchCopy(r: ResearchCard): string {
  return lines([r.title, r.answer, r.notes.length > 0 && `${S.researchNotes}:`, ...r.notes.map((n) => `- ${n.text} (${n.source})`), r.file ? `${S.researchFiled} ${r.file}` : S.researchNotFiled]);
}

/** What Rescue found, as shown. */
export function rescueCopy(r: RescueCard): string {
  return lines([S.rescueTitle, r.summary, r.works.length > 0 && `${S.rescueWorks}: ${r.works.join("; ")}`, `${S.rescueBroken}: ${r.broken}`, r.evidence.length > 0 && `${S.rescueChecks}:`, ...r.evidence.map((e) => `${e.label}: ${e.status}${e.detail ? ` ${e.detail}` : ""}`)]);
}

/** An explained error: its sentences and where it is in the project. */
export function ehCopy(m: Model): string { return m.eh ? lines(ehLines(m)) : ""; }
/** Second Look's answer as text, with the address of each page it found. */
export function slCopy(m: Model): string { return m.sl ? lines([...slLines(m), ...(m.sl.items ?? []).flatMap((i) => (i.source ? [`${i.source.title}: ${i.source.url}`] : []))]) : ""; }

/** Why it was done: its points, and the question with its choices when there is one. */
export function explainCopy(e: Explain): string {
  return lines([S.explainTitle, ...e.bullets.map((b) => `- ${b}`), e.question && `${S.explainCheck}: ${e.question.text}`, ...(e.question?.options ?? []).map((o) => `- ${o}`)]);
}

/** Where you left off, as shown. */
export function recapCopy(r: { lines: string[] }): string { return lines([S.recapTitle, ...r.lines]); }

/** What the project is, as shown. */
export function aboutCopy(a: About): string { return lines([S.aboutTitle, a.about, ...a.notes]); }
