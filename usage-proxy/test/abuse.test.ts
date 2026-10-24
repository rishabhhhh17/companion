import { describe, expect, test } from "bun:test";
import { MemoryStore } from "../src/store.ts";
import { hashToken, newToken } from "../src/tokens.ts";
import { issueToken } from "../src/accounts.ts";
import { runOperator } from "../src/operator.ts";
import { deriveUserId, USER_ID_SECRET_SETTING } from "../src/userid.ts";
import { createProxy } from "../src/proxy.ts";

const SECRET = "operator-secret-for-tests-0123456789abcdef";
const NOW = Date.UTC(2026, 9, 24, 9, 0, 0);
const env = { [USER_ID_SECRET_SETTING]: SECRET };

async function world() {
  const store = new MemoryStore();
  const tokens: Record<string, string> = {};
  for (const [owner, plan] of [["owner-aaa", "pro"], ["owner-bbb", "free"], ["owner-ccc", "max"]] as const) {
    const a = await issueToken(store, owner, plan); if (!a.ok) throw new Error("setup");
    tokens[owner] = a.token;
  }
  const b2 = await newToken(); store.addUser(b2.hash, { id: "owner-aaa", plan: "pro", status: "active" });   // a second device for aaa
  return { store, tokens, second: b2.token };
}
const run = (store: MemoryStore, argv: string[], e: Record<string, string | undefined> = env) => runOperator(argv, e, store, () => NOW);

describe("signing a person in", () => {
  test("a token is issued and works for the owner", async () => {
    const s = new MemoryStore(); const a = await issueToken(s, "owner-x", "pro");
    expect(a.ok).toBe(true); if (!a.ok) return;
    expect(await s.userByTokenHash(await hashToken(a.token))).toEqual({ id: "owner-x", plan: "pro", status: "active" });
  });
  test("a suspended owner cannot be issued a new token, and nothing is stored for the attempt", async () => {
    const { store } = await world();
    await store.suspendOwner("owner-bbb", { at: NOW });
    const before = JSON.stringify(store.dump());
    const a = await issueToken(store, "owner-bbb", "free");
    expect(a.ok).toBe(false); if (a.ok) return;
    expect(a.message).toMatch(/paused|suspended/i);
    expect(JSON.stringify(store.dump())).toBe(before);
  });
  test("an empty owner id is refused", async () => { expect((await issueToken(new MemoryStore(), "", "free")).ok).toBe(false); });
});

describe("suspending one person", () => {
  test("all of their tokens stop working at once; other people are not touched", async () => {
    const { store, tokens, second } = await world();
    const r = await store.suspendOwner("owner-aaa", { at: NOW, caseId: "case-1" });
    expect(r).toEqual({ tokensRevoked: 2, alreadySuspended: false });
    for (const t of [tokens["owner-aaa"], second]) expect((await store.userByTokenHash(await hashToken(t)))?.status).not.toBe("active");
    expect((await store.userByTokenHash(await hashToken(tokens["owner-bbb"])))?.status).toBe("active");
    expect(await store.isSuspended("owner-aaa")).toBe(true);
    expect(await store.isSuspended("owner-bbb")).toBe(false);
  });
  test("suspending twice changes nothing the second time and says so", async () => {
    const { store } = await world();
    await store.suspendOwner("owner-aaa", { at: NOW });
    expect(await store.suspendOwner("owner-aaa", { at: NOW + 1000 })).toEqual({ tokensRevoked: 0, alreadySuspended: true });
    expect((await store.suspensions()).filter((x) => x.kind === "suspended").length).toBe(1);
  });
  test("the proxy refuses a suspended person's old token with a plain message and forwards nothing", async () => {
    const { store, tokens } = await world();
    let forwarded = 0;
    const handle = createProxy({ store, anthropicKey: "sk-ant-api03-OUR-KEY-0000000000", userIdSecret: SECRET, enabled: () => true, now: () => NOW,
      fetch: (async () => { forwarded++; return new Response("{}"); }) as unknown as typeof fetch });
    const body = JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 10, messages: [] });
    const send = () => handle(new Request("https://p.example/v1/messages", { method: "POST", headers: { "x-api-key": tokens["owner-aaa"] }, body }));
    expect((await send()).status).toBe(200);
    await store.suspendOwner("owner-aaa", { at: NOW });
    const r = await send(); expect(r.status).toBe(403); expect(forwarded).toBe(1);
    expect(JSON.stringify(await r.json())).toMatch(/paused/i);
  });
  test("a record is kept of ids and dates only: no text, no token, no hash", async () => {
    const { store } = await world();
    await store.suspendOwner("owner-aaa", { at: NOW, caseId: "case-1" });
    await store.restoreOwner("owner-aaa", { at: NOW + 3600_000, caseId: "case-1" });
    const recs = await store.suspensions();
    expect(recs).toEqual([{ ownerId: "owner-aaa", kind: "suspended", at: NOW, caseId: "case-1" }, { ownerId: "owner-aaa", kind: "restored", at: NOW + 3600_000, caseId: "case-1" }]);
  });
  test("a payment event that sets a plan cannot lift a suspension: the flag is separate from the token's status", async () => {
    const { store, tokens } = await world();
    await store.suspendOwner("owner-aaa", { at: NOW });
    store.addUser(await hashToken(tokens["owner-aaa"]), { id: "owner-aaa", plan: "max", status: "active" });   // what a late payment event would write
    expect((await store.userByTokenHash(await hashToken(tokens["owner-aaa"])))?.status).toBe("suspended");
  });
  test("restoring lifts the block for new tokens, but the old tokens stay dead", async () => {
    const { store, tokens } = await world();
    await store.suspendOwner("owner-aaa", { at: NOW });
    expect(await store.restoreOwner("owner-aaa", { at: NOW + 1 })).toBe(true);
    expect(await store.restoreOwner("owner-aaa", { at: NOW + 2 })).toBe(false);   // nothing to restore
    expect((await store.userByTokenHash(await hashToken(tokens["owner-aaa"])))?.status).toBe("revoked");
    const a = await issueToken(store, "owner-aaa", "pro"); expect(a.ok).toBe(true);
  });
});

describe("the operator command", () => {
  test("a dry run is the default: it finds the owner from the opaque id, says what it would do, and changes nothing", async () => {
    const { store, tokens } = await world();
    const id = await deriveUserId("owner-bbb", SECRET);
    const before = JSON.stringify(store.dump());
    const r = await run(store, ["--user-id", id]);
    expect(r.code).toBe(0);
    expect(r.lines.join("\n")).toContain("owner-bbb");
    expect(r.lines.join("\n")).toMatch(/dry run/i);
    expect(r.lines.join("\n")).toMatch(/--apply/);
    expect(JSON.stringify(store.dump())).toBe(before);
    expect((await store.userByTokenHash(await hashToken(tokens["owner-bbb"])))?.status).toBe("active");
  });
  test("--apply suspends that person, says how many tokens were cut, and leaves the others alone", async () => {
    const { store, tokens } = await world();
    const r = await run(store, ["--user-id", await deriveUserId("owner-aaa", SECRET), "--apply", "--case", "ant-notice-17"]);
    expect(r.code).toBe(0);
    expect(r.lines.join("\n")).toMatch(/2 tokens/);
    expect(await store.isSuspended("owner-aaa")).toBe(true);
    expect((await store.userByTokenHash(await hashToken(tokens["owner-ccc"])))?.status).toBe("active");
    expect((await store.suspensions())[0].caseId).toBe("ant-notice-17");
  });
  test("an owner id can be given directly (a report that names our own id)", async () => {
    const { store } = await world();
    expect((await run(store, ["--owner", "owner-ccc", "--apply"])).code).toBe(0);
    expect(await store.isSuspended("owner-ccc")).toBe(true);
  });
  test("an id that matches nobody, or an owner we do not have, changes nothing and says so", async () => {
    const { store } = await world();
    const a = await run(store, ["--user-id", await deriveUserId("someone-else", SECRET), "--apply"]);
    expect(a.code).toBe(1); expect(a.lines.join(" ")).toMatch(/no owner/i);
    const b = await run(store, ["--owner", "nobody", "--apply"]);
    expect(b.code).toBe(1); expect(b.lines.join(" ")).toMatch(/no owner/i);
    expect((await store.suspensions()).length).toBe(0);
  });
  test("no operator secret: it stops in plain words and names the setting", async () => {
    const { store } = await world();
    const r = await run(store, ["--user-id", "a".repeat(64), "--apply"], {});
    expect(r.code).toBe(1); expect(r.lines.join(" ")).toContain(USER_ID_SECRET_SETTING);
    expect((await store.suspensions()).length).toBe(0);
  });
  test("restoring is a dry run too until --apply", async () => {
    const { store } = await world();
    await store.suspendOwner("owner-bbb", { at: NOW });
    const dry = await run(store, ["--restore", "--owner", "owner-bbb"]);
    expect(dry.lines.join(" ")).toMatch(/dry run/i); expect(await store.isSuspended("owner-bbb")).toBe(true);
    const real = await run(store, ["--restore", "--owner", "owner-bbb", "--apply"]);
    expect(real.code).toBe(0); expect(await store.isSuspended("owner-bbb")).toBe(false);
  });
  test("suspending someone already suspended says so and exits cleanly", async () => {
    const { store } = await world();
    await store.suspendOwner("owner-bbb", { at: NOW });
    const r = await run(store, ["--owner", "owner-bbb", "--apply"]);
    expect(r.code).toBe(0); expect(r.lines.join(" ")).toMatch(/already suspended/i);
  });
  test("bad arguments print a short usage in plain words and change nothing", async () => {
    const { store } = await world();
    for (const argv of [[], ["--apply"], ["--user-id"], ["--owner", "a", "--user-id", "b"], ["--owner", "owner-aaa", "--case", "has spaces and text"], ["--owner", "owner-aaa", "--nonsense"]]) {
      const r = await run(store, argv); expect([argv.join(" "), r.code]).toEqual([argv.join(" "), 2]); expect(r.lines.join(" ")).toMatch(/usage/i);
    }
    expect((await store.suspensions()).length).toBe(0);
  });
  test("what it prints is ids and plain sentences: never the secret, a token, a hash, or a plan", async () => {
    const { store, tokens } = await world();
    const r = await run(store, ["--user-id", await deriveUserId("owner-aaa", SECRET), "--apply"]);
    const text = r.lines.join("\n");
    expect(text).not.toContain(SECRET);
    for (const t of Object.values(tokens)) { expect(text).not.toContain(t); expect(text).not.toContain(await hashToken(t)); }
  });
});
