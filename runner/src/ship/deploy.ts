// Putting a project on the internet, through the person's own Vercel login. Companion never holds a deploy token:
// the Vercel tool keeps the login in its own place, and everything it says is cleaned before it is shown or saved.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { writeAtomic } from "../atomic.ts";
import { runCommand, shq, type RunResult } from "../proof/exec.ts";
import { minimalEnv } from "../env.ts";
import { companionDirUsable, readCompanionFile } from "../companionfile.ts";
import { clip, redact } from "../redact.ts";
import { refuseWrite } from "../readonly.ts";

export type Ok<T = object> = { ok: true } & T;
// unclear: the command was sent and then stopped, ran out of time or ended in a way that does not say what happened, so
// what it asked Vercel to do may have happened anyway.
export type Fail = { ok: false; reason: string; unclear?: true };
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
// failed: the newest finished deploy failed, with its build log, and when it was made (createdAt, in milliseconds, when
// the list says; a line is ringed only in a file that has not changed since). none: it did not (or there is none).
// not_linked: this folder is not a Vercel project, so there is nothing to say. unavailable: one plain line saying why,
// with what to do.
export type FailedBuild =
  | { state: "failed"; url: string; log: string; createdAt?: number }
  | { state: "none" }
  | { state: "not_linked" }
  | { state: "unavailable"; reason: string }
  | { state: "cancelled" };
export interface DeployLogReader { lastFailedBuild(project: string, signal?: AbortSignal): Promise<FailedBuild> }
// A watch on deploys (F21): how the newest finished deploy ended. none: there is no finished deploy yet.
export type LatestDeploy =
  | { state: "ready" | "failed"; url: string; building: boolean; createdAt?: number }
  | { state: "none"; building: boolean }
  | { state: "not_linked" }
  | { state: "unavailable"; reason: string }
  | { state: "cancelled" };
export interface LatestDeployReader { latestDeploy(project: string, signal?: AbortSignal): Promise<LatestDeploy> }
const COULD_NOT = "I could not read why the Vercel deploy failed:";
const COULD_NOT_WATCH = "I could not check your Vercel deploys:";
const LOG_NO_CLI = `${COULD_NOT} the Vercel tool is not installed. Install it with: npm install -g vercel`;
const LOG_NO_LOGIN = `${COULD_NOT} you are not signed in to Vercel. Open Terminal, run: vercel login, then try again.`;
// The list holds teammates' names and commit messages, so when it cannot be read none of it is shown or passed on.
const LOG_NO_LIST = `${COULD_NOT} the Vercel tool's list of deploys could not be read. Open this project on vercel.com to see why the last deploy failed.`;
// The same three lines for a watch, which asks about the latest deploy rather than why one failed.
const watchWords = (prefix: string) => ({
  noCli: `${prefix} the Vercel tool is not installed. Install it with: npm install -g vercel`,
  noLogin: `${prefix} you are not signed in to Vercel. Open Terminal, run: vercel login, then try again.`,
  noList: `${prefix} the Vercel tool's list of deploys could not be read. Open this project on vercel.com to look.`,
});
// The list of 20 deployments with their GitHub details runs to tens of thousands of characters (pretty printed JSON).
const LIST_KEEP = 256_000;
// The team (or personal account) the linked project belongs to, as Vercel writes its id: never anything a shell could read.
const ORG_ID = /^(?:team_)?[A-Za-z0-9]+$/;
const DEPLOYMENT_HOST = /^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.vercel\.app$/i;
const STATUS = /\b(Ready|Error|Building|Queued|Initializing|Canceled|Deploying|Analyzing)\b/;
const LOG_LINE = /^\[?\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/m;
// Is the Vercel tool on the tool path Companion runs commands with? (Tests say yes, so they never depend on this Mac.)
const cliOnPath = () => process.env.COMPANION_TEST_ASSUME_TOOLS === "1" || (minimalEnv().PATH ?? "").split(":").some((d) => d && existsSync(join(d, "vercel")));

/** The deployments `vercel list --format json` printed, newest first. */
type Listed = { url: string; state: string; createdAt?: number };
export function parseDeploymentList(stdout: string): Listed[] | null {
  const a = stdout.indexOf("{"), b = stdout.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let j: any;
  try { j = JSON.parse(stdout.slice(a, b + 1)); } catch { return null; }
  if (!Array.isArray(j?.deployments)) return null;
  return j.deployments
    .map((d: any) => ({ url: String(d?.url ?? ""), state: String(d?.state ?? d?.readyState ?? "").toUpperCase(), at: Number(d?.createdAt) || 0 }))
    .sort((x: { at: number }, y: { at: number }) => y.at - x.at)
    .map(({ url, state, at }: { url: string; state: string; at: number }) => ({ url, state, ...(at > 0 ? { createdAt: at } : {}) }));
}
// The id of the team the folder's link names (.vercel/project.json), or null.
function linkedOrg(project: string): string | null {
  try { const id = JSON.parse(readFileSync(join(project, ".vercel", "project.json"), "utf8"))?.orgId; return typeof id === "string" && ORG_ID.test(id) ? id : null; } catch { return null; }
}
/** The table an older `vercel list` prints (no --format there): one row per deployment, newest first. */
export function parseDeploymentTable(text: string): Listed[] {
  const out: Listed[] = [];
  for (const line of text.split("\n")) {
    const url = /https:\/\/\S+?\.vercel\.app\b/.exec(line)?.[0], st = STATUS.exec(line.replace(/https:\/\/\S+/g, ""))?.[1];
    if (url && st) out.push({ url, state: st.toUpperCase() });
  }
  return out;
}
const LOGIN_FLOW = /Starting login flow|oauth\/device|No existing credentials/i;
const URL_RE = /https:\/\/[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.vercel\.app\b[^\s)"']*/gi;
const plain = (r: RunResult) => clip(redact(`${r.stderr}\n${r.stdout}`).replace(/\s+/g, " ").trim(), 300);

export class VercelCli implements Deployer, DeployLogReader, LatestDeployReader {
  // scale: "my internet is slow" (2) doubles the waits for a deploy, going live and rolling back; read at each call.
  constructor(private run: typeof runCommand = runCommand, private authFile = join(homedir(), "Library", "Application Support", "com.vercel.cli", "auth.json"), private hasCli: () => boolean = cliOnPath, private scale: () => number = () => 1) {}
  // Only whether the file exists: its contents are never opened.
  signedIn() { return existsSync(this.authFile); }

  private async vercel(args: string, project: string, timeoutMs: number, signal?: AbortSignal): Promise<{ r: RunResult; fail: string | null; unclear?: true }> {
    const r = await this.run(`vercel ${args}`, { cwd: project, timeoutMs, signal, stopWhen: LOGIN_FLOW });
    if (r.matched) return { r, fail: NOT_SIGNED_IN };
    if (r.aborted) return { r, fail: "Stopped.", unclear: true };
    if (r.timedOut) return { r, fail: "Vercel took too long, so I stopped it.", unclear: true };
    if (r.code === 127) return { r, fail: "The Vercel tool is not installed. Install it with: npm install -g vercel" };
    if (r.code !== 0) return { r, fail: `Vercel said no: ${plain(r) || "no details"}` };
    return { r, fail: null };
  }
  private lastUrl(r: RunResult): string | null {
    const all = `${r.stdout}\n${r.stderr}`.match(URL_RE);
    return all ? all[all.length - 1].replace(/[.,]+$/, "") : null;
  }

  async preview(project: string, signal?: AbortSignal) {
    const { r, fail, unclear } = await this.vercel("deploy --yes", project, 10 * 60_000 * this.scale(), signal);
    // A preview is never live, so for it a stop or a time limit does mean nothing went live.
    if (fail) return { ok: false as const, reason: unclear && r.timedOut ? `${fail} Nothing went live.` : fail };
    const url = this.lastUrl(r);
    return url ? { ok: true as const, url } : { ok: false as const, reason: "Vercel finished but did not give a preview link." };
  }
  async promote(url: string, project: string, signal?: AbortSignal) {
    if (!/^https:\/\/[a-z0-9.-]+\.vercel\.app\/?$/i.test(url)) return { ok: false as const, reason: "That is not a Vercel preview link." };
    const { r, fail, unclear } = await this.vercel(`promote ${url} --yes`, project, 5 * 60_000 * this.scale(), signal);
    if (fail) return { ok: false as const, reason: fail, ...(unclear ? { unclear } : {}) };
    return { ok: true as const, productionUrl: this.lastUrl(r) ?? undefined };
  }
  async rollback(project: string, signal?: AbortSignal) {
    const { fail, unclear } = await this.vercel("rollback --yes", project, 5 * 60_000 * this.scale(), signal);
    return fail ? { ok: false as const, reason: fail, ...(unclear ? { unclear } : {}) } : { ok: true as const };
  }

  // Read only, and checked in code: nothing but `vercel list` and `vercel inspect` is ever run here (readonly.ts).
  private reading(project: string, signal: AbortSignal | undefined) {
    return (args: string, timeoutMs: number, keep?: number): Promise<RunResult> => {
      const command = `vercel ${args}`;
      const refused = refuseWrite(command);
      if (refused) throw new Error(refused);
      return this.run(command, { cwd: project, timeoutMs, signal, stopWhen: LOGIN_FLOW, ...(keep ? { keep } : {}) });
    };
  }
  // The deployments of a linked project, newest first, or why they cannot be read.
  private async listed(project: string, signal: AbortSignal | undefined, words: { noCli: string; noLogin: string; noList: string; could: string }): Promise<{ deployments: Listed[] } | { fail: FailedBuild }> {
    if (!existsSync(join(project, ".vercel", "project.json"))) return { fail: { state: "not_linked" } };
    if (!this.hasCli()) return { fail: { state: "unavailable", reason: words.noCli } };
    if (!this.signedIn()) return { fail: { state: "unavailable", reason: words.noLogin } };
    const read = this.reading(project, signal);
    const stopped = (r: RunResult): FailedBuild | null =>
      r.aborted ? { state: "cancelled" } : r.matched ? { state: "unavailable", reason: words.noLogin }
      : r.timedOut ? { state: "unavailable", reason: `${words.could} Vercel took too long, so I stopped it.` }
      : r.code === 127 ? { state: "unavailable", reason: words.noCli } : null;
    // Kept whole: the default keeps only the end of a command's output, and a list cut short is not JSON.
    let r = await read("list --format json", 60_000, LIST_KEEP);
    let deployments: Listed[] | null = null;
    if (stopped(r)) return { fail: stopped(r)! };
    if (r.code === 0) deployments = parseDeploymentList(r.stdout);
    else if (/unknown or unexpected option|unknown option/i.test(`${r.stderr}\n${r.stdout}`)) {
      r = await read("list", 60_000, LIST_KEEP);
      if (stopped(r)) return { fail: stopped(r)! };
      if (r.code === 0) deployments = parseDeploymentTable(`${r.stderr}\n${r.stdout}`);
    }
    // A no from the tool says why on its error stream; a list it printed but that cannot be read is never shown.
    if (!deployments) return { fail: { state: "unavailable", reason: r.code === 0 ? words.noList : `${words.could} Vercel said no: ${plain({ ...r, stdout: "" }) || "no details"}` } };
    return { deployments };
  }

  // Read only: `vercel list`, then `vercel inspect <url> --logs` for the newest finished deploy if it failed.
  async lastFailedBuild(project: string, signal?: AbortSignal): Promise<FailedBuild> {
    const l = await this.listed(project, signal, { noCli: LOG_NO_CLI, noLogin: LOG_NO_LOGIN, noList: LOG_NO_LIST, could: COULD_NOT });
    if ("fail" in l) return l.fail;
    // The newest deploy that finished; one still building, queued or cancelled says nothing yet.
    const last = l.deployments.find((d) => d.state === "READY" || d.state === "ERROR");
    if (!last || last.state !== "ERROR") return { state: "none" };
    return this.buildLog(project, last, signal);
  }
  private async buildLog(project: string, last: Listed, signal: AbortSignal | undefined): Promise<FailedBuild> {
    const host = last.url.replace(/^https:\/\//, "").replace(/\/$/, "");
    if (!DEPLOYMENT_HOST.test(host)) return { state: "unavailable", reason: `${COULD_NOT} its address looked wrong, so I did not use it.` };
    const url = `https://${host}`;
    // `vercel list` looks in the team the link names; `vercel inspect` does not read the link and looks in the tool's
    // default team, so it is told the same team. [verify] with a team project that is not the default (T08).
    const org = linkedOrg(project);
    // Exit code 1 is what inspect gives for a failed deployment, so the log itself is what counts.
    const l = await this.reading(project, signal)(`inspect ${shq(url)} --logs${org ? ` --scope ${shq(org)}` : ""}`, 90_000, 64_000);
    if (l.aborted) return { state: "cancelled" };
    if (l.matched) return { state: "unavailable", reason: LOG_NO_LOGIN };
    if (l.timedOut) return { state: "unavailable", reason: `${COULD_NOT} Vercel took too long, so I stopped it.` };
    if (l.code === 127) return { state: "unavailable", reason: LOG_NO_CLI };
    const log = [l.stderr, l.stdout].filter(Boolean).join("\n");
    if (!LOG_LINE.test(log)) return { state: "unavailable", reason: `${COULD_NOT} Vercel said no: ${plain(l) || "no details"}` };
    return { state: "failed", url, log, ...(last.createdAt ? { createdAt: last.createdAt } : {}) };
  }

  // A watch (F21): how the newest finished deploy of a linked project ended, read only. building: a newer one is still going.
  async latestDeploy(project: string, signal?: AbortSignal): Promise<LatestDeploy> {
    const l = await this.listed(project, signal, { ...watchWords(COULD_NOT_WATCH), could: COULD_NOT_WATCH });
    if ("fail" in l) return l.fail as LatestDeploy;
    const last = l.deployments.find((d) => d.state === "READY" || d.state === "ERROR");
    const building = l.deployments.some((d) => ["BUILDING", "QUEUED", "INITIALIZING", "DEPLOYING", "ANALYZING"].includes(d.state)) && (!last || l.deployments.indexOf(last) > 0);
    if (!last) return { state: "none", building };
    return { state: last.state === "ERROR" ? "failed" : "ready", url: last.url, building, ...(last.createdAt ? { createdAt: last.createdAt } : {}) };
  }
}

// ---------- the record of what went live ----------

// unconfirmed: a live step that was sent but cut short, so whether it went live is not known (Roll back stays possible).
export type ShipReceipt = { at: string; action: "preview" | "live" | "rollback"; snapshot: string; url?: string; productionUrl?: string; gates: { id: string; status: string }[]; proof: string; unconfirmed?: true };
const FILE = ".companion/ships.json";

// Read and written safely (companionfile.ts): never through a link.
export function readShips(project: string): ShipReceipt[] {
  const r = readCompanionFile(project, "ships.json", 1024 * 1024);
  if (r.state !== "ok") return [];
  try { const j = JSON.parse(r.text); return Array.isArray(j) ? j : []; } catch { return []; }
}
export function addShipReceipt(project: string, r: ShipReceipt) {
  if (!companionDirUsable(project)) throw new Error("The project's .companion folder is a link, so the record was not written.");
  const f = join(project, FILE);
  mkdirSync(dirname(f), { recursive: true });
  // A record that is there but cannot be understood (cut short, edited by hand into something else) is kept next to the new
  // one as ships.damaged.json, never written over: Roll back looks for the last live version in it.
  const read = readCompanionFile(project, "ships.json", 1024 * 1024);
  if (read.state === "ok") {
    let fine = false;
    try { fine = Array.isArray(JSON.parse(read.text)); } catch { /* damaged */ }
    if (!fine) {
      const keep = join(dirname(f), "ships.damaged.json");
      writeAtomic(existsSync(keep) ? join(dirname(f), `ships.damaged-${Date.now()}.json`) : keep, read.text);
    }
  }
  writeAtomic(f, JSON.stringify([...readShips(project), r].slice(-50), null, 2) + "\n");
}
