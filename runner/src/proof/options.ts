// What the person chose in Settings for checking a project (the registry's "Checking your project" section, T16; area 2 of
// docs/milestones/M11-customize-plan.md). Read once when a task or a check starts (RunnerSettings.get), so one already
// running keeps what it started with. Every usual value is exactly today's behaviour. What can never change stays in code:
// the start check and the browser check always run (F14), a check left out is a gap (so at best "passed with gaps"), a
// button whose words sound risky is never pressed, and an unanswered install question is a no.
import type { Rule } from "../rules.ts";

export type SkipName = "typecheck" | "lint" | "build" | "test";
export const SKIPPABLE: readonly SkipName[] = ["typecheck", "lint", "build", "test"];
export type CheckTime = "normal" | "longer" | "longest";
export type InstallMode = "auto" | "ask" | "never";
export type PageSize = "desktop" | "phone" | "both";
export type CheckSettings = {
  mustSee: string[]; press: string; afterPress: string;   // used only when the project has no .claude/proof.json
  start: string;            // "auto" (found as today) or the name of one of the project's own scripts
  skip: SkipName[];         // never the start or the browser check
  time: CheckTime;
  install: InstallMode;
  pageSize: PageSize;
};
export const USUAL_CHECK: CheckSettings = { mustSee: [], press: "", afterPress: "", start: "auto", skip: [], time: "normal", install: "auto", pageSize: "desktop" };

/** Time allowed for checks: normal is today's limits, longer twice them, longest four times. */
export const TIME_FACTOR: Record<CheckTime, number> = { normal: 1, longer: 2, longest: 4 };
/** The page sizes the browser check opens the page at. Desktop is today's. */
export const VIEWPORTS = { desktop: { width: 1280, height: 800 }, phone: { width: 390, height: 844 } } as const;
export type Viewport = { width: number; height: number };

const oneOf = <T extends string>(v: unknown, all: readonly T[], usual: T): T => (typeof v === "string" && (all as readonly string[]).includes(v) ? (v as T) : usual);
const words = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()) : []);
const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** The check settings in force for a project, from the settings the shell applied (anything odd is its usual value). */
export function checkSettings(get: (key: string) => unknown): CheckSettings {
  const start = text(get("check.start"));
  return {
    mustSee: words(get("check.mustSee")).slice(0, 5),
    press: text(get("check.press")),
    afterPress: text(get("check.afterPress")),
    start: /^[A-Za-z0-9][A-Za-z0-9:._-]{0,59}$/.test(start) ? start : "auto",
    skip: words(get("check.skip")).filter((x): x is SkipName => (SKIPPABLE as readonly string[]).includes(x)),
    time: oneOf(get("check.time"), ["normal", "longer", "longest"] as const, "normal"),
    install: oneOf(get("check.install"), ["auto", "ask", "never"] as const, "auto"),
    pageSize: oneOf(get("check.pageSize"), ["desktop", "phone", "both"] as const, "desktop"),
  };
}

/** Whether a check may install the project's packages. A house rule "ask before installing packages", or a rules file that
 *  could not be read, makes it at least ask (until now the check's own install did not ask, whatever the rule said). */
export function installMode(chosen: InstallMode | undefined, rules: Pick<Rule, "kind">[], broken = false): InstallMode {
  const c = chosen ?? "auto";
  if (c === "never") return "never";
  return broken || rules.some((r) => r.kind === "ask_install") ? "ask" : c;
}

/** "My internet is slow": the waits for things that go over the internet (and the snapshot limit) are doubled. */
export const slowFactor = (get: (key: string) => unknown): number => (get("net.slow") === true ? 2 : 1);
