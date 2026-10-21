// The transfer projects for the "did they learn?" study (app/sample/transfer, docs/launch/did-they-learn-test.md): for
// each practice, the same kind of mistake in another project. Each must fail its own check as shipped, with the plain
// words its fix.json says, and pass after the known good fix in fix.json; the observer's check
// (runner/scripts/transfer-check.ts) must not be fooled by editing or deleting the test, and must accept the other right
// fixes FIX.md names. No model; needs Node, which the practices need anyway. Nothing reaches the network and nothing is
// written outside temporary folders.
import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rlsGate } from "../src/ship/rls.ts";
import { SAMPLES, applyFix, checkTransfer, fixOf, makeCopy, projectOf, transferDir, transferIds } from "../scripts/transfer-check.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-transfer-test-"))); made.push(d); return d; };
const copy = (id: string) => { const p = join(tmp(), "copy"); cpSync(projectOf(id), p, { recursive: true }); return p; };
const edit = (p: string, f: string, from: string, to: string) => { const t = readFileSync(join(p, f), "utf8"); expect(t).toContain(from); writeFileSync(join(p, f), t.replace(from, to)); };
// The project's own check, as the participant runs it (npm test runs node --test), in a plain environment.
const nodeTest = (p: string) => { const r = spawnSync("node", ["--test"], { cwd: p, encoding: "utf8", timeout: 60_000, env: { PATH: process.env.PATH ?? "", HOME: p, NO_COLOR: "1" } }); return { ok: r.status === 0, out: `${r.stdout}\n${r.stderr}` }; };
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => statSync(join(d, n)).isDirectory() ? walk(join(d, n)).map((x) => `${n}/${x}`) : [n]);
const catalog = JSON.parse(readFileSync(join(SAMPLES, "practices.json"), "utf8")) as { practices: { id: string; transfer?: string }[] };

describe("one transfer project for every practice", () => {
  test("every practice names its transfer folder, and each holds the project, FIX.md and fix.json", () => {
    expect(transferIds()).toEqual(catalog.practices.map((p) => p.id));
    for (const p of catalog.practices) expect(p.transfer, p.id).toBe(`transfer/${p.id}`);
    expect(readdirSync(join(SAMPLES, "transfer")).sort()).toEqual([...transferIds()].sort());
    for (const id of transferIds()) {
      expect(readdirSync(transferDir(id)).sort(), id).toEqual(["FIX.md", "fix.json", "project"]);
      const fix = fixOf(id);
      expect(fix.practice).toBe(id);
      expect(fix.changes.length, id).toBeGreaterThan(0);
      expect(fix.fails.length, id).toBeGreaterThan(5);
      for (const f of fix.protect) expect(existsSync(join(projectOf(id), f)), `${id} protects ${f}`).toBe(true);
      if (fix.check.kind === "tests") expect(fix.protect.slice(0, 2), id).toEqual([expect.stringMatching(/^test\//), "package.json"]);
      // FIX.md shows the same change fix.json makes, so the observer reads what the test proves.
      const md = readFileSync(join(transferDir(id), "FIX.md"), "utf8");
      for (const c of fix.changes) { expect(md, id).toContain(c.file); if (c.old) expect(md, id).toContain(c.old); expect(md, id).toContain(c.new.split("\n")[0]); }
    }
  });

  test("each holds only the exercise: no packages, no hidden files, and none of the answers", () => {
    for (const id of transferIds()) {
      const pkg = JSON.parse(readFileSync(join(projectOf(id), "package.json"), "utf8"));
      expect(pkg.dependencies ?? {}, id).toEqual({}); expect(pkg.devDependencies ?? {}, id).toEqual({});
      for (const f of walk(projectOf(id))) {
        expect(f.split("/").some((part) => part.startsWith(".")), `${id}/${f}`).toBe(false);
        expect(/fix/i.test(f), `${id}/${f}`).toBe(false);
      }
    }
  });

  test("the participant's copy is the project only, and never goes over anything", () => {
    const where = join(tmp(), "Contact page");
    makeCopy("signup", where);
    expect(walk(where).sort()).toEqual(walk(projectOf("signup")).sort());
    expect(() => makeCopy("signup", where)).toThrow(/already/);
    expect(() => transferDir("deploy")).toThrow(/no transfer project/);
  });
});

describe("each transfer fails as shipped and passes after the right fix", () => {
  for (const id of transferIds()) {
    test(`${id}: fails with plain words as shipped, passes after the fix in fix.json`, async () => {
      const fix = fixOf(id), p = copy(id);
      if (fix.check.kind === "tests") {
        const before = nodeTest(p);
        expect(before.ok).toBe(false);
        expect(before.out).toContain(fix.fails);
      } else {
        const g = await rlsGate({ project: p });
        expect(g).toMatchObject({ id: "database_access", status: "blocked", findings: [fix.check.table] });
        expect(g.detail).toContain(fix.fails);
      }
      const shipped = await checkTransfer(id, p);
      expect(shipped.fixed).toBe(false);
      expect(shipped.says).toContain(fix.fails);
      expect(shipped.changedProtected).toEqual([]);
      applyFix(p, fix.changes);
      if (fix.check.kind === "tests") expect(nodeTest(p).ok).toBe(true);
      const after = await checkTransfer(id, p);
      expect(after).toMatchObject({ fixed: true, changedProtected: [] });
    }, 60_000);
  }

  test("the check never changes the folder it checks", async () => {
    for (const id of transferIds()) {
      const p = copy(id);
      const before = walk(p).map((f) => [f, readFileSync(join(p, f), "utf8")]);
      await checkTransfer(id, p);
      expect(walk(p).map((f) => [f, readFileSync(join(p, f), "utf8")])).toEqual(before);
    }
  }, 60_000);

  test("the open table is found at the line that makes it, like the practice", async () => {
    const g = await rlsGate({ project: copy("open-table") });
    expect(g.places?.[0]).toMatchObject({ table: "shopping_lists", file: "supabase/migrations/20261006090000_create_shopping_lists.sql", line: 2 });
  });
});

describe("the cheat does not pass", () => {
  for (const id of transferIds().filter((x) => fixOf(x).check.kind === "tests")) {
    const testFile = fixOf(id).protect[0];
    test(`${id}: deleting the test, or making it always pass, is put back and still fails`, async () => {
      const gone = copy(id); unlinkSync(join(gone, testFile));
      expect(nodeTest(gone).ok).toBe(true);   // node --test alone finds nothing to fail, which is the cheat
      expect(await checkTransfer(id, gone)).toMatchObject({ fixed: false, changedProtected: [testFile] });
      const easy = copy(id); writeFileSync(join(easy, testFile), 'require("node:test")("fine", () => {});\n');
      expect(nodeTest(easy).ok).toBe(true);
      expect(await checkTransfer(id, easy)).toMatchObject({ fixed: false, changedProtected: [testFile] });
      const script = copy(id); edit(script, "package.json", '"test": "node --test"', '"test": "echo ok"');
      expect(await checkTransfer(id, script)).toMatchObject({ fixed: false, changedProtected: ["package.json"] });
      // The right fix with the test changed too still counts as fixed, and the observer is told about the test.
      const both = copy(id); applyFix(both, fixOf(id).changes); unlinkSync(join(both, testFile));
      expect(await checkTransfer(id, both)).toMatchObject({ fixed: true, changedProtected: [testFile] });
    }, 60_000);
  }

  test("setting: putting the value in the code instead of the settings file does not pass", async () => {
    const p = copy("setting");
    edit(p, "lib/config.js", 'process.env.BOOKING_EMAIL || ""', 'process.env.BOOKING_EMAIL || "lessons@example.com"');
    expect(nodeTest(p).ok).toBe(true);
    expect(await checkTransfer("setting", p)).toMatchObject({ fixed: false, changedProtected: ["lib/config.js"] });
    const q = copy("setting");
    edit(q, "server.js", 'const { replyTo } = require("./lib/config.js");', 'const replyTo = "lessons@example.com";');
    expect(await checkTransfer("setting", q)).toMatchObject({ fixed: false, changedProtected: ["server.js"] });
    const r = copy("setting"); writeFileSync(join(r, ".env.local"), "BOOKING_EMAIL=\n");   // the file, but no address in it
    expect((await checkTransfer("setting", r)).fixed).toBe(false);
    const s = copy("setting"); writeFileSync(join(s, ".env"), "BOOKING_EMAIL=lessons@example.com\n");   // .env is read too
    expect((await checkTransfer("setting", s)).fixed).toBe(true);
  }, 60_000);

  test("route: taking the broken link away does not pass; changing the address on the server side does", async () => {
    const p = copy("route");
    edit(p, "pages/menu.html", '  <p><a href="/hours">Opening hours</a></p>\n', "");
    const v = await checkTransfer("route", p);
    expect(v.fixed).toBe(false);
    expect(v.says).toContain("should still have its link Opening hours");
    const q = copy("route");
    edit(q, "server.js", '"/opening-hours": "pages/opening-hours.html"', '"/hours": "pages/opening-hours.html"');
    expect((await checkTransfer("route", q)).fixed).toBe(true);
  }, 60_000);

  test("signup: matching the server's address to the form works too; a form that goes nowhere does not", async () => {
    const p = copy("signup");
    edit(p, "server.js", 'req.url === "/api/messages"', 'req.url === "/api/contact"');
    expect((await checkTransfer("signup", p)).fixed).toBe(true);
    const q = copy("signup");
    edit(q, "site/contact.html", 'action="/api/contact"', 'action="/"');
    expect((await checkTransfer("signup", q)).fixed).toBe(false);
  }, 60_000);

  test("import: renaming the file back breaks the other place that uses its new name", async () => {
    const p = copy("import");
    renameSync(join(p, "lib/tax.js"), join(p, "lib/sales-tax.js"));
    const v = await checkTransfer("import", p);
    expect(v.fixed).toBe(false);
    expect(v.says).toContain("Cannot find module './lib/tax'");
  }, 60_000);

  test("open-table: dropping the table, deleting its file, a rule that says true, or no rule at all do not pass", async () => {
    const add = (sql: string) => { const p = copy("open-table"); writeFileSync(join(p, "supabase/migrations/20261007090000_change.sql"), sql); return p; };
    const lists = "supabase/migrations/20261006090000_create_shopping_lists.sql";
    const deleted = copy("open-table"); unlinkSync(join(deleted, lists));
    for (const [why, p] of [
      ["deleted", deleted],
      ["dropped", add("drop table public.shopping_lists;\n")],
      ["moved", add("alter table public.shopping_lists set schema private;\n")],
      ["no rule", add("alter table public.shopping_lists enable row level security;\n")],
      ["true", add("alter table public.shopping_lists enable row level security;\ncreate policy \"all\" on public.shopping_lists for select using (true);\n")],
      ["signed in", add("alter table public.shopping_lists enable row level security;\ncreate policy \"all\" on public.shopping_lists for select to authenticated using (true);\n")],
      ["wrong table", add("alter table public.shopping_lists enable row level security;\ncreate policy \"own\" on public.recipes for select to authenticated using ((select auth.uid()) = owner_id);\n")],
    ] as const) expect((await checkTransfer("open-table", p)).fixed, why).toBe(false);
    // Putting the two lines in the file that makes the table (before it was ever applied) is right too.
    const inPlace = copy("open-table");
    writeFileSync(join(inPlace, lists), readFileSync(join(inPlace, lists), "utf8") + "\nalter table public.shopping_lists enable row level security;\ncreate policy \"Own lists\" on public.shopping_lists for all to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);\n");
    expect((await checkTransfer("open-table", inPlace)).fixed).toBe(true);
  }, 60_000);
});
