// Proof rung 7: for a risky change, a second model reads the change before it can be called done.
// It is shown text only (never the project folder), with secret looking values hidden first.

export type Changed = { file: string; kind: string };
export type Review = { verdict: "approve" | "changes"; concerns: string[] };

const RISKY_NAME = /(^|\/)(package(-lock)?\.json|bun\.lockb?|pnpm-lock\.yaml|yarn\.lock|\.env[^/]*|next\.config\.[cm]?[jt]s|vercel\.json|netlify\.toml|Dockerfile|docker-compose\.ya?ml|firebase\.json|firestore\.rules|\.firebaserc)$|auth|login|password|passwd|payment|stripe|checkout|billing|secret|credential|token|api[-_.]?key|migration|schema\.sql|\.sql$|supabase|\.github\/workflows/i;

export function needsReview(changed: Changed[], contents: Record<string, string> = {}): boolean {
  if (changed.length === 0) return false;
  // A secret written into any file makes the change risky, whatever the file is called.
  if (Object.values(contents).some((t) => hideSecrets(t) !== t)) return true;
  if (changed.length > 15) return true;
  if (changed.filter((c) => c.kind === "deleted").length > 3) return true;
  return changed.some((c) => RISKY_NAME.test(c.file));
}

// Secrets are hidden before anything is sent, but the marker says what kind of thing was there, so a reviewer can still warn about it.
const SECRETS: [RegExp, string][] = [
  [/\bsk_live_[A-Za-z0-9]{10,}/g, "Stripe live key"], [/\bsk_test_[A-Za-z0-9]{10,}/g, "Stripe test key"], [/\bsk-[A-Za-z0-9_-]{20,}/g, "API key"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, "GitHub token"], [/\bAKIA[0-9A-Z]{16}\b/g, "AWS key"], [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, "Slack token"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "login token"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, "private key"],
];
const ASSIGNED = /((?:key|token|secret|password|passwd|pwd)[A-Za-z0-9_]*\s*[=:]\s*["']?)([A-Za-z0-9_\-+/=.]{12,})/gi;
export function hideSecrets(text: string): string {
  let out = text;
  for (const [re, what] of SECRETS) out = out.replace(re, `[hidden ${what}]`);
  return out.replace(ASSIGNED, (m, head: string, value: string) => (value.startsWith("[hidden") ? m : `${head}[hidden secret value]`));
}

function lineDiff(before: string, after: string): string[] {
  const count = new Map<string, number>();
  for (const l of before.split("\n")) count.set(l, (count.get(l) ?? 0) + 1);
  const added: string[] = [];
  for (const l of after.split("\n")) {
    const n = count.get(l) ?? 0;
    if (n > 0) count.set(l, n - 1); else added.push(`+${l}`);
  }
  const removed: string[] = [];
  for (const [l, n] of count) for (let i = 0; i < n; i++) removed.push(`-${l}`);
  return [...removed, ...added];
}

// A plain description of what changed: lines removed and added, per file. Cut to a size limit.
export function diffText(before: Record<string, string>, after: Record<string, string>, maxChars: number): string {
  const out: string[] = [];
  let size = 0, cut = false;
  for (const file of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
    const lines = lineDiff(before[file] ?? "", after[file] ?? "");
    if (lines.length === 0) continue;
    const block = [`--- ${file}`, ...lines.filter((l) => l !== "+" && l !== "-")].join("\n");
    if (size + block.length > maxChars) { cut = true; out.push(block.slice(0, Math.max(0, maxChars - size))); break; }
    out.push(block); size += block.length + 1;
  }
  const text = hideSecrets(out.join("\n"));
  return cut ? `${text}\n[... cut: the change is bigger than what was sent for review ...]` : text;
}

export const reviewPrompt = (goal: string, diff: string) =>
  `You are a careful second reviewer. A person asked an AI assistant to do this:

"${goal}"

Here is the change it made (lines starting with - were removed, + were added; secrets are hidden):

${diff}

A marker like [hidden Stripe live key] or [hidden secret value] means a real secret was written into this code, in the place where it appears. Secrets written into code that anyone can open (web pages, scripts the browser loads) are a serious problem.

Look only for real problems a non-engineer would be hurt by: secrets or keys written into the code, something sent, charged or published without the person asking, login or payment mistakes, data loss, or doing the opposite of what was asked.
Do not flag: which dependency list a package is in, code style, naming, missing tests, missing polish, or features that are only partly done. Approve unless there is a real problem; when unsure, approve.
Reply with ONLY a JSON object: {"verdict": "approve" or "changes", "concerns": ["each concern in one plain sentence"]}. Use "changes" only with at least one concern.`;

export function parseReview(text: string): Review | null {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let j: any;
  try { j = JSON.parse(text.slice(a, b + 1)); } catch { return null; }
  const concerns = Array.isArray(j?.concerns) ? j.concerns.filter((x: unknown): x is string => typeof x === "string").map((x: string) => x.replace(/\s+/g, " ").trim()).filter(Boolean) : [];
  if (j?.verdict === "approve") return { verdict: "approve", concerns };
  if (j?.verdict === "changes" && concerns.length) return { verdict: "changes", concerns };
  return null;
}
