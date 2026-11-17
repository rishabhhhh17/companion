// M102, every warning shows why: the one line under a finding that says why Squibby is sure, from the proof the engine sends
// with each reason (runner/src/review/rate.ts withProofs): the rule and file:line, the failing check and its exit code, the
// OSV id, the house rule, the person's own setting, or the run. Plain code, tested in proofLine.test.ts. Words in strings.ts.
import type { ReviewReason } from "../../protocol/index.ts";
import { S } from "./strings.ts";

const at = (file?: string, line?: number): string | undefined => (file ? (line ? `${file}:${line}` : file) : undefined);

/** shown: the place the card's code box already shows (the lead), said as "the line shown above" instead of again. */
export type ProofOpts = { shown?: { file: string; line: number } | null };

/** "Why I'm sure: …" ("Where it is: …" for a model's worry, which is a guess and never sure), or null for a reason the
 *  engine sent no proof with (an older review). With say (the finding's own words), an id or a rule they already hold is
 *  not said again (M102 review). */
export function proofLine(r: Pick<ReviewReason, "kind" | "proof"> & { say?: string }, o: ProofOpts = {}): string | null {
  const p = r.proof;
  if (!p) return null;
  const said = r.say ?? "";
  const shown = !!(o.shown && p.file === o.shown.file && p.line === o.shown.line);
  const text = ((): string => {
    switch (p.by) {
      case "rule": {
        const name = S.proof.ruleName[r.kind] ?? S.proof.ruleName.touches_risky;
        return shown ? S.proof.ruleShown(name) : S.proof.rule(name, at(p.file, p.line));
      }
      case "line": return p.file && p.line ? (shown ? S.proof.lineShown : S.proof.line(at(p.file, p.line)!)) : S.proof.rule(S.proof.ruleName.model_concern);
      case "check": return p.outcome ? S.proof.claimed[p.outcome] : p.check ? S.proof.check(p.check, p.exit) : S.proof.checks;
      case "osv":
        if (!p.id) return S.proof.rule(S.proof.ruleName[r.kind] ?? "", shown ? undefined : at(p.file, p.line));
        if (said.includes(p.id)) return S.proof.osvShort(shown ? undefined : at(p.file, p.line));
        return shown ? S.proof.osvShown(p.id) : S.proof.osv(p.id, at(p.file, p.line));
      case "house_rule":
        if (!p.rule) return S.proof.rule(S.proof.ruleName.house_rule, at(p.file));
        return said.includes(p.rule) ? S.proof.houseRuleShort(p.file) : S.proof.houseRule(p.rule, p.file);
      case "setting": return p.count !== undefined && p.max !== undefined ? S.proof.tooMany(p.count, p.max) : S.proof.chosen;
      case "run": return S.proof.run;
    }
  })();
  return `${p.by === "line" ? S.proof.lineLabel : S.proof.label}: ${text}`;
}

/** The labels a proof line starts with, so the card can set the label in weight (findingList.tsx SureLine). */
export const PROOF_LABELS: readonly string[] = [S.proof.label, S.proof.lineLabel];

/** M102 review: a failing check's own words that only say the checks failed (every sentence "… did not pass"), which the
 *  proof line (the check's name and exit code) already says. */
export function onlySaysFailed(detail: string): boolean {
  const parts = detail.split(/(?<=\.)\s+/).map((x) => x.trim()).filter(Boolean);
  return parts.length > 0 && parts.every((x) => /^(the )?[\w' -]{1,60} did not pass\.?$/i.test(x));
}
