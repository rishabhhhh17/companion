// M75 (the inspiration shortlist, item 10): tappable choices when an ask is vague. "Make it better", "fix it" or "clean this
// up" in the ask box gets two to four choices built from what the page already knows about the project (a failing check,
// the open review's lead finding, changes waiting for review, the page itself) before anything runs. Nothing runs until a
// choice is tapped (rule 13), and "Do it as I typed it" is always one of them. Typing more words still works: words that are
// no longer vague run as before. Vague is a small rule, no model: a wrong "vague" costs one tap, never a wrong change.
// Tested in vagueAsk.test.ts; card.tsx draws the choices under the ask box.
import { S } from "./strings.ts";

/** General verbs that say "do something" without saying what. */
const VERBS = new Set(["make", "fix", "clean", "improve", "tidy", "sort", "polish", "help", "update", "redo", "change", "do", "work", "repair", "refactor", "finish", "neaten", "optimise", "optimize", "enhance"]);
/** Words that point at nothing in particular. */
const FILLER = new Set([
  "it", "its", "this", "that", "these", "those", "up", "out", "the", "a", "an", "my", "our", "your", "app", "page", "site", "website", "code", "project", "thing", "things", "stuff",
  "please", "pls", "can", "could", "would", "you", "just", "bit", "little", "more", "everything", "all", "better", "nicer", "good", "great", "again", "now", "for", "me", "us",
  "work", "properly", "somehow", "some", "whole", "lot", "and", "of", "to", "look", "looks", "go", "get", "make", "with", "ok", "okay", "right", "is", "be", "should", "actually",
]);
export const MAX_VAGUE_WORDS = 7;

/** Whether an ask says too little to act on: at most MAX_VAGUE_WORDS words, every one a general verb or a filler word, with
 *  at least one verb, and no file name, number, quote, path or code in it. */
export function isVague(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t || /[0-9"`/\\<>{}=_]/.test(t) || /\w\.[a-z]{1,5}\b/i.test(t)) return false;
  const words = t.toLowerCase().replace(/[’']/g, "").replace(/[.,!?;:()-]+/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length || words.length > MAX_VAGUE_WORDS) return false;
  if (!words.some((w) => VERBS.has(w))) return false;
  return words.every((w) => VERBS.has(w) || FILLER.has(w));
}

/** What the page knows about the project, from the model (card.tsx vagueState). Words are already plain and secret free. */
export type VagueState = {
  /** The check that failed last, by its name ("The tests"), when it is still failing. */
  failing?: string | null;
  /** The open review's lead finding, its headline. */
  finding?: string | null;
  /** Changed files waiting for a review. */
  changes?: number;
  /** The project has a page the browser check opens. */
  hasPage?: boolean;
};
export type VagueChoice =
  | { id: string; kind: "task"; words: string; prompt: string }
  | { id: string; kind: "check" | "review"; words: string }
  | { id: "asTyped"; kind: "asTyped"; words: string; prompt: string };

const kindOf = (text: string): "fix" | "clean" | "better" => {
  const w = text.toLowerCase();
  if (/\b(fix|repair|work|help)\b/.test(w)) return "fix";
  if (/\b(clean|tidy|neaten|refactor|sort)\b/.test(w)) return "clean";
  return "better";
};

/** Two to four choices from the real state, the ones that fit the words first, then Do it as I typed it. */
export function vagueChoices(text: string, st: VagueState): VagueChoice[] {
  const V = S.vague;
  const fixFailing: VagueChoice | null = st.failing ? { id: "failing", kind: "task", words: V.fixFailing(st.failing), prompt: V.fixFailingPrompt(st.failing) } : null;
  const fixFinding: VagueChoice | null = st.finding ? { id: "finding", kind: "task", words: V.fixFinding(st.finding), prompt: V.fixFindingPrompt(st.finding) } : null;
  const review: VagueChoice | null = st.changes && st.changes > 0 ? { id: "review", kind: "review", words: V.reviewChanges(st.changes) } : null;
  const look: VagueChoice | null = st.hasPage ? { id: "look", kind: "task", words: V.cleanerLook, prompt: V.cleanerLookPrompt } : null;
  const fast: VagueChoice | null = st.hasPage ? { id: "fast", kind: "task", words: V.faster, prompt: V.fasterPrompt } : null;
  const tidy: VagueChoice = { id: "tidy", kind: "task", words: V.tidy, prompt: V.tidyPrompt };
  const check: VagueChoice = { id: "check", kind: "check", words: V.check };
  const order: (VagueChoice | null)[] =
    kindOf(text) === "fix" ? [fixFailing, fixFinding, review, check, tidy]
    : kindOf(text) === "clean" ? [tidy, fixFinding, fixFailing, review, look]
    : [look, fast, fixFailing, fixFinding, review, tidy];
  const picked = order.filter((c): c is VagueChoice => !!c).filter((c, i, all) => all.findIndex((x) => x.id === c.id) === i).slice(0, 3);
  // Never fewer than two real choices: the check and tidying are always possible.
  for (const extra of [check, tidy]) if (picked.length < 2 && !picked.some((c) => c.id === extra.id)) picked.push(extra);
  return [...picked, { id: "asTyped", kind: "asTyped", words: V.asTyped, prompt: text.trim() }];
}

type StateModel = {
  task: { project?: string; proof?: { verdict?: string; steps: { rung: string; label: string; status: string }[] } } | null;
  review?: { project: string; stage: string; count: number; result: { reasons: { kind: string }[] } | null } | null;
};
/** What the page knows, from the model, for the project on screen only. Fixed words only (no file text, no model words). */
export function vagueStateOf(m: StateModel, project: string): VagueState {
  const t = m.task && m.task.project === project ? m.task : null;
  const failed = t?.proof?.verdict === "failed" ? t.proof.steps.find((s) => s.status === "failed") : undefined;
  const r = m.review && m.review.project === project ? m.review : null;
  const lead = r?.result?.reasons[0];
  const head = lead ? (S.homeNow.reviewHead as Record<string, readonly [string, string]>)[lead.kind]?.[0] : undefined;
  return {
    failing: failed ? failed.label : null,
    finding: head ?? null,
    changes: r && r.stage === "ready" ? r.count : 0,
    hasPage: !!t?.proof?.steps.some((s) => s.rung === "browser" && s.status !== "skipped"),
  };
}
