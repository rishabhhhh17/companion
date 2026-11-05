// M58 shortlist 3: draws the fixed shape findingShape.ts decides. The readiness line (Ready, Check these N things, Not safe
// yet) in words and with the shared status tag (never colour alone), then the findings by level, Must fix first, each with
// what is wrong, the review's own sentence and place, and three short parts. No number score.
import type { ReactNode } from "react";
import { placeSaid } from "./review.ts";
import type { Level, Readiness, Shaped } from "./findingShape.ts";
import { S } from "./strings.ts";

const TONE = { ready: "proven", check: "needs", notSafe: "stop" } as const;

/** quiet: words only, no tag (under a headline that already has its own tag). */
export function ReadinessLine({ r, quiet = false }: { r: Readiness; quiet?: boolean }) {
  if (r.kind === "none") return null;
  if (quiet) return <p className="finding-ready-line" data-ready={r.kind}><b>{r.words}.</b> {r.line}</p>;
  return (
    <div className="finding-ready" data-ready={r.kind}>
      <p className="ui-status" data-tone={TONE[r.kind]}><span className="ui-status-dot" aria-hidden="true" />{r.words}</p>
      <p className="finding-ready-line">{r.line}</p>
    </div>
  );
}

const LEVELS: Level[] = ["must", "should", "look"];

/** extra: what a finding's row adds under its parts (Don't flag this kind here again, its saved line). */
export function FindingList({ items, id, extra }: { items: Shaped[]; id: string; extra?: (f: Shaped) => ReactNode }) {
  if (!items.length) return null;
  const open = items.filter((f) => !f.fixed), gone = items.filter((f) => f.fixed);
  const groups: { key: string; title: string; list: Shaped[] }[] = [
    ...LEVELS.map((l) => ({ key: l, title: S.finding.level[l], list: open.filter((f) => f.level === l) })),
    { key: "fixed", title: S.finding.fixedSince, list: gone },
  ].filter((g) => g.list.length > 0);
  return (
    <>
      {groups.map((g) => (
        <section key={g.key} className="finding-group" aria-labelledby={`${id}-${g.key}`} data-level={g.key}>
          <h3 className="finding-level" id={`${id}-${g.key}`}>{g.title}</h3>
          <ul className="review-reasons">
            {g.list.map((f) => (
              <li key={`${f.kind}:${f.i}:${f.file ?? ""}:${f.line ?? ""}`} data-kind={f.kind} data-level={f.level} data-fixed={f.fixed || undefined}>
                <span className="finding-wrong">{f.parts.wrong}</span>
                {f.parts.detail && f.parts.detail !== f.parts.wrong && <span className="line muted">{f.parts.detail}</span>}
                {f.file && !placeSaid({ say: f.parts.detail ?? "", file: f.file }) && <code className="review-at">{S.review.at(f.file, f.line)}</code>}
                {f.fixed && <span className="line muted review-fixed">{S.review.fixedSince}</span>}
                {!f.fixed && (
                  <dl className="finding-parts">
                    <dt>{S.finding.means}</dt><dd>{f.parts.means}</dd>
                    <dt>{S.finding.how}</dt><dd>{f.parts.how}</dd>
                    {f.parts.fine && <><dt>{S.finding.fine}</dt><dd>{f.parts.fine}</dd></>}
                  </dl>
                )}
                {extra?.(f)}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

/** The lead finding's parts, in the primary card (the review of 5 Nov): the headline above says what is wrong and the line
 *  under it what it means, so this adds the other two, how to fix it and (only where it can be) when it may be fine. */
export function LeadParts({ f }: { f: Shaped | undefined }) {
  if (!f || f.fixed) return null;
  return (
    <dl className="finding-parts finding-lead-parts">
      <dt>{S.finding.how}</dt><dd>{f.parts.how}</dd>
      {f.parts.fine && <><dt>{S.finding.fine}</dt><dd>{f.parts.fine}</dd></>}
    </dl>
  );
}
