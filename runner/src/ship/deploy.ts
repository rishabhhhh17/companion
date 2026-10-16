// Putting a project on the internet, through the person's own Vercel login. Companion never holds a deploy token:
// the Vercel tool keeps the login in its own place, and everything it says is cleaned before it is shown or saved.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { runCommand, shq, type RunResult } from "../proof/exec.ts";
import { minimalEnv } from "../env.ts";
import { clip, redact } from "../redact.ts";

export type Ok<T = object> = { ok: true } & T;
export type Fail = { ok: false; reason: string };
export interface Deployer {
  // Whether a login exists. Never starts a login, never reads it.
  signedIn(): boolean;
  preview(project: string, signal?: AbortSignal): Promise<Ok<{ url: string }> | Fail>;
  promote(url: string, project: string, signal?: AbortSignal): Promise<Ok<{ productionUrl?: string }> | Fail>;
  rollback(project: string, signal?: AbortSignal): Promise<Ok | Fail>;
}

export const NOT_SIGNED_IN = "You are not signed in to Vercel. Open Terminal, run: vercel login, then try again.";

// Reading why the last deploy failed: read only. It lists the deployments and prints one build log; it never deploys,
// promotes, rolls back or removes anything. Only for a folder linked to a Vercel project (.vercel/project.json): in any
// other folder the Vercel tool would list every project's deployments.
// failed: the newest finished deploy failed, with its build log. none: it did not (or there is none). not_linked: this
// folder is not a Vercel project, so there is nothing to say. unavailable: one plain line saying why, with what to do.
export type FailedBuild =
  | { state: "failed"; url: string; log: string }
  | { state: "none" }
  | { state: "not_linked" }
  | { state: "unavailable"; reason: string }
  | { state: "cancelled" };
export interface DeployLogReader { lastFailedBuild(project: string, signal?: AbortSignal): Promise<FailedBuild> }
const COULD_NOT = "I could not read why the Vercel deploy failed:";
const LOG_NO_CLI = `${COULD_NOT} the Vercel tool is not installed. Install it with: npm install -g vercel`;
const LOG_NO_LOGIN = `${COULD_NOT} you are not signed in to Vercel. Open Terminal, run: vercel login, then try again.`;
const DEPLOYMENT_HOST = /^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.vercel\.app$/i;
const STATUS = /\b(Ready|Error|Building|Queued|Initializing|Canceled|Deploying|Analyzing)\b/;
const LOG_LINE = /^\[?\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/m;
// Is the Vercel tool on the tool path Companion runs commands with? (Tests say yes, so they never depend on this Mac.)
const cliOnPath = () => process.env.COMPANION_TEST_ASSUME_TOOLS === "1" || (minimalEnv().PATH ?? "").split(":").some((d) => d && existsSync(join(d, "vercel")));

/** The deployments `vercel list --format json` printed, newest first. */
export function parseDeploymentList(stdout: string): { url: string; state: string }[] | null {
  const a = stdout.indexOf("{"), b = stdout.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let j: any;
  try { j = JSON.parse(stdout.slice(a, b + 1)); } catch { return null; }
  if (!Array.isArray(j?.deployments)) return null;
  return j.deployments
    .map((d: any) => ({ url: String(d?.url ?? ""), state: String(d?.state ?? d?.readyState ?? "").toUpperCase(), at: Number(d?.createdAt) || 0 }))
    .sort((x: { at: number }, y: { at: number }) => y.at - x.at)
    .map(({ url, state }: { url: string; state: string }) => ({ url, state }));
}
/** The table an older `vercel list` prints (no --format there): one row per deployment, newest first. */
export function parseDeploymentTable(text: string): { url: string; state: string }[] {
  const out: { url: string; state: string }[] = [];
  for (const line of text.split("\n")) {
    const url = /https:\/\/\S+?\.vercel\.app\b/.exec(line)?.[0], st = STATUS.exec(line.replace(/https:\/\/\S+/g, ""))?.[1];
    if (url && st) out.push({ url, state: st.toUpperCase() });
  }
  return out;
}
const LOGIN_FLOW = /Starting login flow|oauth\/device|No existing credentials/i;
const URL_RE = /https:\/\/[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.vercel\.app\b[^\s)"']*/gi;
const plain = (r: RunResult) => clip(redact(`${r.stderr}\n${r.stdout}`).replace(/\s+/g, " ").trim(), 300);

export class VercelCli implements Deployer, DeployLogReader {
  constructor(private run: typeof runCommand = runCommand, private authFile = join(homedir(), "Library", "Application Support", "com.vercel.cli", "auth.json"), private hasCli: () => boolean = cliOnPath) {}
  // Only whether the file exists: its contents are never opened.
  signedIn() { return existsSync(this.authFile); }

  private async vercel(args: string, project: string, timeoutMs: number, signal?: AbortSignal) {
    const r = await this.run(`vercel ${args}`, { cwd: project, timeoutMs, signal, stopWhen: LOGIN_FLOW });
    if (r.matched) return { r, fail: NOT_SIGNED_IN };
    if (r.aborted) return { r, fail: "Stopped." };
    if (r.timedOut) return { r, fail: "Vercel took too long, so I stopped it. Nothing went live." };
    if (r.code === 127) return { r, fail: "The Vercel tool is not installed. Install it with: npm install -g vercel" };
    if (r.code !== 0) return { r, fail: `Vercel said no: ${plain(r) || "no details"}` };
    return { r, fail: null as string | null };
  }
  private lastUrl(r: RunResult): string | null {
    const all = `${r.stdout}\n${r.stderr}`.match(URL_RE);
    return all ? all[all.length - 1].replace(/[.,]+$/, "") : null;
  }

  async preview(project: string, signal?: AbortSignal) {
    const { r, fail } = await this.vercel("deploy --yes", project, 10 * 60_000, signal);
    if (fail) return { ok: false as const, reason: fail };
    const url = this.lastUrl(r);
    return url ? { ok: true as const, url } : { ok: false as const, reason: "Vercel finished but did not give a preview link." };
  }
  async promote(url: string, project: string, signal?: AbortSignal) {
    if (!/^https:\/\/[a-z0-9.-]+\.vercel\.app\/?$/i.test(url)) return { ok: false as const, reason: "That is not a Vercel preview link." };
    const { r, fail } = await this.vercel(`promote ${url} --yes`, project, 5 * 60_000, signal);
    if (fail) return { ok: false as const, reason: fail };
    return { ok: true as const, productionUrl: this.lastUrl(r) ?? undefined };
  }
  async rollback(project: string, signal?: AbortSignal) {
    const { fail } = await this.vercel("rollback --yes", project, 5 * 60_000, signal);
    return fail ? { ok: false as const, reason: fail } : { ok: true as const };
  }

  // Read only: `vercel list`, then `vercel inspect <url> --logs` for the newest finished deploy if it failed.
  async lastFailedBuild(project: string, signal?: AbortSignal): Promise<FailedBuild> {
    if (!existsSync(join(project, ".vercel", "project.json"))) return { state: "not_linked" };
    if (!this.hasCli()) return { state: "unavailable", reason: LOG_NO_CLI };
    if (!this.signedIn()) return { state: "unavailable", reason: LOG_NO_LOGIN };
    const read = (args: string, timeoutMs: number, keep?: number) => this.run(`vercel ${args}`, { cwd: project, timeoutMs, signal, stopWhen: LOGIN_FLOW, ...(keep ? { keep } : {}) });
    const stopped = (r: RunResult): FailedBuild | null =>
      r.aborted ? { state: "cancelled" } : r.matched ? { state: "unavailable", reason: LOG_NO_LOGIN }
      : r.timedOut ? { state: "unavailable", reason: `${COULD_NOT} Vercel took too long, so I stopped it.` }
      : r.code === 127 ? { state: "unavailable", reason: LOG_NO_CLI } : null;
    let r = await read("list --format json", 60_000);
    let deployments: { url: string; state: string }[] | null = null;
    if (stopped(r)) return stopped(r)!;
    if (r.code === 0) deployments = parseDeploymentList(r.stdout);
    else if (/unknown or unexpected option|unknown option/i.test(`${r.stderr}\n${r.stdout}`)) {
      r = await read("list", 60_000);
      if (stopped(r)) return stopped(r)!;
      if (r.code === 0) deployments = parseDeploymentTable(`${r.stderr}\n${r.stdout}`);
    }
    if (!deployments) return { state: "unavailable", reason: `${COULD_NOT} Vercel said no: ${plain(r) || "no details"}` };
    // The newest deploy that finished; one still building, queued or cancelled says nothing yet.
    const last = deployments.find((d) => d.state === "READY" || d.state === "ERROR");
    if (!last || last.state !== "ERROR") return { state: "none" };
    const host = last.url.replace(/^https:\/\//, "").replace(/\/$/, "");
    if (!DEPLOYMENT_HOST.test(host)) return { state: "unavailable", reason: `${COULD_NOT} its address looked wrong, so I did not use it.` };
    const url = `https://${host}`;
    // Exit code 1 is what inspect gives for a failed deployment, so the log itself is what counts.
    const l = await read(`inspect ${shq(url)} --logs`, 90_000, 64_000);
    if (stopped(l)) return stopped(l)!;
    const log = [l.stderr, l.stdout].filter(Boolean).join("\n");
    if (!LOG_LINE.test(log)) return { state: "unavailable", reason: `${COULD_NOT} Vercel said no: ${plain(l) || "no details"}` };
    return { state: "failed", url, log };
  }
}

// ---------- the record of what went live ----------

export type ShipReceipt = { at: string; action: "preview" | "live" | "rollback"; snapshot: string; url?: string; productionUrl?: string; gates: { id: string; status: string }[]; proof: string };
const FILE = ".companion/ships.json";

export function readShips(project: string): ShipReceipt[] {
  try { const j = JSON.parse(readFileSync(join(project, FILE), "utf8")); return Array.isArray(j) ? j : []; } catch { return []; }
}
export function addShipReceipt(project: string, r: ShipReceipt) {
  const f = join(project, FILE);
  mkdirSync(dirname(f), { recursive: true });
  const tmp = `${f}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(tmp, JSON.stringify([...readShips(project), r].slice(-50), null, 2) + "\n");
  renameSync(tmp, f);
}
