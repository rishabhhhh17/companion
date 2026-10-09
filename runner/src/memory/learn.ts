// Where memory lines come from. Project facts come from files in the granted folder; profile lines come only from
// things the person says or does inside Companion. Nothing here reads the screen, other apps or voice.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { detectProject } from "../proof/detect.ts";
import type { Scope } from "./store.ts";

export type Fact = { text: string; source: string };
export type Signal = { scope: Scope; text: string; source: string };

const STACK: [string, string][] = [
  ["react", "React"], ["next", "Next.js"], ["vue", "Vue"], ["nuxt", "Nuxt"], ["svelte", "Svelte"], ["@sveltejs/kit", "SvelteKit"], ["astro", "Astro"],
  ["@remix-run/react", "Remix"], ["vite", "Vite"], ["express", "Express"], ["@supabase/supabase-js", "Supabase"], ["stripe", "Stripe"],
  ["tailwindcss", "Tailwind"], ["typescript", "TypeScript"], ["prisma", "Prisma"], ["drizzle-orm", "Drizzle"],
];
const DEPLOY: [string, string][] = [["vercel.json", "Vercel"], ["wrangler.toml", "Cloudflare"], ["wrangler.jsonc", "Cloudflare"], ["wrangler.json", "Cloudflare"], ["netlify.toml", "Netlify"], ["fly.toml", "Fly.io"]];

export function projectFacts(project: string): Fact[] {
  const out: Fact[] = [];
  const pj = join(project, "package.json");
  try {
    if (existsSync(pj)) {
      const j = JSON.parse(readFileSync(pj, "utf8"));
      const deps = new Set([...Object.keys(j.dependencies ?? {}), ...Object.keys(j.devDependencies ?? {})]);
      const stack = STACK.filter(([d]) => deps.has(d)).map(([, n]) => n);
      if (stack.length) out.push({ text: `Built with ${stack.join(", ")}`, source: "package.json" });
      const pm = detectProject(project).packageManager ?? "npm";
      const scripts = j.scripts ?? {};
      const start = ["dev", "start"].find((s) => typeof scripts[s] === "string");
      if (start) out.push({ text: `Start it with: ${pm} run ${start}`, source: "package.json" });
      if (typeof scripts.test === "string") out.push({ text: `Check it with: ${pm} run test`, source: "package.json" });
      else if (typeof scripts.build === "string") out.push({ text: `Build it with: ${pm} run build`, source: "package.json" });
    } else if (existsSync(join(project, "index.html"))) {
      out.push({ text: "A plain website (index.html)", source: "index.html" });
    }
  } catch { /* an unreadable package file just adds nothing */ }
  for (const [file, host] of DEPLOY) if (existsSync(join(project, file))) { out.push({ text: `Deploys to ${host}`, source: file }); break; }
  if (existsSync(join(project, "supabase"))) out.push({ text: "Uses a Supabase database", source: "supabase folder" });
  return out;
}

const PREFER = /\b(?:use|prefer)\s+(tailwind|typescript|react|vue|svelte|next(?:\.js)?|supabase|stripe|cloudflare|vercel)\b/i;
export function askSignals(text: string): Signal[] {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return [];
  const out: Signal[] = [];
  const say = (re: RegExp, scope: Scope, line: string) => { const m = re.exec(t); if (m) out.push({ scope, text: line, source: `you said "${m[0].toLowerCase()}"` }); };
  say(/\b(?:shorter|more concise|keep it short|less text|be brief)\b/i, "profile", "Prefers short answers");
  say(/\b(?:simpler words|plain(?:er)? words|no jargon|explain (?:it )?simply)\b/i, "profile", "Prefers plain words, no jargon");
  say(/\b(?:more detail|explain more|more explanation|walk me through)\b/i, "profile", "Likes more explanation");
  const never = /\bnever (?:touch|edit|change|modify) ((?:the )?[\w./-]{2,40}(?: (?:folder|file))?)/i.exec(t);
  if (never) out.push({ scope: "project", text: `Never touch ${never[1].toLowerCase().startsWith("the ") ? never[1].replace(/^The /, "the ") : never[1]}`.replace(/\s+/g, " "), source: `you said "${never[0].toLowerCase()}"` });
  const pref = PREFER.exec(t);
  if (pref) { const name = ({ tailwind: "Tailwind", typescript: "TypeScript", react: "React", vue: "Vue", svelte: "Svelte", supabase: "Supabase", stripe: "Stripe", cloudflare: "Cloudflare", vercel: "Vercel" } as Record<string, string>)[pref[1].toLowerCase()] ?? "Next.js"; out.push({ scope: "project", text: `Prefers ${name}`, source: `you said "${pref[0].toLowerCase()}"` }); }
  return out;
}
