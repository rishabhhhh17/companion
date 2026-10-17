// HIDDEN checks for the vite-env-prefix case. Run with: node --experimental-loader <this folder>/vite-loader.mjs vite-checks.mjs <name>
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { exposedEnv } from './vite-loader.mjs';

const ok = (cond, why) => { if (!cond) { console.error(`hidden check failed: ${why}`); process.exit(1); } };
const name = process.argv[2];
if (name === 'vite-forecast') {
  const { forecastUrl } = await import(pathToFileURL(join(process.cwd(), 'src', 'config.js')).href);
  ok(forecastUrl('Oslo') === 'https://api.weather.example/forecast?city=Oslo', 'the widget must reach the weather service in the browser');
} else if (name === 'vite-no-secret-exposed') {
  let env = {};
  try { env = exposedEnv(); } catch (e) { ok(false, e.message); }
  ok(!Object.entries(env).some(([k, v]) => /PASSWORD|SECRET/i.test(k) || /not-a-real-password/.test(String(v))), 'the database password must never reach the browser');
} else { console.error(`no hidden check called ${name}`); process.exit(2); }
