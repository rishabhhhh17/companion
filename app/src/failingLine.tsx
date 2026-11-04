// The failing line as proof (M51, the graphite look): where it is (file and line) and the line itself, both in the system
// mono, the line under the marker like a highlighter stroke. Shown in Practice and under Find the problem on Home, only
// when the problem is a real line in the project; a button or a sentence has no line to show, so nothing is drawn.
import type { Problem } from "./model.ts";
import { S } from "./strings.ts";
import { CodePoint } from "./codePoint.tsx";

type LineProblem = Extract<Problem, { kind: "line" }>;
/** The problem when it is a line in the project with its text, else null. */
export const lineOf = (p: Problem | null | undefined): LineProblem | null => (p && p.kind === "line" && p.file ? p : null);
/** The line is in one of the project's tests (the audit, item 41): the test is not what a learner changes, so its line goes
 *  behind Details and the plain message leads. */
export const fromTest = (p: Problem | null | undefined): boolean => {
  const f = lineOf(p)?.file ?? "";
  return /(^|\/)(tests?|__tests__|spec)\//i.test(f) || /\.(test|spec)\.[a-z]+$/i.test(f);
};

/** `pointed` (M69, the YC benchmark spec 3.3 and 3.4): drawn as the review card's pointed line, the file in a header, the line
 *  number in its gutter, a bar at its left edge and "Squibby is pointing here" after it. */
export function FailingLine({ problem, pointed = false }: { problem: Problem | null | undefined; pointed?: boolean }) {
  const p = lineOf(problem);
  if (!p) return null;
  const file = p.file, line = p.line, text = (p.lineText ?? "").trim();
  // M69 step 3: the same drawing as the review card's pointed line (codePoint.tsx): where the card is narrow, the label sits
  // in the file's header instead of wrapping under the code.
  if (pointed) return <CodePoint file={file} line={line} lines={text ? [{ n: line, text }] : undefined} pointing={S.fixRun.pointing} />;
  return (
    <div className="failing" role="group" aria-label={`${file}, line ${line}`}>
      <code className="failing-at">{`${file}:${line}`}</code>
      {text && <code className="failing-code"><mark className="found-line">{text}</mark></code>}
    </div>
  );
}
