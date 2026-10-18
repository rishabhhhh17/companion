// The Settings rows for checking a project (area 2 of the settings plan, docs/milestones/M11-customize-plan.md), as plain
// code (checkRows.test.ts); settingsPage.tsx only draws what these say. What the rows need to know about the project (its
// scripts, the checks it has, its own .claude/proof.json and .claude/launch.json) comes from the engine's project report.
// Every word is in strings.ts. Nothing here changes a setting: every change goes to the shell (settingsStore.ts).
import { defOf, ruleOf, ruleText, RULE_KINDS, validate, type RuleKind } from "../../protocol/settings.ts";
import { S } from "./strings.ts";
import { problemWords } from "./settingsRows.ts";

export type CheckFacts = {
  project: string;
  scripts: string[];
  checks: SkipName[];
  proofFile: { expectText: string[]; click: string | null; expectAfterClick: string | null } | null;
  launchFile: boolean;
};
type SkipName = "typecheck" | "lint" | "build" | "test";
const SKIPPABLE: readonly SkipName[] = ["typecheck", "lint", "build", "test"];
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const strOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** The facts for the rows, from a project.report event; null for any other event. */
export function factsFrom(ev: unknown): CheckFacts | null {
  if (typeof ev !== "object" || ev === null) return null;
  const e = ev as Record<string, unknown>;
  if (e.type !== "project.report" || typeof e.project !== "string") return null;
  const p = typeof e.proofFile === "object" && e.proofFile !== null ? (e.proofFile as Record<string, unknown>) : null;
  return {
    project: e.project,
    scripts: strs(e.scripts),
    checks: strs(e.checks).filter((x): x is SkipName => (SKIPPABLE as readonly string[]).includes(x)),
    proofFile: p ? { expectText: strs(p.expectText), click: strOrNull(p.click), expectAfterClick: strOrNull(p.expectAfterClick) } : null,
    launchFile: e.launchFile === true,
  };
}

/** check.start: Let Companion find it, then the project's own scripts. A chosen script that is not there any more is still
 *  shown (said as gone), so the person can see it and pick another. Never a box to type a command in. */
export function startOptions(value: unknown, facts: CheckFacts | null): { id: string; label: string }[] {
  const out = [{ id: "auto", label: S.set["check.start"].options.auto }, ...(facts?.scripts ?? []).map((s) => ({ id: s, label: s }))];
  if (typeof value === "string" && value !== "auto" && !out.some((o) => o.id === value)) out.push({ id: value, label: S.chkScriptGone(value) });
  return out;
}

/** check.skip: the checks this project has (all four before the engine has said), and any left out before. Never the
 *  start or the browser check: those always run. */
export function skipItems(facts: CheckFacts | null, value: unknown): SkipName[] {
  const have = facts ? facts.checks.filter((x) => (SKIPPABLE as readonly string[]).includes(x)) : [...SKIPPABLE];
  for (const v of strs(value)) if ((SKIPPABLE as readonly string[]).includes(v) && !have.includes(v as SkipName)) have.push(v as SkipName);
  return have;
}

/** With the project's own .claude/proof.json, the words and the button rows say so and show what it holds, read only. */
export function proofLines(key: string, facts: CheckFacts | null): string[] {
  const p = facts?.proofFile;
  if (!p || !["check.mustSee", "check.press", "check.afterPress"].includes(key)) return [];
  const what = key === "check.mustSee" ? p.expectText.join(", ") : key === "check.press" ? p.click ?? "" : p.expectAfterClick ?? "";
  return [S.chkProofFile, S.chkProofShows(what || S.setNone)];
}

/** Words after pressing are shown only when there is a button to press (in Settings, or in the project's own file). */
export const afterPressShown = (press: unknown, facts: CheckFacts | null): boolean => (typeof press === "string" && press.trim() !== "") || !!facts?.proofFile?.click;

/** Whether the house rule "ask before installing packages" is in the list. */
export const askRuleOn = (rules: unknown): boolean => strs(rules).some((r) => ruleOf(r)?.kind === "ask_install");
/** check.install: while that house rule is there, Automatically still asks first, and the row says why. */
export const installNote = (value: unknown, rules: unknown): string | null => (value === "auto" && askRuleOn(rules) ? S.chkAskRule : null);

/** The five kinds of house rule, in the editor's words. */
export const ruleKindOptions = (): { id: RuleKind; label: string }[] => RULE_KINDS.map((id) => ({ id, label: S.rulesKinds[id] }));

/** A rule added in the editor (not saved until Save): built from a kind and what it is about, checked with the list's own
 *  rules (up to 50, one line of up to 200 characters, never anything that looks like a key or password). */
export function addRule(list: string[], kind: RuleKind, what: string): { ok: true; list: string[] } | { ok: false; problem: string } {
  const line = ruleText(kind, what);
  if (!line) return { ok: false, problem: S.rulesNeedWhat };
  if (list.includes(line)) return { ok: false, problem: S.rulesAlready };
  const d = defOf("rules.house")!;
  const c = validate(d, [...list, line]);
  if (!c.ok) return { ok: false, problem: problemWords(c.reason, d) };
  return { ok: true, list: c.value as string[] };
}
/** A rule taken off in the editor (after its inline confirm). Always possible. */
export const removeRule = (list: string[], rule: string): string[] => list.filter((r) => r !== rule);

/** Lowering "Pictures to keep": how many of the pictures kept now will go when the next picture is made (0 when none). */
export function picturesGoing(count: number | undefined, from: number, to: number): number {
  if (typeof count !== "number" || to >= from) return 0;
  return Math.max(0, count - to);
}
