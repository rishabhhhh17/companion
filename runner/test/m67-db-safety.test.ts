// M67, shortlist item 7: destructive database commands and live connection strings go to an approval card that names the
// database, through the hook (rule 12). Written before the rules (rule 17). evaluate() only, on temporary fixture folders.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluate } from "../src/safety.ts";

const made: string[] = [];
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const project = (files: Record<string, string> = {}) => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), "m67-db-"))); made.push(d);
  for (const [p, c] of Object.entries(files)) { mkdirSync(join(d, p, ".."), { recursive: true }); writeFileSync(join(d, p), c); }
  return d;
};
const bash = (command: string, p = project()) => evaluate({ tool: "Bash", input: { command } }, { project: p });

describe("SQLite on the project's own file", () => {
  for (const c of [`sqlite3 dev.db "DROP TABLE users"`, `sqlite3 prisma/dev.db "DELETE FROM users"`, `sqlite3 dev.db "TRUNCATE users"`, `sqlite3 dev.db "UPDATE users SET name = 'x'"`]) {
    test(`asks and names the file: ${c}`, () => {
      const v = bash(c);
      expect(v.decision).toBe("ask");
      expect(v.undoable).toBe(false);
      expect(v.reason).toMatch(/dev\.db/);
      expect(v.reason).toMatch(/deletes|changes every row|empties/);
    });
  }
  for (const c of [`sqlite3 dev.db < wipe.sql`, `echo 'DROP TABLE users;' | sqlite3 dev.db`, `sqlite3 dev.db ".read wipe.sql"`]) {
    test(`SQL it cannot read first asks and names the file: ${c}`, () => {
      const v = bash(c);
      expect(v.decision).toBe("ask");
      expect(v.reason).toMatch(/dev\.db/);
    });
  }
  test("a read still runs without a card", () => {
    expect(bash(`sqlite3 dev.db "SELECT count(*) FROM users"`).decision).toBe("allow");
    expect(bash(`sqlite3 dev.db ".tables"`).decision).toBe("allow");
    expect(bash(`sqlite3 dev.db "DELETE FROM users WHERE id = 3"`).decision).toBe("allow");
  });
});

describe("database clients name the database and say it deletes data", () => {
  test("psql TRUNCATE on a production server", () => {
    const v = bash(`psql postgres://u:secretpw@db.prod.example.com/app -c "TRUNCATE users"`);
    expect(v.decision).toBe("ask");
    expect(v.reason).toMatch(/"app" on db\.prod\.example\.com/);
    expect(v.reason).toMatch(/live/);
    expect(v.reason).toMatch(/empties users/);
    expect(v.reason).not.toMatch(/secretpw|u:/);
  });
  test("psql with the connection in a setting", () => {
    const v = bash(`psql "$DATABASE_URL" -c "DROP TABLE users"`);
    expect(v.reason).toMatch(/DATABASE_URL/);
    expect(v.reason).toMatch(/deletes the table users/);
  });
  test("a DROP after a long query is said first, before the card cuts anything", () => {
    const v = bash(`psql -h db.example.com -d shop -c "SELECT ${"a, ".repeat(80)}b FROM t; DROP TABLE orders"`);
    expect(v.reason).toMatch(/deletes the table orders/);
    expect(v.reason.indexOf("deletes")).toBeLessThan(120);
  });
  test("mysql, mongosh, redis-cli and dropdb", () => {
    expect(bash(`mysql -e "DROP DATABASE shop"`).reason).toMatch(/deletes the database shop/);
    expect(bash(`mongosh --eval "db.dropDatabase()"`).reason).toMatch(/deletes data/);
    expect(bash(`redis-cli -h cache.example.com FLUSHALL`).reason).toMatch(/every key/);
    const d = bash(`dropdb app`);
    expect(d.decision).toBe("ask");
    expect(d.reason).toMatch(/"app"/);
  });
  test("a plain query on another server still asks, and names it", () => {
    const v = bash(`psql -h db.example.com -d shop -c "SELECT 1"`);
    expect(v.decision).toBe("ask");
    expect(v.reason).toMatch(/"shop" on db\.example\.com/);
  });
});

describe("reset and drop tools", () => {
  const cmds = ["rails db:drop", "bin/rails db:reset", "bundle exec rails db:reset", "python manage.py flush --noinput", "npx drizzle-kit drop", "npx drizzle-kit push", "npx knex migrate:rollback --all", "npx sequelize-cli db:drop", "turso db destroy mydb", "neonctl branches delete main", "pscale database delete app", "npx prisma migrate reset --force", "npx typeorm schema:drop"];
  for (const c of cmds) test(`asks: ${c}`, () => {
    const v = bash(c);
    expect(v.decision).toBe("ask");
    expect(v.undoable).toBe(false);
  });
  test("Rails and Django name their own SQLite file when it is there", () => {
    expect(bash("bin/rails db:drop", project({ "storage/development.sqlite3": "x" })).reason).toMatch(/storage\/development\.sqlite3/);
    expect(bash("python3 manage.py flush", project({ "db.sqlite3": "x" })).reason).toMatch(/db\.sqlite3/);
  });
  test("supabase db reset names the local database, --linked names the live project", () => {
    const local = bash("supabase db reset");
    expect(local.decision).toBe("ask");
    expect(local.reason).toMatch(/local/);
    expect(local.reason).not.toMatch(/live/);
    expect(bash("supabase db reset --linked").reason).toMatch(/live Supabase project/);
  });
  test("ordinary tool use does not ask", () => {
    for (const c of ["rails db:migrate", "npx drizzle-kit generate", "npx knex migrate:latest", "python manage.py runserver", "npx prisma generate"]) expect(bash(c).decision).toBe("allow");
  });
});

describe("connection strings and scripts", () => {
  test("a live connection string handed to a script asks and names the server", () => {
    for (const c of ["DATABASE_URL=postgres://u:p@prod.example.com/app npm run migrate", "DATABASE_URL=postgres://u:p@prod.example.com/app node scripts/migrate.js"]) {
      const v = bash(c);
      expect(v.decision).toBe("ask");
      expect(v.reason).toMatch(/"app" on prod\.example\.com/);
      expect(v.reason).not.toMatch(/u:p@/);
    }
  });
  test("a local connection string does not ask", () => {
    expect(bash("DATABASE_URL=postgres://u:p@localhost:5432/app npm run migrate").decision).toBe("allow");
  });
  test("a script of the project with SQL that deletes data asks; one without does not", () => {
    const p = project({ "scripts/wipe.js": "await db.query('DROP TABLE users');\n", "scripts/drop_tables.py": "cur.execute(\"TRUNCATE TABLE orders\")\n", "scripts/ok.js": "console.log('SELECT 1')\n" });
    const a = bash("node scripts/wipe.js", p);
    expect(a.decision).toBe("ask");
    expect(a.reason).toMatch(/scripts\/wipe\.js/);
    expect(bash("python scripts/drop_tables.py", p).decision).toBe("ask");
    expect(bash("node scripts/ok.js", p).decision).toBe("allow");
  });
  test("npm run of a package script that runs such SQL asks", () => {
    const p = project({ "package.json": JSON.stringify({ scripts: { wipe: "node scripts/wipe.js", reset: "prisma migrate reset --force" } }), "scripts/wipe.js": "db.exec('DELETE FROM users')\n" });
    expect(bash("npm run wipe", p).decision).toBe("ask");
    expect(bash("npm run reset", p).decision).toBe("ask");
  });
});
