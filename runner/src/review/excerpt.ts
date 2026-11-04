// M69 step 3, the pointed line (the YC benchmark spec 3.3): the line a review points at, with the line before and after it,
// so "Squibby is pointing here" points at real code and not only at "line 12". Every line is masked before it leaves the
// engine: a key keeps only its known prefix and "…" (sk_live_…), never any part of its secret; a value a name calls secret
// is hidden (redact.ts NAMED); a private key's lines are hidden whole (redact.ts secretLines); and a line is clipped, then
// checked once more, so a clip can never show the start of a key. Tested in test/review-excerpt.test.ts.
import { hasKeyShape, redact, secretLines } from "../redact.ts";

export type ExcerptLine = { n: number; text: string };
/** The most characters of one line shown (the card is about 80 wide; the rest is cut with "…"). */
export const EXCERPT_MAX = 120;
const MORE = "…";

// Known key prefixes, longest first, so a key shows only what kind it is.
const PREFIXES = ["sk_live_", "sk_test_", "rk_live_", "rk_test_", "pk_live_", "pk_test_", "whsec_", "sb_secret_", "github_pat_", "ghp_", "gho_", "ghu_", "ghs_", "ghr_", "xoxb-", "xoxp-", "xoxa-", "xoxr-", "xoxs-", "npm_", "AKIA", "AIza", "SG.", "sk-", "re_"];
// The same shapes redact.ts hides, found here to keep their prefix. Anything these miss, redact() still hides as a whole.
const SHAPES: RegExp[] = [
  /sk-[A-Za-z0-9_-]{16,}/g, /gh[pousr]_[A-Za-z0-9]{20,}/g, /AKIA[0-9A-Z]{16}/g, /xox[baprs]-[A-Za-z0-9-]{10,}/g,
  /\b(?:eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g, /[sr]k_(?:live|test)_[A-Za-z0-9]{10,}/g, /pk_(?:live|test)_[A-Za-z0-9]{10,}/g,
  /AIza[0-9A-Za-z_-]{30,}/g, /npm_[A-Za-z0-9]{30,}/g, /github_pat_[A-Za-z0-9_]{30,}/g, /whsec_[A-Za-z0-9+\/=_-]{16,}/g,
  /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g, /\bsb_secret_[A-Za-z0-9_-]{16,}/g,
];
const prefixOf = (key: string): string => PREFIXES.find((p) => key.startsWith(p)) ?? "";

/** One line of code, masked and clipped for the page. */
export function maskLine(line: string): string {
  let out = line.replace(/\s+$/, "");
  for (const p of SHAPES) out = out.replace(p, (k) => `${prefixOf(k)}${MORE}`);
  // What is left that looks secret (a name that says password, a password inside an address) is hidden by redact.ts.
  out = redact(out).replace(/\[secret\]/g, MORE);
  const chars = Array.from(out);
  if (chars.length > EXCERPT_MAX) out = chars.slice(0, EXCERPT_MAX).join("") + MORE;
  // A clip never shows the start of a key: if anything still looks like one, the whole line goes.
  return hasKeyShape(out) ? MORE : out;
}

/** The pointed line and the lines either side of it (only those that exist), masked. Undefined when the line is not in
 *  the text (a file that changed since, or no line). */
export function excerpt(text: string, line: number): ExcerptLine[] | undefined {
  if (!text || !Number.isInteger(line) || line < 1) return undefined;
  const all = text.split(/\r?\n/);
  if (line > all.length) return undefined;
  const from = Math.max(1, line - 1), to = Math.min(all.length, line + 1);
  // A private key over several lines is judged with the lines around it, so its body is never shown on its own.
  const around = all.slice(Math.max(0, from - 1 - 40), Math.min(all.length, to + 40));
  const offset = Math.max(0, from - 1 - 40);
  const secret = secretLines(around, () => false);
  const out: ExcerptLine[] = [];
  for (let n = from; n <= to; n++) out.push({ n, text: secret[n - 1 - offset] ? MORE : maskLine(all[n - 1]) });
  return out;
}
