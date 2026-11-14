// M88 (b), Share what my AI did: one self contained web page from a History row (a task) or from This week, made on the
// page from what Squibby already holds. No server, no upload, no model, no file read. The research's feature 8
// (synthesis.md section 3, yc-companies.md: "a shareable what my AI did today page, which is also a marketing loop").
// What goes in: the plain words summary, the proof result in words, the proof picture when the receipt on Home is this
// task's (the hidden browser's picture of the app being built, never the screen), and counts. What never goes in: file
// contents, keys (hidden with the runner's own redact, and a line that still looks like a key is left out), file names and
// folder paths (any word that is a path is hidden), decisions and house rules (words), and anything but the project's name.
// The person sees the preview first; Save is their tap on the Mac's own save dialog (shell_tools.rs save_receipt, which
// checks the page again). Every word is in strings.ts; the colours are read from ui/tokens.css (--report-*) on Save.
import type { WeekView } from "../../protocol/index.ts";
import { cleanLine, type Palette, PALETTE_KEYS } from "./goLiveReport.ts";
import type { HistoryItem } from "./model.ts";
import { dayWords } from "./plan.ts";
import { S } from "./strings.ts";
import { weekPage } from "./weekSummary.ts";
import { dayOf, numbersOf, numbersRows } from "./yourNumbers.ts";

export type ProofTone = "ok" | "bad" | "unsure" | "skip";
export type ShareDoc = {
  kind: "task" | "week"; title: string; project: string; day: string; dateWords: string;
  summary: string[]; proof: { words: string; tone: ProofTone } | null; shot?: string; counts: { label: string; value: string }[];
};

/** The project's own name: the last folder only, never where it lives. */
export const projectName = (project: string): string => project.replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean).at(-1) ?? "";

/** A word that is a path (has a slash, or starts at a home folder or a drive) is hidden: a file name in a folder, a folder
 *  of this Mac, a link. */
const PATHY = /^[("'`[]*(?:~|[A-Za-z]:\\|[^\s]*[\\/][^\s]*)/;
/** One line as it may go in the file: the project's folder said as its name, keys hidden (goLiveReport.ts cleanLine), every
 *  path hidden, and null when nothing is left or it still looks like a key. */
export function shareLine(text: string | null | undefined, project: string): string | null {
  const t = cleanLine(text, project);
  if (!t) return null;
  const hidden = S.m88.share.hidden;
  // Paths side by side are said as one hidden mark: a word is skipped when the word before it was already hidden.
  const words = t.split(/\s+/).map((w) => (PATHY.test(w) ? hidden : w)).filter((w, i, a) => !(w === hidden && a[i - 1] === hidden));
  const out = words.join(" ").trim();
  return out && out !== hidden ? out : null;
}

const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
/** The proof picture as it may go in: a JPEG's base64 of a sensible size, or nothing. */
export const shotOk = (b64: string | undefined): string | undefined => (b64 && b64.length <= 6_000_000 && B64.test(b64) && b64.startsWith("/9j/") ? b64 : undefined);

const PROOF_TONE: Record<"passed" | "partial" | "failed" | "skipped" | "none", ProofTone> = { passed: "ok", partial: "unsure", failed: "bad", skipped: "skip", none: "skip" };
const dateOf = (now: Date) => dayWords(dayOf(now.toISOString()));

/** A History row (a task): its name in plain words, how many files changed, whether it was put back, and its proof. */
export function shareFromTask(h: HistoryItem, project: string, now: Date, shot?: string): ShareDoc {
  const s = S.m88.share, name = projectName(project);
  const proofKey = (["passed", "partial", "failed", "skipped"] as const).find((p) => p === h.proof) ?? "none";
  const summary = [
    shareLine(h.label, project),
    (h.changed ?? 0) > 0 ? s.filesChanged(h.changed ?? 0) : null,
    h.undone ? s.undone : null,
  ].filter((x): x is string => !!x);
  const pic = shotOk(shot);
  return { kind: "task", title: s.head, project: name, day: dayOf(now.toISOString()), dateWords: dateOf(now), summary, proof: { words: s.proof[proofKey], tone: PROOF_TONE[proofKey] }, ...(pic ? { shot: pic } : {}), counts: [] };
}

/** The counts the week's sentences do not already say, so each count is said once on the page. */
const WEEK_TABLE_ONLY = new Set(["jobs", "tools", "days"]);
/** This week: the week's plain lines and what was caught (never the decisions: those are words), then a table of only the
 *  counts those sentences do not say (jobs handed, AI tools connected, days used). Each count is said once. */
export function shareFromWeek(w: WeekView, project: string, tools: number | null, now: Date): ShareDoc {
  const p = weekPage(w), name = projectName(project);
  const summary = p.empty ? [S.m79.week.empty] : [...p.lines, ...p.caught.map((c) => `${c}.`)];
  return { kind: "week", title: S.m88.share.weekHead, project: name, day: dayOf(now.toISOString()), dateWords: p.range, summary, proof: null, counts: numbersRows(numbersOf(w, tools)).filter((r) => WEEK_TABLE_ONLY.has(r.id) && r.value !== S.m88.numbers.notCounted).map((r) => ({ label: r.label, value: r.value })) };
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
/** A colour from the tokens, or inherit when the stylesheet could not be read (never a colour written here). */
const hex = (c: string) => (/^#[0-9a-fA-F]{6}$/.test(c) ? c : "inherit");
const toneColour = (t: ProofTone, c: Palette) => (t === "ok" ? c.ok : t === "bad" ? c.bad : t === "unsure" ? c.unsure : c.skip);
/** The meta lines the shell allows, exactly (receiptfile.rs). */
export const RECEIPT_META = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">`;

/** The file: one web page, styles inside it, the picture inside it, nothing that runs or loads. */
export function receiptHtml(d: ShareDoc, p: Palette): string {
  const c = Object.fromEntries(PALETTE_KEYS.map((k) => [k, hex(p[k])])) as Palette, s = S.m88.share;
  const css = `*{box-sizing:border-box}html{color-scheme:light}body{margin:0;background:${c.paper};color:${c.ink};font:16px/1.55 -apple-system,BlinkMacSystemFont,"Helvetica Neue",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}`
    + `main{max-width:680px;margin:0 auto;padding:48px 28px 56px}h1{font-size:28px;line-height:1.2;margin:0 0 6px;letter-spacing:-.01em}.project{color:${c.muted};margin:0 0 28px}`
    + `.summary p{margin:0 0 6px}h2{font-size:15px;margin:28px 0 8px;padding-bottom:6px;border-bottom:1px solid ${c.line}}`
    + `.proof{border:1px solid ${c.line};border-radius:10px;padding:14px 16px;font-weight:600}`
    + `figure{margin:20px 0 0}figure img{display:block;width:100%;height:auto;border:1px solid ${c.line};border-radius:8px}figcaption{color:${c.muted};font-size:13px;margin-top:6px}`
    + `table{width:100%;border-collapse:collapse}td{padding:7px 0;border-bottom:1px solid ${c.line}}td.n{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}`
    + `footer{margin-top:36px;color:${c.muted};font-size:13px}@media (max-width:520px){main{padding:28px 16px}}`;
  const proof = d.proof ? `<section><h2>${esc(s.proofTitle)}</h2><p class="proof" style="border-left:4px solid ${toneColour(d.proof.tone, c)};color:${toneColour(d.proof.tone, c)}">${esc(d.proof.words)}</p></section>` : "";
  const shot = d.shot ? `<figure><img src="data:image/jpeg;base64,${d.shot}" alt="${esc(s.shotAlt)}"><figcaption>${esc(s.shotCaption)}</figcaption></figure>` : "";
  const counts = d.counts.length ? `<section><h2>${esc(s.countsTitle)}</h2><table>${d.counts.map((r) => `<tr><td>${esc(r.label)}</td><td class="n">${esc(r.value)}</td></tr>`).join("")}</table></section>` : "";
  const projectLine = d.project ? s.projectLine(d.project, d.dateWords) : d.dateWords;
  return `<!doctype html>\n<html lang="en"><head>${RECEIPT_META}<title>${esc(d.title)}${d.project ? ` ${esc(d.project)}` : ""}</title><style>${css}</style></head>`
    + `<body><main><h1>${esc(d.title)}</h1><p class="project">${esc(projectLine)}</p>`
    + `<section class="summary">${d.summary.map((l) => `<p>${esc(l)}</p>`).join("")}</section>${proof}${shot}${counts}`
    + `<footer><p>${esc(s.foot)}</p></footer></main></body></html>\n`;
}

/** The file name offered in the save dialog (the shell makes it plain again). */
export const receiptFileName = (d: ShareDoc): string => S.m88.share.fileName(d.project.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40), d.day);
