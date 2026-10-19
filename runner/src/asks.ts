// "Do what it can, then ask one short question" (HeyClicky v1.0.53 parity, M11). Claude is told to end its final message
// with one short question, on its own last line, only when something only the person can give is missing, and otherwise
// never to end on a question or an offer (sdkEngine.ts); Claude's own question box is refused (safety.ts NOT_GIVEN). These
// read that final message: does it stop to ask the person something, does that question name something only the person
// has (their own value, account or choice), and the words the card shows under the receipt. Plain, testable text; nothing
// here is a safety rule.
import { clip, redact } from "./redact.ts";

/** The most of the agent's last words a receipt carries. */
export const MAX_SAID_CHARS = 600;

// Code is not a question: `a ? b : c`, `user?.name`.
const withoutCode = (text: string) => text.replace(/```[\s\S]*?(```|$)/g, "\n").replace(/`[^`\n]*`/g, " ");
// A sentence's own end, past closing quotes, brackets and markdown emphasis.
const QUESTION_END = /\?["'”’)\]*_]*$/;
const sentencesOf = (text: string) => withoutCode(String(text ?? "")).split(/(?<=[.!?]["'”’)\]*_]*)\s+|\n+/).map((s) => s.trim()).filter(Boolean);
// Markdown emphasis, quotes and list marks around a sentence, so "**Should it be blue?**" reads as the question itself.
const bare = (s: string) => s.replace(/^[\s"'“‘*_>#-]+|["'”’)\]*_\s]+$/g, "");

// Claude's habitual endings, which ask for nothing only the person has: an offer of more work ("Want me to add a test?",
// "Should I also update the README?", "Shall I go ahead?", "Do you want a test too?") and a check in ("Anything else?",
// "Does that look right?", "What do you think?"). A choice between two ways ("Should I use Resend or Postmark?") is the
// person's, so it is no offer, unless the other way is only not doing it ("or leave it", "or not") or it offers more ("also").
const OFFER = /\b(?:want|like|need)s? me to\b|\bif you(?:'d| would)? like\b|^(?:so |then |and )?(?:shall|should|can|could|may) I\b|\b(?:also|too|as well)\b.*\b(?:want|like|need)\b|\b(?:want|like|need)\b.*\b(?:too|also|as well)\b/i;
const CHOICE = /\b(?:or|which|whichever)\b/i;
const ONLY_NOT_DOING_IT = /\bor (?:not|leave|skip|keep|stop|is that|anything)\b|\b(?:also|too|as well)\b/i;
const CHECK_IN = /\banything else\b|\bwhat else\b|\b(?:any|other|more) questions\b|\blet me know\b|\bwhat do you think\b|\bhow does (?:that|this|it) (?:look|sound|feel)\b|\bsounds? good\b|^(?:does|did|do|is|was|will|would) (?:that|this|it|everything|these|those)(?: all| now)? (?:look|looks|work|works|working|help|helps|fix|fixed|seem|seems|sound|sounds|make sense|okay|ok|alright|fine|good|what you)\b/i;
const isOffer = (q: string) => CHECK_IN.test(q) || (OFFER.test(q) && (!CHOICE.test(q) || ONLY_NOT_DOING_IT.test(q)));

// The last of the message's last three sentences that is a question for the person (the question, then a line or two on
// where to find the answer), with the sentence before it.
function lastQuestion(text: string): { q: string; before: string } | null {
  const last = sentencesOf(text).slice(-3);
  for (let i = last.length - 1; i >= 0; i--) {
    const q = bare(last[i]);
    if (QUESTION_END.test(last[i]) && !isOffer(q)) return { q, before: i > 0 ? bare(last[i - 1]) : "" };
  }
  return null;
}

/** The question the agent's final message ends on for the person, or null. Not an offer or a check in, not a question it
 *  asked itself early in a longer message and then answered, and never a question mark in code. */
export const questionOf = (text: string): string | null => lastQuestion(text)?.q ?? null;

/** Does the agent's final message stop to ask the person something? */
export const asksPerson = (text: string): boolean => lastQuestion(text) !== null;

// What only the person has: their own value or account ("your Supabase address", "do you have a Stripe account"), or a
// choice ("blue or green", "which address", "what should the price be"). A question Claude could answer by looking at the
// project ("Is it meant to run on port 3000?") names none of these.
const THEIRS = /\byours?\b|\byou(?:'d| would)? (?:want|prefer|like|use|have|need|mean|expect|plan|choose|pick)\b|\b(?:or|which|whichever)\b|\bwhat should\b|\bshould (?:it|the|this|that|they|these|those|we)\b|\bcan you (?:add|give|tell|share|send|set|check|confirm)\b/i;

/** Does that question name something only the person has? Read from the question and the sentence before it ("I need your
 *  Supabase address to finish. What is it?"). When the checks failed, only such a question ends the task as needs you;
 *  anything else gets the fix round as before. */
export function asksForWhatOnlyTheyHave(text: string): boolean {
  const l = lastQuestion(text);
  return !!l && THEIRS.test(`${l.before} ${l.q}`);
}

/** The agent's last words as the receipt carries them: secrets hidden, spaces folded, clipped by whole characters. */
export function saidLine(text: string): string {
  const flat = redact(String(text ?? "")).replace(/\s+/g, " ").trim();
  return Array.from(flat).length <= MAX_SAID_CHARS ? flat : `${clip(flat, MAX_SAID_CHARS - 1).trimEnd()}…`;
}
