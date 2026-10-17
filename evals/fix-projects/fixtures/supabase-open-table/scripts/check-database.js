// Database check, run with npm run lint. Like Supabase's own database linter, it fails when a table in the public schema
// has no row level security, because then anyone with the site's address can read and change it.
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'supabase', 'migrations');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const created = [];
const protectedTables = new Set();
for (const f of files) {
  const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n');
  lines.forEach((line, i) => {
    const made = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)/i.exec(line);
    if (made) created.push({ table: made[1].toLowerCase(), file: `supabase/migrations/${f}`, line: i + 1 });
    const on = /alter\s+table\s+(?:public\.)?(\w+)\s+enable\s+row\s+level\s+security/i.exec(line);
    if (on) protectedTables.add(on[1].toLowerCase());
  });
}
const open = created.filter((t) => !protectedTables.has(t.table));
for (const t of open) console.error(`${t.file}:${t.line}: error: Table public.${t.table} is public, but row level security has not been enabled (rls_disabled_in_public)`);
if (open.length) process.exit(1);
console.log(`${created.length} tables checked, all protected.`);
