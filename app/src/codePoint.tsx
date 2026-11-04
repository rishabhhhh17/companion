// M69 step 3, the pointed line (the YC benchmark spec 3.3 and 3.4): one drawing for the review card and the failing lead.
// The file in a sunken header (with a short note on the right, such as "line 12" when no code came), then the pointed line
// with the line before and after it, each with its number in the gutter, in the system mono. The pointed line has a bar at
// its left edge on the tone's tint and "Squibby is pointing here" after it; where the card is narrow, that label moves into
// the header instead of wrapping under the code (ui/homeNow.css, a container query). The code is the engine's own, already
// masked (runner/src/review/excerpt.ts, review.ts codeLinesOf): a key shows only its known prefix and "…".
import type { CodeLine } from "../../protocol/index.ts";
import { S } from "./strings.ts";

export function CodePoint({ file, line, lines, tone = "stop", pointing = S.homeNow.pointing }: { file: string; line: number; lines?: readonly CodeLine[]; tone?: "stop" | "look"; pointing?: string }) {
  const shown = lines?.length ? lines : null;
  const label = <><span aria-hidden="true">{"← "}</span>{pointing}</>;
  return (
    <div className="code-point" data-tone={tone} role="group" aria-label={S.review.at(file, line)}>
      <div className="cp-head">
        <code className="cp-file">{file}</code>
        {!shown && <code className="cp-where">{S.homeNow.lineNo(line)}</code>}
        <span className="cp-arrow" data-at="head">{label}</span>
      </div>
      {shown && (
        <ol className="cp-lines">
          {shown.map((l) => (
            <li key={l.n} className="cp-line" data-pointed={l.n === line ? "" : undefined} aria-current={l.n === line ? "location" : undefined}>
              <code className="cp-n" aria-hidden="true">{l.n}</code>
              <code className="cp-text">{l.text || " "}</code>
              {l.n === line && <span className="cp-arrow" data-at="line">{label}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
