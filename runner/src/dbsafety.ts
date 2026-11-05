// M67, shortlist item 7: the worst mistake can't happen quietly. Commands that delete or empty a database (DROP, TRUNCATE,
// DELETE or UPDATE with no WHERE, a reset or drop tool, SQL a script runs) and commands that reach a database on another
// computer each go to an approval card that names the database: the file, or the database and its server, and whether it
// looks live. Rule 12: this is the hook's deny and ask logic (safety.ts calls it), never words in a prompt.
// Only plain words leave here: a connection string's user name and password are never part of a reason.
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, relative, resolve } from "node:path";

/** What safety.ts turns into a verdict: an ask that cannot be undone, with its risk and the card's reason. */
export type DbAsk = { risk: "irreversible" | "network"; reason: string };

const NO_UNDO = "Undo can't bring it back.";

// ---------- SQL ----------

/** The SQL with comments and quoted text taken out, so a word inside a string never counts. */
function bare(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, (m) => m)   // a quoted name stays: DROP TABLE "users" names users
    .replace(/\s+/g, " ");
}
const nameOf = (s: string) => s.replace(/^[`"[]|[`"\]]$/g, "").replace(/;$/, "");

/** The first statement that deletes or empties data, in plain words, or null. DROP TABLE, DATABASE or SCHEMA; TRUNCATE;
 *  DELETE or UPDATE with no WHERE; ALTER TABLE ... DROP. Statements are split on semicolons. */
export function destructiveSql(sql: string): string | null {
  for (const raw of bare(sql).split(";")) {
    const s = raw.trim();
    if (!s) continue;
    let m: RegExpExecArray | null;
    if ((m = /^DROP\s+(TABLE|DATABASE|SCHEMA|COLLECTION)\s+(?:IF\s+EXISTS\s+)?(\S+)/i.exec(s))) return `it deletes the ${m[1].toLowerCase()} ${nameOf(m[2])} (${clipSql(s)})`;
    if ((m = /^TRUNCATE\s+(?:TABLE\s+)?(?:ONLY\s+)?(\S+)/i.exec(s))) return `it empties ${nameOf(m[1])} (${clipSql(s)})`;
    if ((m = /^DELETE\s+FROM\s+(\S+)/i.exec(s)) && !/\bWHERE\b/i.test(s)) return `it deletes every row of ${nameOf(m[1])} (${clipSql(s)})`;
    if ((m = /^UPDATE\s+(\S+)\s+SET\b/i.exec(s)) && !/\bWHERE\b/i.test(s)) return `it changes every row of ${nameOf(m[1])} (${clipSql(s)})`;
    if ((m = /^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(\S+)\s+DROP\b/i.exec(s))) return `it removes part of ${nameOf(m[1])} and its data (${clipSql(s)})`;
    if (/^\.restore\b/i.test(s)) return "it replaces the whole database with a backup";
  }
  return null;
}
const clipSql = (s: string) => (s.length > 60 ? `${s.slice(0, 57)}...` : s);

/** SQL that comes from somewhere the hook cannot read first (a file, the input, a sqlite .read). */
const sqlFromElsewhere = (sql: string) => /(^|;|\s)\.(read|import|restore)\b/i.test(sql);

// Mongo and Redis: the calls and commands that delete data.
function destructiveMongo(js: string): string | null {
  const m = /\b(dropDatabase\s*\(|\.drop\s*\(\s*\)|deleteMany\s*\(\s*\{\s*\}\s*\)|\.remove\s*\(\s*\{\s*\}\s*\))/.exec(js);
  return m ? `it deletes data (${m[1].replace(/\s+/g, "")})` : null;
}
function destructiveRedis(words: string[]): string | null {
  const w = words.map((x) => x.toUpperCase());
  if (w.includes("FLUSHALL") || w.includes("FLUSHDB")) return "it deletes every key";
  if (w[0] === "DEL" || w[0] === "UNLINK") return `it deletes ${words.slice(1, 4).join(", ") || "keys"}`;
  return null;
}

// ---------- naming the database ----------

type Target = { host?: string; db?: string; file?: string; fromVar?: string };
const LOCAL_HOST = /^(localhost|127(?:\.\d+){3}|::1|\[::1\]|0\.0\.0\.0|[^.]+\.(?:local|localhost|test))$/i;
/** On another computer: a host that is not this Mac. A socket path (starting with /) is this Mac. */
export const remoteHost = (h?: string): boolean => !!h && !h.startsWith("/") && !LOCAL_HOST.test(h);
const LIVE_WORD = /(^|[-_.])(prod|production|live|main|primary)([-_.]|$)/i;

/** The host and database of a connection string (postgres://, mysql://, mongodb://, redis://, libsql://), never its user or
 *  password. Null when it is not one. */
export function fromUrl(s: string): Target | null {
  const m = /^(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?|libsql|sqlserver|mssql|cockroachdb):\/\/(?:[^@/]*@)?([^/:?,]+)(?::\d+)?(?:,[^/]*)?(?:\/([^?#]*))?/i.exec(s.trim());
  if (!m) return null;
  return { host: m[1], ...(m[2] ? { db: decodeURIComponent(m[2]).split("/")[0] } : {}) };
}
/** "$DATABASE_URL" or "${DATABASE_URL}" as a whole word: the setting it is read from. */
const varIn = (s: string) => /^\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?$/.exec(s.trim())?.[1];

function describe(t: Target): { what: string; live: string } {
  const what = t.file ? `the database file ${t.file}`
    : t.db && t.host ? `the database "${t.db}" on ${t.host}`
    : t.db ? `the database "${t.db}"`
    : t.host ? `the database on ${t.host}`
    : t.fromVar ? `the database in ${t.fromVar}`
    : "a database";
  const remote = remoteHost(t.host);
  const looksLive = LIVE_WORD.test(t.host ?? "") || LIVE_WORD.test(t.db ?? "") || (t.fromVar ? /PROD|LIVE/i.test(t.fromVar) : false);
  const live = remote || t.fromVar
    ? `${remote ? ", a server on the internet" : ""}${looksLive ? ", which looks like your live database" : remote || t.fromVar ? ", which may be your live database" : ""}`
    : looksLive ? ", which looks like your live database" : "";
  return { what, live };
}
const deletes = (t: Target, how: string): DbAsk => { const d = describe(t); return { risk: "irreversible", reason: `This deletes data in ${d.what}${d.live}: ${how}. ${NO_UNDO}` }; };
const unchecked = (t: Target, from: string): DbAsk => { const d = describe(t); return { risk: "irreversible", reason: `This runs ${from} on ${d.what}${d.live}, and it can't be checked first, so it could delete data. ${NO_UNDO}` }; };
const connects = (t: Target): DbAsk => { const d = describe(t); return { risk: "network", reason: `This connects to ${d.what}${d.live}. What it changes there can't be undone.` }; };

// ---------- database programs ----------

/** Options of each program that take the next word as their value, so it is not read as the database or the SQL. */
const TAKES: Record<string, Set<string>> = {
  sqlite3: new Set(["-cmd", "-init", "-separator", "-newline", "-nullvalue", "-vfs", "-maxsize", "-mmap", "-pagecache", "-lookaside", "-heap"]),
  psql: new Set(["-h", "--host", "-p", "--port", "-U", "--username", "-d", "--dbname", "-c", "--command", "-f", "--file", "-v", "--set", "--variable", "-o", "--output", "-L", "--log-file", "-P", "--pset", "-F", "-R", "-T"]),
  mysql: new Set(["-h", "--host", "-P", "--port", "-u", "--user", "-D", "--database", "-e", "--execute", "-S", "--socket", "--default-character-set", "--defaults-file"]),
  mongosh: new Set(["--host", "--port", "-u", "--username", "-p", "--password", "--eval", "-f", "--file", "--authenticationDatabase"]),
  "redis-cli": new Set(["-h", "-p", "-a", "-n", "-u", "--user", "--pass", "-s", "-r", "-i"]),
  dropdb: new Set(["-h", "--host", "-p", "--port", "-U", "--username", "--maintenance-db"]),
};
TAKES.sqlite = TAKES.sqlite3; TAKES.mariadb = TAKES.mysql; TAKES.mongo = TAKES.mongosh;

/** Splits a program's words into options (with their values) and the words that are not options, stopping at a redirect
 *  (<, <<, >, |), which the shell handles. */
function split(name: string, args: string[]): { opt: Map<string, string>; flags: Set<string>; pos: string[]; input: boolean } {
  const takes = TAKES[name] ?? new Set<string>();
  const opt = new Map<string, string>(), flags = new Set<string>(), pos: string[] = [];
  let input = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (/^(<<?<?|[0-9]*>>?|&>)/.test(a)) { if (a.startsWith("<")) input = true; if (a === "<" || a === "<<" || a === "<<<" || /^[0-9]*>>?$/.test(a)) i++; continue; }
    if (a.startsWith("--") && a.includes("=")) { opt.set(a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)); continue; }
    if (takes.has(a)) { opt.set(a, args[i + 1] ?? ""); i++; continue; }
    // -hHOST, -cSQL, -eSQL, -dDB: a short option with its value joined on.
    const joined = /^(-[A-Za-z])(.+)$/.exec(a);
    if (joined && takes.has(joined[1]) && !a.startsWith("--")) { opt.set(joined[1], joined[2]); continue; }
    if (a.startsWith("-") && a !== "-") { flags.add(a); continue; }
    pos.push(a);
  }
  return { opt, flags, pos, input };
}
const first = (m: Map<string, string>, ...keys: string[]) => { for (const k of keys) if (m.has(k)) return m.get(k); return undefined; };

function relName(project: string, cwd: string, f: string): string {
  const abs = isAbsolute(f) ? f : resolve(cwd, f);
  const rel = relative(project, abs);
  return rel && !rel.startsWith("..") ? rel : f;
}

/** The ask for a command of a database program, or null when the program is not one. cwd: where the command runs. */
export function databaseProgram(name: string, args: string[], project: string, cwd: string): DbAsk | null {
  switch (name) {
    case "sqlite3": case "sqlite": {
      const { opt, pos, input } = split("sqlite3", args);
      const file = pos[0];
      if (!file) return null;   // no database named: an empty one in memory
      const t: Target = { file: relName(project, cwd, file) };
      const sql = [opt.get("-cmd") ?? "", ...pos.slice(1)].join(";");
      const bad = destructiveSql(sql);
      if (bad) return deletes(t, bad);
      if (opt.has("-init") || sqlFromElsewhere(sql)) return unchecked(t, "SQL from a file");
      // No SQL on the line: it is read from the input (a pipe, a < file, a here document), which can't be checked here.
      if (pos.length < 2 && !opt.has("-cmd")) return unchecked(t, input ? "SQL from a file or its input" : "SQL from its input");
      return null;
    }
    case "psql": {
      const { opt, pos } = split("psql", args);
      const t = target(pos, first(opt, "-h", "--host"), first(opt, "-d", "--dbname"));
      const sql = first(opt, "-c", "--command");
      if (sql !== undefined) { const bad = destructiveSql(sql); if (bad) return deletes(t, bad); return connects(t); }
      return unchecked(t, opt.has("-f") || opt.has("--file") ? "SQL from a file" : "commands from its input");
    }
    case "mysql": case "mariadb": {
      const { opt, pos } = split("mysql", args);
      const t = target(pos, first(opt, "-h", "--host"), first(opt, "-D", "--database"));
      const sql = first(opt, "-e", "--execute");
      if (sql !== undefined) { const bad = destructiveSql(sql); if (bad) return deletes(t, bad); return connects(t); }
      return unchecked(t, "commands from its input");
    }
    case "mongosh": case "mongo": {
      const { opt, pos } = split("mongosh", args);
      const t = target(pos.filter((p) => !/\.js$/.test(p)), first(opt, "--host"), undefined);
      const js = opt.get("--eval");
      if (js !== undefined) { const bad = destructiveMongo(js); if (bad) return deletes(t, bad); return connects(t); }
      return unchecked(t, opt.has("-f") || opt.has("--file") || pos.some((p) => /\.js$/.test(p)) ? "a script" : "commands from its input");
    }
    case "redis-cli": {
      const { opt, pos } = split("redis-cli", args);
      const u = opt.get("-u") ? fromUrl(opt.get("-u")!) : null;
      const t: Target = u ?? { host: opt.get("-h") ?? "localhost", ...(opt.get("-n") ? { db: `number ${opt.get("-n")}` } : {}) };
      if (!pos.length) return unchecked(t, "commands from its input");
      const bad = destructiveRedis(pos);
      return bad ? deletes(t, bad) : connects(t);
    }
    case "dropdb": {
      const { opt, pos } = split("dropdb", args);
      const t: Target = { db: pos[0], host: first(opt, "-h", "--host") };
      const d = describe(t);
      return { risk: "irreversible", reason: `This deletes ${d.what}${d.live}, with all its data. ${NO_UNDO}` };
    }
    case "mysqladmin": {
      const i = args.findIndex((a) => a === "drop" || a === "DROP");
      if (i < 0) return null;
      const { opt } = split("mysql", args);
      const t: Target = { db: args[i + 1], host: first(opt, "-h", "--host") };
      const d = describe(t);
      return { risk: "irreversible", reason: `This deletes ${d.what}${d.live}, with all its data. ${NO_UNDO}` };
    }
    case "pg_restore": {
      if (!args.some((a) => a === "-c" || a === "--clean" || /^-[A-Za-z]*c[A-Za-z]*$/.test(a))) return null;
      const { opt } = split("psql", args);
      return deletes({ db: first(opt, "-d", "--dbname"), host: first(opt, "-h", "--host") }, "it deletes what is there before it puts the backup back");
    }
  }
  return null;
}
function target(pos: string[], host?: string, db?: string): Target {
  for (const p of pos) { const u = fromUrl(p); if (u) return { ...u, ...(host ? { host } : {}), ...(db ? { db } : {}) }; }
  for (const p of [host, db, ...pos]) { const v = p ? varIn(p) : undefined; if (v) return { fromVar: v }; }
  const named = db ?? pos.find((p) => !p.includes("$"));
  return { ...(host ? { host } : {}), ...(named ? { db: named } : {}) };
}

// ---------- reset and drop tools of frameworks and hosted databases ----------

const RAILS_DESTROY = /^db:(drop|reset|purge|truncate_all|migrate:reset|schema:load|structure:load|rollback|seed:replant|migrate:down)(\b|:)/;
const SEQUELIZE_DESTROY = /^db:(drop|migrate:undo(:all)?|seed:undo(:all)?)$/;

/** The project's own local database file, when a usual one is there (Rails, Django, Prisma's SQLite). */
function localFile(project: string, ...candidates: string[]): string | undefined {
  return candidates.find((c) => { try { return statSync(resolve(project, c)).isFile(); } catch { return false; } });
}

/** The ask for a framework's or a hosted database's command that deletes or resets data, or null. words: the command after
 *  npx, bundle exec and the like were taken off. */
export function databaseTool(words: string[], project: string): DbAsk | null {
  const name = basename(words[0] ?? "").replace(/(.)@[^/@]*$/, "$1");
  const args = words.slice(1);
  const pos = args.filter((a) => !a.startsWith("-"));
  const sub = pos[0] ?? "", sub2 = pos[1] ?? "";
  const has = (...f: string[]) => args.some((a) => f.some((x) => a === x || a.startsWith(`${x}=`)));
  switch (name) {
    case "rails": case "rake": {
      if (!RAILS_DESTROY.test(sub)) return null;
      const file = localFile(project, "storage/development.sqlite3", "db/development.sqlite3");
      return deletes(file ? { file } : {}, `rails ${sub} deletes or resets its tables${file ? "" : " (the database in config/database.yml)"}`);
    }
    case "drizzle-kit": {
      if (sub === "drop") return deletes({}, "drizzle-kit drop removes a migration and can delete what it made");
      if (sub === "push") return deletes({}, "drizzle-kit push makes the tables match the code, which can delete columns and their data");
      return null;
    }
    case "knex": return /^(migrate:rollback|migrate:down)$/.test(sub) ? deletes({}, `knex ${sub} undoes migrations, which can delete tables and their data`) : null;
    case "sequelize": case "sequelize-cli": return SEQUELIZE_DESTROY.test(sub) ? deletes({}, `sequelize ${sub} deletes tables or data`) : null;
    case "typeorm": case "typeorm-ts-node-commonjs": case "typeorm-ts-node-esm": return /^(schema:drop|migration:revert|schema:sync)$/.test(sub) ? deletes({}, `typeorm ${sub} can delete tables and their data`) : null;
    case "prisma": {
      const file = localFile(project, "prisma/dev.db", "dev.db");
      const t: Target = file ? { file } : { fromVar: "DATABASE_URL" };
      if (sub === "migrate" && sub2 === "reset") return deletes(t, "prisma migrate reset deletes all its data and runs every migration again");
      if (sub === "db" && sub2 === "push" && has("--force-reset", "--accept-data-loss")) return deletes(t, `prisma db push ${has("--force-reset") ? "--force-reset deletes all its data" : "--accept-data-loss can delete columns and their data"}`);
      if (sub === "db" && sub2 === "execute") return unchecked(t, "SQL with prisma db execute");
      if (sub === "db" && sub2 === "push") return { risk: "irreversible", reason: `This changes the tables of ${describe(t).what}${describe(t).live} to match the Prisma schema. ${NO_UNDO}` };
      if (sub === "migrate" && sub2 === "deploy") return { risk: "irreversible", reason: `This applies the migrations to ${describe(t).what}${describe(t).live}. ${NO_UNDO}` };
      return null;
    }
    case "supabase": {
      // supabase db reset and push work on the local database unless told --linked (the live project) or --db-url.
      const url = args.find((a, i) => args[i - 1] === "--db-url") ?? args.find((a) => a.startsWith("--db-url="))?.slice(9);
      const linked = has("--linked") || !!url;
      const where: Target = url ? (fromUrl(url) ?? { host: "the --db-url server" }) : {};
      const what = url ? describe(where).what + describe(where).live : "your linked live Supabase project's database";
      if (sub === "db" && sub2 === "reset") return linked
        ? { risk: "irreversible", reason: `This resets ${what}: all its data is deleted and the migrations run again. ${NO_UNDO}` }
        : { risk: "irreversible", reason: `This resets your local Supabase database on this Mac: all its data is deleted and the migrations run again. ${NO_UNDO}` };
      if (sub === "db" && sub2 === "push") return has("--local")
        ? { risk: "irreversible", reason: `This changes the tables of your local Supabase database on this Mac. ${NO_UNDO}` }
        : { risk: "irreversible", reason: `This changes the tables of ${what}. ${NO_UNDO}` };
      if (sub === "db" && sub2 === "remote") return { risk: "irreversible", reason: `This changes your linked live Supabase project's database. ${NO_UNDO}` };
      if (sub === "functions" && ["deploy", "delete"].includes(sub2)) return { risk: "irreversible", reason: `This ${sub2 === "deploy" ? "deploys functions to" : "deletes a function from"} your live Supabase project. ${NO_UNDO}` };
      if (sub === "secrets" && ["set", "unset"].includes(sub2)) return { risk: "irreversible", reason: `This changes the secrets of your live Supabase project. ${NO_UNDO}` };
      if (sub === "projects" && sub2 === "delete") return { risk: "irreversible", reason: `This deletes a Supabase project, with its database. ${NO_UNDO}` };
      return null;
    }
    case "turso": {
      if ((sub === "db" || sub === "group") && ["destroy", "delete"].includes(sub2)) return { risk: "irreversible", reason: `This deletes the Turso ${sub === "db" ? "database" : "group"} ${pos[2] ?? ""}`.trimEnd() + `, with all its data. ${NO_UNDO}` };
      if (sub === "db" && sub2 === "shell") { const sql = pos.slice(3).join(" "); const bad = destructiveSql(sql); const t: Target = { db: pos[2], host: "Turso" }; return bad ? deletes(t, bad) : sql ? connects(t) : unchecked(t, "commands from its input"); }
      return null;
    }
    case "neonctl": case "neon": {
      if (["branches", "branch", "projects", "project", "databases", "database", "db"].includes(sub) && ["delete", "reset", "restore"].includes(sub2)) return { risk: "irreversible", reason: `This ${sub2 === "delete" ? "deletes" : "resets"} the Neon ${sub.replace(/e?s$/, "")} ${pos[2] ?? ""}`.trimEnd() + `, with its data. ${NO_UNDO}` };
      return null;
    }
    case "pscale": {
      if (["database", "db", "branch"].includes(sub) && sub2 === "delete") return { risk: "irreversible", reason: `This deletes the PlanetScale ${sub === "branch" ? "branch" : "database"} ${pos[2] ?? ""}`.trimEnd() + `, with its data. ${NO_UNDO}` };
      if (sub === "shell") return unchecked({ db: pos[1], host: "PlanetScale" }, "commands from its input");
      return null;
    }
  }
  // python manage.py flush (Django), or ./manage.py flush.
  const django = name === "manage.py" ? pos : /^python[0-9.]*$/.test(name) && basename(pos[0] ?? "") === "manage.py" ? pos.slice(1) : null;
  if (django) {
    const cmd = django[0] ?? "";
    const file = localFile(project, "db.sqlite3");
    const t: Target = file ? { file } : {};
    const tail = file ? "" : " (the database in your Django settings)";
    if (cmd === "flush") return deletes(t, `manage.py flush deletes every row of every table${tail}`);
    if (cmd === "reset_db") return deletes(t, `manage.py reset_db deletes the whole database${tail}`);
    if (cmd === "migrate" && django[2] === "zero") return deletes(t, `manage.py migrate ${django[1]} zero deletes that app's tables${tail}`);
  }
  return null;
}

// ---------- connection strings and scripts ----------

const DB_VAR = /^(?:[A-Z0-9_]*(?:DATABASE|DB|POSTGRES|PG|MYSQL|MONGO|MONGODB|REDIS|SUPABASE_DB|TURSO|NEON)[A-Z0-9_]*(?:URL|URI|DSN|HOST)|PGHOST|PGDATABASE|MYSQL_HOST)$/;

/** VAR=value words that point the command at a database on another computer: the ask, or null. */
export function databaseSetting(words: string[]): DbAsk | null {
  for (const w of words) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=([\s\S]+)$/.exec(w);
    if (!m || !DB_VAR.test(m[1])) continue;
    const t = fromUrl(m[2]) ?? (/HOST$/.test(m[1]) ? { host: m[2] } : null);
    if (!t || !remoteHost(t.host)) continue;
    const d = describe(t);
    return { risk: "irreversible", reason: `This runs with ${m[1]} set to ${d.what}${d.live}. What the command does to it can't be undone.` };
  }
  return null;
}

const SCRIPT_FILE = /\.(c?js|mjs|tsx?|mts|cts|py|rb|php|pl)$/i;
const RUNNERS = new Set(["node", "nodejs", "bun", "deno", "tsx", "ts-node", "ts-node-esm", "esno", "python", "python3", "ruby", "php", "perl"]);
const SCRIPT_SQL = /\b(DROP\s+(?:TABLE|DATABASE|SCHEMA)\b(?:\s+IF\s+EXISTS)?\s*[\w."`]*|TRUNCATE\s+(?:TABLE\s+)?[\w."`]+|DELETE\s+FROM\s+[\w."`]+\s*(?=["'`;)]|$)|FLUSHALL|FLUSHDB|dropDatabase\s*\(|deleteMany\s*\(\s*\{\s*\}\s*\))/im;

/** A script of the project run by node, python and the like that has SQL or calls in it that delete data: the ask, or null.
 *  Only a file inside the project is read, at most 512 KB, and only to look for those words. */
export function databaseScript(name: string, args: string[], project: string, cwd: string): DbAsk | null {
  if (!RUNNERS.has(name)) return null;
  const rest = name === "deno" || (name === "bun" && args[0] === "run") ? args.slice(1) : args;
  const file = rest.find((a) => !a.startsWith("-") && SCRIPT_FILE.test(a));
  if (!file) return null;
  const abs = isAbsolute(file) ? file : resolve(cwd, file);
  const rel = relative(project, abs);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return null;
  let text: string;
  try { if (!existsSync(abs) || statSync(abs).size > 512 * 1024) return null; text = readFileSync(abs, "utf8"); } catch { return null; }
  const m = SCRIPT_SQL.exec(text);
  if (!m) return null;
  const urls = [...text.matchAll(/(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|rediss?):\/\/[^\s"'`]+/gi)].map((x) => fromUrl(x[0])).filter((x): x is Target => !!x);
  const t: Target = urls.find((u) => remoteHost(u.host)) ?? urls[0] ?? {};
  const said = m[1].replace(/\s+/g, " ").trim();
  const d = describe(t.host || t.db ? t : {});
  return { risk: "irreversible", reason: `This runs ${rel}, which deletes data in ${d.what}${d.live} (it has ${clipSql(said)}). ${NO_UNDO}` };
}

/** The project's SQLite files a command names (sqlite3 dev.db ...), so the undo copy keeps them even when git ignores them. */
export function sqliteFiles(words: string[], cwd: string): string[] {
  const name = basename(words[0] ?? "");
  if (name !== "sqlite3" && name !== "sqlite") return [];
  const { pos } = split("sqlite3", words.slice(1));
  return pos[0] && !pos[0].startsWith(":") && !pos[0].includes("$") ? [isAbsolute(pos[0]) ? pos[0] : resolve(cwd, pos[0])] : [];
}
