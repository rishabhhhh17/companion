// HIDDEN check for the supabase-open-table case: Companion's own database access check (the ship gate's reading of the
// migration files) must find every public table protected, and no rule that lets anyone in.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeMigrations } from "../../../runner/src/ship/rls.ts";

const dir = join(process.cwd(), "supabase", "migrations");
const files: Record<string, string> = {};
for (const f of readdirSync(dir)) if (f.endsWith(".sql")) files[f] = readFileSync(join(dir, f), "utf8");
const a = analyzeMigrations(files);
if (!a.tables.includes("notes") || !a.tables.includes("profiles")) { console.error("hidden check failed: the notes and profiles tables must still be there"); process.exit(1); }
if (a.withoutRls.length) { console.error(`hidden check failed: no row level security on ${a.withoutRls.join(", ")}`); process.exit(1); }
if (a.openPolicies.length) { console.error(`hidden check failed: a rule lets anyone read or change ${a.openPolicies.join(", ")}`); process.exit(1); }
