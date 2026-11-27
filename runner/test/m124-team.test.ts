// M124, the engine side of teams: the Squibby sign in only, https only; nothing is shared until the person turns sharing on;
// a shared receipt is the plain summary only (redacted); team rules add to the project's own, never loosen them.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TeamClient, receiptSummary } from "../src/team.ts";
import { loadRules, setTeamRules } from "../src/rules.ts";

const made: string[] = [];
afterEach(() => { setTeamRules([]); while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const dir = () => { const d = mkdtempSync(join(tmpdir(), "companion-m124-")); made.push(d); return d; };
const TOKEN = "cmp_" + "t".repeat(40);
const auth = async () => ({ token: TOKEN, base: "https://api.example.test" });
type Seen = { url: string; method: string; body: any; auth: string | null };
const server = (answers: Record<string, unknown>) => {
  const seen: Seen[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    seen.push({ url, method: String(init.method ?? "GET"), body: init.body ? JSON.parse(String(init.body)) : null, auth: (init.headers as Record<string, string>)?.authorization ?? null });
    const key = `${init.method ?? "GET"} ${new URL(url).pathname}`;
    const a = Object.entries(answers).find(([k]) => key.startsWith(k))?.[1];
    return new Response(JSON.stringify(a ?? { error: "no" }), { status: a ? 200 : 404 });
  }) as unknown as typeof fetch;
  return { seen, fetchFn };
};
const VIEW = { id: "A".repeat(16), name: "bloom studio", role: "admin", me: "Ana", members: [{ name: "Ana", role: "admin" }], rules: [{ kind: "never_edit", pattern: "pricing.txt" }] };

describe("the team client", () => {
  test("no Squibby sign in: nothing is sent", async () => {
    const s = server({});
    const c = new TeamClient({ dir: dir(), auth: async () => null, fetchFn: s.fetchFn });
    expect(await c.make("bloom studio", "Ana")).toEqual({ ok: false, reason: "signIn" });
    expect(s.seen).toEqual([]);
  });
  test("make a team: the team is kept on this Mac (0600), sharing starts off, its rules are applied", async () => {
    const d = dir(), s = server({ "POST /v1/teams": { id: VIEW.id, name: "bloom studio", invite: `${VIEW.id}.secret` }, "GET /v1/teams/": VIEW });
    const c = new TeamClient({ dir: d, auth, fetchFn: s.fetchFn });
    const r = await c.make("bloom studio", "Ana");
    expect(r).toMatchObject({ ok: true, invite: `${VIEW.id}.secret` });
    expect(s.seen[0].auth).toBe(`Bearer ${TOKEN}`);
    expect(statSync(join(d, "team.json")).mode & 0o777).toBe(0o600);
    expect(c.state()).toMatchObject({ id: VIEW.id, name: "bloom studio", share: false });
    const p = dir();
    expect(loadRules(p).rules.map((x) => x.text)).toEqual(["never edit pricing.txt"]);
  });
  test("a receipt is shared only with sharing on, and only the summary", async () => {
    const d = dir(), s = server({ "POST /v1/teams/join": { id: VIEW.id, joined: true }, "GET /v1/teams/": VIEW, "POST /v1/teams/AAAAAAAAAAAAAAAA/receipts": { seq: 1 } });
    const c = new TeamClient({ dir: d, auth, fetchFn: s.fetchFn });
    await c.join(`${VIEW.id}.secret`, "Jon");
    const sum = { project: "my-shop", tool: "squibby", verdict: "works" as const, lines: ["add a pricing page"], checks: [], flags: [] };
    expect(await c.share(sum)).toEqual({ ok: false, reason: "off" });
    expect(s.seen.some((x) => x.url.endsWith("/receipts"))).toBe(false);
    c.setShare(true);
    expect(await c.share(sum)).toEqual({ ok: true });
    expect(s.seen.at(-1)!.body).toEqual({ receipt: sum });
  });
  test("leave forgets the team and its rules on this Mac", async () => {
    const d = dir(), s = server({ "POST /v1/teams/join": { id: VIEW.id, joined: true }, "GET /v1/teams/": VIEW, "POST /v1/teams/AAAAAAAAAAAAAAAA/leave": { left: true } });
    const c = new TeamClient({ dir: d, auth, fetchFn: s.fetchFn });
    await c.join(`${VIEW.id}.secret`, "Jon");
    expect(await c.leave()).toEqual({ ok: true });
    expect(c.state()).toBeNull();
    expect(loadRules(dir()).rules).toEqual([]);
  });
  test("only https, and a team id of the right shape", async () => {
    const s = server({});
    const c = new TeamClient({ dir: dir(), auth: async () => ({ token: TOKEN, base: "http://api.example.test" }), fetchFn: s.fetchFn });
    expect((await c.make("x", "Ana")).ok).toBe(false);
    expect(s.seen).toEqual([]);
  });
});

describe("team rules only add to a project's own", () => {
  test("the project's rules stay, team rules are added, loosening kinds are never taken", () => {
    const p = dir(); mkdirSync(join(p, ".companion")); writeFileSync(join(p, ".companion", "rules.txt"), "never run rm -rf\n");
    setTeamRules([{ kind: "never_edit", pattern: "pricing.txt" }, { kind: "allow_read" as never, pattern: ".env" }]);
    expect(loadRules(p).rules.map((x) => x.text)).toEqual(["never run rm -rf", "never edit pricing.txt"]);
  });
});

describe("the summary a team sees", () => {
  test("plain words only: the project's name, never its folder; keys hidden; at most six lines", () => {
    const s = receiptSummary({ project: "/Users/ana/code/my-shop", tool: "cursor", label: "add a pricing page with key sk-ant-api03-" + "Z".repeat(40), changed: 3, proof: "failed", ended: "done", undone: false,
      checks: [{ label: "npm test", status: "passed" }, { label: "Opening it in a browser", status: "failed" }], flags: ["Not what you asked for: changed /Users/ana/code/my-shop/pricing.txt"], asked: { kept: 1, missing: 1 } });
    expect(s.project).toBe("my-shop");
    expect(s.verdict).toBe("not_done");
    expect(JSON.stringify(s)).not.toContain("ZZZZZZZZZZ");
    expect(JSON.stringify(s)).not.toContain("/Users/");
    expect(s.lines.length).toBeLessThanOrEqual(6);
    expect(s.checks).toEqual([{ label: "npm test", result: "passed" }, { label: "Opening it in a browser", result: "failed" }]);
    expect(s.asked).toEqual({ kept: 1, missing: 1 });
  });
  test("verdicts", () => {
    const base = { project: "/p/shop", tool: "squibby", label: "x", changed: 1, checks: [], flags: [] };
    expect(receiptSummary({ ...base, proof: "passed", ended: "done", undone: false }).verdict).toBe("works");
    expect(receiptSummary({ ...base, proof: "passed", ended: "needs_you", undone: false }).verdict).toBe("needs_you");
    expect(receiptSummary({ ...base, proof: "passed", ended: "done", undone: true }).verdict).toBe("put_back");
    expect(receiptSummary({ ...base, proof: "passed", ended: "done", undone: false, asked: { kept: 1, missing: 1 } }).verdict).toBe("not_done");
  });
});
