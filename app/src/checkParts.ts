// A check's result as a person reads it (M15 wave 2, moved here in M45 so model.ts can use it without an import cycle): one
// plain sentence, the file and line when it is known, and the check's own output kept apart, for behind "Details"
// (checkDetail.tsx draws it). Pure: no page, no Model.
import type { Problem } from "../../protocol/index.ts";
import { S } from "./strings.ts";

// Most sentences the engine sends were written for a person ("Something is still working on this project. Wait for it to finish,
// or press Stop."). Those are shown as they are. A technical message (an error name, a path, a code) is wrapped and never shown raw.
const LOOKS_TECHNICAL = /(\b[A-Z][A-Za-z]*(Error|Exception)\b|\bE[A-Z]{3,}\b|\bat \/|\.(ts|js|tsx|rs):\d|\bundefined\b|\bnull\b|\bNaN\b|\[object|\bstack\b|\bgit [a-z-]+ failed|\bexit(ed)? (code|with)\b|\bunknown approval\b|\bstderr\b)/;
export const WRITTEN_FOR_A_PERSON = (r: string) => /^[A-Z][^\n]{10,320}[.!?)]$/.test(r.trim()) && !LOOKS_TECHNICAL.test(r);

export type CheckParts = { summary: string; place: string; raw: string };

/** The plain summary, the place and the raw output of one step or piece of evidence. A step that did not fail is its own
 *  plain sentence (the engine writes those for a person); a failed one leads with the engine's summary, or its first
 *  sentence when that reads plainly, or "It did not pass.", and the rest is the raw output. */
export function checkParts(s: { status: string; detail: string; summary?: string; problem?: Problem }): CheckParts {
  const detail = String(s.detail ?? "").trim();
  const place = s.problem && s.problem.kind === "line" ? S.ehWhere(s.problem.file, s.problem.line) : "";
  if (s.status !== "failed") return { summary: s.status === "passed" ? "" : detail, place: "", raw: "" };
  const first = /^[^\n]*?[.!?](?=\s|$)/.exec(detail)?.[0] ?? "";
  const summary = s.summary || (first && WRITTEN_FOR_A_PERSON(first) ? first : S.checkDidNotPass);
  const rest = detail.startsWith(summary) ? detail.slice(summary.length).trim() : detail;
  return { summary, place, raw: rest };
}
