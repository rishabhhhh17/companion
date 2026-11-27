// M124: Squibby for teams, the engine side. Make or join a team with the Squibby sign in (never a Claude key), keep which
// team on this Mac (team.json, 0600), apply the team's rules on top of each project's own (rules.ts setTeamRules), and
// share a receipt's plain summary only when the person turned "Share my receipts with my team" on (rule 13).
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { setTeamRules } from "./rules.ts";
import { clip, redact } from "./redact.ts";

export type TeamAuth = { token: string; base: string };
export type TeamState = { id: string; name: string; me: string; share: boolean };
export type TeamRule = { kind: string; pattern: string };
export type TeamView = { id: string; name: string; role: "admin" | "member"; me: string; members: { name: string; role: "admin" | "member" }[]; rules: TeamRule[] };
export type Verdict = "works" | "needs_you" | "not_done" | "put_back";
export type TeamReceipt = { project: string; tool: string; verdict: Verdict; lines: string[]; checks: { label: string; result: "passed" | "failed" | "skipped" }[]; flags: string[]; asked?: { kept: number; missing: number } };
type Fail = { ok: false; reason: "signIn" | "offline" | "refused" | "off" | "none"; say?: string };

const ID = /^[A-Za-z0-9_-]{16}$/;
const MAC_PATH = /(?:\/Users\/|\/home\/|\/private\/|\/var\/folders\/|~\/)[^\s"')]*/g;
/** One plain line for the team: keys hidden, a folder of this Mac said as its last name only, one line, clipped. */
const line = (s: string, max = 160) => clip(redact(String(s ?? "")).replace(MAC_PATH, (m) => basename(m.replace(/\/+$/, ""))).replace(/\s+/g, " ").trim(), max);

/** The plain summary a team sees for one receipt. Never code, file contents, a folder of this Mac, keys or the conversation. */
export function receiptSummary(r: { project: string; tool: string; label: string; changed: number; proof: string; ended: string; undone: boolean;
  checks: { label: string; status: string }[]; flags: string[]; asked?: { kept: number; missing: number } }): TeamReceipt {
  const missing = r.asked?.missing ?? 0;
  const verdict: Verdict = r.undone ? "put_back" : r.ended === "needs_you" ? "needs_you" : r.ended === "done" && r.proof === "passed" && missing === 0 ? "works" : "not_done";
  const lines = [line(r.label), r.changed === 1 ? "1 file changed" : `${r.changed} files changed`, ...r.flags.slice(0, 2).map((f) => line(f, 200))].filter(Boolean).slice(0, 6);
  const checks = r.checks.slice(0, 6).map((c) => ({ label: line(c.label, 80), result: (c.status === "passed" || c.status === "failed" ? c.status : "skipped") as "passed" | "failed" | "skipped" })).filter((c) => c.label);
  return { project: line(basename(r.project.replace(/\/+$/, "")), 80) || "project", tool: line(r.tool, 40) || "ai", verdict, lines, checks, flags: r.flags.slice(0, 2).map((f) => line(f, 200)).filter(Boolean),
    ...(r.asked ? { asked: { kept: r.asked.kept, missing: r.asked.missing } } : {}) };
}

export class TeamClient {
  private view: TeamView | null = null;
  constructor(private d: { dir: string; auth: () => Promise<TeamAuth | null>; fetchFn?: typeof fetch }) {
    const s = this.state();
    if (!s) setTeamRules([]);
  }
  private file() { return join(this.d.dir, "team.json"); }
  state(): TeamState | null {
    try { const j = JSON.parse(readFileSync(this.file(), "utf8")); return j && ID.test(j.id) && typeof j.name === "string" && typeof j.me === "string" ? { id: j.id, name: j.name, me: j.me, share: j.share === true } : null; } catch { return null; }
  }
  private save(s: TeamState | null) {
    if (!s) { rmSync(this.file(), { force: true }); return; }
    mkdirSync(this.d.dir, { recursive: true, mode: 0o700 });
    const tmp = `${this.file()}.tmp`;
    writeFileSync(tmp, JSON.stringify(s), { mode: 0o600 }); renameSync(tmp, this.file()); chmodSync(this.file(), 0o600);
  }
  lastView() { return this.view; }

  private async req<T>(method: string, path: string, body?: unknown): Promise<{ ok: true; j: T } | Fail> {
    const a = await this.d.auth().catch(() => null);
    if (!a) return { ok: false, reason: "signIn" };
    let base: string;
    try { const u = new URL(a.base); if (u.protocol !== "https:") return { ok: false, reason: "signIn" }; base = u.origin; } catch { return { ok: false, reason: "signIn" }; }
    let res: Response;
    try { res = await (this.d.fetchFn ?? fetch)(`${base}${path}`, { method, headers: { "content-type": "application/json", authorization: `Bearer ${a.token}` }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), redirect: "error", signal: AbortSignal.timeout(20_000) }); }
    catch { return { ok: false, reason: "offline" }; }
    let j: Record<string, unknown> = {};
    try { j = await res.json() as Record<string, unknown>; } catch { /* checked below */ }
    if (!res.ok) return { ok: false, reason: "refused", ...(typeof j.error === "string" ? { say: j.error.slice(0, 200) } : {}) };
    return { ok: true, j: j as T };
  }

  /** Ask the server for the team (members, roles, rules) and apply its rules. */
  async refresh(): Promise<{ ok: true; view: TeamView } | Fail> {
    const s = this.state();
    if (!s) return { ok: false, reason: "none" };
    const r = await this.req<TeamView>("GET", `/v1/teams/${s.id}`);
    if (!r.ok) return r;
    this.view = r.j; setTeamRules(Array.isArray(r.j.rules) ? r.j.rules : []);
    return { ok: true, view: r.j };
  }
  async make(name: string, me: string): Promise<{ ok: true; invite: string } | Fail> {
    const r = await this.req<{ id: string; name: string; invite: string }>("POST", "/v1/teams", { name, me });
    if (!r.ok) return r;
    if (!ID.test(r.j.id)) return { ok: false, reason: "refused" };
    this.save({ id: r.j.id, name: r.j.name, me, share: false });
    await this.refresh();
    return { ok: true, invite: r.j.invite };
  }
  async join(invite: string, me: string): Promise<{ ok: true } | Fail> {
    const r = await this.req<{ id: string }>("POST", "/v1/teams/join", { invite: invite.trim(), me });
    if (!r.ok) return r;
    if (!ID.test(r.j.id)) return { ok: false, reason: "refused" };
    this.save({ id: r.j.id, name: "", me, share: false });
    const v = await this.refresh();
    if (v.ok) this.save({ id: r.j.id, name: v.view.name, me, share: false });
    return { ok: true };
  }
  async leave(): Promise<{ ok: true } | Fail> {
    const s = this.state();
    if (!s) return { ok: false, reason: "none" };
    const r = await this.req("POST", `/v1/teams/${s.id}/leave`);
    if (!r.ok && r.reason !== "refused") return r;   // refused: not in the team any more; forget it here too
    this.save(null); this.view = null; setTeamRules([]);
    return { ok: true };
  }
  setShare(on: boolean) { const s = this.state(); if (s) this.save({ ...s, share: on }); }
  async share(summary: TeamReceipt): Promise<{ ok: true } | Fail> {
    const s = this.state();
    if (!s || !s.share) return { ok: false, reason: "off" };
    const r = await this.req("POST", `/v1/teams/${s.id}/receipts`, { receipt: summary });
    return r.ok ? { ok: true } : r;
  }
  async receipts(before?: number) { const s = this.state(); if (!s) return { ok: false as const, reason: "none" as const }; return this.req<{ receipts: unknown[] }>("GET", `/v1/teams/${s.id}/receipts${before ? `?before=${before}` : ""}`); }
  async setRules(rules: TeamRule[]) { const s = this.state(); if (!s) return { ok: false as const, reason: "none" as const }; const r = await this.req<{ rules: TeamRule[] }>("PUT", `/v1/teams/${s.id}/rules`, { rules }); if (r.ok) setTeamRules(r.j.rules); return r; }
  async newInvite() { const s = this.state(); if (!s) return { ok: false as const, reason: "none" as const }; return this.req<{ invite: string }>("POST", `/v1/teams/${s.id}/invite`); }
  async remove(name: string) { const s = this.state(); if (!s) return { ok: false as const, reason: "none" as const }; return this.req("DELETE", `/v1/teams/${s.id}/members/${encodeURIComponent(name)}`); }
}
