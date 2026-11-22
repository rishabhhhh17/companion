// M117: the small text helpers the money rules share. Pure: they read text already in memory and never open a file.
// Comments are blanked (line numbers kept), so code that is only in a comment never counts as a route, a call or a limit.

/** A code file the money rules read. */
export const CODE = /\.(?:[cm]?[jt]sx?|vue|svelte|astro|py)$/i;
export const PAGE = /\.(?:[jt]sx|vue|svelte|astro|html?)$/i;
export const PY = /\.py$/i;
const MARKUP = /\.(?:html?|vue|svelte|astro|mdx?)$/i;

/** Files the money rules never count: tests, stories, examples, scripts, docs and built or installed folders. */
export const LEFT_OUT = /^(?:test|spec)\/|(^|\/)(?:node_modules|\.git|dist|build|out|\.next|\.output|\.nuxt|\.svelte-kit|\.vercel|\.netlify|\.wrangler|coverage|__tests__|__mocks__|tests|e2e|cypress|playwright|stories|\.storybook|examples?|scripts|fixtures|docs|vendor|venv|\.venv|site-packages|__pycache__)(?:\/|$)|\.(?:test|spec|stories|story)\.[cm]?[jt]sx?$|(^|\/)test_[^/]*\.py$|_test\.py$|\.d\.ts$/i;

/** The text with every comment turned into spaces, so lines keep their numbers. Strings stay (paths and imports are in
 *  strings); a quote never runs past the end of its line, so an apostrophe in page text cannot hide the rest of a file. */
export function stripComments(file: string, text: string): string {
  if (PY.test(file)) return text.split("\n").map(pyLine).join("\n");
  if (MARKUP.test(file)) {
    const noHtml = text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
    // Inside a page's script part, the usual code comments.
    return noHtml.split("\n").map((l) => (/^\s*\/\//.test(l) ? l.replace(/[^\n]/g, " ") : l)).join("\n").replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  }
  if (!CODE.test(file)) return text;
  let out = "";
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i], d = text[i + 1];
    if (c === "/" && d === "/") { while (i < n && text[i] !== "\n") { out += " "; i++; } continue; }
    if (c === "/" && d === "*") { out += "  "; i += 2; while (i < n && !(text[i] === "*" && text[i + 1] === "/")) { out += text[i] === "\n" ? "\n" : " "; i++; } if (i < n) { out += "  "; i += 2; } continue; }
    if (c === '"' || c === "'") {
      out += c; i++;
      while (i < n && text[i] !== c && text[i] !== "\n") { if (text[i] === "\\" && i + 1 < n && text[i + 1] !== "\n") { out += text[i] + text[i + 1]; i += 2; continue; } out += text[i]; i++; }
      if (i < n && text[i] === c) { out += c; i++; }
      continue;
    }
    if (c === "`") {
      out += c; i++;
      while (i < n && text[i] !== "`") { if (text[i] === "\\" && i + 1 < n) { out += text[i] + text[i + 1]; i += 2; continue; } out += text[i]; i++; }
      if (i < n) { out += "`"; i++; }
      continue;
    }
    out += c; i++;
  }
  return out;
}
function pyLine(l: string): string {
  let q: string | null = null;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (q) { if (c === "\\") { i++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === "#") return l.slice(0, i) + " ".repeat(l.length - i);
  }
  return l;
}

/** The line number (from 1) of a place in a text. */
export function lineAt(text: string, index: number): number {
  let n = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}
/** The first line (from 1) a pattern matches, or undefined. */
export function firstLine(text: string, re: RegExp): number | undefined {
  const r = new RegExp(re.source, re.flags.replace("g", ""));
  const m = r.exec(text);
  return m ? lineAt(text, m.index) : undefined;
}

// ---------- imports ----------

const JS_SPEC = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)(["'`])([^"'`\n]+)\1/gm;
// The names after import: on one line, or in brackets over several (never running on into the next line's import).
const PY_FROM = /^[ \t]*from[ \t]+(\.*[A-Za-z_][\w.]*|\.+)[ \t]+import[ \t]+(\([^)]*\)|[\w \t,*.]+)/gm;
const PY_IMPORT = /^[ \t]*import[ \t]+([A-Za-z_][\w.]*(?:[ \t]*,[ \t]*[A-Za-z_][\w.]*)*)/gm;

/** A package specifier as its package name and the rest: "npm:@upstash/ratelimit@1.0.0" is "@upstash/ratelimit". A local
 *  path is null. Deno's web addresses (esm.sh, skypack, deno.land/x) count as the package they name. */
export function packageOf(spec: string): { name: string; sub: string } | null {
  let s = spec.trim().split("?")[0].split("#")[0];
  const web = /^https?:\/\/(?:esm\.sh|cdn\.skypack\.dev|cdn\.jsdelivr\.net\/npm|unpkg\.com|deno\.land\/x)\/(.+)$/.exec(s);
  if (web) s = web[1];
  else if (/^https?:/.test(s)) return null;
  s = s.replace(/^(?:npm|jsr|node):/, "");
  if (!s || s.startsWith(".") || s.startsWith("/") || s.startsWith("@/") || s.startsWith("~/") || s.startsWith("#") || s.startsWith("$lib")) return null;
  const parts = s.split("/");
  const strip = (p: string) => p.replace(/@[^@/]*$/, "") || p;
  if (s.startsWith("@")) { if (parts.length < 2) return null; return { name: `${parts[0]}/${strip(parts[1])}`, sub: parts.slice(2).join("/") }; }
  return { name: strip(parts[0]), sub: parts.slice(1).join("/") };
}

export type Imports = { packages: { name: string; sub: string; line: number }[]; local: { spec: string; line: number }[] };
/** What a file imports: packages by name (with the line), and local files by their specifier. Comments already blanked. */
export function importsOf(file: string, code: string): Imports {
  const out: Imports = { packages: [], local: [] };
  if (PY.test(file)) {
    const add = (mod: string, idx: number) => {
      const line = lineAt(code, idx);
      if (mod.startsWith(".")) { out.local.push({ spec: mod, line }); return; }
      out.packages.push({ name: mod.split(".")[0].toLowerCase(), sub: mod.split(".").slice(1).join("."), line });
      out.local.push({ spec: mod, line });
    };
    for (const m of code.matchAll(PY_FROM)) {
      add(m[1], m.index!);
      // "from google import genai" is the module google.genai.
      if (!m[1].startsWith(".")) for (const n of m[2].replace(/[()]/g, "").split(",").map((x) => x.trim().split(/\s+/)[0]).filter(Boolean)) if (/^\w+$/.test(n)) out.packages.push({ name: m[1].split(".")[0].toLowerCase(), sub: [...m[1].split(".").slice(1), n].join("."), line: lineAt(code, m.index!) });
    }
    for (const m of code.matchAll(PY_IMPORT)) for (const mod of m[1].split(",").map((x) => x.trim())) add(mod, m.index!);
    return out;
  }
  for (const m of code.matchAll(JS_SPEC)) {
    const spec = m[2], line = lineAt(code, m.index!);
    const p = packageOf(spec);
    if (p) out.packages.push({ ...p, line });
    else out.local.push({ spec, line });
  }
  return out;
}

const ENDINGS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".vue", ".svelte"];
const dirOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
function joinPath(dir: string, rel: string): string | null {
  const parts = dir ? dir.split("/") : [];
  for (const seg of rel.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") { if (!parts.length) return null; parts.pop(); continue; }
    parts.push(seg);
  }
  return parts.join("/");
}
const candidates = (p: string): string[] => [...ENDINGS.map((e) => p + e), ...ENDINGS.slice(1).map((e) => `${p}/index${e}`)];
/** The project file a local import means, when it is among the files read. Workspace packages are not followed. */
export function resolveLocal(importer: string, spec: string, has: (f: string) => boolean): string | null {
  let c: string[] = [];
  if (PY.test(importer)) {
    const dots = /^\.*/.exec(spec)![0].length;
    const rest = spec.slice(dots).split(".").filter(Boolean).join("/");
    let base: string | null = "";
    if (dots > 0) { base = dirOf(importer); for (let i = 1; i < dots && base !== null; i++) base = base ? dirOf(base) : null; if (base === null) return null; }
    const p = [base, rest].filter(Boolean).join("/");
    if (!p) return null;
    c = [`${p}.py`, `${p}/__init__.py`];
    // A module named from the project's top may also be under a src folder.
    if (!dots) c.push(`src/${p}.py`, `src/${p}/__init__.py`);
  } else {
    const s = spec.split("?")[0].split("#")[0].replace(/\.js$/, "");
    if (s.startsWith("./") || s.startsWith("../")) { const p = joinPath(dirOf(importer), s); if (p) c = candidates(p); }
    else if (s.startsWith("@/") || s.startsWith("~/") || s.startsWith("#/")) c = [...candidates(`src/${s.slice(2)}`), ...candidates(s.slice(2)), ...candidates(`app/${s.slice(2)}`)];
    else if (s.startsWith("$lib/")) c = candidates(`src/lib/${s.slice(5)}`);
    else if (s.startsWith("/")) c = candidates(s.slice(1));
    // A .js written for a .ts file (ESM style).
    if (spec.endsWith(".js")) { const p = spec.startsWith(".") ? joinPath(dirOf(importer), spec) : null; if (p) c.unshift(p, p.replace(/\.js$/, ".ts"), p.replace(/\.js$/, ".tsx")); }
  }
  return c.find(has) ?? null;
}

/** How many files deep a call is followed from a route: the route's own file, and two steps of its imports. */
export const FOLLOW_DEPTH = 2;
/** The file and the project files it imports, up to FOLLOW_DEPTH steps, the file itself first. */
export function reachable(file: string, code: (f: string) => string | undefined, depth = FOLLOW_DEPTH): string[] {
  const seen = new Set<string>([file]);
  let front = [file];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const f of front) {
      const t = code(f);
      if (t === undefined) continue;
      for (const l of importsOf(f, t).local) {
        const r = resolveLocal(f, l.spec, (x) => code(x) !== undefined);
        if (r && !seen.has(r)) { seen.add(r); next.push(r); }
      }
    }
    front = next;
  }
  return [...seen];
}

// ---------- package lists ----------

/** Every package name in the project's package lists (package.json, requirements files, pyproject.toml), names only. */
export function depsOf(files: Readonly<Record<string, string>>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [f, text] of Object.entries(files)) {
    if (/(^|\/)package\.json$/.test(f)) {
      try {
        const j = JSON.parse(text) as Record<string, unknown>;
        for (const k of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
          const d = j[k];
          if (d && typeof d === "object" && !Array.isArray(d)) for (const n of Object.keys(d)) if (!out.has(n)) out.set(n, f);
        }
      } catch { /* a broken list names nothing */ }
    } else if (/(^|\/)requirements[^/]*\.txt$/.test(f)) {
      for (const l of text.split("\n")) { const m = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(l); if (m && !l.trim().startsWith("-")) { const n = m[1].toLowerCase().replace(/_/g, "-"); if (!out.has(n)) out.set(n, f); } }
    } else if (/(^|\/)pyproject\.toml$/.test(f)) {
      for (const m of text.matchAll(/["']([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[[^\]]*\])?\s*(?:[<>=!~;][^"']*)?["']/g)) { const n = m[1].toLowerCase().replace(/_/g, "-"); if (!out.has(n)) out.set(n, f); }
      for (const m of text.matchAll(/^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*=\s*(?:["'{^~]|\d)/gm)) { const n = m[1].toLowerCase().replace(/_/g, "-"); if (!["python", "name", "version", "description", "readme", "requires-python", "license"].includes(n) && !out.has(n)) out.set(n, f); }
    }
  }
  return out;
}
