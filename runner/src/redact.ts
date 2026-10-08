// Keep secrets out of logs and labels. Conservative: when it looks like a key, hide it.
const PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{16,}/g,            // Anthropic and OpenAI style keys
  /gh[pousr]_[A-Za-z0-9]{20,}/g,       // GitHub tokens
  /AKIA[0-9A-Z]{16}/g,                 // AWS access key ids
  /xox[baprs]-[A-Za-z0-9-]{10,}/g,     // Slack tokens
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\b(?:eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g, // JWTs
  /sk_(?:live|test)_[A-Za-z0-9]{10,}/g,                    // Stripe keys
  /AIza[0-9A-Za-z_-]{30,}/g,                               // Google keys
  /npm_[A-Za-z0-9]{30,}/g,                                 // npm tokens
  /github_pat_[A-Za-z0-9_]{30,}/g,                         // GitHub fine grained tokens
  /\bBearer\s+[A-Za-z0-9._~+\/=-]{16,}/g,                  // authorization headers
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@\/]+:[^\s@\/]+@/gi,         // passwords inside addresses (postgres://user:pass@host)
];
// "password: hunter2", "API_KEY=abc123": the name tells us the value is a secret.
const NAMED = /\b(password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key)(\s*[:=]\s*)["']?[^\s"']{6,}/gi;
export function redact(text: string): string {
  let out = text;
  for (const p of PATTERNS) out = out.replace(p, "[secret]");
  return out.replace(NAMED, (_m, name: string, sep: string) => `${name}${sep}[secret]`);
}
// Cut by whole characters, so an emoji is never split in half (half an emoji is not valid text).
export const clip = (text: string, max: number): string => { const chars = Array.from(text); return chars.length <= max ? text : chars.slice(0, max).join(""); };
export const label = (text: string, max = 120): string => clip(redact(text).replace(/\s+/g, " ").trim(), max);
