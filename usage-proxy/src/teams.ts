// M124: Squibby for teams, the team layer on the account server. One Durable Object per team ("team:<id>"): who is in it,
// the team's house rules, and the receipt summaries its members chose to share. Receipts and rules only: never a model
// request, never code, never the conversation (rule 1, rule 15). Signed in only; off unless TEAMS_ON.
import type { StorageLike } from "./store-do.ts";

export const MAX_MEMBERS = 50;
export const MAX_RULES = 50;
export const MAX_RECEIPTS = 500;
export const RULE_KINDS = ["never_edit", "never_run", "ask_edit", "ask_run", "ask_install"] as const;
export type RuleKind = (typeof RULE_KINDS)[number];
export type TeamRule = { kind: RuleKind; pattern: string };
export type Member = { ownerId: string; name: string; role: "admin" | "member"; joined: number };
export type Team = { id: string; name: string; made: number; inviteHash: string };
export const VERDICTS = ["works", "needs_you", "not_done", "put_back"] as const;
export type SharedReceipt = {
  project: string; tool: string; verdict: (typeof VERDICTS)[number]; lines: string[];
  checks: { label: string; result: "passed" | "failed" | "skipped" }[]; flags: string[]; asked?: { kept: number; missing: number };
};
export type KeptReceipt = SharedReceipt & { seq: number; by: string; at: number };
export type TeamView = { id: string; name: string; role: "admin" | "member"; me: string; members: { name: string; role: "admin" | "member" }[]; rules: TeamRule[] };

type Op = (s: StorageLike, a: any) => Promise<unknown>;
const members = async (s: StorageLike) => ((await s.get<Member[]>("members")) ?? []);
const me = (list: Member[], ownerId: string) => list.find((m) => m.ownerId === ownerId) ?? null;
const RKEY = (seq: number) => `r:${String(seq).padStart(10, "0")}`;

export const TEAM_OPS: Record<string, Op> = {
  "team.create": async (s, a: { id: string; name: string; ownerId: string; memberName: string; inviteHash: string; now: number }) => {
    if (await s.get("team")) return false;
    await s.put({ team: { id: a.id, name: a.name, made: a.now, inviteHash: a.inviteHash } satisfies Team, members: [{ ownerId: a.ownerId, name: a.memberName, role: "admin", joined: a.now }] satisfies Member[], rules: [], seq: 0 });
    return true;
  },
  "team.join": async (s, a: { ownerId: string; name: string; inviteHash: string; now: number }) => {
    const t = await s.get<Team>("team");
    if (!t || t.inviteHash !== a.inviteHash) return "bad_invite";
    const list = await members(s);
    if (me(list, a.ownerId)) return "already";
    if (list.length >= MAX_MEMBERS) return "full";
    if (list.some((m) => m.name.toLowerCase() === a.name.toLowerCase())) return "name_taken";
    await s.put({ members: [...list, { ownerId: a.ownerId, name: a.name, role: "member", joined: a.now }] });
    return "joined";
  },
  "team.view": async (s, a: { ownerId: string }): Promise<TeamView | null> => {
    const t = await s.get<Team>("team"), list = await members(s), m = me(list, a.ownerId);
    if (!t || !m) return null;
    return { id: t.id, name: t.name, role: m.role, me: m.name, members: list.map(({ name, role }) => ({ name, role })), rules: (await s.get<TeamRule[]>("rules")) ?? [] };
  },
  "team.post": async (s, a: { ownerId: string; receipt: SharedReceipt; now: number }) => {
    const m = me(await members(s), a.ownerId);
    if (!m) return null;
    const seq = ((await s.get<number>("seq")) ?? 0) + 1;
    await s.put({ seq, [RKEY(seq)]: { ...a.receipt, seq, by: m.name, at: a.now } satisfies KeptReceipt });
    if (seq > MAX_RECEIPTS) {
      const old = await s.list<KeptReceipt>({ prefix: "r:", limit: Math.min(128, seq - MAX_RECEIPTS) });
      if (old.size) await s.delete([...old.keys()]);
    }
    return seq;
  },
  "team.receipts": async (s, a: { ownerId: string; limit: number; before?: number }) => {
    if (!me(await members(s), a.ownerId)) return null;
    const got = await s.list<KeptReceipt>({ prefix: "r:", reverse: true, limit: 600 });
    return [...got.values()].filter((r) => a.before === undefined || r.seq < a.before).slice(0, a.limit);
  },
  "team.setRules": async (s, a: { ownerId: string; rules: TeamRule[] }) => {
    const m = me(await members(s), a.ownerId);
    if (!m) return "not_member";
    if (m.role !== "admin") return "not_admin";
    await s.put({ rules: a.rules });
    return "saved";
  },
  "team.invite": async (s, a: { ownerId: string; inviteHash: string }) => {
    const m = me(await members(s), a.ownerId), t = await s.get<Team>("team");
    if (!t || !m) return "not_member";
    if (m.role !== "admin") return "not_admin";
    await s.put({ team: { ...t, inviteHash: a.inviteHash } });
    return "saved";
  },
  "team.remove": async (s, a: { ownerId: string; name: string }) => {
    const list = await members(s), m = me(list, a.ownerId);
    if (!m) return "not_member";
    if (m.role !== "admin") return "not_admin";
    const gone = list.find((x) => x.name.toLowerCase() === a.name.toLowerCase());
    if (!gone || gone.ownerId === a.ownerId) return "unknown";
    await s.put({ members: list.filter((x) => x !== gone) });
    return "removed";
  },
  // Leaving: the last person out removes the whole team (its receipts too). If the last admin leaves, the member who joined
  // first becomes the admin, so a team is never left without one.
  "team.leave": async (s, a: { ownerId: string }) => {
    const list = await members(s), m = me(list, a.ownerId);
    if (!m) return "not_member";
    const rest = list.filter((x) => x.ownerId !== a.ownerId);
    if (!rest.length) {
      for (;;) { const r = await s.list({ prefix: "r:", limit: 128 }); if (!r.size) break; await s.delete([...r.keys()]); }
      await s.delete(["team", "members", "rules", "seq"]);
      return "team_gone";
    }
    if (!rest.some((x) => x.role === "admin")) rest.sort((x, y) => x.joined - y.joined)[0].role = "admin";
    await s.put({ members: rest });
    return "left";
  },
};
