// M117 step 1: the project's server routes, per framework, as static rules over text already in memory. A framework counts
// when its files are found (and, for the folder conventions, its package is in a package list). A route the rules cannot
// read (a path made at run time, a framework with no reader) is never left out quietly: it is said as could not check,
// with a count. Pure: no file is opened here.
import type { MoneyFramework, MoneyMethod, MoneyUnsure } from "../../../protocol/index.ts";
import { CODE, depsOf, importsOf, LEFT_OUT, lineAt, resolveLocal } from "./text.ts";

export type RouteKind = "route" | "action" | "function" | "form_handler";
export type Route = { file: string; line: number; framework: MoneyFramework; method?: MoneyMethod; path?: string; kind: RouteKind };
export type Unsure = { why: MoneyUnsure; count?: number; name?: string };
export type Code = Readonly<Record<string, string>>;

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const SERVER_NAMES: [RegExp | string, string][] = [["koa", "koa"], ["@nestjs/core", "@nestjs/core"], ["elysia", "elysia"], ["@hapi/hapi", "@hapi/hapi"], ["@adonisjs/core", "@adonisjs/core"], ["django", "django"], ["@trpc/server", "@trpc/server"]];
const cleanPath = (p: string): string | undefined => { const t = ("/" + p.replace(/^\/+/, "")).replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/"; return /^\/[A-Za-z0-9_\-./:[\]*$]{0,200}$/.test(t) ? t : undefined; };
const upper = (m: string): MoneyMethod | undefined => { const u = m.toUpperCase(); return u === "ALL" ? "ALL" : (METHODS as readonly string[]).includes(u) ? (u as MoneyMethod) : undefined; };

/** The path of a file based route from its folder: route groups "(x)" and parallel "@x" folders left out. */
function folderPath(segments: string[]): string | undefined {
  const kept = segments.filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith("@") && s !== "index");
  return cleanPath(kept.join("/"));
}

function nextApp(file: string, code: string, out: Route[]): void {
  const m = /^(?:src\/)?app\/(.*?)\/?route\.(?:[cm]?[jt]sx?)$/.exec(file) ?? /^(?:src\/)?app\/()route\.(?:[cm]?[jt]sx?)$/.exec(file);
  if (!m) return;
  const path = folderPath(m[1].split("/"));
  const re = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b|export\s+(?:const|let|var)\s+(GET|POST|PUT|PATCH|DELETE)\s*=|export\s*\{([^}]*)\}/g;
  for (const x of code.matchAll(re)) {
    const line = lineAt(code, x.index!);
    const names = x[3] ? [...x[3].matchAll(/\bas\s+(GET|POST|PUT|PATCH|DELETE)\b|^\s*(GET|POST|PUT|PATCH|DELETE)\s*$/gm)].map((y) => y[1] ?? y[2]) : [x[1] ?? x[2]];
    for (const n of names) if (n) out.push({ file, line, framework: "next_app", method: n as MoneyMethod, ...(path ? { path } : {}), kind: "route" });
  }
}
/** Server Actions: a file or a function marked "use server" that exports an async function. Anyone can call one with a POST. */
function serverActions(file: string, code: string, out: Route[]): void {
  const top = /^\s*(?:["']use strict["'];?\s*)?["']use server["']/.test(code.replace(/^\s+/, ""));
  if (top) {
    for (const x of code.matchAll(/export\s+(?:default\s+)?async\s+function\s*(\w*)|export\s+const\s+(\w+)\s*=\s*async\b/g)) out.push({ file, line: lineAt(code, x.index!), framework: "next_app", method: "POST", kind: "action" });
    return;
  }
  // "use server" inside a function: the line that marks it.
  for (const x of code.matchAll(/^\s+["']use server["'];?\s*$/gm)) out.push({ file, line: lineAt(code, x.index!), framework: "next_app", method: "POST", kind: "action" });
}
function nextPages(file: string, code: string, out: Route[]): void {
  const m = /^(?:src\/)?pages\/(api\/.*)\.(?:[cm]?[jt]sx?)$/.exec(file);
  if (!m) return;
  const x = /export\s+default\b/.exec(code);
  if (!x) return;
  const path = folderPath(m[1].split("/"));
  out.push({ file, line: lineAt(code, x.index), framework: "next_pages", ...(path ? { path } : {}), kind: "route" });
}

/** The names a file gives its server object: `const app = express()`, `const router = Router()`, `new Hono()`, `Fastify()`. */
function receivers(code: string, make: RegExp, fallback: string[]): string[] {
  const got = [...code.matchAll(new RegExp(String.raw`(?:const|let|var)\s+(\w+)\s*(?::\s*[\w<>.,\s]+)?=\s*(?:await\s+)?(?:${make.source})`, "g"))].map((m) => m[1]);
  return got.length ? [...new Set([...got, ...fallback])] : fallback;
}
type Mounts = Map<string, string>;   // a file -> the path it is mounted at
/** Express, Hono and Fastify: route calls on the server's own names with a path written as text. A call whose path is
 *  made by code (a variable, a template with ${}, app[method]) is counted as could not check. */
function callRoutes(file: string, code: string, fw: "express" | "hono" | "fastify", names: string[], prefix: string, out: Route[], dyn: { n: number }): void {
  const who = names.map((n) => n.replace(/\$/g, "\\$")).join("|");
  const re = new RegExp(String.raw`\b(${who})\s*\.\s*(get|post|put|patch|delete|all|on)\s*\(\s*`, "g");
  for (const x of code.matchAll(re)) {
    const rest = code.slice(x.index! + x[0].length, x.index! + x[0].length + 240);
    const line = lineAt(code, x.index!);
    let method = upper(x[2]);
    let r = rest;
    if (x[2] === "on") { const mm = /^(["'])([A-Za-z]+)\1\s*,\s*/.exec(r); if (!mm) { dyn.n++; continue; } method = upper(mm[2]); r = r.slice(mm[0].length); }
    const p = /^(["'`])([^"'`\n]*)\1/.exec(r);
    if (!p || (p[1] === "`" && p[2].includes("${"))) { dyn.n++; continue; }
    if (!p[2].startsWith("/") && p[2] !== "*") continue;   // not a route path (a client call, a setting)
    const path = cleanPath(`${prefix}/${p[2] === "*" ? "*" : p[2]}`);
    out.push({ file, line, framework: fw, ...(method ? { method } : {}), ...(path ? { path } : {}), kind: "route" });
  }
  const computed = new RegExp(String.raw`\b(${who})\s*\[\s*[\w$.]+\s*\]\s*\(`, "g");
  for (const _ of code.matchAll(computed)) dyn.n++;
  if (fw === "fastify") {
    for (const x of code.matchAll(/\.route\s*\(\s*\{([\s\S]{0,400}?)\}\s*\)/g)) {
      const body = x[1];
      const url = /\b(?:url|path)\s*:\s*(["'`])([^"'`\n]*)\1/.exec(body), meth = /\bmethod\s*:\s*(["'])([A-Za-z]+)\1/.exec(body);
      if (!url || url[2].includes("${")) { dyn.n++; continue; }
      const path = cleanPath(`${prefix}/${url[2]}`);
      out.push({ file, line: lineAt(code, x.index!), framework: "fastify", ...(meth && upper(meth[2]) ? { method: upper(meth[2]) } : {}), ...(path ? { path } : {}), kind: "route" });
    }
  }
}
/** app.use("/api", router) and app.route("/api", sub): the file the router comes from is mounted at that path. */
function mountsIn(file: string, code: string, has: (f: string) => boolean, mounts: Mounts): void {
  const from = new Map<string, string>();
  for (const m of code.matchAll(/import\s+(\w+)(?:\s*,\s*\{[^}]*\})?\s+from\s+(["'])([^"']+)\2|(?:const|let|var)\s+(\w+)\s*=\s*require\s*\(\s*(["'])([^"']+)\5\s*\)/g)) {
    const name = m[1] ?? m[4], spec = m[3] ?? m[6];
    const r = resolveLocal(file, spec, has);
    if (r) from.set(name, r);
  }
  for (const m of code.matchAll(/\.\s*(?:use|route|register)\s*\(\s*(["'])(\/[^"'\n]*)\1\s*,\s*(\w+)/g)) {
    const target = from.get(m[3]);
    if (target && !mounts.has(target)) mounts.set(target, m[2].replace(/\/\*$/, ""));
  }
  // Fastify: register(plugin, { prefix: "/api" }).
  for (const m of code.matchAll(/\.register\s*\(\s*(\w+)\s*,\s*\{[^}]*\bprefix\s*:\s*(["'])(\/[^"'\n]*)\2/g)) {
    const target = from.get(m[1]);
    if (target && !mounts.has(target)) mounts.set(target, m[3]);
  }
}

function remix(file: string, code: string, out: Route[]): void {
  const m = /^app\/routes\/(.+?)(?:\/route)?\.(?:[cm]?[jt]sx?)$/.exec(file);
  if (!m) return;
  const segs = m[1].replace(/\//g, ".").split(".").filter((s) => s && s !== "_index" && !/^_/.test(s) && !/^\(.*\)$/.test(s)).map((s) => (s === "$" ? "*" : s.startsWith("$") ? `:${s.slice(1)}` : s.replace(/_$/, "")));
  const path = cleanPath(segs.join("/"));
  for (const x of code.matchAll(/export\s+(?:async\s+)?function\s+(action|loader)\b|export\s+(?:const|let)\s+(action|loader)\s*=/g)) {
    const which = x[1] ?? x[2];
    out.push({ file, line: lineAt(code, x.index!), framework: "remix", method: which === "action" ? "POST" : "GET", ...(path ? { path } : {}), kind: which === "action" ? "form_handler" : "route" });
  }
}
function svelte(file: string, code: string, out: Route[]): void {
  const s = /^src\/routes\/(?:(.*)\/)?\+server\.(?:ts|js)$/.exec(file);
  const p = /^src\/routes\/(?:(.*)\/)?\+page\.server\.(?:ts|js)$/.exec(file);
  if (s) {
    const path = folderPath((s[1] ?? "").split("/"));
    for (const x of code.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|fallback)\b|export\s+(?:const|let)\s+(GET|POST|PUT|PATCH|DELETE|fallback)\s*(?::[^=]+)?=/g)) {
      const n = x[1] ?? x[2];
      out.push({ file, line: lineAt(code, x.index!), framework: "sveltekit", ...(n !== "fallback" ? { method: n as MoneyMethod } : {}), ...(path ? { path } : {}), kind: "route" });
    }
  } else if (p) {
    const x = /export\s+(?:const|let)\s+actions\b/.exec(code);
    const path = folderPath((p[1] ?? "").split("/"));
    if (x) out.push({ file, line: lineAt(code, x.index), framework: "sveltekit", method: "POST", ...(path ? { path } : {}), kind: "form_handler" });
  }
}
function nuxt(file: string, code: string, out: Route[]): void {
  const m = /^server\/(api|routes)\/(.+)\.(?:ts|js|mjs)$/.exec(file);
  if (!m) return;
  const x = /\b(?:defineEventHandler|eventHandler|defineCachedEventHandler)\s*\(/.exec(code);
  if (!x) return;
  let name = m[2];
  const meth = /\.(get|post|put|patch|delete)$/i.exec(name);
  if (meth) name = name.slice(0, -meth[0].length);
  const path = folderPath([...(m[1] === "api" ? ["api"] : []), ...name.split("/")]);
  out.push({ file, line: lineAt(code, x.index), framework: "nuxt", ...(meth ? { method: upper(meth[1]) } : {}), ...(path ? { path } : {}), kind: "route" });
}
function supabaseFn(file: string, code: string, out: Route[]): void {
  const m = /^supabase\/functions\/([A-Za-z0-9][\w-]*)\/index\.(?:ts|js)$/.exec(file);
  if (!m) return;
  const x = /\bDeno\.serve\s*\(|\bserve\s*\(|export\s+default\s*\{[\s\S]{0,80}\bfetch\b/.exec(code);
  if (!x) return;
  out.push({ file, line: lineAt(code, x.index), framework: "supabase_fn", path: `/functions/v1/${m[1]}`, kind: "function" });
}
function pagesFunctions(file: string, code: string, out: Route[]): void {
  const m = /^functions\/(.+)\.(?:ts|js)$/.exec(file);
  if (!m) return;
  const path = folderPath(["", ...m[1].split("/")]);
  for (const x of code.matchAll(/export\s+(?:async\s+)?function\s+(onRequest(?:Get|Post|Put|Patch|Delete)?)\b|export\s+const\s+(onRequest(?:Get|Post|Put|Patch|Delete)?)\s*(?::[^=]+)?=/g)) {
    const n = (x[1] ?? x[2]).slice("onRequest".length);
    out.push({ file, line: lineAt(code, x.index!), framework: "cloudflare", ...(n ? { method: upper(n) } : {}), ...(path ? { path } : {}), kind: "function" });
  }
}
function vercelFn(file: string, code: string, out: Route[]): void {
  const m = /^api\/(.+)\.(?:ts|js|mjs|py)$/.exec(file);
  if (!m) return;
  const path = folderPath(["api", ...m[1].split("/")]);
  if (file.endsWith(".py")) {
    const x = /^class\s+handler\s*\(/m.exec(code);
    if (x) out.push({ file, line: lineAt(code, x.index), framework: "vercel_fn", ...(path ? { path } : {}), kind: "function" });
    return;
  }
  const methods = [...code.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b|export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=/g)];
  for (const x of methods) out.push({ file, line: lineAt(code, x.index!), framework: "vercel_fn", method: (x[1] ?? x[2]) as MoneyMethod, ...(path ? { path } : {}), kind: "function" });
  if (!methods.length) { const d = /export\s+default\b|module\.exports\s*=/.exec(code); if (d) out.push({ file, line: lineAt(code, d.index), framework: "vercel_fn", ...(path ? { path } : {}), kind: "function" }); }
}
function python(file: string, code: string, fw: "flask" | "fastapi", out: Route[], dyn: { n: number }): void {
  // FastAPI: APIRouter(prefix="/x") on a name in the same file.
  const prefixes = new Map<string, string>();
  for (const m of code.matchAll(/(\w+)\s*=\s*(?:APIRouter|Blueprint)\s*\(([^)]*)\)/g)) { const p = /(?:prefix|url_prefix)\s*=\s*["']([^"']*)["']/.exec(m[2]); if (p) prefixes.set(m[1], p[1]); }
  const re = fw === "flask" ? /@(\w+)\.(route|get|post|put|patch|delete)\s*\(\s*/g : /@(\w+)\.(get|post|put|patch|delete|api_route)\s*\(\s*/g;
  for (const x of code.matchAll(re)) {
    const rest = code.slice(x.index! + x[0].length, x.index! + x[0].length + 300);
    const p = /^[rf]?(["'])([^"'\n]*)\1/.exec(rest);
    if (!p || rest.startsWith("f")) { dyn.n++; continue; }
    let method: MoneyMethod | undefined = x[2] === "route" || x[2] === "api_route" ? undefined : upper(x[2]);
    if (!method) { const mm = /methods\s*=\s*\[\s*["']([A-Za-z]+)["']/.exec(rest.slice(0, 200)); method = mm ? upper(mm[1]) : x[2] === "route" ? "GET" : undefined; }
    const path = cleanPath(`${prefixes.get(x[1]) ?? ""}/${p[2]}`);
    out.push({ file, line: lineAt(code, x.index!), framework: fw, ...(method ? { method } : {}), ...(path ? { path } : {}), kind: "route" });
  }
  for (const _ of code.matchAll(/\.add_url_rule\s*\(\s*[A-Za-z_]/g)) dyn.n++;
}

/** Cloudflare Workers: the wrangler file's main file, when it exports a fetch handler. One route for the whole Worker. */
export function wranglerMain(files: Code): string | null {
  for (const [f, text] of Object.entries(files)) {
    if (!/(^|\/)wrangler\.(toml|jsonc?)$/.test(f)) continue;
    const m = /^\s*main\s*=\s*["']([^"']+)["']/m.exec(text) ?? /"main"\s*:\s*"([^"]+)"/.exec(text);
    if (m) { const dir = f.includes("/") ? f.slice(0, f.lastIndexOf("/") + 1) : ""; return (dir + m[1].replace(/^\.\//, "")).replace(/\/\.\//g, "/"); }
  }
  return null;
}

/** The folders ("" for the top, or "apps/web/") of every package list that names a framework, so a project kept in a
 *  subfolder (a monorepo) is read from its own folder. The top always counts for a framework found anywhere. */
export function rootsOf(raw: Code, has: (deps: Map<string, string>) => boolean): string[] {
  const out = new Set<string>();
  for (const f of Object.keys(raw)) {
    const m = /^(.*\/)?package\.json$/.exec(f);
    if (!m || LEFT_OUT.test(f) || !has(depsOf({ [f]: raw[f] }))) continue;
    out.add(m[1] ?? "");
  }
  if (out.size) out.add("");
  // The longest first, so a file is read from the closest app folder.
  return [...out].sort((a, b) => b.length - a.length);
}
/** Run one reader on a file as seen from the first app folder it is in, then put the file's own path back on what it found. */
function fromRoots(f: string, roots: readonly string[], t: string, out: Route[], read: (rel: string, t: string, out: Route[]) => void): void {
  const r = roots.find((x) => f.startsWith(x));
  if (r === undefined) return;
  const before = out.length;
  read(f.slice(r.length), t, out);
  for (let i = before; i < out.length; i++) out[i].file = f;
}

/** Every route found, what could not be checked, and the frameworks seen. code: the project's files with comments blanked. */
export function routesIn(code: Code, raw: Code = code): { routes: Route[]; unsure: Unsure[]; frameworks: MoneyFramework[] } {
  const deps = depsOf(raw);
  const has = (f: string) => code[f] !== undefined;
  const routes: Route[] = [];
  const unsure: Unsure[] = [];
  const dyn = { n: 0 };
  const nextRoots = rootsOf(raw, (d) => d.has("next")), remixRoots = rootsOf(raw, (d) => [...d.keys()].some((x) => x.startsWith("@remix-run/") || x.startsWith("@react-router/")));
  const kitRoots = rootsOf(raw, (d) => d.has("@sveltejs/kit")), nuxtRoots = rootsOf(raw, (d) => d.has("nuxt") || d.has("nuxt3"));
  const isNext = nextRoots.length > 0, isRemix = remixRoots.length > 0, isKit = kitRoots.length > 0, isNuxt = nuxtRoots.length > 0;
  // Cloudflare Pages functions and Vercel functions: from the top, and from each folder with its own host file.
  const hostRoots = (re: RegExp) => [...new Set(["", ...Object.keys(raw).filter((f) => re.test(f) && !LEFT_OUT.test(f)).map((f) => (f.includes("/") ? f.slice(0, f.lastIndexOf("/") + 1) : ""))])].sort((a, b) => b.length - a.length);
  const pagesRoots = hostRoots(/(^|\/)wrangler\.(toml|jsonc?)$/), vercelRoots = hostRoots(/(^|\/)vercel\.json$/);
  const files = Object.keys(code).filter((f) => CODE.test(f) && !LEFT_OUT.test(f)).sort();
  // Mounted routers first, so their routes get the path they are mounted at.
  const mounts: Mounts = new Map();
  for (const f of files) if (/\.(use|route|register)\s*\(/.test(code[f])) mountsIn(f, code[f], has, mounts);
  const main = wranglerMain(raw);
  for (const f of files) {
    const t = code[f];
    const pk = new Set(importsOf(f, t).packages.map((p) => p.name));
    const before = routes.length;
    if (isNext) { fromRoots(f, nextRoots, t, routes, (rel, x, o) => { nextApp(rel, x, o); nextPages(rel, x, o); }); if (/["']use server["']/.test(t)) serverActions(f, t, routes); }
    if (isRemix) fromRoots(f, remixRoots, t, routes, remix);
    if (isKit) fromRoots(f, kitRoots, t, routes, svelte);
    if (isNuxt) fromRoots(f, nuxtRoots, t, routes, nuxt);
    // Supabase functions: in a supabase/functions folder anywhere.
    fromRoots(f, [f.includes("supabase/functions/") ? f.slice(0, f.indexOf("supabase/functions/")) : ""], t, routes, supabaseFn);
    if (main || deps.has("wrangler")) fromRoots(f, pagesRoots, t, routes, pagesFunctions);
    const vr = vercelRoots.find((x) => f.startsWith(x)) ?? "";
    if (!nextRoots.includes(vr) && /^api\//.test(f.slice(vr.length)) && !pk.has("express") && !pk.has("hono") && !pk.has("fastify")) fromRoots(f, [vr], t, routes, vercelFn);
    if (pk.has("express")) callRoutes(f, t, "express", receivers(t, /express\s*\(|express\.Router\s*\(|Router\s*\(/, ["app", "router"]), mounts.get(f) ?? "", routes, dyn);
    else if (pk.has("hono") || /\bnew\s+Hono\b/.test(t)) callRoutes(f, t, "hono", receivers(t, /new\s+Hono\b/, ["app"]), mounts.get(f) ?? "", routes, dyn);
    else if (pk.has("fastify")) callRoutes(f, t, "fastify", receivers(t, /[Ff]astify\s*\(/, ["fastify", "app", "server", "instance"]), mounts.get(f) ?? "", routes, dyn);
    else if (mounts.has(f) && /\b(?:router|app)\s*\.\s*(?:get|post|put|patch|delete)\s*\(/.test(t)) callRoutes(f, t, deps.has("hono") ? "hono" : deps.has("fastify") ? "fastify" : "express", ["router", "app", "fastify"], mounts.get(f)!, routes, dyn);
    if (f.endsWith(".py")) {
      if (pk.has("flask")) python(f, t, "flask", routes, dyn);
      else if (pk.has("fastapi")) python(f, t, "fastapi", routes, dyn);
    }
    // A Worker's main file with its own fetch handler, routed by hand: one route for the whole Worker.
    if (main === f && routes.length === before && /export\s+default\s*\{[\s\S]{0,200}\bfetch\b|export\s+default\s+\{\s*async\s+fetch/.test(t)) {
      const x = /export\s+default\b/.exec(t)!;
      routes.push({ file: f, line: lineAt(t, x.index), framework: "cloudflare", kind: "function" });
    }
  }
  if (dyn.n) unsure.push({ why: "dynamic_routes", count: dyn.n });
  for (const [pkg, name] of SERVER_NAMES) if (typeof pkg === "string" && deps.has(pkg)) unsure.push({ why: "unknown_framework", name });
  for (const f of Object.keys(raw)) {
    if (/(^|\/)Gemfile$/.test(f) && /\brails\b/.test(raw[f])) unsure.push({ why: "unknown_framework", name: "rails" });
    if (/(^|\/)composer\.json$/.test(f) && /laravel\/framework/.test(raw[f])) unsure.push({ why: "unknown_framework", name: "laravel" });
    if (/(^|\/)go\.mod$/.test(f) && /(gin-gonic|labstack\/echo|gofiber|go-chi|gorilla\/mux)/.test(raw[f])) unsure.push({ why: "unknown_framework", name: "go" });
  }
  const frameworks = [...new Set(routes.map((r) => r.framework))];
  return { routes, unsure: dedupeUnsure(unsure), frameworks };
}
const dedupeUnsure = (xs: Unsure[]): Unsure[] => { const seen = new Set<string>(); return xs.filter((x) => { const k = `${x.why}|${x.name ?? ""}`; if (seen.has(k)) return false; seen.add(k); return true; }); };
