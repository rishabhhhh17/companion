// HIDDEN copy of the next-client-component fixture's build check (kept here so editing the project's copy cannot game it). A stand in for `next build` that applies Next.js's two rules about server and client components, with Next's own
// wording, so this project can be checked with no packages installed. Files under app/ are server components unless
// they start with "use client". A component that uses a React hook must be a client component, and a client component
// cannot be an async function.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const root = process.cwd();
const HOOKS = /\b(useState|useEffect|useReducer|useRef|useLayoutEffect|useContext)\b/;
const problems = [];

const isClient = (text) => /^\s*(['"])use client\1/.test(text);
function resolveImport(from, spec) {
  if (!spec.startsWith('.')) return null;
  const base = join(dirname(from), spec);
  for (const p of [base, `${base}.jsx`, `${base}.js`, join(base, 'index.jsx'), join(base, 'index.js')]) if (existsSync(p) && statSync(p).isFile()) return p;
  return null;
}
function entries(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...entries(p));
    else if (/^(page|layout)\.(jsx|js)$/.test(n)) out.push(p);
  }
  return out;
}

const seen = new Set();
function visit(file) {
  if (seen.has(file)) return;
  seen.add(file);
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  const name = `./${relative(root, file)}`;
  if (isClient(text)) {
    const i = lines.findIndex((l) => /export\s+default\s+async\s+function/.test(l));
    if (i >= 0) problems.push(`${name}:${i + 1}:16\nError: async/await is not yet supported in Client Components, only Server Components. This error is often caused by accidentally adding \`'use client'\` to a module that was originally written for the server.`);
    return;   // everything it imports is on the client side too
  }
  lines.forEach((line, i) => {
    const hook = /import\s*\{([^}]*)\}\s*from\s*['"]react['"]/.exec(line);
    const used = hook && HOOKS.exec(hook[1]);
    if (used) problems.push(`${name}:${i + 1}:${line.indexOf(used[1]) + 1}\nError: You're importing a component that needs ${used[1]}. This React hook only works in a client component. To fix, mark the file (or its parent) with the "use client" directive.`);
  });
  for (const m of text.matchAll(/import\s+[^'"]*from\s*['"]([^'"]+)['"]/g)) {
    const next = resolveImport(file, m[1]);
    if (next) visit(next);
  }
}

for (const e of entries(join(root, 'app'))) visit(e);
if (problems.length) {
  console.error('Failed to compile.\n');
  console.error(problems.join('\n\n'));
  process.exit(1);
}
console.log('Compiled successfully.');
