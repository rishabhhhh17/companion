// How one explanation is scored, following RUBRIC.md: the rules checked in code here, and the parts a reader must judge
// (is it true of the change, is the marked answer right, could a non-engineer follow it) asked of a grader model.
import { parseExplain, type Explanation } from "../../runner/src/explain.ts";
import { countOutcomes, type CaseResult } from "../lib/results.ts";

const JARGON = ["variable", "function", "parameter", "argument", "undefined", "null", "boolean", "integer", "array", "string", "async", "await", "promise", "callback", "runtime", "compile", "syntax", "regex", "refactor", "dependency", "stack trace", "exception", "directive", "hook", "typeerror", "referenceerror"];
const FRAMEWORKS = /\b(Next|Node|Nuxt|Vue|Express|Three|Chart|Ember|Backbone)\.js\b/g;
const MAX_LINE = 160, MAX_WORDS = 30;

/** What makes a piece of text not plain, in plain words; empty when it is plain. */
export function plainProblems(text: string): string[] {
  const p: string[] = [];
  const t = text.replace(FRAMEWORKS, "$1");
  if (/`/.test(t)) p.push("it has code in backticks");
  if (/=>|===|!==|;|[{}]|\w\(\)/.test(t)) p.push("it has code characters");
  if (/\b[\w-]+\.(?:js|jsx|ts|tsx|mjs|cjs|json|py|css|html|sql|md|env|toml|ya?ml)\b/i.test(t)) p.push("it names a file name");
  if (/\b[a-z]+[A-Z][A-Za-z0-9]*\b/.test(t) || /\b[a-z][a-z0-9]*_[a-z0-9_]+\b/.test(t)) p.push("it uses a code style name");
  const lower = t.toLowerCase();
  for (const w of JARGON) if (new RegExp(`\\b${w}s?\\b`).test(lower)) p.push(`it uses the programming word "${w}"`);
  for (const s of t.split(/[.!?]+/)) if (s.trim().split(/\s+/).filter(Boolean).length > MAX_WORDS) { p.push("a sentence is too long"); break; }
  return p;
}

export type Rules = { parsed: boolean; twoLines: boolean; plain: boolean; question: boolean; problems: string[]; explanation: Explanation | null; lines: string[] };

/** The rules checked in code, on exactly what the fast model sent back (before the app trims it). */
export function ruleChecks(raw: string): Rules {
  const explanation = parseExplain(raw);
  let lines: string[] = [];
  try { const a = raw.indexOf("{"), b = raw.lastIndexOf("}"); const j = JSON.parse(raw.slice(a, b + 1)); if (Array.isArray(j?.why)) lines = j.why.filter((x: unknown): x is string => typeof x === "string"); } catch { lines = []; }
  if (!explanation) return { parsed: false, twoLines: false, plain: false, question: false, problems: ["No usable explanation came back."], explanation: null, lines };
  const problems: string[] = [];
  const twoLines = lines.length === 2 && lines.every((l) => l.trim().length > 0 && l.length <= MAX_LINE && !/\n/.test(l) && l.split(/[.!?]+\s/).filter((s) => s.trim()).length <= 2);
  if (!twoLines) problems.push(lines.length !== 2 ? `It has ${lines.length} lines, not two.` : "A line is too long, or more than two sentences.");
  const q = explanation.question;
  const question = !!q && /\?\s*$/.test(q.text);
  if (!question) problems.push(q ? "The question does not end with a question mark." : "There is no fair check question.");
  const words = [...explanation.bullets, ...(q ? [q.text, ...q.options] : [])];
  const plainList = [...new Set(words.flatMap(plainProblems))];
  for (const w of plainList) problems.push(`Not plain: ${w}.`);
  return { parsed: true, twoLines, plain: plainList.length === 0, question, problems, explanation, lines };
}

// ---------- the grader ----------

export type Grade = { correct: boolean; questionRight: boolean; plain: boolean; why: string };

/** What the grader model is asked: the rubric, the same change Explain was shown, and the explanation with its marked answer. */
export function gradeRequest(rubric: string, change: string, e: { why: string[]; question?: { text: string; options: string[]; correct: number } }): { system: string; text: string } {
  const q = e.question ? `\nThe check question: ${e.question.text}\n${e.question.options.map((o, i) => `- ${o}${i === e.question!.correct ? " (the marked answer)" : ""}`).join("\n")}` : "\nThere is no check question.";
  return {
    system: `You grade one explanation that a coding assistant wrote for a person who is not an engineer, after it changed their project. Use this rubric and nothing else.\n\n${rubric}\n\nReply with ONLY the JSON object the rubric shows.`,
    text: `What the explanation was written from:\n${change}\n\nThe explanation:\n${e.why.map((l, i) => `${i + 1}. ${l}`).join("\n")}${q}`,
  };
}

export function parseGrade(text: string): Grade | null {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let j: any;
  try { j = JSON.parse(text.slice(a, b + 1)); } catch { return null; }
  if (typeof j?.correct !== "boolean" || typeof j?.questionRight !== "boolean" || typeof j?.plain !== "boolean") return null;
  return { correct: j.correct, questionRight: j.questionRight, plain: j.plain, why: typeof j.why === "string" ? j.why.trim() : "" };
}

// ---------- the verdict ----------

export const OUTCOMES = ["pass", "fail", "no_explanation", "not_graded", "error", "not_started"] as const;

export function judge(r: Rules, g: Grade | null): { outcome: (typeof OUTCOMES)[number]; reasons: string[] } {
  if (!r.parsed) return { outcome: "no_explanation", reasons: r.problems };
  if (!g) return { outcome: "not_graded", reasons: ["The grader gave no usable grade."] };
  const reasons = [...r.problems];
  if (!g.correct) reasons.push(`The grader found it not true of the change: ${g.why}`);
  if (!g.questionRight) reasons.push(`The grader found the question unfair or its marked answer wrong: ${g.why}`);
  if (!g.plain) reasons.push(`The grader found it hard to follow: ${g.why}`);
  return { outcome: reasons.length ? "fail" : "pass", reasons };
}

const rate = (n: number, of: number) => (of ? n / of : null);

export function summarize(cases: CaseResult[]) {
  const scored = cases.filter((c) => c.outcome === "pass" || c.outcome === "fail");
  const part = (k: string) => rate(scored.filter((c) => c.detail?.[k] === true).length, scored.length);
  return {
    counts: countOutcomes(cases, [...OUTCOMES]),
    passRate: rate(cases.filter((c) => c.outcome === "pass").length, cases.filter((c) => c.outcome !== "not_started" && c.outcome !== "error").length),
    correct: part("correct"), plain: part("plain"), twoLines: part("twoLines"), question: part("question"),
    costUsd: Math.round(cases.reduce((s, c) => s + c.costUsd, 0) * 1e6) / 1e6,
  };
}

export function summaryLine(s: ReturnType<typeof summarize>): string {
  const pct = (x: number | null) => (x === null ? "none" : `${Math.round(x * 100)}%`);
  return `Passed ${pct(s.passRate)}. Correct ${pct(s.correct)}, plain ${pct(s.plain)}, two lines ${pct(s.twoLines)}, a fair question ${pct(s.question)}. ` +
    `No explanation ${s.counts.no_explanation}, not graded ${s.counts.not_graded}. Cost $${s.costUsd.toFixed(2)}.`;
}
