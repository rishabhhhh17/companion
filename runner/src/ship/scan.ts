// The secret scan. Looks at what would be published (source files and built files) for keys, tokens and passwords,
// especially the ones every visitor of the site could read. Findings never repeat the secret itself.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";

export type Finding = { file: string; line: number; kind: string; public: boolean; message: string; advice: string; preview: string };
export type ScanOptions = { allow?: Set<string> };

const DETECTORS: [RegExp, string][] = [
  [/\bsk_live_[A-Za-z0-9]{10,}/, "Stripe live key"], [/\bsk_test_[A-Za-z0-9]{10,}/, "Stripe test key"], [/\bsk-[A-Za-z0-9_-]{20,}/, "API key"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/, "GitHub token"], [/\bAKIA[0-9A-Z]{16}\b/, "AWS key"], [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, "Slack token"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
];
const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/;
const SECRETISH = /(?:key|token|secret|password|passwd|pwd)[A-Za-z0-9_]*\s*[=:]\s*(["'])([^\s"'\n]{12,})\1/i;
const SECRETISH_RAW = /(?:key|token|secret|password|passwd|pwd)[A-Za-z0-9_]*\s*[=:]\s*([^\s"'\n#]{12,})/i;
const ENV_LINE = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/;
const PUBLIC_PREFIX = /^(?:NEXT_PUBLIC_|NUXT_PUBLIC_|EXPO_PUBLIC_|REACT_APP_|VITE_|PUBLIC_|GATSBY_)/;
const SECRET_NAME = /SECRET|PRIVATE|SERVICE_ROLE|PASSWORD|PASSWD|TOKEN|CREDENTIAL/;

const ADVICE = "Take it out of the code, keep the real value in a private setting (an .env file that .gitignore lists), and replace the key, because anything that was published should be treated as already exposed.";

function jwtKind(payloadB64: string): string | null {
  try {
    const p = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (p?.role === "anon") return null;                          // Supabase anon keys are meant to be public
    if (p?.role === "service_role") return "Supabase service key";
    return "login token";
  } catch { return "login token"; }
}

const isConfigFile = (file: string) => /(^|\/)\.env(\.|$)|\.(ya?ml|ini|properties|toml|conf)$/i.test(file);

type Hit = { kind: string; match: string; publicSetting?: boolean };
function classify(line: string, file: string): Hit[] {
  const env = ENV_LINE.exec(line);
  if (env && PUBLIC_PREFIX.test(env[1]) && SECRET_NAME.test(env[1]) && env[2].replace(/^["']|["']$/g, "").length > 0 && !env[2].includes("${")) {
    return [{ kind: "secret in a public setting", match: env[0].trim(), publicSetting: true }];
  }
  const hits: Hit[] = [];
  for (const [re, kind] of DETECTORS) { const m = re.exec(line); if (m) hits.push({ kind, match: m[0] }); }
  const j = JWT.exec(line);
  if (j) { const k = jwtKind(j[1]); if (k) hits.push({ kind: k, match: j[0] }); }
  // A generic "password = ..." is only reported when it is not the same text a specific detector already found.
  const covered = (v: string) => hits.some((h) => h.match.includes(v) || v.includes(h.match));
  const q = SECRETISH.exec(line);
  if (q && !/process\.env|import\.meta|\$\{/.test(q[2]) && !covered(q[2])) hits.push({ kind: "password or secret in code", match: q[2] });
  else if (isConfigFile(file) && !/(^|\/)\.env/.test(file)) { const r = SECRETISH_RAW.exec(line); if (r && !/process\.env|\$\{/.test(r[1]) && !covered(r[1])) hits.push({ kind: "password or secret in code", match: r[1] }); }
  return hits;
}

export function fingerprint(f: Finding): string {
  return createHash("sha256").update(`${f.file}|${f.kind}|${f.preview}`).digest("hex").slice(0, 16);
}

export function scanFiles(files: Record<string, string>, o: ScanOptions & { publicFiles?: (file: string) => boolean } = {}): Finding[] {
  const out: Finding[] = [];
  for (const [file, text] of Object.entries(files)) {
    text.split("\n").forEach((line, i) => {
      for (const c of classify(line, file)) {
        const isPublic = !!c.publicSetting || !!o.publicFiles?.(file);
        const preview = line.replace(c.match, `[hidden ${c.kind}]`).trim().slice(0, 100);
        const f: Finding = {
          file, line: i + 1, kind: c.kind, public: isPublic, preview, advice: ADVICE,
          message: `Found a ${c.kind} in ${file} (line ${i + 1}).${isPublic ? " Anyone who opens your site can read it." : ""}`,
        };
        if (o.allow?.has(fingerprint(f))) continue;
        out.push(f);
      }
    });
  }
  return out;
}

// ---------- a whole folder ----------

const SKIP_DIRS = new Set(["node_modules", ".git", ".vercel", ".claude", ".companion", ".turbo", ".cache", "coverage", ".next/cache", ".svelte-kit"]);
const BUILD_DIRS = ["dist", "build", "out", "public", ".next/static", ".output", "_site", ".svelte-kit/output"];
const MAX_BYTES = 1_000_000;

function ignoredBy(patterns: string[], rel: string): boolean {
  const name = basename(rel);
  return patterns.some((p) => {
    const pat = p.replace(/^\//, "").replace(/\/$/, "");
    const re = new RegExp("^" + pat.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*") + "$");
    return re.test(name) || re.test(rel) || rel.startsWith(pat + "/");
  });
}

export function scanProject(dir: string, o: ScanOptions = {}): { findings: Finding[]; scanned: number; skipped: number } {
  if (!existsSync(dir)) return { findings: [], scanned: 0, skipped: 0 };
  const files: Record<string, string> = {};
  let skipped = 0;
  const walk = (d: string) => {
    let names: string[] = [];
    try { names = readdirSync(d); } catch { return; }
    for (const n of names) {
      const full = join(d, n), rel = relative(dir, full).split("\\").join("/");
      if (SKIP_DIRS.has(n) || SKIP_DIRS.has(rel)) continue;
      let st; try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) { walk(full); continue; }
      if (!st.isFile()) continue;
      if (st.size > MAX_BYTES) { skipped++; continue; }
      let buf: Buffer; try { buf = readFileSync(full); } catch { skipped++; continue; }
      if (buf.subarray(0, 4096).includes(0)) { skipped++; continue; }
      files[rel] = buf.toString("utf8");
    }
  };
  walk(dir);
  const gitignore = (files[".gitignore"] ?? "").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const publicFiles = (f: string) => BUILD_DIRS.some((b) => f === b || f.startsWith(b + "/"));
  let findings = scanFiles(files, { ...o, publicFiles });
  findings = findings.flatMap((f) => {
    if (basename(f.file).startsWith(".env")) {
      if (f.kind === "secret in a public setting") return [f];             // the build would put it in the site
      if (ignoredBy(gitignore, f.file)) return [];                          // a private setting file git ignores: where secrets belong
      return [{ ...f, advice: `Add ${basename(f.file)} to your .gitignore so it is never published, and replace the key, because it may already have been shared.` }];
    }
    return [f];
  });
  return { findings, scanned: Object.keys(files).length, skipped };
}
