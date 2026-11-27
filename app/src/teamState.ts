// M124: Squibby for teams on the page. Only what the engine said (team.state): the team, its receipts, an invite code, and
// what the last press did, in plain words. Pure, so it is tested without a page.
import { S } from "./strings.ts";

export type TeamInfo = { id: string; name: string; me: string; share: boolean; role?: "admin" | "member"; members?: { name: string; role: "admin" | "member" }[]; rules?: { kind: string; pattern: string }[] };
export type TeamRow = { seq: number; by: string; at: number; project: string; tool: string; verdict: "works" | "needs_you" | "not_done" | "put_back"; lines: string[]; checks: { label: string; result: string }[]; flags: string[]; asked?: { kept: number; missing: number } };
export type TeamPage = { team: TeamInfo | null; receipts?: TeamRow[]; invite?: string; last?: { ok: boolean; did?: string; reason?: string; say?: string } };

const VERDICTS = new Set(["works", "needs_you", "not_done", "put_back"]);
const str = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v : null);

/** The page's view of one runner event, or null when it is not team.state. Anything out of shape is dropped. */
export function teamFrom(e: unknown): TeamPage | null {
  const v = e as Record<string, unknown> | null;
  if (!v || v.type !== "team.state") return null;
  const t = v.team as Record<string, unknown> | null;
  const team: TeamInfo | null = t && str(t.id, 40) && typeof t.name === "string" && typeof t.me === "string"
    ? { id: t.id as string, name: String(t.name).slice(0, 60), me: String(t.me).slice(0, 40), share: t.share === true,
        ...(t.role === "admin" || t.role === "member" ? { role: t.role } : {}),
        ...(Array.isArray(t.members) ? { members: (t.members as { name?: unknown; role?: unknown }[]).filter((m) => typeof m?.name === "string").slice(0, 50).map((m) => ({ name: String(m.name).slice(0, 40), role: m.role === "admin" ? "admin" as const : "member" as const })) } : {}),
        ...(Array.isArray(t.rules) ? { rules: (t.rules as { kind?: unknown; pattern?: unknown }[]).filter((r) => typeof r?.kind === "string" && typeof r?.pattern === "string").slice(0, 50).map((r) => ({ kind: String(r.kind), pattern: String(r.pattern).slice(0, 200) })) } : {}) }
    : null;
  const receipts = Array.isArray(v.receipts) ? (v.receipts as Record<string, unknown>[]).filter((r) => r && typeof r.seq === "number" && typeof r.by === "string" && typeof r.project === "string" && VERDICTS.has(String(r.verdict))).slice(0, 100).map((r) => ({
    seq: r.seq as number, by: String(r.by).slice(0, 40), at: typeof r.at === "number" ? r.at : 0, project: String(r.project).slice(0, 80), tool: String(r.tool ?? "").slice(0, 40), verdict: r.verdict as TeamRow["verdict"],
    lines: Array.isArray(r.lines) ? (r.lines as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 6).map((x) => x.slice(0, 200)) : [],
    checks: Array.isArray(r.checks) ? (r.checks as { label?: unknown; result?: unknown }[]).filter((c) => typeof c?.label === "string").slice(0, 6).map((c) => ({ label: String(c.label).slice(0, 80), result: String(c.result) })) : [],
    flags: Array.isArray(r.flags) ? (r.flags as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 2).map((x) => x.slice(0, 200)) : [],
    ...(r.asked && typeof (r.asked as { kept?: unknown }).kept === "number" ? { asked: { kept: (r.asked as { kept: number }).kept, missing: Number((r.asked as { missing?: unknown }).missing) || 0 } } : {}),
  })) : undefined;
  const last = v.last && typeof v.last === "object" ? v.last as TeamPage["last"] : undefined;
  return { team, ...(receipts ? { receipts } : {}), ...(typeof v.invite === "string" ? { invite: v.invite.slice(0, 120) } : {}), ...(last ? { last } : {}) };
}

/** What the last press did, in plain words, or null when there is nothing to say. */
export function lastWords(l: TeamPage["last"]): string | null {
  if (!l) return null;
  const w = S.team;
  if (l.ok) return l.did === "make" ? w.made : l.did === "join" ? w.joined : l.did === "leave" ? w.left : l.did === "rules" ? w.rulesSaved : l.did === "invite" ? w.newInvite : l.did === "remove" ? w.removed : null;
  if (l.reason === "signIn") return w.signIn;
  if (l.reason === "offline") return w.offline;
  return l.say ?? w.failed;
}

/** A rule as a line: the five kinds, said the way house rules are written. */
export const ruleLine = (r: { kind: string; pattern: string }) => (S.team.ruleKinds[r.kind as keyof typeof S.team.ruleKinds] ?? r.kind) + (r.kind === "ask_install" ? "" : ` ${r.pattern}`);
