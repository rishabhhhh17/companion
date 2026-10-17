// HIDDEN check for the supabase-open-table case. Two parts:
// 1. Companion's own database access check (the ship gate's reading of the migration files) must find every public table
//    protected, and no rule that lets anyone in.
// 2. The notes themselves: row level security with no rule locks every person out of their own notes (the notes page
//    breaks), and a rule that says "true" lets every signed in person read everyone's notes (the same leak). So every rule
//    on notes must keep a person to their own rows (auth.uid() = user_id), and at least one must let them read them.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeMigrations, cleanSql } from "../../../runner/src/ship/rls.ts";

const fail = (why: string): never => { console.error(`hidden check failed: ${why}`); process.exit(1); };

const dir = join(process.cwd(), "supabase", "migrations");
const files: Record<string, string> = {};
for (const f of readdirSync(dir)) if (f.endsWith(".sql")) files[f] = readFileSync(join(dir, f), "utf8");
const a = analyzeMigrations(files);
if (!a.tables.includes("notes") || !a.tables.includes("profiles")) fail("the notes and profiles tables must still be there");
if (a.withoutRls.length) fail(`no row level security on ${a.withoutRls.join(", ")}`);
if (a.openPolicies.length) fail(`a rule lets anyone read or change ${a.openPolicies.join(", ")}`);

/** The text inside the brackets that follow a keyword, brackets inside it included; null when the keyword is not there. */
function bracketAfter(text: string, keyword: RegExp): string | null {
  const m = keyword.exec(text);
  if (!m) return null;
  let i = m.index + m[0].length, depth = 1;
  const start = i;
  for (; i < text.length && depth > 0; i++) { if (text[i] === "(") depth++; else if (text[i] === ")") depth--; }
  return text.slice(start, i - 1);
}
/** Does this rule keep a person to their own rows? Only a plain owner test, with nothing that could widen it. */
function ownerOnly(expr: string): boolean {
  const e = expr.replace(/\(\s*select\s+auth\.uid\(\)\s*\)/gi, "auth.uid()").replace(/\s+/g, " ").trim();
  if (/\b(or|true)\b/i.test(e)) return false;
  return /^\(*\s*(?:auth\.uid\(\) = (?:\w+\.)?user_id|(?:\w+\.)?user_id = auth\.uid\(\))\s*\)*$/i.test(e);
}

type Rule = { name: string; command: string; using: string | null; check: string | null };
const rules: Rule[] = [];
const POLICY = /create\s+policy\s+("[^"]+"|\w+)\s+on\s+((?:"[^"]+"|\w+)(?:\s*\.\s*(?:"[^"]+"|\w+))?)([^;]*)/gi;
for (const name of Object.keys(files).sort()) {
  for (const m of cleanSql(files[name]).text.matchAll(POLICY)) {
    const table = m[2].split(".").map((p) => p.trim().replace(/^"|"$/g, "").toLowerCase());
    if ((table.length === 2 ? table : ["public", table[0]]).join(".") !== "public.notes") continue;
    const rest = m[3];
    rules.push({ name: m[1], command: /\bfor\s+(all|select|insert|update|delete)\b/i.exec(rest)?.[1].toLowerCase() ?? "all", using: bracketAfter(rest, /\busing\s*\(/i), check: bracketAfter(rest, /\bwith\s+check\s*\(/i) });
  }
}
for (const r of rules) {
  for (const [what, expr] of [["using", r.using], ["with check", r.check]] as const) {
    if (expr !== null && !ownerOnly(expr)) fail(`the rule ${r.name} on notes must keep each person to their own notes (auth.uid() = user_id), but its ${what} is (${expr.trim()})`);
  }
}
if (!rules.some((r) => (r.command === "all" || r.command === "select") && r.using !== null && ownerOnly(r.using))) {
  fail("row level security is on, but no rule lets a person read their own notes, so nobody can see their own notes");
}
