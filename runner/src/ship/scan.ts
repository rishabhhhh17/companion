// The secret scan. Looks at what would be published (source files and built files) for keys, tokens and passwords,
// especially the ones every visitor of the site could read. Findings never repeat the secret itself.
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";

export type Finding = { file: string; line: number; kind: string; public: boolean; message: string; advice: string; preview: string };
export type ScanOptions = { allow?: Set<string> };

const DETECTORS: [RegExp, string][] = [
  [/\b[rs]k_live_[A-Za-z0-9]{10,}/, "Stripe live key"], [/\bsk_test_[A-Za-z0-9]{10,}/, "Stripe test key"], [/\bsk-[A-Za-z0-9_-]{20,}/, "API key"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/, "GitHub token"], [/\bAKIA[0-9A-Z]{16}\b/, "AWS key"], [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, "Slack token"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  [/\bwhsec_[A-Za-z0-9]{16,}/, "Stripe webhook secret"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "Google API key"], [/\bnpm_[A-Za-z0-9]{30,}/, "npm token"], [/\bgithub_pat_[A-Za-z0-9_]{30,}/, "GitHub token"],
  [/\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/, "SendGrid key"],
  [/https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9\/]{20,}/, "Slack webhook"], [/https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]{20,}/, "Discord webhook"],
  [/\b[a-z][a-z0-9+.-]*:\/\/[^\s:@\/"']{1,64}:[^\s@\/"']{4,}@[^\s\/"']+/i, "password inside a web address"],
  [/\bBearer\s+[A-Za-z0-9._~+\/-]{24,}=*/, "login token"],
];
const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/;
const SECRETISH = /(?:key|token|secret|password|passwd|pwd)[A-Za-z0-9_]*\s*[=:]\s*(["'])([^\s"'\n]{12,})\1/i;
const SECRETISH_RAW = /(?:key|token|secret|password|passwd|pwd)[A-Za-z0-9_]*\s*[=:]\s*([^\s"'\n#]{12,})/i;
const ENV_LINE = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/;
const PUBLIC_PREFIX = /^(?:NEXT_PUBLIC_|NUXT_PUBLIC_|EXPO_PUBLIC_|REACT_APP_|VITE_|PUBLIC_|GATSBY_)/;
const SECRET_NAME = /SECRET|PRIVATE|SERVICE_ROLE|SERVICE_KEY|ADMIN_KEY|MASTER_KEY|PASSWORD|PASSWD|TOKEN|CREDENTIAL/;
const PLACEHOLDER = /^(?:["']?)(?:your[_-]|<|xxx|changeme|change[_-]me|example|placeholder|todo|\.\.\.|\*{3,}|replace)/i;

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

const SKIP_DIRS = new Set([".venv", "venv", "site-packages", "__pycache__", "target", "vendor", "Pods", ".gradle", "node_modules", ".git", ".vercel", ".claude", ".companion", ".turbo", ".cache", "coverage", ".next/cache", ".svelte-kit"]);
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

const publicDir = (rel: string) => BUILD_DIRS.some((b) => rel === b || rel.startsWith(b + "/"));
const TEMPLATE_ENV = /(^|\/)\.env\.(example|sample|template|dist)$/;

export function scanProject(dir: string, o: ScanOptions = {}): { findings: Finding[]; scanned: number; skipped: number; unreadablePublic: number } {
  if (!existsSync(dir)) return { findings: [], scanned: 0, skipped: 0, unreadablePublic: 0 };
  const files: Record<string, string> = {};
  let skipped = 0, unreadablePublic = 0;
  const walk = (d: string) => {
    let names: string[] = [];
    try { names = readdirSync(d); } catch { return; }
    for (const n of names) {
      const full = join(d, n), rel = relative(dir, full).split("\\").join("/");
      if (SKIP_DIRS.has(n) || SKIP_DIRS.has(rel)) continue;
      let st; try { st = lstatSync(full); } catch { continue; }
      if (st.isSymbolicLink()) continue;                       // never follow a link out of the project
      if (st.isDirectory()) { walk(full); continue; }
      if (!st.isFile()) continue;
      const pub = publicDir(rel);
      if (st.size > MAX_BYTES) { skipped++; if (pub) unreadablePublic++; continue; }
      let buf: Buffer; try { buf = readFileSync(full); } catch { skipped++; if (pub) unreadablePublic++; continue; }
      if (buf.subarray(0, 4096).includes(0) && !pub) { skipped++; continue; }
      if (buf.subarray(0, 4096).includes(0)) { skipped++; continue; }   // binary files cannot hold readable keys
      files[rel] = buf.toString("utf8");
    }
  };
  walk(dir);
  const gitignore = (files[".gitignore"] ?? "").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const publicFiles = publicDir;
  let findings = scanFiles(files, { ...o, publicFiles });
  findings = findings.flatMap((f) => {
    if (basename(f.file).startsWith(".env")) {
      if (f.kind === "secret in a public setting") return [f];             // the build would put it in the site
      if (ignoredBy(gitignore, f.file)) return [];                          // a private setting file git ignores: where secrets belong
      return [{ ...f, advice: `Add ${basename(f.file)} to your .gitignore so it is never published, and replace the key, because it may already have been shared.` }];
    }
    return [f];
  });
  // A private settings file git does not ignore, holding real looking values, would be published with the code.
  if (!o.allow) for (const [f, text] of Object.entries(files)) {
    if (!/(^|\/)\.env(\.|$)/.test(f) || TEMPLATE_ENV.test(f) || ignoredBy(gitignore, f)) continue;
    text.split("\n").forEach((line, i) => {
      const m = ENV_LINE.exec(line);
      const v = m?.[2].replace(/^["']|["']$/g, "") ?? "";
      if (!m || !/SECRET|PASSWORD|PASSWD|TOKEN|PRIVATE|CREDENTIAL|_KEY$/.test(m[1]) || v.length < 8 || PLACEHOLDER.test(v) || v.includes("${")) return;
      if (findings.some((x) => x.file === f && x.line === i + 1)) return;
      findings.push({ file: f, line: i + 1, kind: "secret in a settings file", public: false, preview: line.replace(v, "[hidden value]").trim().slice(0, 100),
        advice: `Add ${basename(f)} to your .gitignore so it is never published, and replace the key, because it may already have been shared.`,
        message: `${f} (line ${i + 1}) holds a secret value and is not hidden from git.` });
    });
  }
  return { findings, scanned: Object.keys(files).length, skipped, unreadablePublic };
}
