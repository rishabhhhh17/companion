// Keep secrets out of logs and labels. Conservative: when it looks like a key, hide it.
const PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{16,}/g,            // Anthropic and OpenAI style keys
  /gh[pousr]_[A-Za-z0-9]{20,}/g,       // GitHub tokens
  /AKIA[0-9A-Z]{16}/g,                 // AWS access key ids
  /xox[baprs]-[A-Za-z0-9-]{10,}/g,     // Slack tokens
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\b(?:eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g, // JWTs
];
export function redact(text: string): string {
  let out = text;
  for (const p of PATTERNS) out = out.replace(p, "[secret]");
  return out;
}
export const label = (text: string, max = 120): string => redact(text).replace(/\s+/g, " ").trim().slice(0, max);
