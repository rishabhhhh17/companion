// M28: an approval card a person can actually read. The engine's reason is written for the safety rules ("a script I cannot
// read"); the card leads with the plain question for its kind of risk, then exactly what will happen (the command or the
// file, secrets already covered by the engine), then whether Undo can take it back. Nobody should press Allow on a sentence
// fragment.
import type { ApprovalCard } from "./model.ts";
import { S } from "./strings.ts";

export type ApprovalWords = { question: string; what: string | null; why: string; undo: string | null };

/** "Running: npm install zod" reads "npm install zod"; "Write: /a/b.ts" reads "/a/b.ts"; anything else as it is. */
export function whatOf(action: string | undefined): string | null {
  const a = (action ?? "").trim();
  if (!a) return null;
  const m = /^(Running|Write|Edit|MultiEdit|Read|NotebookEdit):\s*(.+)$/s.exec(a);
  return (m ? m[2] : a).trim() || null;
}

/** The reason as a sentence: a capital first letter and a full stop. */
const sentence = (s: string): string => { const t = s.trim(); if (!t) return ""; const c = t.charAt(0).toUpperCase() + t.slice(1); return /[.!?]$/.test(c) ? c : `${c}.`; };

export function approvalWords(a: Pick<ApprovalCard, "risk" | "title" | "action" | "undoable">): ApprovalWords {
  const q = (S.approval.question as Record<string, string>)[a.risk] ?? S.approval.question.irreversible;
  return {
    question: q,
    what: whatOf(a.action),
    why: sentence(a.title),
    undo: a.undoable === true ? S.approval.undoYes : a.undoable === false ? S.approval.undoNo : null,
  };
}
