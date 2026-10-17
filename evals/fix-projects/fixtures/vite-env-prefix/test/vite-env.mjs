// Imitates how Vite fills import.meta.env for the page: it reads .env, and only the names that start with the envPrefix
// in vite.config.js (VITE_ unless the config says otherwise) reach the browser. Everything else stays on the server.
// Used as a Node loader by npm test, so the code under src/ runs exactly as written.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const read = (name) => { const p = fileURLToPath(new URL(name, root)); return existsSync(p) ? readFileSync(p, 'utf8') : ''; };

function envFile() {
  const env = {};
  for (const line of read('.env').split('\n')) {
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) env[m[1]] = m[2];
  }
  return env;
}
// envPrefix may be one prefix or a list of them, as in Vite.
function envPrefixes() {
  const cfg = read('vite.config.js');
  const list = /envPrefix\s*:\s*\[([^\]]*)\]/.exec(cfg);
  const one = /envPrefix\s*:\s*(['"`])(.*?)\1/.exec(cfg);
  const prefixes = list ? [...list[1].matchAll(/(['"`])(.*?)\1/g)].map((m) => m[2]) : [one ? one[2] : 'VITE_'];
  if (prefixes.includes('')) throw new Error('envPrefix option contains value \'\', which could lead unexpected exposure of sensitive information.');
  return prefixes;
}
export function exposedEnv() {
  const prefixes = envPrefixes();
  return Object.fromEntries(Object.entries(envFile()).filter(([k]) => prefixes.some((p) => k.startsWith(p))));
}

const src = new URL('../src/', import.meta.url).href;
export async function load(url, context, nextLoad) {
  const r = await nextLoad(url, context);
  if (!url.startsWith(src)) return r;
  const text = typeof r.source === 'string' ? r.source : new TextDecoder().decode(r.source);
  const env = { ...exposedEnv(), MODE: 'development', DEV: true, PROD: false };
  return { ...r, source: text.replace(/import\.meta\.env/g, `(${JSON.stringify(env)})`), shortCircuit: true };
}
