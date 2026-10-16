// "It works on my Mac but the deploy failed": read a failed Vercel build log (as the person's own Vercel tool prints it)
// and find what to point at. A file and line, only when that line is really in this folder (and reads the same as in the
// log, when the log shows it); else the name of the missing setting; else the sentence that says why. The first failure
// the build printed wins: the last line ("Command ... exited with 1") only ever says that the build stopped.
// Names of settings only, never their values. Everything shown is cleaned of secrets first.
import { lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { label } from "../redact.ts";
import { envNames, namesInCode } from "../proof/intake.ts";
import { projectLine, projectRows, type Problem } from "../proof/locate.ts";
import type { DeployLogReader } from "./deploy.ts";

export type BuildFailure = { problem: Problem; setting?: string };

const ANSI = /\u001b\[[0-9;?]*[ -\/]*[@-~]|\u001b\][^\u0007]*\u0007/g;
// "2026-10-15T14:02:00.000Z  text": the time the Vercel tool puts before each line of the build.
const STAMP = /^\[?\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\]?(?: {1,2}|\t|$)/;
const CLI_LINE = /^(?:Vercel CLI \d|status\s|Fetching deployment|> Fetched deployment)/;
const MESSAGE_MAX = 200;
const tidy = (s: string) => label(s, MESSAGE_MAX);

/** The build's own lines: the Vercel tool's times and colours taken off. */
export function buildLogLines(log: string): string[] {
  const raw = log.replace(ANSI, "").replace(/\r/g, "").split("\n");
  const stamped = raw.filter((l) => STAMP.test(l));
  return stamped.length ? stamped.map((l) => l.replace(STAMP, "")) : raw.filter((l) => l.trim() && !CLI_LINE.test(l.trim()));
}

// ---------- paths: Vercel builds in /vercel/path0, perhaps from a Root Directory ----------

function rootDirectory(project: string): string | null {
  try { const j = JSON.parse(readFileSync(join(project, ".vercel", "project.json"), "utf8")); const r = j?.settings?.rootDirectory; return typeof r === "string" && r && !r.includes("..") ? r.replace(/^\.?\/+|\/+$/g, "") : null; } catch { return null; }
}
function candidates(path: string, rootDir: string | null): string[] {
  let p = path.replace(/^file:\/\//, "");
  const onVercel = /^\/vercel\/path\d+\//.test(p);
  p = p.replace(/^\/vercel\/path\d+\//, "").replace(/^\.\//, "");
  if (!onVercel && p.startsWith("/")) return [p];
  const out = [p];
  if (rootDir) out.push(p.startsWith(`${rootDir}/`) ? p.slice(rootDir.length + 1) : `${rootDir}/${p}`);
  return out;
}
const lineAt = (project: string, rootDir: string | null, path: string, line: number) => { for (const c of candidates(path, rootDir)) { const hit = projectLine(project, c, line); if (hit) return hit; } return null; };
const rowsOf = (project: string, rootDir: string | null, path: string) => { for (const c of candidates(path, rootDir)) { const hit = projectRows(project, c); if (hit) return hit; } return null; };
const same = (a: string, b: string) => a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();

// ---------- what a failure line can look like ----------

const PATH_PLACE = /^(?:\.\/)?([^\s:()"'<>]+\.[A-Za-z0-9]{1,6}):(\d+)(?::(\d+))?$/;    // Next.js: "./app/page.tsx:6:9" alone on its line
const PATH_ONLY = /^(?:\.\/)?([^\s:()"'<>]+\.[A-Za-z0-9]{1,6})$/;                       // Next.js: "./app/page.tsx" alone
const FRAME = /^\s*>\s*(\d+)\s*\|\s?(.*)$/;                                               // "> 6 |   const total: number = ..."
const STARTS_ERROR = /^(?:Type error|Error|SyntaxError|ReferenceError|TypeError|Syntax error|Parsing error|Unexpected|Expected|x |×|Module parse failed|Unterminated)\b/;
const COMPILE_FAILED = /^(?:Failed to compile|Error: Turbopack build failed|> Build error occurred|Build error occurred)/;
const TSC = [/^(\S+?\.[cm]?[jt]sx?)\((\d+),(\d+)\):\s*error\s+TS\d+:\s*(.+)$/, /^(\S+?\.[cm]?[jt]sx?):(\d+):(\d+)\s+-\s+error\s+TS\d+:\s*(.+)$/];
const ESBUILD = /^(\S+?):(\d+):(\d+):\s+ERROR:\s+(.+)$/;
const ROLLUP_PLACE = /^(\S+?\.[A-Za-z0-9]{1,6})\s+\((\d+):(\d+)\):\s+(.+)$/;
const ESLINT_ROW = /^(\d+):(\d+)\s+(Error|Warning):\s+(.+?)(?:\s{2,}\S+)?\s*$/;
const MODULE_NEXT = /Module not found: (?:Error: )?Can't resolve '([^']+)'(?: in '([^']+)')?/;
const MODULE_ROLLUP = /Rollup failed to resolve import "([^"]+)" from "([^"]+)"/;
const MODULE_ROLLDOWN = /Could not resolve ["']([^"']+)["'](?: (?:in|from) ["']?([^\s"']+?)["']?)?\.?\s*$/;
const MODULE_LOAD = /Could not load (\S+) \(imported by (\S+?)\)/;
// The lines that only say the build stopped: never the cause.
const GENERIC = /^(?:Error: )?Command ".*" exited with \d+|^>?\s*Build failed because of webpack errors|Next\.js build worker exited|Export encountered errors|^Error occurred prerendering page|^error during build:?$|^Exiting build container|^Build failed with \d+ errors?:?$|^Failed to compile\.?$|^[x✗×]\s+Build failed|^Error: Turbopack build failed|^\s*at\s|^Learn More:/;
const ERRORISH = /^(?:\[?[A-Za-z_]*Error\]?:|Error\b|error\b|ERROR\b|npm ERR!|npm error|\[vite\]|✘|\[ERROR\])/;

// Settings, by the words tools use when one is missing. Names only.
const SETTING_NAME = /^[A-Z][A-Z0-9_]{2,}$/;
const NOT_SETTINGS = new Set(["NODE_ENV", "CI", "VERCEL", "VERCEL_ENV", "VERCEL_URL", "PATH", "HOME", "PORT", "HOST", "TZ", "LANG"]);
const ENV_RULES: RegExp[] = [
  /Environment Variable "([A-Za-z_][A-Za-z0-9_]*)" references Secret/,
  /[Ee]nvironment variable not found:\s*([A-Za-z_][A-Za-z0-9_]*)/,
  /[Mm]issing (?:required )?(?:[Ee]nvironment|[Ee]nv) [Vv]ariables?:?\s*["'`]?([A-Z][A-Z0-9_]{2,})/,
  /\b([A-Z][A-Z0-9_]{2,})["'`]?\s+(?:[Ee]nvironment [Vv]ariable|env var(?:iable)?)\s+is\s+(?:missing|not set|not defined|required|undefined|empty)/,
  /(?:[Ee]nvironment [Vv]ariable|env var(?:iable)?)\s+["'`]?([A-Z][A-Z0-9_]{2,})["'`]?\s+(?:is\s+)?(?:missing|not set|not defined|required|undefined)/,
  /Invalid environment variables:?\s*\{?\s*["']?([A-Z][A-Z0-9_]{2,})["']?\s*:/,
];
const SUPABASE = /\bsupabase(Url|Key) is required\b/;
// @supabase/ssr's clients: either setting may be the one missing.
const SUPABASE_SSR = /Your project's URL and Key are required to create a Supabase client/;

// ---------- the missing file behind an import ----------

const EXTS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte", ".astro", ".css", ".scss", ".json"];
function listDir(d: string): string[] { try { return readdirSync(d); } catch { return []; } }
const isDir = (p: string) => { try { return statSync(p).isDirectory(); } catch { return false; } };

// The file system of a Mac ignores capital letters; Vercel's does not. So compare the names exactly, one folder at a time.
function caseCheck(base: string, rel: string): { status: "case"; actual: string } | { status: "missing" } | { status: "exists" } {
  const parts = rel.split("/").filter((s) => s && s !== ".");
  let cur = base;
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    if (seg === "..") { cur = dirname(cur); continue; }
    const names = listDir(cur);
    const last = i === parts.length - 1;
    const wanted = last ? EXTS.map((e) => seg + e) : [seg];
    const exact = wanted.find((w) => names.includes(w));
    if (exact) { cur = join(cur, exact); continue; }
    const near = names.find((n) => wanted.some((w) => w.toLowerCase() === n.toLowerCase()));
    return near ? { status: "case", actual: near } : { status: "missing" };
  }
  return { status: "exists" };
}

function aliasBase(project: string, spec: string): { base: string; rest: string } | null {
  const m = /^([@~])\/(.*)$/.exec(spec);
  if (!m) return null;
  for (const f of ["tsconfig.json", "jsconfig.json"]) {
    try {
      const text = readFileSync(join(project, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"])\/\/.*$/gm, "$1");
      const target = JSON.parse(text)?.compilerOptions?.paths?.[`${m[1]}/*`]?.[0];
      if (typeof target === "string") return { base: resolve(project, target.replace(/\*$/, "").replace(/\/$/, "") || "."), rest: m[2] };
    } catch { /* not readable */ }
  }
  return { base: isDir(join(project, "src")) ? join(project, "src") : project, rest: m[2] };
}

// case: the file is there with other capital letters. exists: it is there exactly. missing: no such file. package: not a file.
type Why = { status: "case" | "exists" | "missing" | "package"; message: string };
function whyMissing(project: string, spec: string, fromDir: string | null): Why {
  const alias = aliasBase(project, spec);
  const relativeSpec = spec.startsWith("./") || spec.startsWith("../");
  if (relativeSpec || alias) {
    const base = alias ? alias.base : fromDir;
    if (base) {
      const c = caseCheck(base, alias ? alias.rest : spec);
      if (c.status === "case") return { status: "case", message: `The code asks for "${spec}", but the file is named ${c.actual}. Your Mac does not mind capital letters in file names; Vercel does.` };
      if (c.status === "exists") return { status: "exists", message: `Vercel could not find "${spec}", but it is in this folder. It may not be in what Vercel built: if Vercel builds from GitHub, check that this file was pushed.` };
    }
    return { status: "missing", message: `Vercel could not find "${spec}". There is no file by that name in this project.` };
  }
  const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
  let deps: Record<string, unknown> = {};
  try { const j = JSON.parse(readFileSync(join(project, "package.json"), "utf8")); deps = { ...(j.dependencies ?? {}), ...(j.devDependencies ?? {}) }; } catch { /* none */ }
  return { status: "package", message: pkg in deps ? `Vercel could not find the package "${pkg}", though package.json lists it.` : `Vercel could not find the package "${pkg}". It is not in package.json, so Vercel did not install it. Add it to package.json.` };
}

// TypeScript's "Cannot find module" (TS2307), from tsc or Next.js's type check. Only a file that is named with other
// capital letters, or not there at all, is explained in Vercel's terms; a file that is there (a stylesheet with no type
// declarations, say) or a package (its types may be what is missing) keeps TypeScript's own words.
const TS_NO_MODULE = /Cannot find module '([^']+)'/;
function typescriptMissing(project: string, message: string, file: string): string | null {
  const spec = TS_NO_MODULE.exec(message)?.[1];
  if (!spec || !(spec.startsWith("./") || spec.startsWith("../") || /^[@~]\//.test(spec))) return null;
  const w = whyMissing(project, spec, dirname(join(project, file)));
  return w.status === "case" || w.status === "missing" ? w.message : null;
}

function moduleFailure(project: string, rootDir: string | null, spec: string, importer: string | null, importerLine?: number): BuildFailure {
  const f = importer ? rowsOf(project, rootDir, importer) : null;
  const quoted = (r: string) => r.includes(`"${spec}"`) || r.includes(`'${spec}'`) || r.includes(`\`${spec}\``);
  let n = importerLine && f && f.rows[importerLine - 1] !== undefined && quoted(f.rows[importerLine - 1]) ? importerLine : 0;
  if (!n && f) n = f.rows.findIndex(quoted) + 1;
  const message = tidy(whyMissing(project, spec, f ? dirname(join(project, f.file)) : null).message);
  if (f && n > 0) return { problem: { kind: "line", file: f.file, line: n, lineText: label(f.rows[n - 1], 200), message, from: "deploy" } };
  return { problem: { kind: "message", message, from: "deploy" } };
}

// ---------- a setting the build needed ----------

const CODE_FILE = /\.(?:m?[jt]sx?|cjs|vue|svelte|astro|py|prisma)$/;
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", ".vercel", ".companion", ".venv", "venv", "__pycache__"]);
function settingLine(project: string, name: string): { file: string; line: number; lineText: string } | null {
  const reads = new RegExp(`process\\.env\\.${name}\\b|process\\.env\\[["']${name}["']\\]|import\\.meta\\.env\\.${name}\\b|os\\.(?:environ\\.get|getenv)\\(\\s*["']${name}["']|os\\.environ\\[["']${name}["']\\]|\\benv\\(\\s*["']${name}["']\\s*\\)`);
  let files = 0;
  const walk = (d: string, depth: number): { file: string; line: number; lineText: string } | null => {
    if (depth > 6 || files > 1500) return null;
    for (const n of listDir(d).sort()) {
      if (SKIP_DIRS.has(n) || n.startsWith(".")) continue;
      const p = join(d, n);
      let st; try { st = lstatSync(p); } catch { continue; }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) { const hit = walk(p, depth + 1); if (hit) return hit; continue; }
      if (!CODE_FILE.test(n) || st.size > 300_000) continue;
      files++;
      let rows: string[]; try { rows = readFileSync(p, "utf8").split("\n"); } catch { continue; }
      const i = rows.findIndex((r) => reads.test(r));
      if (i >= 0) { const rel = relative(project, p).split(sep).join("/"); const hit = projectLine(project, rel, i + 1); if (hit) return { file: hit.file, line: i + 1, lineText: hit.lineText }; }
    }
    return null;
  };
  return walk(project, 0);
}

const LOCAL_ENV = [".env", ".env.local", ".env.production", ".env.production.local", ".env.development", ".env.development.local"];
// One name, or a few when the build cannot tell which one is missing ("A or B is not set"). The line ringed is the one
// that reads the first name. Names only: a local .env file is read for its names, never its values.
function settingFailure(project: string, names: string[]): BuildFailure {
  const name = names[0], one = names.length === 1;
  const which = one ? name : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
  let local = "";
  for (const f of LOCAL_ENV) {
    let here: string[] = [];
    try { const there = envNames(readFileSync(join(project, f), "utf8")); here = names.filter((n) => there.includes(n)); } catch { continue; }
    if (here.length) { local = ` Your Mac has ${here.length === names.length ? (one ? "it" : "them") : here.join(" and ")} in ${f}, which Vercel never sees.`; break; }
  }
  // Names are short and never secret, so this sentence may run longer than a log line.
  const message = label(`${which} is not set on Vercel.${local} Add ${one ? "it" : "them"} in your Vercel project under Settings, Environment Variables.`, 300);
  const at = settingLine(project, name);
  return at ? { problem: { kind: "line", file: at.file, line: at.line, lineText: at.lineText, message, from: "deploy" }, setting: name } : { problem: { kind: "message", message, from: "deploy" }, setting: name };
}

// The setting names the project's code reads that match: the browser's own (NEXT_PUBLIC_, VITE_, PUBLIC_) first, and
// the ones matching `last` (a server only key) after the rest.
const PUBLIC = /^(NEXT_PUBLIC_|VITE_|PUBLIC_|EXPO_PUBLIC_)/;
function namesLike(project: string, want: RegExp, last?: RegExp): string[] {
  const rank = (n: string) => (PUBLIC.test(n) ? 0 : 1) + (last?.test(n) ? 2 : 0);
  return [...namesInCode(project)].filter((n) => want.test(n)).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}
const SUPABASE_URL_NAME = /SUPABASE_URL$/;
const SUPABASE_KEY_NAME = /SUPABASE_(?:ANON_|PUBLISHABLE_|SERVICE_ROLE_|SECRET_)?KEY$/;
const SUPABASE_SERVER_KEY = /SERVICE_ROLE|SECRET/;

const projectSetting = (setting: string, message: string): BuildFailure => ({ problem: { kind: "message", message: tidy(message), from: "deploy" }, setting });

// ---------- reading it ----------

/** What to point at in a failed Vercel build log: a confirmed line, a setting's name, or the sentence that says why. */
export function readBuildLog(log: string, project: string): BuildFailure | null {
  const lines = buildLogLines(log);
  const rootDir = rootDirectory(project);
  const next = (i: number) => { for (let j = i + 1; j < lines.length; j++) if (lines[j].trim()) return j; return -1; };
  const prev = (i: number) => { for (let j = i - 1; j >= 0; j--) if (lines[j].trim()) return j; return -1; };
  const atPlace = (path: string, line: number, column: number | undefined, message: string, frameFrom?: number): BuildFailure => {
    const hit = lineAt(project, rootDir, path, line);
    if (!hit) return { problem: { kind: "message", message: tidy(message), from: "deploy" } };
    // When the log shows the line, it must read the same here, or this folder is not what Vercel built.
    if (frameFrom !== undefined) {
      for (let j = frameFrom; j < Math.min(lines.length, frameFrom + 16); j++) {
        const f = FRAME.exec(lines[j]);
        if (f && Number(f[1]) === line && !same(f[2], hit.text)) {
          return { problem: { kind: "message", message: tidy(`Vercel's build failed at ${hit.file}, line ${line}, but that line is different in this folder, so this may not be the version that was deployed.`), from: "deploy" } };
        }
      }
    }
    const said = typescriptMissing(project, message, hit.file) ?? message;
    return { problem: { kind: "line", file: hit.file, line, ...(column ? { column } : {}), lineText: hit.lineText, message: tidy(said), from: "deploy" } };
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i], l = raw.trim();
    if (!l) continue;
    let m: RegExpExecArray | null;
    // An import that cannot be found (often a file named with a capital letter on a Mac).
    if ((m = MODULE_NEXT.exec(l))) {
      const p = prev(i), place = p >= 0 ? PATH_PLACE.exec(lines[p].trim()) ?? PATH_ONLY.exec(lines[p].trim()) : null;
      if (place) return moduleFailure(project, rootDir, m[1], place[1], place[2] ? Number(place[2]) : undefined);
      return moduleFailure(project, rootDir, m[1], null);
    }
    if ((m = MODULE_ROLLUP.exec(l))) return moduleFailure(project, rootDir, m[1], m[2]);
    if ((m = MODULE_LOAD.exec(l))) {
      const resolvedPath = m[1], importer = m[2];
      const f = rowsOf(project, rootDir, importer);
      const base = resolvedPath.split("/").pop() ?? "";
      const spec = f?.rows.map((r) => /["'`](\.{1,2}\/[^"'`]+)["'`]/.exec(r)?.[1]).find((s) => !!s && s.split("/").pop() === base);
      return moduleFailure(project, rootDir, spec ?? resolvedPath, importer);
    }
    if ((m = MODULE_ROLLDOWN.exec(l))) {
      let importer: string | null = m[2] ?? null;
      if (!importer) { const n = next(i), loc = n >= 0 ? /^\s*(\S+?\.[A-Za-z0-9]{1,6}):(\d+):(\d+):?$/.exec(lines[n].trim()) : null; importer = loc?.[1] ?? null; }
      return moduleFailure(project, rootDir, m[1], importer);
    }
    // A place alone on its line, then what went wrong (Next.js, Turbopack).
    if ((m = PATH_PLACE.exec(l))) {
      const n = next(i);
      const said = n >= 0 ? lines[n].trim() : "";
      if (said && !MODULE_NEXT.test(said)) {
        const p1 = prev(i), p2 = p1 >= 0 ? prev(p1) : -1;
        const afterFailure = [p1, p2].some((j) => j >= 0 && COMPILE_FAILED.test(lines[j].trim()));
        if ((STARTS_ERROR.test(said) || afterFailure) && !FRAME.test(said)) return atPlace(m[1], Number(m[2]), m[3] ? Number(m[3]) : undefined, said, n + 1);
      }
    }
    // A file alone on its line, then ESLint's rows under it (Next.js lint): the first error, never a warning.
    if ((m = PATH_ONLY.exec(l))) {
      for (let j = i + 1; j < lines.length && lines[j].trim(); j++) {
        const r = ESLINT_ROW.exec(lines[j].trim());
        if (!r) break;
        if (r[3] === "Error") return atPlace(m[1], Number(r[1]), Number(r[2]), r[4]);
      }
    }
    for (const re of TSC) if ((m = re.exec(l))) return atPlace(m[1], Number(m[2]), Number(m[3]), m[4]);
    if ((m = ESBUILD.exec(l))) return atPlace(m[1], Number(m[2]), Number(m[3]), m[4]);
    if ((m = ROLLUP_PLACE.exec(l))) return atPlace(m[1], Number(m[2]), Number(m[3]), m[4]);
    // A setting the build needed.
    for (const re of ENV_RULES) {
      const e = re.exec(l);
      if (e && SETTING_NAME.test(e[1]) && !NOT_SETTINGS.has(e[1])) return settingFailure(project, [e[1]]);
    }
    // Supabase names no setting: the names the code reads stand in. When the code reads more than one that fits (the
    // public key and the service role key, say), the build cannot tell which is missing, so each is named.
    if ((m = SUPABASE.exec(l))) {
      const names = m[1] === "Url" ? namesLike(project, SUPABASE_URL_NAME) : namesLike(project, SUPABASE_KEY_NAME, SUPABASE_SERVER_KEY);
      if (names.length) return settingFailure(project, names.slice(0, 3));
      return { problem: { kind: "message", message: tidy(`Supabase's ${m[1] === "Url" ? "address" : "key"} is not set on Vercel, so the build stopped.`), from: "deploy" } };
    }
    if (SUPABASE_SSR.test(l)) {
      const url = namesLike(project, SUPABASE_URL_NAME)[0], key = namesLike(project, SUPABASE_KEY_NAME, SUPABASE_SERVER_KEY)[0];
      const names = [url, key].filter((n): n is string => !!n);
      if (names.length) return settingFailure(project, names);
      return { problem: { kind: "message", message: tidy("Supabase's address or key is not set on Vercel, so the build stopped."), from: "deploy" } };
    }
    // A setting of the Vercel project itself.
    if ((m = /No Output Directory named ["']?([^"'\s]+?)["']? found after the Build completed/.exec(l))) return projectSetting("Output Directory", `Vercel looked for the built site in a folder named ${m[1]} and found nothing. Check Output Directory in your Vercel project's settings, or the folder your build writes to.`);
    if (/No Next\.js version detected/.test(l)) return projectSetting("Root Directory", "Vercel did not find Next.js in the folder it built. Check Root Directory in your Vercel project's settings.");
    if (/Node\.js Version "[^"]*" is (?:discontinued|deprecated|invalid)|Found invalid Node\.js Version/.test(l)) return projectSetting("Node.js Version", "Vercel cannot use the Node.js version this project asks for. Check Node.js Version in your Vercel project's settings, and \"engines\" in package.json.");
    // The project's own build steps.
    if ((m = /(?:npm (?:ERR!|error)|error) Missing script:\s*"?([\w:.-]+)"?/i.exec(l))) return { problem: { kind: "message", message: tidy(`package.json has no "${m[1]}" script, so Vercel had nothing to run.`), from: "deploy" } };
    if ((m = /(?:^|:\s)([\w@.\/-]+): command not found/.exec(l))) return { problem: { kind: "message", message: tidy(`The build could not run ${m[1]}: it is not installed on Vercel. Check that ${m[1]} is in package.json.`), from: "deploy" } };
  }
  // Nothing recognised: the first line that reads like an error and is not only "the build stopped".
  const first = lines.map((x) => x.trim()).find((x) => ERRORISH.test(x) && !GENERIC.test(x));
  if (first) return { problem: { kind: "message", message: tidy(first), from: "deploy" } };
  const stopped = lines.map((x) => x.trim()).find((x) => /Command ".*" exited with \d+/.test(x));
  if (stopped) return { problem: { kind: "message", message: tidy(`Vercel's build stopped (${stopped.replace(/^Error:\s*/, "")}), but the log does not say where.`), from: "deploy" } };
  return null;
}

// ---------- for Point at the problem and Rescue ----------

// summary: the whole sentence (Point at the problem). evidence: the same without its lead, for a line under the label
// "Your last Vercel deploy" (Rescue).
export type DeployFinding =
  | { state: "failed"; url: string; problem: Problem; setting?: string; summary: string; evidence: string }
  | { state: "fine" }
  | { state: "unknown"; reason: string }
  | { state: "cancelled" };

/** The last failed deploy of a project linked to Vercel, read and placed. null: the folder is not a Vercel project. */
export async function readDeployFailure(project: string, reader: DeployLogReader, signal?: AbortSignal): Promise<DeployFinding | null> {
  let b;
  try { b = await reader.lastFailedBuild(project, signal); }
  catch (e) { return { state: "unknown", reason: tidy(`I could not read why the Vercel deploy failed (${String((e as Error)?.message ?? e)}).`) }; }
  if (signal?.aborted || b.state === "cancelled") return { state: "cancelled" };
  if (b.state === "not_linked") return null;
  if (b.state === "none") return { state: "fine" };
  if (b.state === "unavailable") return { state: "unknown", reason: b.reason };
  const f = readBuildLog(b.log, project);
  if (!f) return { state: "unknown", reason: "Your last Vercel deploy failed, but its build log was empty. Open that deploy in Vercel to read why." };
  const evidence = f.problem.kind === "line" ? `${f.problem.file}, line ${f.problem.line}: ${f.problem.message}` : f.problem.message;
  const summary = f.problem.kind === "line" ? `Your last Vercel deploy failed at ${evidence}` : `Your last Vercel deploy failed: ${evidence}`;
  return { state: "failed", url: b.url, problem: f.problem, ...(f.setting ? { setting: f.setting } : {}), summary, evidence };
}
