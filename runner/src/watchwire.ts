// The real checks a watch runs, and the evidence Fix it is given, put together from the engine's parts (F21). Everything
// outside the engine is passed in, so a test hands in stand ins and never reaches the network or a tool.
import type { Checks, EvidenceMaker, Watch } from "./watch.ts";
import { checkSite, realDeps, type SiteDeps } from "./watchsite.ts";
import { ciEvidence, ciResult, deployEvidence, deployResult, type CiReader } from "./connections.ts";
import type { DeployLogReader, LatestDeployReader } from "./ship/deploy.ts";
import type { CheckResult } from "./watchsite.ts";
import { hostOf } from "./watchname.ts";

export type Parts = {
  site?: SiteDeps;
  vercel: DeployLogReader & LatestDeployReader;
  gh: CiReader;
  /** The project's own checks, without Claude (AgentRunner.checkWithoutModel). */
  project: (project: string, signal: AbortSignal) => Promise<CheckResult | { skip: string } | null>;
};

export function makeChecks(p: Parts): Checks {
  return {
    site: (target, signal, timeoutMs) => checkSite(target, p.site ?? realDeps(), { signal, timeoutMs }),
    deploy: async (project, signal) => deployResult(await p.vercel.latestDeploy(project, signal)),
    ci: async (project, signal) => ciResult(await p.gh.latestRun(project, signal)),
    project: p.project,
  };
}

/** What a failed watch hands to a task, read only: the located problem and the end of the log for a deploy or a CI run, what
 *  the check saw for the others. null: nothing more than the watch's own plain reason. */
export function makeEvidence(p: Pick<Parts, "vercel" | "gh">): EvidenceMaker {
  return async (w: Watch, signal: AbortSignal) => {
    switch (w.kind) {
      case "site_up": return `My site ${hostOf(w.target)} is not working. What a plain web request saw: ${w.reason}`;
      case "deploy_status": return (await deployEvidence(w.project, p.vercel, signal))?.text ?? null;
      case "ci_status": return (await ciEvidence(w.project, p.gh, signal))?.text ?? null;
      default: return `My project's own checks are failing. ${w.reason}`;
    }
  };
}
