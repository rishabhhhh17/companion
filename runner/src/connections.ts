// Builder stack connections, read only (F21). For a project linked to Vercel or GitHub, Companion reads the latest deploy,
// its build log, the latest CI run and the log of the job that failed, through the person's own `vercel` and `gh` tools. It
// never holds their tokens (their tool does), never writes anything (readonly.ts refuses every other command, in code),
// redacts everything it passes on and caps its size. Used by Watch routines and, as evidence, by Rescue and Fix it.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { minimalEnv } from "./env.ts";
import { runCommand, shq, type RunResult } from "./proof/exec.ts";
import { clip, redact, redactOutput, stripTerminal } from "./redact.ts";
import { refuseWrite } from "./readonly.ts";
import { readDeployFailure } from "./ship/buildlog.ts";
import type { DeployLogReader, LatestDeploy, LatestDeployReader } from "./ship/deploy.ts";

export type RunInfo = { id: number; workflow: string; branch: string; url: string; title: string };
export type CiLatest =
  | { state: "ok" | "failing"; reason: string; run: RunInfo; failing: RunInfo[] }
  | { state: "none"; reason: string }
  | { state: "unknown"; reason: string }
  | { state: "cancelled" };
export interface CiReader { latestRun(project: string, signal?: AbortSignal): Promise<CiLatest>; failureLog(project: string, run: RunInfo, signal?: AbortSignal): Promise<string | null> }

export const GH_NO_CLI = "The GitHub tool (gh) is not installed. Install it from cli.github.com, then sign in with: gh auth login";
export const GH_NO_LOGIN = "You are not signed in to GitHub. Open Terminal, run: gh auth login, then try again.";
export const GH_NO_REPO = "This folder is not connected to a GitHub project, so there is no CI to read.";
const COULD = "I could not read your GitHub runs:";
const EVIDENCE_MAX = 6000;
const LOG_KEEP = 64_000;
const GOOD = new Set(["success"]);
const BAD = new Set(["failure", "timed_out", "startup_failure"]);

const ghOnPath = () => process.env.COMPANION_TEST_ASSUME_TOOLS === "1" || (minimalEnv().PATH ?? "").split(":").some((d) => d && existsSync(join(d, "gh")));
const plain = (r: RunResult) => clip(redactOutput(`${r.stderr}\n${r.stdout}`).replace(/\s+/g, " ").trim(), 240);
/** The last lines of a log, secrets hidden, colours and times taken off, and capped. */
export function logTail(log: string, maxLines = 40, maxChars = 3000): string {
  // Colour codes, carriage returns and the time and job prefix of each line come off first, so a secret they cut in two is
  // whole again when it is looked for.
  const cleaned = stripTerminal(log).split("\n")
    .map((l) => l.replace(/^\S+\t\S+\t/, "").replace(/^\[?\d{4}-\d{2}-\d{2}T[\d:.]+Z\]?\s?/, "").trimEnd()).filter((l) => l.trim());
  const lines = redact(cleaned.join("\n")).split("\n");
  const tail = lines.slice(-maxLines).join("\n");
  return tail.length > maxChars ? tail.slice(-maxChars) : tail;
}

export class GhCli implements CiReader {
  constructor(private run: typeof runCommand = runCommand, private hasCli: () => boolean = ghOnPath, private scale: () => number = () => 1) {}

  private read(project: string, args: string, timeoutMs: number, signal?: AbortSignal, keep?: number): Promise<RunResult> {
    const command = `gh ${args}`;
    const refused = refuseWrite(command);
    if (refused) throw new Error(refused);
    return this.run(command, { cwd: project, timeoutMs: timeoutMs * this.scale(), signal, ...(keep ? { keep } : {}) });
  }
  // Why a gh command could not give an answer, in one plain line, or null when it did.
  private trouble(r: RunResult): CiLatest | null {
    if (r.aborted) return { state: "cancelled" };
    if (r.timedOut) return { state: "unknown", reason: `${COULD} GitHub took too long, so I stopped it.` };
    if (r.code === 127) return { state: "unknown", reason: GH_NO_CLI };
    const said = `${r.stderr}\n${r.stdout}`;
    if (r.code !== 0 && /gh auth login|not logged in|authentication required|HTTP 401|bad credentials/i.test(said)) return { state: "unknown", reason: GH_NO_LOGIN };
    if (r.code !== 0 && /none of the git remotes|not a git repository|no git remotes|Could not resolve to a Repository|HTTP 404/i.test(said)) return { state: "unknown", reason: GH_NO_REPO };
    if (r.code !== 0) return { state: "unknown", reason: `${COULD} GitHub said no: ${plain(r) || "no details"}` };
    return null;
  }

  async latestRun(project: string, signal?: AbortSignal): Promise<CiLatest> {
    if (!this.hasCli()) return { state: "unknown", reason: GH_NO_CLI };
    if (!existsSync(join(project, ".git"))) return { state: "unknown", reason: GH_NO_REPO };
    // The branch the project is built from: the repository's default one. If that cannot be read, any branch counts.
    let branch = "";
    const repo = await this.read(project, "repo view --json defaultBranchRef", 30_000, signal);
    const t0 = this.trouble(repo);
    if (t0 && (t0.state === "cancelled" || (t0.state === "unknown" && (t0.reason === GH_NO_CLI || t0.reason === GH_NO_LOGIN || t0.reason === GH_NO_REPO)))) return t0;
    if (!t0) { try { const n = JSON.parse(repo.stdout)?.defaultBranchRef?.name; if (typeof n === "string" && /^[A-Za-z0-9._\/-]{1,100}$/.test(n)) branch = n; } catch { /* any branch */ } }
    const fields = "databaseId,status,conclusion,workflowName,headBranch,displayTitle,createdAt,url";
    const r = await this.read(project, `run list --limit 20 --json ${fields}${branch ? ` --branch ${shq(branch)}` : ""}`, 45_000, signal, 256_000);
    const t = this.trouble(r);
    if (t) return t;
    let runs: any[];
    try { runs = JSON.parse(r.stdout); if (!Array.isArray(runs)) throw new Error("not a list"); } catch { return { state: "unknown", reason: `${COULD} what GitHub sent could not be read.` }; }
    // The newest finished run of each workflow decides (a workflow that passes cannot hide one that fails). Runs still going,
    // cancelled or skipped say nothing yet.
    const latest = new Map<string, any>();
    for (const x of runs.slice().sort((a, b) => String(b?.createdAt).localeCompare(String(a?.createdAt)))) {
      if (x?.status !== "completed" || !(GOOD.has(x.conclusion) || BAD.has(x.conclusion))) continue;
      const k = String(x.workflowName ?? "");
      if (!latest.has(k)) latest.set(k, x);
    }
    if (latest.size === 0) return { state: "none", reason: "There are no finished GitHub runs yet." };
    const info = (x: any): RunInfo => ({ id: Number(x.databaseId), workflow: clip(redact(String(x.workflowName ?? "A workflow")), 80), branch: clip(redact(String(x.headBranch ?? "")), 80), url: /^https:\/\/github\.com\//.test(String(x.url)) ? String(x.url) : "", title: clip(redact(String(x.displayTitle ?? "")), 120) });
    const bad = [...latest.values()].filter((x) => BAD.has(x.conclusion)).map(info).filter((x) => Number.isSafeInteger(x.id) && x.id > 0);
    const any = [...latest.values()].map(info).filter((x) => Number.isSafeInteger(x.id) && x.id > 0);
    if (bad.length) return { state: "failing", run: bad[0], failing: bad, reason: bad.length === 1 ? `${bad[0].workflow} failed${bad[0].branch ? ` on ${bad[0].branch}` : ""}.` : `${bad.length} GitHub workflows failed: ${bad.slice(0, 3).map((b) => b.workflow).join(", ")}.` };
    if (!any.length) return { state: "unknown", reason: `${COULD} what GitHub sent could not be read.` };
    return { state: "ok", run: any[0], failing: [], reason: `${any.length === 1 ? any[0].workflow : `${any.length} workflows`} passed${any[0].branch ? ` on ${any[0].branch}` : ""}.` };
  }

  /** The failing job and step names and the end of the failed log of one run, secrets hidden and capped. null when it cannot be read. */
  async failureLog(project: string, run: RunInfo, signal?: AbortSignal): Promise<string | null> {
    if (!Number.isSafeInteger(run.id) || run.id <= 0 || !this.hasCli()) return null;
    const names: string[] = [];
    const j = await this.read(project, `run view ${shq(String(run.id))} --json jobs`, 45_000, signal, 128_000);
    if (!this.trouble(j)) {
      try { for (const job of JSON.parse(j.stdout)?.jobs ?? []) if (BAD.has(job?.conclusion)) { const step = (job.steps ?? []).find((s: any) => BAD.has(s?.conclusion)); names.push(`${clip(redact(String(job.name ?? "A job")), 80)}${step ? `, step "${clip(redact(String(step.name ?? "")), 80)}"` : ""}`); } } catch { /* the log below still helps */ }
    }
    const l = await this.read(project, `run view ${shq(String(run.id))} --log-failed`, 60_000, signal, LOG_KEEP);
    if (this.trouble(l) && names.length === 0) return null;
    const log = this.trouble(l) ? "" : logTail(l.stdout || l.stderr);
    const text = [names.length ? `Failed: ${names.slice(0, 4).join("; ")}` : "", log ? `The end of its log:\n${log}` : ""].filter(Boolean).join("\n");
    return text ? clip(text, EVIDENCE_MAX) : null;
  }
}

// ---------- evidence, in the words a task or a plan is given ----------

/** ok: it is fine or failed. unknown: it could not be read (no tool, not signed in, no project), which says nothing about the
 *  project, so it is never a failure. */
export type Evidence = { ok: boolean; text: string; unknown?: boolean };
export type ConnectionTools = { deploys?: (DeployLogReader & Partial<LatestDeployReader>) | null; ci?: CiReader | null };

/** Why the project's last Vercel deploy failed: the located problem, then the end of the build log. null: not a Vercel project. */
export async function deployEvidence(project: string, reader: DeployLogReader, signal?: AbortSignal): Promise<Evidence | null> {
  const d = await readDeployFailure(project, reader, signal);
  if (!d || d.state === "cancelled") return null;
  if (d.state === "fine") return { ok: true, text: "Your last Vercel deploy worked." };
  if (d.state === "unknown") return { ok: false, unknown: true, text: d.reason };
  let tail = "";
  try { const b = await reader.lastFailedBuild(project, signal); if (b.state === "failed") tail = logTail(b.log, 30, 2500); } catch { /* the located problem is enough */ }
  return { ok: false, text: clip(`${d.summary}${tail ? `\nThe end of its build log:\n${tail}` : ""}`, EVIDENCE_MAX) };
}

/** Why the latest GitHub run failed: its name, the failing job and step, and the end of its log. null: nothing failed. */
export async function ciEvidence(project: string, ci: CiReader, signal?: AbortSignal): Promise<Evidence | null> {
  const r = await ci.latestRun(project, signal);
  if (r.state === "cancelled" || r.state === "none") return null;
  if (r.state === "unknown") return { ok: false, unknown: true, text: r.reason };
  if (r.state === "ok") return null;
  const log = await ci.failureLog(project, r.run, signal);
  return { ok: false, text: clip([`Your latest GitHub run failed: ${r.reason}`, r.run.title ? `Change: ${r.run.title}` : "", log ?? ""].filter(Boolean).join("\n"), EVIDENCE_MAX) };
}

/** The result a watch shows for a deploy: failing with the problem when the newest finished deploy failed. */
export function deployResult(l: LatestDeploy): { outcome: "ok" | "failing" | "unknown"; reason: string } | null {
  switch (l.state) {
    case "cancelled": return null;
    case "not_linked": return { outcome: "unknown", reason: "This folder is not linked to a Vercel project. Open Terminal in it and run: vercel link" };
    case "unavailable": return { outcome: "unknown", reason: l.reason };
    case "none": return { outcome: "unknown", reason: "There are no finished Vercel deploys yet." };
    case "failed": return { outcome: "failing", reason: `Your latest Vercel deploy failed${l.building ? " (a newer one is still building)" : ""}.` };
    case "ready": return { outcome: "ok", reason: `Your latest Vercel deploy is live${l.building ? " (a newer one is building)" : ""}.` };
  }
}
export function ciResult(l: CiLatest): { outcome: "ok" | "failing" | "unknown"; reason: string } | null {
  if (l.state === "cancelled") return null;
  if (l.state === "none") return { outcome: "unknown", reason: l.reason };
  return { outcome: l.state, reason: l.reason };
}
