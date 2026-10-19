// What "fixed" means for an open table: the database access check (rls.ts) shows no table open. One rule for the open
// table practice on the page (app/src/practice.ts gateFinding) and its real run (runner/scripts/real-verify.ts), so what
// is measured is what the person is told. Plain code with no imports, so the pages can use it too.

/** The check shows no open table: it passed (the live database was read), or it could read only the files and they name
 *  no table (could_not_check with no findings, as on a copy with no live database connected). A table with row level
 *  security on but a rule that says "true" is named in the findings, so it is still open; a project that does not use
 *  Supabase (not_applicable), a block, or an answer this does not know proves nothing either (rule 14). */
export function noTableOpen(g: { status?: unknown; findings?: unknown } | null | undefined): boolean {
  if (!g) return false;
  if (g.status === "passed") return true;
  return g.status === "could_not_check" && !(Array.isArray(g.findings) && g.findings.length > 0);
}
