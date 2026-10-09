// Putting a project on the internet, through the person's own Vercel login. Companion never holds a deploy token:
// the Vercel tool keeps the login in its own place, and everything it says is cleaned before it is shown or saved.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { runCommand, type RunResult } from "../proof/exec.ts";
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
const LOGIN_FLOW = /Starting login flow|oauth\/device|No existing credentials/i;
const URL_RE = /https:\/\/[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.vercel\.app\b[^\s)"']*/gi;
const plain = (r: RunResult) => clip(redact(`${r.stderr}\n${r.stdout}`).replace(/\s+/g, " ").trim(), 300);

export class VercelCli implements Deployer {
  constructor(private run: typeof runCommand = runCommand, private authFile = join(homedir(), "Library", "Application Support", "com.vercel.cli", "auth.json")) {}
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
