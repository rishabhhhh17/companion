import { describe, expect, test } from "bun:test";
import { analyzeMigrations } from "../src/ship/rls.ts";

describe("reading migrations more carefully", () => {
  test("a double dash inside a string does not hide the rest of the line", () => {
    const r = analyzeMigrations({ "1.sql": "insert into logs values ('--'); create table notes (id int);" });
    expect(r.withoutRls).toEqual(["notes"]);
  });
  test("a table name inside a string is not a table", () => {
    expect(analyzeMigrations({ "1.sql": "insert into docs values ('create table fake (id int)');" }).tables).toEqual([]);
  });
  test("renaming a table keeps its protection", () => {
    const r = analyzeMigrations({ "1.sql": "create table a (id int); alter table a enable row level security; alter table a rename to b;" });
    expect(r.tables).toEqual(["b"]); expect(r.withoutRls).toEqual([]);
  });
  test("renaming an unprotected table keeps it unprotected", () => {
    expect(analyzeMigrations({ "1.sql": "create table a (id int); alter table a rename to b;" }).withoutRls).toEqual(["b"]);
  });
  test("a rule that says true for everyone is found", () => {
    const r = analyzeMigrations({ "1.sql": "create table a (id int); alter table a enable row level security; create policy p on a for select to anon using (true);" });
    expect(r.openPolicies).toEqual(["a"]);
    const ok = analyzeMigrations({ "1.sql": "create table a (id int); alter table a enable row level security; create policy p on a for select to authenticated using (auth.uid() = user_id);" });
    expect(ok.openPolicies).toEqual([]);
  });
  test("tables made while the code runs are reported as unreadable", () => {
    expect(analyzeMigrations({ "1.sql": "do $$ begin execute format('create table %I (id int)', 'x'); end $$;" }).dynamic).toBe(true);
    expect(analyzeMigrations({ "1.sql": "create table a (id int);" }).dynamic).toBe(false);
  });
});
