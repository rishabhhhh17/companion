// M76 (the 6 Nov review, rank 5): the "Is this safe to go live?" report, one plain words page a freelancer can send a
// client. Built on the page from what Squibby already holds for the project: the last check of the work (its steps, commands
// and exit codes), the review's findings in the fixed shape (findingShape.ts), and the checks before going live (keys in the
// code, database access, the work checked). No model, no network, no file read.
// Rule 14: the answer is "Ready to go live" only when every check passed on this version and nothing is open that must or
// should be fixed; anything red is "Not ready"; anything not run is "Not fully checked", and every part that was not run is
// listed under "What was not checked". Rule 15: every line is hidden of keys first (the runner's own redact), and a line that
// still has a key's shape is left out. File names stay; file contents do not, except, when the person turned it on, the
// review's own short lines (already masked, three at most, 120 characters each). Rule 13: building it sends nothing; saving it
// is the person's tap on a save dialog (main.rs save_report).
import { hasKeyShape, redact } from "../../runner/src/redact.ts";
import { gatesReadiness, shapeFindings, type Level } from "./findingShape.ts";
import type { ProofState, ShipReport } from "./model.ts";
import { hexRgb, pdfDoc, type PdfBlock } from "./pdfText.ts";
import type { ReviewCard } from "./review.ts";
import { S } from "./strings.ts";

export type Mark = "ok" | "bad" | "unsure" | "skip" | "notNeeded" | Level;
export type ReportRow = { mark: Mark; head: string; lines: string[]; code?: string[] };
export type ReportSection = { id: "work" | "gates" | "review" | "notChecked"; title: string; rows: ReportRow[] };
export type Answer = "ready" | "notReady" | "notChecked";
export type ReportDoc = { title: string; project: string; date: string; day: string; answer: Answer; answerWords: string; answerLine: string; sections: ReportSection[]; about: string[] };
export type ReportInput = { project: string; when: Date; proof?: ProofState | null; review?: ReviewCard | null; ship?: ShipReport | null; codeLines?: boolean };
/** The report's colours, read from ui/tokens.css (--report-*) when it is saved, since a sent file cannot read that file. */
export type Palette = { paper: string; ink: string; muted: string; line: string; ok: string; bad: string; unsure: string; skip: string };
export const PALETTE_KEYS = ["paper", "ink", "muted", "line", "ok", "bad", "unsure", "skip"] as const;

const MAX_LINE = 400, MAX_CODE = 120;
const baseName = (p: string) => p.replace(/\/+$/, "").split("/").pop() || p;

/** One line as it may go in the report: the project's own folder said as its name, keys hidden, and nothing that still looks
 *  like a key. Null when it must be left out. */
export function cleanLine(text: string | undefined | null, project = ""): string | null {
  if (!text) return null;
  let t = String(text);
  if (project) t = t.split(project.replace(/\/+$/, "") + "/").join("").split(project.replace(/\/+$/, "")).join(baseName(project));
  // A hidden key is said in words: "(hidden)", and a key in brackets goes with its brackets.
  t = redact(t).replace(/\s*\(\[secret\]\)/g, "").replace(/\[secret\]/g, S.goLive.hidden).replace(/\s+/g, " ").trim();
  if (!t || hasKeyShape(t)) return null;
  return Array.from(t).length > MAX_LINE ? `${Array.from(t).slice(0, MAX_LINE - 1).join("")}…` : t;
}
const clean = (xs: (string | null | undefined)[], project: string) => xs.map((x) => cleanLine(x, project)).filter((x): x is string => !!x);

/** "6 November 2026", and "2026-11-06" for the file name. */
export function dateWords(d: Date): { long: string; day: string } {
  const long = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(d);
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { long, day };
}

/** The whole report, decided. Pure: the same input gives the same report. */
export function buildReport(i: ReportInput): ReportDoc {
  const G = S.goLive, project = i.project, name = baseName(project), { long, day } = dateWords(i.when);
  const notChecked: ReportRow[] = [];
  const skip = (line: string, more: string[] = []) => notChecked.push({ mark: "skip", head: line, lines: more });

  // The checks of the work.
  const work: ReportRow[] = [];
  const proof = i.proof && i.proof.verdict ? i.proof : null;
  if (!proof) skip(G.noProof);
  else {
    for (const s of proof.steps) {
      if (s.status === "running") continue;
      const runs = (s.runs ?? []).slice(0, 4).map((r) => G.ran(r.command, r.exit));
      const mark: Mark = s.status === "passed" ? "ok" : s.status === "failed" ? "bad" : "skip";
      const lines = clean([s.summary ?? s.detail, ...runs], project);
      work.push({ mark, head: cleanLine(s.label, project) ?? s.rung, lines });
      if (s.status === "skipped") skip(G.skipped(cleanLine(s.label, project) ?? s.rung), clean([s.detail], project));
    }
    if (proof.verdict === "nothing_to_check") skip(G.nothingToCheck);
    if (proof.verdict === "cancelled") skip(G.proofCancelled);
    if (!proof.steps.some((s) => s.rung === "browser")) skip(G.noBrowser);
  }

  // Before going live.
  const gates: ReportRow[] = [];
  const ship = i.ship && i.ship.gates?.length ? i.ship : null;
  if (!ship) skip(G.noGates);
  else for (const g of ship.gates) {
    const mark: Mark = g.status === "passed" ? "ok" : g.status === "blocked" ? "bad" : g.status === "could_not_check" ? "unsure" : "notNeeded";
    gates.push({ mark, head: cleanLine(g.label, project) ?? g.id, lines: clean([g.detail, ...(g.findings ?? []).slice(0, 3)], project) });
    if (g.status === "could_not_check") skip(G.gateUnsure(cleanLine(g.label, project) ?? g.id), clean([g.detail], project));
  }

  // What the review found, in the fixed shape (Must fix, Should fix, Worth a look).
  const review: ReportRow[] = [];
  const shaped = shapeFindings(i.review ?? null).filter((x) => !x.fixed);
  const reasons = i.review?.result?.reasons ?? [];
  for (const f of shaped) {
    const where = f.file ? G.at(f.file, f.line) : "";
    const code = i.codeLines && f.i >= 0 ? (reasons[f.i]?.lines ?? []).slice(0, 3).map((l) => cleanLine(`${l.n}  ${Array.from(l.text).slice(0, MAX_CODE).join("")}`, project)).filter((x): x is string => !!x) : [];
    review.push({ mark: f.level, head: cleanLine(f.parts.wrong, project) ?? "", lines: clean([where, f.parts.detail, f.parts.means, G.howFix(f.parts.how)], project), ...(code.length ? { code } : {}) });
  }
  if (proof?.privateOpen?.length) review.push({ mark: "look", head: G.privatePage(proof.privateOpen.slice(0, 5).join(", ")), lines: [] });
  const reviewed = !!i.review && (i.review.stage === "reviewed" || !!i.review.keys?.length);
  if (!review.length) review.push({ mark: reviewed ? "ok" : "skip", head: reviewed ? G.reviewNothing : G.noReview, lines: [] });

  // The answer. Red anywhere is Not ready; anything not run is Not fully checked; Ready only over all green.
  const open = shaped.filter((x) => x.level === "must" || x.level === "should");
  const red = (ship ? gatesReadiness(ship).kind === "notSafe" && ship.gates.some((g) => g.status === "blocked") : false)
    || proof?.verdict === "failed" || proof?.steps.some((s) => s.status === "failed") || shaped.some((x) => x.level === "must")
    || (i.review?.result?.rating === "stop" && i.review.stage === "reviewed");
  const allGreen = !!ship && gatesReadiness(ship).kind === "ready" && proof?.verdict === "passed" && open.length === 0 && notChecked.length === 0;
  const answer: Answer = red ? "notReady" : allGreen ? "ready" : "notChecked";

  const sections: ReportSection[] = [
    { id: "gates", title: G.sections.gates, rows: gates.length ? gates : [{ mark: "skip", head: G.noGates, lines: [] }] },
    { id: "work", title: G.sections.work, rows: work.length ? work : [{ mark: "skip", head: G.noProof, lines: [] }] },
    { id: "review", title: G.sections.review, rows: review },
    ...(notChecked.length ? [{ id: "notChecked" as const, title: G.sections.notChecked, rows: notChecked }] : []),
  ];
  return { title: G.title, project: name, date: long, day, answer, answerWords: G.answer[answer], answerLine: G.answerLine[answer], sections, about: [...G.about, G.made(long)] };
}

/** Every word of the report as one text, for the tests and for checking nothing secret is in it. */
export const reportText = (d: ReportDoc): string => [d.title, d.project, d.date, d.answerWords, d.answerLine, ...d.sections.flatMap((s) => [s.title, ...s.rows.flatMap((r) => [markWords(r.mark), r.head, ...r.lines, ...(r.code ?? [])])]), ...d.about].join("\n");

export const markWords = (m: Mark): string => S.goLive.mark[m];
const markColour = (m: Mark, p: Palette): string => (m === "ok" ? p.ok : m === "bad" || m === "must" ? p.bad : m === "unsure" || m === "should" ? p.unsure : p.skip);
const answerColour = (a: Answer, p: Palette) => (a === "ready" ? p.ok : a === "notReady" ? p.bad : p.unsure);

const h = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const hex = (s: string) => (/^#[0-9a-f]{6}$/i.test(s.trim()) ? s.trim() : "currentColor");

/** One self contained web page: inline styles only, no script, no link out, no picture from anywhere. Prints on one or two
 *  pages. */
export function reportHtml(d: ReportDoc, p: Palette): string {
  const c = Object.fromEntries(PALETTE_KEYS.map((k) => [k, hex(p[k])])) as Palette;
  const row = (r: ReportRow) => `<li class="row"><span class="mark" style="color:${markColour(r.mark, c)}">${h(markWords(r.mark))}</span><div><p class="head">${h(r.head)}</p>${r.lines.map((l) => `<p class="sub">${h(l)}</p>`).join("")}${r.code?.length ? `<pre>${r.code.map(h).join("\n")}</pre>` : ""}</div></li>`;
  const css = `*{box-sizing:border-box}html{color-scheme:light}body{margin:0;background:${c.paper};color:${c.ink};font:15px/1.5 -apple-system,BlinkMacSystemFont,"Helvetica Neue",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}`
    + `main{max-width:720px;margin:0 auto;padding:48px 28px 56px}h1{font-size:28px;line-height:1.2;margin:0 0 6px;letter-spacing:-.01em}.project{color:${c.muted};margin:0 0 28px}`
    + `.answer{border:1px solid ${c.line};border-left:4px solid ${answerColour(d.answer, c)};border-radius:10px;padding:16px 18px;margin:0 0 32px}.answer b{display:block;font-size:20px;color:${answerColour(d.answer, c)}}.answer p{margin:4px 0 0}`
    + `h2{font-size:16px;margin:28px 0 8px;padding-bottom:6px;border-bottom:1px solid ${c.line}}ul{list-style:none;margin:0;padding:0}.row{display:grid;grid-template-columns:104px 1fr;gap:12px;padding:10px 0;border-bottom:1px solid ${c.line}}`
    + `.mark{font-weight:600;font-size:13px;padding-top:1px}.head{margin:0;font-weight:600}.sub{margin:2px 0 0;color:${c.muted}}pre{margin:6px 0 0;padding:8px 10px;border:1px solid ${c.line};border-radius:6px;font:12px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap;word-break:break-all}`
    + `footer{margin-top:36px;color:${c.muted};font-size:13px}footer p{margin:2px 0}@media (max-width:520px){.row{grid-template-columns:1fr;gap:2px}main{padding:28px 16px}}@media print{main{padding:0}.row{break-inside:avoid}}`;
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light">`
    + `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${h(d.title)} ${h(d.project)}</title><style>${css}</style></head>`
    + `<body><main><h1>${h(d.title)}</h1><p class="project">${h(S.goLive.projectLine(d.project, d.date))}</p>`
    + `<section class="answer"><b>${h(d.answerWords)}</b><p>${h(d.answerLine)}</p></section>`
    + d.sections.map((s) => `<section><h2>${h(s.title)}</h2><ul>${s.rows.map(row).join("")}</ul></section>`).join("")
    + `<footer><h2>${h(S.goLive.sections.about)}</h2>${d.about.map((l) => `<p>${h(l)}</p>`).join("")}</footer></main></body></html>\n`;
}

/** The same report as a PDF (pdfText.ts, the PDF's own Helvetica). */
export function reportPdf(d: ReportDoc, p: Palette): Uint8Array {
  const blocks: PdfBlock[] = [
    { kind: "title", text: d.title },
    { kind: "muted", text: S.goLive.projectLine(d.project, d.date) },
    { kind: "gap" },
    { kind: "h", text: d.answerWords, color: hexRgb(answerColour(d.answer, p)) },
    { kind: "p", text: d.answerLine },
    ...d.sections.flatMap((s): PdfBlock[] => [{ kind: "h", text: s.title }, { kind: "rule" }, ...s.rows.map((r): PdfBlock => ({ kind: "row", mark: markWords(r.mark), markColor: hexRgb(markColour(r.mark, p)), text: r.head, sub: [...r.lines, ...(r.code ?? [])] }))]),
    { kind: "h", text: S.goLive.sections.about }, { kind: "rule" },
    ...d.about.map((l): PdfBlock => ({ kind: "small", text: l })),
  ];
  return pdfDoc(blocks, { ink: hexRgb(p.ink), muted: hexRgb(p.muted), line: hexRgb(p.line), title: `${d.title} ${d.project}`, more: S.goLive.pdfMore });
}

/** The file name offered in the save dialog: "mug-shop-go-live-report-2026-11-06.pdf". */
export function reportFileName(d: ReportDoc, ext: "html" | "pdf"): string {
  const slug = d.project.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "project";
  return S.goLive.fileName(slug, d.day, ext);
}

/** The palette from tokens.css as the page has it now (--report-*). */
export function readPalette(get: (name: string) => string): Palette {
  return Object.fromEntries(PALETTE_KEYS.map((k) => [k, longHex(get(`--report-${k}`))])) as Palette;
}
/** A three digit colour (the built stylesheet shortens colours) written out in six digits; a six digit one as it is; anything else empty. */
export function longHex(v: string): string {
  const t = v.trim();
  if (/^#[0-9a-f]{6}$/i.test(t)) return t;
  const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(t);
  return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}` : "";
}
