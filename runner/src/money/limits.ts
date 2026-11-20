// M117 step 3: is there a limit on how often a route can be called. Limited when a known limiter is applied to the route
// (an Express, Hono or Fastify route: passed in its call or used in its handler; Flask or FastAPI: a decorator in its own
// stack; a file based route: called in its file or through a helper it imports, two steps), or across the project or a
// part of it (Express or Hono app.use, Fastify's
// register, Next.js middleware or proxy with a matcher written as text, SvelteKit's hooks, Nuxt's server middleware or
// nuxt-security, Flask-Limiter's default limits). Unsure when a matcher is made by code. A limit set in a host's dashboard
// cannot be seen here, so it is never assumed. Pure: no file is opened here.
import type { MoneyFramework } from "../../../protocol/index.ts";
import type { Code, Route } from "./routes.ts";
import { rootsOf } from "./routes.ts";
import { importsOf, resolveLocal } from "./text.ts";

export type Limit = "limited" | "none" | "unsure";

const LIMIT_PACKAGES: (string | RegExp)[] = ["express-rate-limit", "express-slow-down", "rate-limiter-flexible", "@upstash/ratelimit", /^@arcjet\//, "hono-rate-limiter", /^@hono-rate-limiter\//,
  "@fastify/rate-limit", "fastify-rate-limit", "@nestjs/throttler", "@vercel/firewall", "next-rate-limit", "limiter", "@unkey/ratelimit", "@convex-dev/rate-limiter", "@koa/ratelimit", "rate-limit-redis", "next-limitr", "@elysiajs/rate-limit", "sveltekit-rate-limiter"];
const PY_LIMITERS = ["slowapi", "flask_limiter", "fastapi_limiter", "django_ratelimit", "limits"];
const isLimitPkg = (n: string) => LIMIT_PACKAGES.some((w) => (typeof w === "string" ? w === n : w.test(n)));

/** The names a file gives what it imports from a limiter package, and the names it gives what they make. */
function limiterNames(file: string, code: string): Set<string> {
  const names = new Set<string>();
  for (const m of code.matchAll(/import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*(?:\*\s+as\s+(\w+)\s*)?from\s*(["'])([^"']+)\4|(?:const|let|var)\s+(?:(\w+)|\{([^}]*)\})\s*=\s*require\s*\(\s*(["'])([^"']+)\8\s*\)/g)) {
    const spec = m[5] ?? m[9];
    const name = spec.replace(/^npm:/, "").replace(/@[\d^~][^/]*$/, "");
    if (!isLimitPkg(name) && !isLimitPkg(name.split("/").slice(0, name.startsWith("@") ? 2 : 1).join("/"))) continue;
    for (const n of [m[1], m[3], m[6]]) if (n) names.add(n);
    for (const list of [m[2], m[7]]) if (list) for (const p of list.split(",")) { const k = p.trim().split(/\s+as\s+/).pop()?.trim(); if (k && /^\w+$/.test(k)) names.add(k); }
  }
  // What they make: const limiter = rateLimit({...}), const rl = new RateLimiterMemory(...).
  for (let i = 0; i < 2; i++) {
    const who = [...names].map((n) => n.replace(/\$/g, "\\$")).join("|");
    if (!who) break;
    for (const m of code.matchAll(new RegExp(String.raw`(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*(?:await\s+)?(?:new\s+)?(?:${who})\b`, "g"))) names.add(m[1]);
  }
  void file;
  return names;
}

/** Does this file hold a limiter: import a known limiter package, or a Cloudflare rate limiting binding? (Holding one limits
 *  nothing: see appliesLimiter.) */
export function holdsLimiter(file: string, code: string): boolean {
  const pk = importsOf(file, code).packages;
  if (file.endsWith(".py")) return pk.some((p) => PY_LIMITERS.includes(p.name)) || /@\w*limiter\.limit\s*\(|\bRateLimiter\s*\(\s*times\s*=/i.test(code);
  return /\benv\.\w+\.limit\s*\(\s*\{/.test(code) || pk.some((p) => isLimitPkg(p.name));
}

/** The text with its imports and the lines that make a limiter (const limiter = rateLimit({...})) taken out, so what is left
 *  of a limiter's name is where it is used. */
function usesOf(code: string, names: Set<string>): string {
  let t = code.replace(/^\s*import\s[\s\S]*?from\s*["'][^"']+["'];?|^\s*import\s*["'][^"']+["'];?/gm, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(?:const|let|var)\s+(?:\w+|\{[^}]*\})\s*=\s*require\s*\(\s*["'][^"']+["']\s*\)/g, (m) => m.replace(/[^\n]/g, " "));
  const who = [...names].map((n) => n.replace(/\$/g, "\\$")).join("|");
  if (who) t = t.replace(new RegExp(String.raw`(?:export\s+)?(?:const|let|var)\s+\w+\s*(?::[^=]+)?=\s*(?:await\s+)?(?:new\s+)?(?:${who})\b`, "g"), (m) => m.replace(/[^\n]/g, " "));
  return t;
}
const usedIn = (text: string, names: Iterable<string>): boolean => [...names].some((n) => new RegExp(String.raw`(?<![\w$.])${n.replace(/\$/g, "\\$")}(?![\w$])`).test(text));

/** Does this one file apply a limit at its own level (comments already blanked): a limiter it holds is called or used, not
 *  only imported or made. Python: a limit decorator, default limits or a FastAPI RateLimiter. */
export function appliesLimiter(file: string, code: string): boolean {
  if (file.endsWith(".py")) return holdsLimiter(file, code) && /@\w+\.(?:shared_)?limit\s*\(|\bRateLimiter\s*\(\s*times\s*=|\bdefault_limits\s*=/.test(code);
  if (/\benv\.\w+\.limit\s*\(\s*\{/.test(code)) return true;
  const pk = importsOf(file, code).packages;
  for (const p of pk) {
    if (!isLimitPkg(p.name)) continue;
    if (p.name === "@upstash/ratelimit" || p.name === "@unkey/ratelimit") { if (/\.limit\s*\(/.test(code)) return true; continue; }
    if (p.name.startsWith("@arcjet/")) { if (/\.protect\s*\(/.test(code)) return true; continue; }
    if (p.name === "@vercel/firewall") { if (/\bcheckRateLimit\s*\(/.test(code)) return true; continue; }
  }
  const names = limiterNames(file, code);
  return names.size > 0 && usedIn(usesOf(code, names), names);
}

/** What a file imports from project files, by the name it gives each: import x, { a as b }, * as ns, require. */
function bindingsOf(code: string): { name: string; spec: string }[] {
  const out: { name: string; spec: string }[] = [];
  for (const m of code.matchAll(/import\s+(?:type\s+)?(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*(?:\*\s+as\s+(\w+)\s*)?from\s*(["'])([^"']+)\4|(?:const|let|var)\s+(?:(\w+)|\{([^}]*)\})\s*=\s*require\s*\(\s*(["'])([^"']+)\8\s*\)/g)) {
    const spec = m[5] ?? m[9];
    for (const n of [m[1], m[3], m[6]]) if (n) out.push({ name: n, spec });
    for (const list of [m[2], m[7]]) if (list) for (const p of list.split(",")) { const k = p.trim().split(/\s+as\s+|\s*:\s*/).pop()?.trim(); if (k && /^\w+$/.test(k)) out.push({ name: k, spec }); }
  }
  return out;
}
/** The names a file imports from a project file that holds a limiter (helper: "holds") or applies one itself, two steps
 *  ("applies"). */
function helperNames(file: string, own: string, code: (f: string) => string | undefined, depth = 2): { holds: Set<string>; applies: Set<string> } {
  const holds = new Set<string>(), applies = new Set<string>();
  if (file.endsWith(".py") || depth <= 0) return { holds, applies };
  for (const b of bindingsOf(own)) {
    const r = resolveLocal(file, b.spec, (x) => code(x) !== undefined);
    const t = r ? code(r) : undefined;
    if (!r || t === undefined) continue;
    if (fileLimited(r, code, depth - 1)) applies.add(b.name);
    else if (holdsLimiter(r, t)) holds.add(b.name);
  }
  return { holds, applies };
}
const esc = (n: string) => n.replace(/\$/g, "\\$");
/** Does the file call a limit on a name it imports from a helper: name.limit(), name.protect(), name.consume(), name(...);
 *  or call anything on a name from a helper that limits by itself? */
function callsHelper(own: string, h: { holds: Set<string>; applies: Set<string> }): boolean {
  const body = usesOf(own, new Set());
  for (const n of h.holds) if (new RegExp(String.raw`(?<![\w$.])${esc(n)}(?:\s*\.\s*\w+)*\s*\.\s*(?:limit|protect|consume|check|removeTokens|tryRemoveTokens)\s*\(|(?<![\w$.])${esc(n)}\s*\(`).test(body)) return true;
  for (const n of h.applies) if (new RegExp(String.raw`(?<![\w$.])${esc(n)}(?:\s*\.\s*\w+)*\s*\(`).test(body)) return true;
  return false;
}

/** Does the file apply a limit itself, or through a project file it imports (two steps)? A limiter kept in a helper counts
 *  only when this file calls its limit (or protect, or consume), or calls a helper that limits by itself: an import alone,
 *  or the word limiter, limits nothing. */
export function fileLimited(file: string, code: (f: string) => string | undefined, depth = 2): boolean {
  const own = code(file);
  if (own === undefined) return false;
  if (appliesLimiter(file, own)) return true;
  return callsHelper(own, helperNames(file, own, code, depth));
}

const CALL_ROUTE = new Set<MoneyFramework>(["express", "hono", "fastify"]);
const NEXT_CALL = /^[ \t]*\w+\s*\.\s*(?:get|post|put|patch|delete|all|on|route)\s*\(\s*["'`]|^[ \t]*\w+\s*\.\s*(?:use|listen|register)\s*\(/gm;
/** The text of one Express, Hono or Fastify route: from its call to the next route, use or listen call. */
function spanOf(code: string, line: number): string {
  let i = 0;
  for (let n = 1; n < line && i >= 0; n++) i = code.indexOf("\n", i) + 1;
  if (i < 0) return "";
  NEXT_CALL.lastIndex = code.indexOf("\n", i) < 0 ? code.length : code.indexOf("\n", i);
  const next = NEXT_CALL.exec(code);
  return code.slice(i, next ? next.index : code.length);
}
/** Is a limiter applied to this one route: passed in its call, or used in its handler? */
function callRouteLimited(r: Route, code: (f: string) => string | undefined): boolean {
  const own = code(r.file);
  if (own === undefined) return false;
  const span = spanOf(own, r.line).replace(/^[^(]*\(\s*(["'`])[^"'`\n]*\1/, "");
  const h = helperNames(r.file, own, code);
  const names = new Set([...limiterNames(r.file, own), ...h.holds, ...h.applies]);
  if (usedIn(span, names)) return true;
  if (/\benv\.\w+\.limit\s*\(\s*\{/.test(span)) return true;
  // Fastify's own limit set on one route.
  return holdsLimiter(r.file, own) && /\bconfig\s*:\s*\{[^}]*\brateLimit\s*:/.test(span);
}
/** Is a Flask or FastAPI route limited by a decorator in its own decorator stack (or a RateLimiter in its route's own
 *  dependencies)? */
function pyRouteLimited(r: Route, code: (f: string) => string | undefined): boolean {
  const own = code(r.file);
  if (own === undefined) return false;
  const lines = own.split("\n");
  let a = r.line - 1, b = r.line - 1;
  while (a > 0 && /^\s*@/.test(lines[a - 1])) a--;
  while (b < lines.length - 1 && !/^\s*(?:async\s+)?def\s/.test(lines[b])) b++;
  return /@\w+\.(?:shared_)?limit\s*\(|\bRateLimiter\s*\(\s*times\s*=/.test(lines.slice(a, b + 1).join("\n"));
}

export type ProjectLimits = {
  /** Frameworks whose every route is limited by something project wide. */
  all: Set<MoneyFramework>;
  /** Limits on a part of the path, by framework. */
  prefixes: { frameworks: Set<MoneyFramework>; prefix: string }[];
  /** Next.js middleware or proxy that limits: none, every path, the paths of matchers written as text, or not known. */
  next: { kind: "none" } | { kind: "all" } | { kind: "matcher"; res: RegExp[] } | { kind: "unsure" };
};

/** Next.js matcher syntax to a test: /api/:path* is /api and everything under it. Null for one that cannot be read. */
export function matcherTest(m: string): RegExp | null {
  try {
    const s = m.replace(/\/:(\w+)\*/g, "(?:/.*)?").replace(/\/:(\w+)\+/g, "(?:/.+)").replace(/\/:(\w+)\?/g, "(?:/[^/]+)?").replace(/:(\w+)/g, "[^/]+");
    return new RegExp(`^${s}$`);
  } catch { return null; }
}
/** The matcher of a middleware file: every path when there is no config; the list when it is written as text; null when
 *  it is made by code. */
function matchersOf(code: string): string[] | "all" | null {
  const at = /\bmatcher\s*:\s*/.exec(code);
  if (!at) return /export\s+const\s+config\b/.test(code) ? null : "all";
  const rest = code.slice(at.index + at[0].length);
  const one = /^(["'`])([^"'`\n]*)\1/.exec(rest);
  if (one) return one[1] === "`" && one[2].includes("${") ? null : [one[2]];
  if (!rest.startsWith("[")) return null;
  let depth = 0, end = -1;
  for (let i = 0; i < rest.length && i < 4000; i++) { if (rest[i] === "[") depth++; else if (rest[i] === "]") { depth--; if (depth === 0) { end = i; break; } } }
  if (end < 0) return null;
  const body = rest.slice(1, end);
  const out: string[] = [];
  // Each item: a string, or an object whose source is a string.
  const items = body.split(/,(?![^{]*\})/).map((x) => x.trim()).filter(Boolean);
  for (const it of items) {
    const s = /^(["'])([^"'\n]*)\1$/.exec(it) ?? /^\{[\s\S]*?\bsource\s*:\s*(["'])([^"'\n]*)\1[\s\S]*\}$/.exec(it);
    if (!s) return null;
    out.push(s[2]);
  }
  return out;
}

const ANY = new Set<MoneyFramework>(["express", "hono", "fastify", "remix"]);
// A limit inside an if on the path (if (pathname.startsWith("/login"))) covers only some paths, which cannot be told here.
const PATH_IF = /\bif\s*\([^)]*\b(?:pathname|nextUrl|url\.path\w*|req\.url|request\.url|event\.url|routeId)\b/;
/** A file at one of the roots of a framework's apps ("" or "apps/web/"), as its path from that root; null when it is not. */
const fromRoot = (f: string, roots: readonly string[]): string | null => { for (const r of roots) if (f.startsWith(r)) return f.slice(r.length); return null; };
/** What limits whole parts of the project. code: comments blanked. raw: as read (nuxt.config, wrangler). */
export function projectLimits(code: Code): ProjectLimits {
  const all = new Set<MoneyFramework>();
  const prefixes: ProjectLimits["prefixes"] = [];
  let next: ProjectLimits["next"] = { kind: "none" };
  const get = (f: string) => code[f];
  const roots = { next: rootsOf(code, (d) => d.has("next")), kit: rootsOf(code, (d) => d.has("@sveltejs/kit")), nuxt: rootsOf(code, (d) => d.has("nuxt") || d.has("nuxt3")) };
  for (const [f, t] of Object.entries(code)) {
    // Express and Hono: app.use(limiter) or app.use("/api", limiter); Fastify: register(rateLimit). The limiter is one the
    // file imports from a limiter package, or from a project file that holds or applies one.
    const mounts = /\.\s*(?:use|register)\s*\(/.test(t);
    const h = mounts ? helperNames(f, t, get) : { holds: new Set<string>(), applies: new Set<string>() };
    const names = mounts ? new Set([...limiterNames(f, t), ...h.holds, ...h.applies]) : new Set<string>();
    if (names.size) {
      const who = [...names].map(esc).join("|");
      for (const m of t.matchAll(/\.\s*use\s*\(([^;]{0,300}?)\)\s*;?\s*$/gm)) {
        const args = m[1];
        if (!new RegExp(String.raw`(?<![\w$.])(?:${who})(?![\w$])`).test(args)) continue;
        const p = /^\s*(["'])(\/[^"'\n]*)\1\s*,/.exec(args);
        if (p && p[2] !== "*" && p[2] !== "/*" && p[2] !== "/") prefixes.push({ frameworks: ANY, prefix: p[2].replace(/\/\*$/, "") });
        else for (const fw of ANY) all.add(fw);
      }
      if (/\.register\s*\(\s*(?:\w*[rR]ate[lL]imit\w*|import\s*\(\s*["']@fastify\/rate-limit["']\s*\)|require\s*\(\s*["']@fastify\/rate-limit["']\s*\))/.test(t) && !/\bglobal\s*:\s*false\b/.test(t)) all.add("fastify");
    }
    // Next.js: middleware.ts or proxy.ts at the top of an app or in its src/.
    const nr = fromRoot(f, roots.next);
    if (nr !== null && /^(?:src\/)?(?:middleware|proxy)\.(?:[cm]?[jt]s)$/.test(nr) && fileLimited(f, get)) {
      const ms = PATH_IF.test(t) ? null : matchersOf(t);
      if (ms === "all") next = { kind: "all" };
      else if (ms === null) { if (next.kind === "none") next = { kind: "unsure" }; }
      else {
        const res = ms.map(matcherTest);
        if (res.some((r) => r === null)) { if (next.kind === "none") next = { kind: "unsure" }; }
        else if (next.kind !== "all") next = { kind: "matcher", res: [...(next.kind === "matcher" ? next.res : []), ...(res as RegExp[])] };
      }
    }
    // SvelteKit: the handle hook; Nuxt: server middleware. A limit inside an if on the path is not every path.
    const kr = fromRoot(f, roots.kit), xr = fromRoot(f, roots.nuxt);
    if (kr !== null && /^src\/hooks\.server\.(?:ts|js)$/.test(kr) && !PATH_IF.test(t) && fileLimited(f, get)) all.add("sveltekit");
    if (xr !== null && /^server\/middleware\/.+\.(?:ts|js|mjs)$/.test(xr) && !PATH_IF.test(t) && fileLimited(f, get)) all.add("nuxt");
    if (xr !== null && /^nuxt\.config\.(?:ts|js|mjs)$/.test(xr) && /["']nuxt-security["']/.test(t) && !/\brateLimiter\s*:\s*false\b/.test(t)) all.add("nuxt");
    // Flask-Limiter or slowapi with default limits for every route.
    if (f.endsWith(".py") && /\b(?:Limiter)\s*\([^)]*\bdefault_limits\s*=/.test(t.replace(/\n/g, " "))) { all.add("flask"); if (/SlowAPIMiddleware/.test(t)) all.add("fastapi"); }
  }
  return { all, prefixes, next };
}

/** A route path made plain for matching: [id], [...slug], :id and * become one plain segment. */
const plainPath = (p: string) => p.replace(/\[\[?\.{0,3}[^\]]*\]\]?/g, "x").replace(/:\w+\??/g, "x").replace(/\*/g, "x");

/** A route's limit. code: comments blanked, by file. */
export function limitOf(r: Route, code: (f: string) => string | undefined, pl: ProjectLimits): Limit {
  const own = CALL_ROUTE.has(r.framework) ? callRouteLimited(r, code) : r.framework === "flask" || r.framework === "fastapi" ? pyRouteLimited(r, code) : fileLimited(r.file, code);
  if (own) return "limited";
  if (pl.all.has(r.framework)) return "limited";
  if (r.path && pl.prefixes.some((p) => p.frameworks.has(r.framework) && (r.path === p.prefix || r.path!.startsWith(p.prefix.replace(/\/$/, "") + "/")))) return "limited";
  if (r.framework === "next_app" || r.framework === "next_pages") {
    if (pl.next.kind === "all") return "limited";
    if (pl.next.kind === "unsure") return "unsure";
    if (pl.next.kind === "matcher") {
      if (!r.path) return "unsure";      // a Server Action is posted to its page's path, which is not known here
      const p = plainPath(r.path);
      return pl.next.res.some((re) => re.test(p)) ? "limited" : "none";
    }
  }
  return "none";
}
