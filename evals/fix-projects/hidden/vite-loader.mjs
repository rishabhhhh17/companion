// HIDDEN: how Vite fills import.meta.env for the page, kept outside the project (the project's own test helper could be
// edited). Only names starting with vite.config.js's envPrefix (VITE_ by default) reach the browser.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const read = (name) => (existsSync(join(root, name)) ? readFileSync(join(root, name), 'utf8') : '');
function envFile() {
  const env = {};
  for (const line of read('.env').split('\n')) { const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line); if (m) env[m[1]] = m[2]; }
  return env;
}
function prefixes() {
  const cfg = read('vite.config.js') + read('vite.config.ts') + read('vite.config.mjs');
  const list = /envPrefix\s*:\s*\[([^\]]*)\]/.exec(cfg);
  if (list) return [...list[1].matchAll(/(['"`])(.*?)\1/g)].map((m) => m[2]);
  const one = /envPrefix\s*:\s*(['"`])(.*?)\1/.exec(cfg);
  return [one ? one[2] : 'VITE_'];
}
export function exposedEnv() {
  const ps = prefixes();
  if (ps.some((p) => p === '')) throw new Error('envPrefix is empty, so every setting would reach the browser');
  return Object.fromEntries(Object.entries(envFile()).filter(([k]) => ps.some((p) => k.startsWith(p))));
}
const src = pathToFileURL(join(root, 'src') + '/').href;
export async function load(url, context, nextLoad) {
  const r = await nextLoad(url, context);
  if (!url.startsWith(src)) return r;
  const text = typeof r.source === 'string' ? r.source : new TextDecoder().decode(r.source);
  const env = { ...exposedEnv(), MODE: 'development', DEV: true, PROD: false };
  return { ...r, source: text.replace(/import\.meta\.env/g, `(${JSON.stringify(env)})`), shortCircuit: true };
}
