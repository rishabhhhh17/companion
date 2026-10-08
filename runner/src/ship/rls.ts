// The database access check. Supabase tables in the public schema can be read through the public interface, so each
// needs row level security switched on. This reads the migration files (offline) and can also ask the live database.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type GateStatus = "passed" | "blocked" | "could_not_check" | "not_applicable";
export type GateResult = { id: string; label: string; status: GateStatus; detail: string; findings?: string[]; overridable?: boolean };

export const LIVE_RLS_SQL = `select c.relname as "table", c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p') order by c.relname`;

export function detectSupabase(project: string): boolean {
  if (existsSync(join(project, "supabase"))) return true;
  try {
    const p = JSON.parse(readFileSync(join(project, "package.json"), "utf8"));
    return Object.keys({ ...p.dependencies, ...p.devDependencies }).some((d) => d.startsWith("@supabase/"));
  } catch { return false; }
}

const NAME = String.raw`((?:"[^"]+"|\w+)(?:\s*\.\s*(?:"[^"]+"|\w+))?)`;
const CREATE = new RegExp(String.raw`create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?${NAME}`, "gi");
const RLS = new RegExp(String.raw`alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${NAME}\s+(enable|disable)\s+row\s+level\s+security`, "gi");
const DROP = new RegExp(String.raw`drop\s+table\s+(?:if\s+exists\s+)?${NAME}`, "gi");

// "public.Notes" -> "notes"; anything in another schema is not exposed, so null.
function publicTable(raw: string): string | null {
  const parts = raw.split(".").map((p) => p.trim().replace(/^"|"$/g, "").toLowerCase());
  const [schema, table] = parts.length === 2 ? parts : ["public", parts[0]];
  return schema === "public" ? table : null;
}
// Takes comments out and empties quoted text, so a "--" inside a string or a table name inside an INSERT is never read as SQL.
// Code that builds SQL while it runs (DO blocks, EXECUTE) cannot be read this way, so it is reported separately.
export function cleanSql(sql: string): { text: string; dynamic: boolean } {
  let out = "", i = 0, dynamic = false;
  while (i < sql.length) {
    const c = sql[i], two = sql.slice(i, i + 2);
    if (two === "--") { while (i < sql.length && sql[i] !== "\n") i++; out += " "; continue; }
    if (two === "/*") { const e = sql.indexOf("*/", i + 2); i = e < 0 ? sql.length : e + 2; out += " "; continue; }
    if (c === "'") { i++; while (i < sql.length) { if (sql[i] === "'" && sql[i + 1] === "'") i += 2; else if (sql[i] === "'") { i++; break; } else i++; } out += "''"; continue; }
    if (c === "$") {
      const m = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (m) {
        const e = sql.indexOf(m[0], i + m[0].length), body = sql.slice(i + m[0].length, e < 0 ? sql.length : e);
        if (/\bexecute\b|\bcreate\s+table\b|\balter\s+table\b/i.test(cleanSql(body).text)) dynamic = true;
        i = e < 0 ? sql.length : e + m[0].length; out += " "; continue;
      }
    }
    out += c; i++;
  }
  return { text: out, dynamic };
}
const stripComments = (sql: string) => cleanSql(sql).text;
const RENAME = new RegExp(String.raw`alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${NAME}\s+rename\s+to\s+(\w+|"[^"]+")`, "gi");
const SET_SCHEMA = new RegExp(String.raw`alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${NAME}\s+set\s+schema\s+(\w+|"[^"]+")`, "gi");
const POLICY = /create\s+policy\s+(?:"[^"]+"|\w+)\s+on\s+((?:"[^"]+"|\w+)(?:\s*\.\s*(?:"[^"]+"|\w+))?)([^;]*)/gi;

export function analyzeMigrations(files: Record<string, string>): { tables: string[]; withoutRls: string[]; openPolicies: string[]; dynamic: boolean } {
  const state = new Map<string, boolean>();
  const openPolicies = new Set<string>();
  let dynamic = false;
  for (const name of Object.keys(files).sort()) {
    const cleaned = cleanSql(files[name]);
    const sql = cleaned.text;
    if (cleaned.dynamic) dynamic = true;
    for (const m of sql.matchAll(POLICY)) {
      const t = publicTable(m[1]), rest = m[2];
      const toWho = /\bto\s+([\w\s,"]+?)(?=\s+(?:using|with)\b|$)/i.exec(rest)?.[1].toLowerCase() ?? "public";
      const wide = /\busing\s*\(\s*true\s*\)/i.test(rest) || /\bwith\s+check\s*\(\s*true\s*\)/i.test(rest);
      if (t && wide && /\b(anon|public)\b/.test(toWho)) openPolicies.add(t);
    }
    const events: { at: number; kind: "create" | "enable" | "disable" | "drop" | "rename" | "leave"; table: string | null; to?: string }[] = [];
    for (const m of sql.matchAll(RENAME)) events.push({ at: m.index!, kind: "rename", table: publicTable(m[1]), to: m[2].replace(/^"|"$/g, "").toLowerCase() });
    for (const m of sql.matchAll(SET_SCHEMA)) if (m[2].replace(/^"|"$/g, "").toLowerCase() !== "public") events.push({ at: m.index!, kind: "leave", table: publicTable(m[1]) });
    for (const m of sql.matchAll(CREATE)) events.push({ at: m.index!, kind: "create", table: publicTable(m[1]) });
    for (const m of sql.matchAll(RLS)) events.push({ at: m.index!, kind: m[2].toLowerCase() as "enable" | "disable", table: publicTable(m[1]) });
    for (const m of sql.matchAll(DROP)) events.push({ at: m.index!, kind: "drop", table: publicTable(m[1]) });
    for (const e of events.sort((a, b) => a.at - b.at)) {
      if (!e.table) continue;
      if (e.kind === "create") state.set(e.table, state.get(e.table) ?? false);
      else if (e.kind === "enable") state.set(e.table, true);
      else if (e.kind === "disable") state.set(e.table, false);
      else if (e.kind === "rename") { const was = state.get(e.table); state.delete(e.table); if (e.to) state.set(e.to, was ?? false); }
      else state.delete(e.table);   // dropped, or moved out of the public schema
    }
  }
  const tables = [...state.keys()];
  return { tables, withoutRls: tables.filter((t) => !state.get(t)), openPolicies: [...openPolicies].filter((t) => state.has(t)), dynamic };
}

export function liveRows(rows: { table: string; rls: boolean | null }[]): { tables: string[]; withoutRls: string[] } {
  return { tables: rows.map((r) => r.table), withoutRls: rows.filter((r) => r.rls !== true).map((r) => r.table) };
}

function migrationFiles(project: string): Record<string, string> {
  const out: Record<string, string> = {};
  const dir = join(project, "supabase", "migrations");
  try { for (const f of readdirSync(dir)) if (f.endsWith(".sql")) out[f] = readFileSync(join(dir, f), "utf8"); } catch { /* no migrations */ }
  return out;
}

const ID = "database_access", LABEL = "Database access is protected";

export async function rlsGate(o: { project: string; query?: () => Promise<{ table: string; rls: boolean | null }[]> }): Promise<GateResult> {
  if (!detectSupabase(o.project)) return { id: ID, label: LABEL, status: "not_applicable", detail: "This project does not use Supabase." };
  const files = migrationFiles(o.project);
  const stat = analyzeMigrations(files);
  const hasFiles = Object.keys(files).length > 0;
  const open = (names: string[]) => `${names.length === 1 ? "This table is" : "These tables are"} open to anyone with your site address: ${names.join(", ")}. Turn on row level security for ${names.length === 1 ? "it" : "them"} and add the rules that say who may see what.`;
  if (stat.withoutRls.length) return { id: ID, label: LABEL, status: "blocked", detail: open(stat.withoutRls), findings: stat.withoutRls, overridable: false };
  const note = stat.dynamic ? " Some of your database code builds its tables while it runs, which I cannot read, so tables made that way are not covered." : "";
  if (!o.query && stat.openPolicies.length) {
    return { id: ID, label: LABEL, status: "could_not_check", overridable: true, findings: stat.openPolicies,
      detail: `${stat.openPolicies.join(", ")} can be read or changed by anyone, signed in or not, because of a rule that says "true". Make the rule check who the person is, or confirm it is meant to be public.${note}` };
  }
  if (!o.query) {
    return { id: ID, label: LABEL, status: "could_not_check", overridable: true,
      detail: hasFiles ? `The tables in your migration files are protected, but I could not check your live database, where tables made in the Supabase dashboard would not show up. Connect it to be sure, or confirm you have checked it yourself.${note}` : `I could not check your live database, and there are no migration files to read. Connect it to be sure, or confirm you have checked it yourself.${note}` };
  }
  try {
    const live = liveRows(await o.query());
    if (live.withoutRls.length) return { id: ID, label: LABEL, status: "blocked", detail: open(live.withoutRls), findings: live.withoutRls, overridable: false };
    return { id: ID, label: LABEL, status: "passed", detail: live.tables.length ? `All ${live.tables.length} table${live.tables.length === 1 ? "" : "s"} in your live database have row level security on.` : "Your live database has no public tables." };
  } catch (e) {
    return { id: ID, label: LABEL, status: "could_not_check", overridable: true, detail: `I could not check your live database (${(e as Error).message}). Fix the connection, or confirm you have checked it yourself.` };
  }
}
