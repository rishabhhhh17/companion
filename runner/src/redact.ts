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
  /whsec_[A-Za-z0-9+\/=_-]{16,}/g,                         // webhook signing secrets (Stripe, Svix)
  /rk_(?:live|test)_[A-Za-z0-9]{10,}/g,                    // Stripe restricted keys
  /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g,          // SendGrid keys
  /\bsb_secret_[A-Za-z0-9_-]{16,}/g,                       // Supabase secret keys
  /\bre_(?=[A-Za-z0-9_]*[0-9])(?=[A-Za-z0-9_]*[A-Z])[A-Za-z0-9_]{20,}/g,   // Resend keys (a digit and a capital, so names are left alone)
  /\b[a-z][a-z0-9+.-]{0,30}:\/\/[^\s:@\/]+:[^\s@\/]+@/gi,         // passwords inside addresses (postgres://user:pass@host)
];
// "password: hunter2", "API_KEY=abc123": the name tells us the value is a secret.
// The name may carry more words around the telling one (DB_PASSWORD, STRIPE_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY, auth_token).
// Up to 80 characters each side: unbounded, a long run of dots or dashes sent the matcher over the rest of the text from every
// start, and the time grew with the square of the length (audit round 3). A longer name still has its value hidden, because
// the match can start at any dash, dot or underscore inside it. Every name the review calls a key in code (review/rate.ts
// NAMED_LITERAL) is here too, authKey among them, so a line the review flags never reaches a model in clear (M52).
const NAMED = /(?<![A-Za-z0-9])([A-Za-z0-9_.$-]{0,80}(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|service[_-]?role|auth[_-]?key|credential|[_-]key)[A-Za-z0-9_.$-]{0,80})(["']?\s*[:=]\s*)["'`]?[^\s"'`]{4,}/gi;
/** Whether the text holds a value shaped like a key or token (the patterns above, not the "password: x" names). The review
 *  of a change (review/rate.ts) uses it to find a key written into code without guessing from a variable's name. */
export function hasKeyShape(text: string): boolean {
  return PATTERNS.some((p) => { p.lastIndex = 0; const hit = p.test(text); p.lastIndex = 0; return hit; });
}
export function redact(text: string): string {
  let out = text;
  for (const p of PATTERNS) out = out.replace(p, "[secret]");
  return out.replace(NAMED, (_m, name: string, sep: string) => `${name}${sep}[secret]`);
}
// Colour and cursor codes and carriage returns inside raw tool output. A secret split by one is not seen by redact, and joins up
// again once the code is gone, so raw output is cleaned of them first and only then redacted (redactOutput).
const TERMINAL = /\u001b\[[0-9;?]*[ -\/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g;
export const stripTerminal = (text: string): string => text.replace(TERMINAL, "").replace(/\r/g, "");
/** Raw output of a tool (a log, an error), cleaned of terminal codes and then of secrets. */
export const redactOutput = (text: string): string => redact(stripTerminal(text));
// Cut by whole characters, so an emoji is never split in half (half an emoji is not valid text).
export const clip = (text: string, max: number): string => { const chars = Array.from(text); return chars.length <= max ? text : chars.slice(0, max).join(""); };
export const label = (text: string, max = 120): string => clip(redact(text).replace(/\s+/g, " ").trim(), max);
