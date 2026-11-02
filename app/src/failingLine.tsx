// The failing line as proof (M51, the graphite look): where it is (file and line) and the line itself, both in the system
// mono, the line under the marker like a highlighter stroke. Shown in Practice and under Find the problem on Home, only
// when the problem is a real line in the project; a button or a sentence has no line to show, so nothing is drawn.
import type { Problem } from "./model.ts";

type LineProblem = Extract<Problem, { kind: "line" }>;
/** The problem when it is a line in the project with its text, else null. */
export const lineOf = (p: Problem | null | undefined): LineProblem | null => (p && p.kind === "line" && p.file ? p : null);
/** The line is in one of the project's tests (the audit, item 41): the test is not what a learner changes, so its line goes
 *  behind Details and the plain message leads. */
export const fromTest = (p: Problem | null | undefined): boolean => {
  const f = lineOf(p)?.file ?? "";
  return /(^|\/)(tests?|__tests__|spec)\//i.test(f) || /\.(test|spec)\.[a-z]+$/i.test(f);
};

export function FailingLine({ problem }: { problem: Problem | null | undefined }) {
  const p = lineOf(problem);
  if (!p) return null;
  const file = p.file, line = p.line, text = (p.lineText ?? "").trim();
  return (
    <div className="failing" role="group" aria-label={`${file}, line ${line}`}>
      <code className="failing-at">{`${file}:${line}`}</code>
      {text && <code className="failing-code"><mark className="found-line">{text}</mark></code>}
    </div>
  );
}
