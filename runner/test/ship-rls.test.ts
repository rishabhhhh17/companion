// The database access check: a Supabase table the public can reach must have row level security on.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeMigrations, detectSupabase, liveRows, LIVE_RLS_SQL, rlsGate } from "../src/ship/rls.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-rls-"))); made.push(d); return d; };
const put = (root: string, files: Record<string, string>) => { for (const [p, c] of Object.entries(files)) { mkdirSync(join(root, p, ".."), { recursive: true }); writeFileSync(join(root, p), c); } };

describe("does the project use Supabase?", () => {
  test("by its package, its folder or its settings file", () => {
    const a = tmp(); put(a, { "package.json": JSON.stringify({ dependencies: { "@supabase/supabase-js": "2" } }) });
    const b = tmp(); put(b, { "supabase/config.toml": "x" });
    const c = tmp(); put(c, { "package.json": JSON.stringify({ devDependencies: { "@supabase/ssr": "1" } }) });
    expect([detectSupabase(a), detectSupabase(b), detectSupabase(c)]).toEqual([true, true, true]);
  });
  test("otherwise not", () => {
    const d = tmp(); put(d, { "package.json": JSON.stringify({ dependencies: { react: "19" } }) });
    expect(detectSupabase(d)).toBe(false);
    expect(detectSupabase(tmp())).toBe(false);
  });
});

describe("reading migration files", () => {
  test("a table with row level security passes, one without is named", () => {
    const r = analyzeMigrations({
      "001.sql": "create table public.notes (id int);\nalter table public.notes enable row level security;\ncreate table public.orders (id int);",
    });
    expect(r.tables.sort()).toEqual(["notes", "orders"]);
    expect(r.withoutRls).toEqual(["orders"]);
  });
  test("the schema defaults to public, and quoting, case and spacing do not matter", () => {
    const r = analyzeMigrations({ "a.sql": 'CREATE TABLE IF NOT EXISTS "Profiles" (id uuid);\nALTER TABLE   "Profiles"   ENABLE   ROW LEVEL SECURITY ;' });
    expect(r.tables).toEqual(["profiles"]);
    expect(r.withoutRls).toEqual([]);
  });
  test("enabling it in a later file counts, turning it off again does not", () => {
    expect(analyzeMigrations({ "001.sql": "create table t (id int);", "002.sql": "alter table t enable row level security;" }).withoutRls).toEqual([]);
    expect(analyzeMigrations({ "001.sql": "create table t (id int); alter table t enable row level security;", "002.sql": "alter table t disable row level security;" }).withoutRls).toEqual(["t"]);
  });
  test("files are read in order, so a table dropped later is no longer a problem", () => {
    expect(analyzeMigrations({ "001.sql": "create table gone (id int);", "002.sql": "drop table gone;" }).withoutRls).toEqual([]);
  });
  test("tables in other schemas are not exposed to the public interface", () => {
    const r = analyzeMigrations({ "a.sql": "create table private.secrets (id int); create table auth.extra (id int); create table public.open (id int);" });
    expect(r.tables).toEqual(["open"]);
  });
  test("SQL comments do not count", () => {
    const r = analyzeMigrations({ "a.sql": "-- create table fake (id int);\n/* alter table real enable row level security; */\ncreate table real (id int);" });
    expect(r.tables).toEqual(["real"]);
    expect(r.withoutRls).toEqual(["real"]);
  });
  test("no tables at all is nothing wrong", () => expect(analyzeMigrations({ "a.sql": "select 1;" })).toEqual({ tables: [], withoutRls: [], openPolicies: [], dynamic: false }));
});

describe("asking the live database", () => {
  test("the question is about tables in public and their row level security flag", () => {
    expect(LIVE_RLS_SQL).toMatch(/pg_class/); expect(LIVE_RLS_SQL).toMatch(/relrowsecurity/); expect(LIVE_RLS_SQL).toMatch(/public/);
  });
  test("rows turn into the tables that are open", () => {
    expect(liveRows([{ table: "notes", rls: true }, { table: "orders", rls: false }, { table: "t2", rls: null }])).toEqual({ tables: ["notes", "orders", "t2"], withoutRls: ["orders", "t2"] });
  });
});

describe("the gate", () => {
  const supa = (extra: Record<string, string> = {}) => { const d = tmp(); put(d, { "package.json": JSON.stringify({ dependencies: { "@supabase/supabase-js": "2" } }), ...extra }); return d; };
  test("not a Supabase project: not applicable, never 'passed'", async () => {
    const d = tmp(); put(d, { "index.html": "x" });
    expect((await rlsGate({ project: d })).status).toBe("not_applicable");
  });
  test("a table without row level security blocks, and names it", async () => {
    const r = await rlsGate({ project: supa({ "supabase/migrations/001.sql": "create table orders (id int);" }) });
    expect(r.status).toBe("blocked");
    expect(r.detail).toContain("orders");
    expect(r.overridable).toBe(false);
  });
  test("all tables protected in the files, but the live database not checked: could not check, and you may confirm it yourself", async () => {
    const r = await rlsGate({ project: supa({ "supabase/migrations/001.sql": "create table notes (id int); alter table notes enable row level security;" }) });
    expect(r.status).toBe("could_not_check");
    expect(r.overridable).toBe(true);
    expect(r.detail).toMatch(/live database/i);
  });
  test("a live check that finds everything protected passes", async () => {
    const r = await rlsGate({ project: supa({ "supabase/migrations/001.sql": "create table notes (id int); alter table notes enable row level security;" }), query: async () => [{ table: "notes", rls: true }] });
    expect(r.status).toBe("passed");
  });
  test("a live table without protection blocks even when the files look fine", async () => {
    const r = await rlsGate({ project: supa({ "supabase/migrations/001.sql": "create table notes (id int); alter table notes enable row level security;" }), query: async () => [{ table: "notes", rls: true }, { table: "made_in_dashboard", rls: false }] });
    expect(r.status).toBe("blocked");
    expect(r.detail).toContain("made_in_dashboard");
  });
  test("a live check that fails is 'could not check', never 'passed'", async () => {
    const r = await rlsGate({ project: supa({ "supabase/migrations/001.sql": "create table notes (id int); alter table notes enable row level security;" }), query: async () => { throw new Error("connection refused"); } });
    expect(r.status).toBe("could_not_check");
    expect(r.detail).toMatch(/connection refused|could not/i);
  });
  test("a live database with no tables and no migration files still cannot be trusted without a check", async () => {
    expect((await rlsGate({ project: supa() })).status).toBe("could_not_check");
  });
  test("a live check alone, with no migration files, can pass", async () => {
    expect((await rlsGate({ project: supa(), query: async () => [{ table: "notes", rls: true }] })).status).toBe("passed");
  });
});
