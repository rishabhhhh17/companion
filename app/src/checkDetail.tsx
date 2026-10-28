// A check's result as a person reads it (M15 wave 2): one plain sentence, the file and line when it is known, and the
// check's own output behind "Details" (a native disclosure, so the keyboard and VoiceOver open it like any button).
import { WRITTEN_FOR_A_PERSON, type Problem } from "./model.ts";
import { S } from "./strings.ts";

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

export function CheckDetail({ parts }: { parts: CheckParts }) {
  if (!parts.summary && !parts.raw) return null;
  return (
    <span className="check-detail">
      {parts.summary && <span className="muted"> {parts.summary}</span>}
      {parts.place && <span className="muted"> {parts.place}</span>}
      {parts.raw && (
        <details className="raw">
          <summary>{S.checkDetails}</summary>
          <pre className="diff">{parts.raw}</pre>
        </details>
      )}
    </span>
  );
}
