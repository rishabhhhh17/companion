// Keep secrets out of logs and labels. Conservative: when it looks like a key, hide it.
const PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{16,}/g,            // Anthropic and OpenAI style keys
  /gh[pousr]_[A-Za-z0-9]{20,}/g,       // GitHub tokens
  /AKIA[0-9A-Z]{16}/g,                 // AWS access key ids
  /xox[baprs]-[A-Za-z0-9-]{10,}/g,     // Slack tokens
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY[A-Z ]*-----[\s\S]*?(-----END [A-Z0-9 ]*PRIVATE KEY[A-Z ]*-----|$)/g,   // PEM, OpenSSH and PGP ("PRIVATE KEY BLOCK")
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
// A private key's first and last lines, and a line of its body: only key letters (base64), 40 or more with capitals, small
// letters and digits, with at most quotes, a plus, a comma or an escaped line break around them (a key pasted into code).
// A git hash (small letters and digits only) or a word is never one. KEYISH: a line of key letters of any length (the short
// last line of a key's body), hidden only beside a line of a key.
const KEY_BEGIN = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY[A-Z ]*-----/;
const KEY_END = /-----END [A-Z0-9 ]*PRIVATE KEY[A-Z ]*-----/;
const KEY_BODY = /^[\s"'`+,(]*(?=[A-Za-z0-9+/]*[A-Z])(?=[A-Za-z0-9+/]*[a-z])(?=[A-Za-z0-9+/]*[0-9])[A-Za-z0-9+/]{40,}={0,2}(?:\\n)?[\s"'`+,;)]*$/;
const KEYISH = /^[\s"'`+,(]*[A-Za-z0-9+/]+={0,2}(?:\\n)?[\s"'`+,;)]*$/;
/** Which lines of a run (lines that follow each other in a file) hold part of a secret, judged together, so a key written
 *  over several lines is hidden whole (must fix 3, 3 Nov 2026: hiding one line at a time hid only a private key's BEGIN
 *  line, and so took away the anchor the whole text redaction looks for; the key's body went to the model). A line is
 *  secret when isSecret says so; every line of a private key from its BEGIN line to its END line (or to the end of the run
 *  when the END is not there) is secret; a line that looks like a key's body is secret, with the BEGIN or END line out of
 *  view too; and so is a short line of key letters beside any line of a key (its last line). Ordinary code beside a key
 *  stays readable. */
export function secretLines(lines: string[], isSecret: (line: string) => boolean = hasKeyShape): boolean[] {
  const edge = lines.map((l) => KEY_BEGIN.test(l) || KEY_END.test(l));
  const body = lines.map((l) => KEY_BODY.test(l));
  let inKey = false;
  lines.forEach((l, i) => {
    const begins = KEY_BEGIN.exec(l);
    if (begins) inKey = !KEY_END.test(l.slice(begins.index + begins[0].length));
    else if (inKey) { if (KEY_END.test(l)) inKey = false; else body[i] = true; }
  });
  // The short lines of key letters next to a line of a key's body, outwards until a line that is not one (never past its
  // BEGIN or END line).
  const key = lines.map((_, i) => body[i] || edge[i]);
  for (let i = 0; i < lines.length; i++) {
    if (!body[i]) continue;
    for (let j = i - 1; j >= 0 && !key[j] && KEYISH.test(lines[j]); j--) key[j] = true;
    for (let j = i + 1; j < lines.length && !key[j] && KEYISH.test(lines[j]); j++) key[j] = true;
  }
  return lines.map((l, i) => key[i] || isSecret(l));
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
