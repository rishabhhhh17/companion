// M124: the team routes. Signed in only (the Squibby sign in token, never a Claude key); off unless TEAMS_ON. Every shared
// receipt is checked again here (shape, sizes, nothing that looks like a key, a password block or a folder of a Mac), so a
// bad client cannot put more on the team's board than the plain summary the app shows.
import { callObject, type NamespaceLike } from "./store-do.ts";
import { hashToken, tokenFromHeaders } from "./tokens.ts";
import { jsonNoStore, readCapped } from "./http.ts";
import { MAX_RULES, RULE_KINDS, VERDICTS, type KeptReceipt, type SharedReceipt, type TeamRule, type TeamView } from "./teams.ts";

export const TEAMS_PATH = "/v1/teams";
const ID = /^[A-Za-z0-9_-]{16}$/;
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const TEAM = (id: string) => `team:${id}`;

export type TeamDeps = {
  ns: NamespaceLike; on: () => boolean; now: () => number;
  userOf: (token: string) => Promise<{ id: string; active: boolean } | null>;
};

const SECRETY = /\b(?:sk-[A-Za-z0-9_-]{16,}|sk_(?:live|test)_[A-Za-z0-9]{10,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|cmp_[A-Za-z0-9_-]{20,})|-----BEGIN [A-Z ]*PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/;
const MAC_PATH = /(?:^|[\s"'(])(?:\/Users\/|\/home\/|\/private\/|\/var\/folders\/|~\/|[A-Za-z]:\\)/;
const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t && t.length <= max && !SECRETY.test(t) && !MAC_PATH.test(t) ? t : null;
};

/** A shared receipt as the server keeps it, or null when anything in it is out of shape. */
export function cleanReceipt(v: unknown): SharedReceipt | null {
  const r = v as Record<string, unknown> | null;
  if (!r || typeof r !== "object") return null;
  const project = text(r.project, 80), tool = text(r.tool, 40);
  const verdict = VERDICTS.find((x) => x === r.verdict);
  if (!project || !tool || !verdict) return null;
  const list = (x: unknown, n: number, max: number) => (Array.isArray(x) && x.length <= n ? x.map((y) => text(y, max)) : null);
  const lines = list(r.lines ?? [], 6, 200), flags = list(r.flags ?? [], 2, 200);
  if (!lines || lines.some((x) => x === null) || !flags || flags.some((x) => x === null)) return null;
  const checksIn = r.checks ?? [];
  if (!Array.isArray(checksIn) || checksIn.length > 6) return null;
  const checks = checksIn.map((c) => { const label = text((c as { label?: unknown })?.label, 80), result = (c as { result?: unknown })?.result; return label && (result === "passed" || result === "failed" || result === "skipped") ? { label, result } : null; });
  if (checks.some((c) => c === null)) return null;
  const a = r.asked as { kept?: unknown; missing?: unknown } | undefined;
  const ok = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 5;
  if (a !== undefined && !(a && ok(a.kept) && ok(a.missing))) return null;
  return { project, tool, verdict, lines: lines as string[], checks: checks as SharedReceipt["checks"], flags: flags as string[], ...(a ? { asked: { kept: a.kept as number, missing: a.missing as number } } : {}) };
}

export function cleanRules(v: unknown): TeamRule[] | null {
  if (!Array.isArray(v) || v.length > MAX_RULES) return null;
  const out: TeamRule[] = [];
  for (const x of v) {
    const kind = RULE_KINDS.find((k) => k === (x as { kind?: unknown })?.kind), pattern = text((x as { pattern?: unknown })?.pattern, 200);
    if (!kind || !pattern) return null;
    out.push({ kind, pattern });
  }
  return out;
}
const cleanName = (v: unknown) => { const t = text(v, 40); return t && /^[\p{L}\p{N} .'-]+$/u.test(t) ? t : null; };

export function makeTeamRoutes(d: TeamDeps): (req: Request, url: URL) => Promise<Response | null> {
  const call = <T>(id: string, op: string, args: Record<string, unknown>) => callObject<T>(d.ns, TEAM(id), op, args);
  const body = async (req: Request) => { const raw = await readCapped(req, 16_384); try { return raw === null ? null : JSON.parse(raw) as Record<string, unknown>; } catch { return null; } };
  const newInvite = async (id: string) => { const secret = b64url(crypto.getRandomValues(new Uint8Array(24))); return { code: `${id}.${secret}`, hash: await hashToken(secret) }; };
  const bad = (msg: string, status = 400) => jsonNoStore({ error: msg }, status);

  return async (req, url) => {
    const p = url.pathname;
    if (p !== TEAMS_PATH && !p.startsWith(`${TEAMS_PATH}/`)) return null;
    if (!d.on()) return jsonNoStore({ error: "Teams are not open yet." }, 404);
    const token = tokenFromHeaders(req.headers);
    const user = token ? await d.userOf(token) : null;
    if (!user) return bad("Sign in to Squibby to use teams.", 401);
    if (!user.active) return bad("This account cannot use teams right now.", 403);
    const now = d.now(), parts = p.slice(TEAMS_PATH.length).split("/").filter(Boolean);

    if (req.method === "POST" && parts.length === 0) {
      const b = await body(req), name = text(b?.name, 60), memberName = cleanName(b?.me);
      if (!name || !memberName) return bad("A team needs a name, and you need a name in it.");
      const id = b64url(crypto.getRandomValues(new Uint8Array(12))), inv = await newInvite(id);
      if (!(await call<boolean>(id, "team.create", { id, name, ownerId: user.id, memberName, inviteHash: inv.hash, now }))) return bad("Try again.", 409);
      return jsonNoStore({ id, name, invite: inv.code });
    }
    if (req.method === "POST" && parts.length === 1 && parts[0] === "join") {
      const b = await body(req), code = typeof b?.invite === "string" ? b.invite.trim() : "", name = cleanName(b?.me);
      const [id, secret] = code.split(".");
      if (!id || !ID.test(id) || !secret || !name) return bad("That invite code does not look right.");
      const r = await call<string>(id, "team.join", { ownerId: user.id, name, inviteHash: await hashToken(secret), now });
      if (r === "joined" || r === "already") return jsonNoStore({ id, joined: true });
      return bad(r === "full" ? "This team is full." : r === "name_taken" ? "Someone in this team already uses that name. Pick another." : "That invite code does not work. Ask for a new one.", r === "bad_invite" ? 403 : 409);
    }
    const id = parts[0];
    if (!id || !ID.test(id)) return bad("Not found.", 404);
    const rest = parts.slice(1);
    if (req.method === "GET" && rest.length === 0) {
      const v = await call<TeamView | null>(id, "team.view", { ownerId: user.id });
      return v ? jsonNoStore(v) : bad("You are not in this team.", 403);
    }
    if (rest[0] === "receipts" && rest.length === 1) {
      if (req.method === "POST") {
        const b = await body(req), r = cleanReceipt(b?.receipt);
        if (!r) return bad("That receipt could not be shared.");
        const seq = await call<number | null>(id, "team.post", { ownerId: user.id, receipt: r, now });
        return seq === null ? bad("You are not in this team.", 403) : jsonNoStore({ seq });
      }
      if (req.method === "GET") {
        const before = Number(url.searchParams.get("before")), limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));
        const list = await call<KeptReceipt[] | null>(id, "team.receipts", { ownerId: user.id, limit, ...(Number.isInteger(before) && before > 0 ? { before } : {}) });
        return list === null ? bad("You are not in this team.", 403) : jsonNoStore({ receipts: list });
      }
    }
    const admin = (r: string, ok: () => Response) => (r === "saved" || r === "removed" ? ok() : r === "not_admin" ? bad("Only a team admin can do that.", 403) : r === "unknown" ? bad("Nobody in this team has that name.", 404) : bad("You are not in this team.", 403));
    if (req.method === "PUT" && rest[0] === "rules" && rest.length === 1) {
      const rules = cleanRules((await body(req))?.rules);
      if (!rules) return bad(`Rules are one line each, at most ${MAX_RULES}, of the five kinds.`);
      return admin(await call<string>(id, "team.setRules", { ownerId: user.id, rules }), () => jsonNoStore({ rules }));
    }
    if (req.method === "POST" && rest[0] === "invite" && rest.length === 1) {
      const inv = await newInvite(id);
      return admin(await call<string>(id, "team.invite", { ownerId: user.id, inviteHash: inv.hash }), () => jsonNoStore({ invite: inv.code }));
    }
    if (req.method === "DELETE" && rest[0] === "members" && rest.length === 2) {
      return admin(await call<string>(id, "team.remove", { ownerId: user.id, name: decodeURIComponent(rest[1]) }), () => jsonNoStore({ removed: true }));
    }
    if (req.method === "POST" && rest[0] === "leave" && rest.length === 1) {
      const r = await call<string>(id, "team.leave", { ownerId: user.id });
      return r === "not_member" ? bad("You are not in this team.", 403) : jsonNoStore({ left: true, ...(r === "team_gone" ? { teamGone: true } : {}) });
    }
    return bad("Not found.", 404);
  };
}
