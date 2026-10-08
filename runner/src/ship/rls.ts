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
const stripComments = (sql: string) => sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

export function analyzeMigrations(files: Record<string, string>): { tables: string[]; withoutRls: string[] } {
  const state = new Map<string, boolean>();
  for (const name of Object.keys(files).sort()) {
    const sql = stripComments(files[name]);
    const events: { at: number; kind: "create" | "enable" | "disable" | "drop"; table: string | null }[] = [];
    for (const m of sql.matchAll(CREATE)) events.push({ at: m.index!, kind: "create", table: publicTable(m[1]) });
    for (const m of sql.matchAll(RLS)) events.push({ at: m.index!, kind: m[2].toLowerCase() as "enable" | "disable", table: publicTable(m[1]) });
    for (const m of sql.matchAll(DROP)) events.push({ at: m.index!, kind: "drop", table: publicTable(m[1]) });
    for (const e of events.sort((a, b) => a.at - b.at)) {
      if (!e.table) continue;
      if (e.kind === "create") state.set(e.table, state.get(e.table) ?? false);
      else if (e.kind === "enable") state.set(e.table, true);
      else if (e.kind === "disable") state.set(e.table, false);
      else state.delete(e.table);
    }
  }
  const tables = [...state.keys()];
  return { tables, withoutRls: tables.filter((t) => !state.get(t)) };
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
  if (!o.query) {
    return { id: ID, label: LABEL, status: "could_not_check", overridable: true,
      detail: hasFiles ? "The tables in your migration files are protected, but I could not check your live database, where tables made in the Supabase dashboard would not show up. Connect it to be sure, or confirm you have checked it yourself." : "I could not check your live database, and there are no migration files to read. Connect it to be sure, or confirm you have checked it yourself." };
  }
  try {
    const live = liveRows(await o.query());
    if (live.withoutRls.length) return { id: ID, label: LABEL, status: "blocked", detail: open(live.withoutRls), findings: live.withoutRls, overridable: false };
    return { id: ID, label: LABEL, status: "passed", detail: live.tables.length ? `All ${live.tables.length} table${live.tables.length === 1 ? "" : "s"} in your live database have row level security on.` : "Your live database has no public tables." };
  } catch (e) {
    return { id: ID, label: LABEL, status: "could_not_check", overridable: true, detail: `I could not check your live database (${(e as Error).message}). Fix the connection, or confirm you have checked it yourself.` };
  }
}
