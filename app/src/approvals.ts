// M28: an approval card a person can actually read. The engine's reason is written for the safety rules ("a script I cannot
// read"); the card leads with the plain question for its kind of risk, then exactly what will happen (the command or the
// file, secrets already covered by the engine), then whether Undo can take it back. Nobody should press Allow on a sentence
// fragment.
import { plainPath, type ApprovalCard } from "./model.ts";
import { S } from "./strings.ts";

// canUndo: the one fact the card's words and its colour follow (M45).
export type ApprovalWords = { question: string; what: string | null; why: string; undo: string | null; canUndo: boolean };
/** The kinds of question the card knows. Anything else reads as one that cannot be undone. */
const KNOWN: readonly string[] = ["irreversible", "git", "outside_project", "install", "network", "settings", "house_rule"];

/** "Running: npm install zod" (or "Bash: npm install zod") reads "npm install zod"; "Write: /a/b.ts" reads "/a/b.ts"; anything else as it is. With the
 *  project, a path inside it is shown from the project folder down (M45). */
export function whatOf(action: string | undefined, project = ""): string | null {
  const a = (action ?? "").trim();
  if (!a) return null;
  const m = /^(Running|Bash|Write|Edit|MultiEdit|Read|NotebookEdit):\s*(.+)$/s.exec(a);
  return plainPath((m ? m[2] : a).trim(), project) || null;
}

/** The reason as a sentence: a capital first letter and a full stop. */
const sentence = (s: string): string => { const t = s.trim(); if (!t) return ""; const c = t.charAt(0).toUpperCase() + t.slice(1); return /[.!?]$/.test(c) ? c : `${c}.`; };

/** The tools that only read (the engine's action is "Read: <path>", or the bare tool name when the call names no file). */
const READS = /^(Read|Grep|Glob|LS|NotebookRead|BashOutput|TaskOutput)(:|$)/;

/** What the card says (M45). "Do something that can't be undone?" only ever comes with "Undo can't take this back.": Undo
 *  is promised only for a known kind of question the engine said is undoable, never for one that cannot be undone or that
 *  changes the person's git (Undo never touches git, rule 10), and never when an older engine did not say. A plain read
 *  changes nothing, so it has no Undo line. A house rule asking about a command does not promise Undo either: the engine's
 *  undo fact for an allowed command can be wrong (an install writes node_modules, which Undo leaves alone; spec M45 section 8
 *  leaves fixing that fact to a follow up), so the card does not lean on it. */
export function approvalWords(a: Pick<ApprovalCard, "risk" | "title" | "action" | "undoable">, project = ""): ApprovalWords {
  const known = KNOWN.includes(a.risk);
  const ruledCommand = a.risk === "house_rule" && /^Running:/.test(a.action ?? "");
  const canUndo = known && a.undoable === true && a.risk !== "irreversible" && a.risk !== "git" && !ruledCommand;
  const question = known ? S.approval.question[a.risk] : S.approval.question.irreversible;
  const isRead = READS.test((a.action ?? "").trim());
  return { question, what: whatOf(a.action, project), why: sentence(a.title), undo: isRead ? null : canUndo ? S.approval.undoYes : S.approval.undoNo, canUndo };
}
