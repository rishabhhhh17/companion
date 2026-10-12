// Draw it for me: the person asks "why did this break?" and the model answers with a small diagram AS DATA (boxes and
// arrows, with the broken place marked), never as free drawing. It is built only from the project and the failing place,
// never from the screen. Everything is checked hard before it is shown.
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { clip, redact } from "./redact.ts";

export const MAX_NODES = 6;
const MAX_EDGES = 8;

export type DiagramNode = { id: string; label: string };
export type DiagramEdge = { from: string; to: string; label?: string };
export type Broken = { node: string; reason: string } | { edge: [string, string]; reason: string };
export type Diagram = { nodes: DiagramNode[]; edges: DiagramEdge[]; broken: Broken; caption: string };

export const DIAGRAM_SYSTEM = [
  "You explain, to a person who is not an engineer, why something in their project broke, as a small diagram.",
  "Reply with ONLY JSON: {\"nodes\":[{\"id\":\"page\",\"label\":\"Signup page\"}], \"edges\":[{\"from\":\"page\",\"to\":\"api\",\"label\":\"sends the form\"}], \"broken\":{\"edge\":[\"page\",\"api\"],\"reason\":\"...\"}, \"caption\":\"...\"}.",
  "Use two to six nodes (the parts of THEIR project that matter: a page, an API route, a database table, a service), in the order data flows, and an arrow for each hand over.",
  "\"broken\" is required: either {\"node\":\"id\",\"reason\":\"...\"} or {\"edge\":[\"from\",\"to\"],\"reason\":\"...\"}, naming the one place where it goes wrong and why in one plain sentence.",
  "\"caption\" is one plain sentence under the picture. Labels are two to four words. No code, no jargon, no file paths in labels.",
  "Use only what the project information below shows. If it is not enough to tell, draw the most likely flow and say so in the caption.",
].join(" ");

const tidy = (s: unknown, n: number) => clip(redact(String(s ?? "")).replace(/<[^>]*>/g, "").replace(/[<>\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim(), n);
const normId = (s: unknown) => tidy(s, 24).replace(/[^A-Za-z0-9_-]/g, "");

export function parseDiagram(raw: string): Diagram | null {
  const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let j: any;
  try { j = JSON.parse(raw.slice(a, b + 1)); } catch { return null; }
  if (!Array.isArray(j?.nodes)) return null;
  const nodes: DiagramNode[] = [];
  for (const n of j.nodes) {
    const id = normId(n?.id);
    const label = tidy(n?.label, 40);
    if (id && label && !nodes.some((x) => x.id === id) && nodes.length < MAX_NODES) nodes.push({ id, label });
  }
  if (nodes.length < 2) return null;
  const has = (id: string) => nodes.some((n) => n.id === id);
  const edges: DiagramEdge[] = [];
  for (const e of Array.isArray(j.edges) ? j.edges : []) {
    const from = normId(e?.from), to = normId(e?.to);
    if (!has(from) || !has(to) || from === to || edges.some((x) => x.from === from && x.to === to) || edges.length >= MAX_EDGES) continue;
    const label = tidy(e?.label, 30);
    edges.push({ from, to, ...(label ? { label } : {}) });
  }
  if (edges.length === 0) return null;
  const reason = tidy(j?.broken?.reason, 140);
  let broken: Broken | null = null;
  if (typeof j?.broken?.node === "string" && has(normId(j.broken.node))) broken = { node: normId(j.broken.node), reason };
  else if (Array.isArray(j?.broken?.edge) && j.broken.edge.length === 2) {
    const [f, t] = [normId(j.broken.edge[0]), normId(j.broken.edge[1])];
    if (edges.some((e) => e.from === f && e.to === t)) broken = { edge: [f, t], reason };
    else if (edges.some((e) => e.from === t && e.to === f)) broken = { edge: [t, f], reason };   // the model named it backwards
  }
  if (!broken || !reason) return null;
  return { nodes, edges, broken, caption: tidy(j?.caption, 160) };
}

const SKIP = new Set(["node_modules", ".git", "dist", "build", ".next", ".vercel", ".companion", "coverage", "venv", "env", "vendor", "target", "__pycache__", "site-packages"]);
// Settings, key and credential files are never sent, whatever their name looks like.
export const isEnvFile = (p: string) => /(^|\/)\.env/.test(p) || /(^|\/)[^/]*\.env$/.test(p)
  || /(^|\/)(id_(rsa|dsa|ecdsa|ed25519)|\.npmrc|\.netrc|\.pgpass|\.pypirc|credentials(\.[a-z]+)?|secrets?(\.[a-z]+)?|[^/]*\.(pem|key|p12|pfx|jks|keystore)|[^/]*\.tfstate(\.backup)?|[^/]*\.tfvars)$/i.test(p);

// The lines around the failing line, from a file that is really inside the project and is not a settings or key file.
function around(project: string, file: string, line: number, radius = 8): string {
  try {
    const root = realpathSync(project);
    if (isEnvFile(file)) return "";
    const real = realpathSync(join(root, file));
    if (!real.startsWith(root + sep) || relative(root, real).split(sep).some((p) => SKIP.has(p)) || isEnvFile(real)) return "";
    const st = statSync(real);
    if (!st.isFile() || st.size > 400_000) return "";
    const rows = readFileSync(real, "utf8").split("\n");
    if (!Number.isInteger(line) || line < 1 || line > rows.length) return "";
    const from = Math.max(1, line - radius), to = Math.min(rows.length, line + radius);
    return rows.slice(from - 1, to).map((r, i) => `${from + i}${from + i === line ? " >" : "  "} ${clip(r, 160)}`).join("\n");
  } catch { return ""; }
}

const CODE_FILE = /\.(?:[cm]?[jt]sx?|vue|svelte|astro|py)$/;
const SERVER_ROUTE = /\b(?:app|router|server|api|fastify|r)\.(get|post|put|patch|delete|all|use)\(\s*['"`](\/[^'"`\s]*)['"`]/g;
const PAGE_CALL = /\b(?:fetch|axios(?:\.(?:get|post|put|patch|delete))?|ky(?:\.(?:get|post|put|patch|delete))?)\(\s*['"`](\/[^'"`\s]*)['"`]/g;
const DB_TABLE = /\.from\(\s*['"`]([A-Za-z_][\w]*)['"`]\s*\)/g;

/** A short list of what the project serves and what its pages ask for, so a mismatch can be seen. Found by plain
 *  reading of the files (never run): express style routes, Next.js file routes, fetch and axios calls, database tables. */
export function routesSummary(project: string): string {
  const lines: string[] = [];
  let files = 0;
  const walk = (dir: string, depth: number) => {
    if (depth > 6 || files > 300 || lines.length >= 28) return;
    let names: string[]; try { names = readdirSync(dir); } catch { return; }
    for (const n of names.sort()) {
      if (files > 300 || lines.length >= 28) return;
      if (SKIP.has(n) || n.startsWith(".") || isEnvFile(n)) continue;
      const p = join(dir, n);
      let st; try { st = lstatSync(p); } catch { continue; }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) { walk(p, depth + 1); continue; }
      if (!CODE_FILE.test(n) || st.size > 200_000) continue;
      files++;
      const rel = relative(project, p).split(sep).join("/");
      let text = ""; try { text = readFileSync(p, "utf8"); } catch { continue; }
      const at = (idx: number) => text.slice(0, idx).split("\n").length;
      // Next.js style: app/api/users/route.ts and pages/api/ping.ts
      const next = /(?:^|\/)app\/(api\/.*)\/route\.[cm]?[jt]sx?$/.exec(rel);
      if (next) for (const m of text.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) lines.push(`${m[1]} /${next[1]} (${rel})`);
      const pg = /(?:^|\/)pages\/(api\/.*?)\.[cm]?[jt]sx?$/.exec(rel);
      if (pg) lines.push(`/${pg[1].replace(/\/index$/, "")} (${rel})`);
      for (const m of text.matchAll(SERVER_ROUTE)) lines.push(`${m[1] === "use" || m[1] === "all" ? "ANY" : m[1].toUpperCase()} ${m[2]} (${rel}:${at(m.index!)})`);
      for (const m of text.matchAll(PAGE_CALL)) lines.push(`the page calls ${m[1]} (${rel}:${at(m.index!)})`);
      for (const m of text.matchAll(DB_TABLE)) lines.push(`database table ${m[1]} (${rel}:${at(m.index!)})`);
    }
  };
  walk(project, 0);
  return [...new Set(lines)].slice(0, 28).map((l) => clip(redact(l), 200)).join("\n");
}

/** What the model is shown: the question, the failing place and the lines around it, and what the project is built with. */
export function diagramContext(project: string, i: { question: string; problem?: { kind?: string; file?: string; line?: number; message?: string } }): string {
  const parts = [`The person asks: ${tidy(i.question, 300) || "Why did this break?"}`];
  const p = i.problem;
  if (p?.message) parts.push(`The failing check said: ${tidy(p.message, 300)}`);
  if (p?.kind === "line" && p.file && p.line) {
    parts.push(`It failed at ${tidy(p.file, 120)}, line ${p.line}.`);
    const code = around(project, p.file, p.line);
    if (code) parts.push(`The code there (the failing line is marked >):\n${redact(code)}`);
  }
  try {
    const pkg = JSON.parse(readFileSync(join(project, "package.json"), "utf8"));
    const deps = Object.keys({ ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }).slice(0, 30).join(", ");
    if (deps) parts.push(`Built with: ${deps}`);
  } catch { /* no package list */ }
  const dirs = ["src", "app", "pages", "api", "routes", "supabase", "server", "lib"].filter((d) => existsSync(join(project, d)));
  if (dirs.length) parts.push(`Folders: ${dirs.join(", ")}`);
  const routes = routesSummary(project);
  if (routes) parts.push(`What the project serves and what its pages ask for:\n${routes}`);
  return parts.join("\n\n");
}

export const diagramRequest = (context: string): { text: string; system: string } => ({ system: DIAGRAM_SYSTEM, text: context });
