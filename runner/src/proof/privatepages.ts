// M75: "this page should need a sign in but does not". From the project's own files only (read only), the pages that look
// private: a dashboard, settings, account, admin, profile or billing page, and the plain paths the project's own middleware
// guards. They are looked at only in a project that has a sign in (browser.ts knownSignIn) or a middleware matcher of its
// own, so a site with no sign in at all is never told that its settings page "should" have one. Each is then opened once in
// the hidden browser with no sign in, only read and never pressed (browser.ts openWithoutSignIn). One that loads is a Worth
// a look finding (the review reason open_private_page), never a stop: a page can be public on purpose.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { knownSignIn } from "./browser.ts";

/** Words that name a private page, as one whole part of its path. */
const PRIVATE = new Set(["dashboard", "settings", "account", "accounts", "admin", "profile", "billing"]);
export const MAX_PRIVATE = 5;
const PAGE_FILE = /^(page|index)\.(tsx|jsx|ts|js|mdx)$/;
const SKIP = new Set(["node_modules", ".git", ".next", "dist", "build", "out", ".svelte-kit", "coverage", ".venv", "venv", ".companion"]);

const isPrivate = (route: string): boolean => route.split("/").some((p) => PRIVATE.has(p.toLowerCase().replace(/\.html$/, "")));
/** A route with no dynamic part, no group and no API: only a page that can be opened as it is. */
const plain = (parts: string[]): string | null => {
  const kept = parts.filter((p) => !/^\(.*\)$/.test(p) && !p.startsWith("@"));   // route groups (auth) and parallel slots
  if (kept.some((p) => /[[\]:*]/.test(p) || p === "api" || p.startsWith("_"))) return null;
  return "/" + kept.join("/");
};

function walk(dir: string, depth: number, out: string[][], at: string[] = [], seen = { n: 0 }): void {
  if (depth > 6) return;
  let names: import("node:fs").Dirent[];
  try { names = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of names) {
    if (++seen.n > 4000) return;
    if (e.isDirectory()) { if (!SKIP.has(e.name) && !e.name.startsWith(".")) walk(join(dir, e.name), depth + 1, out, [...at, e.name], seen); }
    else out.push([...at, e.name]);
  }
}

/** The plain paths of a middleware's matcher (Next.js: matcher: ["/dashboard/:path*", "/settings"]): their part before
 *  any pattern. A matcher that is a pattern only (a regex) names nothing. */
export function matcherPaths(text: string): string[] {
  const m = /matcher\s*:\s*(\[[\s\S]*?\]|["'`][^"'`]*["'`])/.exec(text);
  if (!m) return [];
  const out: string[] = [];
  for (const s of m[1]!.matchAll(/["'`]([^"'`]+)["'`]/g)) {
    const head = s[1]!.split(/[:(*[\\]/)[0]!.replace(/\/+$/, "");
    if (head.startsWith("/") && head.length > 1 && !/[^A-Za-z0-9/_-]/.test(head)) out.push(head);
  }
  return out;
}

function middlewareOf(project: string): string | null {
  for (const f of ["middleware.ts", "middleware.js", "src/middleware.ts", "src/middleware.js"]) {
    try { return readFileSync(join(project, f), "utf8"); } catch { /* not this one */ }
  }
  return null;
}

/** The project's private looking pages, at most MAX_PRIVATE, only when it has a sign in or a middleware matcher. */
export function privateRoutes(project: string): string[] {
  const mw = middlewareOf(project);
  const guarded = mw ? matcherPaths(mw) : [];
  if (!guarded.length && !knownSignIn(project)) return [];
  const found = new Set<string>(guarded);
  const files: string[][] = [];
  walk(project, 0, files);
  for (const parts of files) {
    const name = parts.at(-1)!;
    let route: string | null = null;
    // Next.js app router (app/ or src/app/): a folder holding page.tsx.
    const app = parts[0] === "app" ? 1 : parts[0] === "src" && parts[1] === "app" ? 2 : 0;
    if (app && /^page\.(tsx|jsx|ts|js|mdx)$/.test(name)) route = plain(parts.slice(app, -1));
    // Next.js pages router: pages/dashboard.tsx or pages/dashboard/index.tsx.
    const pages = parts[0] === "pages" ? 1 : parts[0] === "src" && parts[1] === "pages" ? 2 : 0;
    if (!route && pages && /\.(tsx|jsx|ts|js)$/.test(name)) { const base = name.replace(/\.(tsx|jsx|ts|js)$/, ""); route = plain(PAGE_FILE.test(name) ? parts.slice(pages, -1) : [...parts.slice(pages, -1), base]); }
    // SvelteKit: src/routes/dashboard/+page.svelte.
    if (!route && parts[0] === "src" && parts[1] === "routes" && /^\+page\.svelte$/.test(name)) route = plain(parts.slice(2, -1));
    // A plain site: dashboard.html, or admin/index.html (a Vite project's public/ folder is served from the top).
    if (!route && /\.html$/.test(name) && parts.length <= 3) { const at = parts[0] === "public" ? parts.slice(1) : parts; route = plain(name === "index.html" ? at.slice(0, -1) : at); }
    if (route && route !== "/" && isPrivate(route)) found.add(route);
  }
  return [...found].sort((a, b) => a.length - b.length || a.localeCompare(b)).slice(0, MAX_PRIVATE);
}
