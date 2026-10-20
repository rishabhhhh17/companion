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
// "Should I also update the README?", "Shall I go ahead?", "Would you like to see it?", "Do you want to continue?", "Shall we
// deploy it?", "Ready to deploy?") and a check in ("Anything else?", "Does that look right?", "What do you think?", "Is that
// clear?", "Did it work for you?"). A choice between two ways ("Should I use Resend or Postmark?") is the person's, so it is
// no offer, unless the other way is only not doing it ("or leave it", "or not") or it offers more ("also").
const OFFER = /\b(?:want|like|need)s? me to\b|\bif you(?:'d| would)? like\b|^(?:so |then |and )?(?:shall|should|can|could|may) (?:I|we)\b|^(?:so |then |and )?(?:would you like|would you prefer|do you want|did you want|are you ready|ready|want)\b|\b(?:also|too|as well)\b.*\b(?:want|like|need)\b|\b(?:want|like|need)\b.*\b(?:too|also|as well)\b/i;
const CHOICE = /\b(?:or|which|whichever)\b/i;
const ONLY_NOT_DOING_IT = /\bor (?:not|leave|skip|keep|stop|is that|anything)\b|\b(?:also|too|as well)\b/i;
const CHECK_IN = /\banything else\b|\bwhat else\b|\b(?:any|other|more) questions\b|\blet me know\b|\bwhat do you think\b|\bhow does (?:that|this|it) (?:look|sound|feel)\b|\bsounds? good\b|^(?:does|did|do|is|was|will|would) (?:that|this|it|everything|these|those)(?: all| now)? (?:look|looks|work|works|working|help|helps|fix|fixed|seem|seems|sound|sounds|make sense|okay|ok|alright|fine|good|clear|enough|what you)\b|^(?:is|was) (?:that|this|it) (?:clear|enough|helpful|what you)\b|^have I (?:covered|missed|answered|addressed|explained|got)\b|^(?:did|does|do) (?:the|that|this|it|everything)\b[^?]*\b(?:work|works|worked|help|helps|helped)\b[^?]*\bfor you\b|^(?:would you like|do you want) any (?:changes|more|further)\b/i;
// "Should I delete the old users table?" is the person's to say, however it is worded: a yes or no before something that
// cannot be taken back, goes out, or is theirs. Only "I" asking is such a request; "Should we deploy it?" is a habitual
// ending (rule 13: nothing goes live without a tap anyway).
const ASKS_LEAVE = /^(?:so |then |and )?(?:shall|should|can|could|may) I\b/i;
// "Do you want me to delete...?", "Would you like me to overwrite your config?", "Want me to wipe...?" ask the same thing.
const ASKS_LEAVE_ME = /\b(?:want|like)s? me to\b/i;
// "Do you want to delete your account data?": no "me", so only what cannot be taken back counts.
const ASKS_LEAVE_YOU = /^(?:so |then |and )?(?:do you want|would you like|did you want) to\b/i;
const DESTRUCTIVE = /\b(?:delete|deleting|remove|removing|overwrite|overwriting|replace|replacing|drop|dropping|wipe|wiping|erase|erasing|reset|truncate)\b/i;
const RISKY_VERB = /\b(?:delete|deleting|remove|removing|overwrite|overwriting|replace|replacing|drop|dropping|wipe|wiping|erase|erasing|reset|truncate|push|pushing|deploy|deploying|publish|publishing|send|sending|pay|paying|charge|charging|email|emailing)\b/i;
const THEIR_THING = /\byour\b/i;
const HABITUAL = /\b(?:see|show|explain|walk through|proceed|continue|go ahead|carry on|move on|keep going|get started|go on|add (?:a |some )?tests?|tidy|clean up|double.check|run the tests)\b/i;
const asksLeave = (q: string) => ((ASKS_LEAVE.test(q) || ASKS_LEAVE_ME.test(q)) && (RISKY_VERB.test(q) || (THEIR_THING.test(q) && !HABITUAL.test(q)))) || (ASKS_LEAVE_YOU.test(q) && DESTRUCTIVE.test(q));
const isOffer = (q: string) => !asksLeave(q) && (CHECK_IN.test(q) || (OFFER.test(q) && (!CHOICE.test(q) || ONLY_NOT_DOING_IT.test(q))));

// A line after a question counts as Claude answering its own question only when it positively reads as an answer or a
// result ("Yes it passes.", "The port was taken.", "I changed it to 3001.", "The tests pass."). Any other line ("Without it I
// can't set up payments.", "Please paste it here.", "I'll need it before I continue.") leaves the question standing. A line
// that points at where the answer lives ("You can copy it from the dashboard.") or waits is never an answer.
const POINTER = /^(?:you(?:'ll| will| can| could| may| might| should)\b|it(?:'s| is)? (?:in|under|at|on|from|listed|shown|inside|found)\b|this (?:is|can be|will be) (?:in|under|found|listed)\b|(?:put|add|copy|paste|type|tell|reply|answer|send|give|share|open|go|look|check|find|set|enter|use|just|then|or|e\.g)\b|(?:in|under|on|from|at|inside) (?:the|your|a)\b|(?:once|when|after|as soon as|if|thanks?|thank you|let me know)\b|i(?:'ll| will| am|'m) (?:wait|waiting|pause|paused|stop|stopped|carry|continue)|i (?:need|can't|cannot|could not|couldn't|don't have|do not have)\b)/i;
const ANSWER = /^(?:(?:yes|yep|yeah|no|nope|not yet|not really)\b|it (?:is|was|does|did|has|had|works?|worked|passes|passed|fails?|failed|ran|runs)\b|it's (?!in\b|under\b|at\b|on\b|from\b)|the [^.!?]*\b(?:is|was|are|were|passes|passed|fails|failed|works|worked|ran|runs|has|have|had)\b(?! (?:needed|required|missing))|(?:all |the )?(?:tests?|checks?|builds?) (?:pass|passed|fail|failed|ran|run)\b|i (?:changed|used|set|added|fixed|updated|made|chose|picked|went|ran|found|removed|created|wrote|checked|looked|renamed|moved|installed|switched|kept|left)\b|that (?:is|was|means|worked)\b|there (?:is|are|was|were)\b|because\b|so (?:it|the|I)\b)/i;
const isAnswer = (s: string) => { const t = bare(s); return !POINTER.test(t) && !(QUESTION_END.test(s) && isOffer(t)) && ANSWER.test(t); };
const isPointer = (s: string) => !isAnswer(s);

// The last of the message's last three sentences that is a question for the person (the question, then a line or two on
// where to find the answer), with the sentence before it. A question followed by Claude's own answer is no question.
function lastQuestion(text: string): { q: string; before: string } | null {
  const last = sentencesOf(text).slice(-3);
  for (let i = last.length - 1; i >= 0; i--) {
    const q = bare(last[i]);
    if (QUESTION_END.test(last[i]) && !isOffer(q) && last.slice(i + 1).every(isPointer)) return { q, before: i > 0 ? bare(last[i - 1]) : "" };
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
  return !!l && (asksLeave(l.q) || THEIRS.test(`${l.before} ${l.q}`));
}

/** The agent's last words as the receipt carries them: secrets hidden, spaces folded, clipped by whole characters. The
 *  question is the last line of the message, so words that ask the person keep their end ("…" then the tail, from a word
 *  start); any other message keeps its start. */
export function saidLine(text: string): string {
  const flat = redact(String(text ?? "")).replace(/\s+/g, " ").trim();
  const chars = Array.from(flat);
  if (chars.length <= MAX_SAID_CHARS) return flat;
  if (!asksPerson(text)) return `${clip(flat, MAX_SAID_CHARS - 1).trimEnd()}…`;
  const tail = chars.slice(chars.length - (MAX_SAID_CHARS - 1)).join("");
  const space = tail.indexOf(" ");
  return `…${(space >= 0 && space < 40 ? tail.slice(space + 1) : tail).trimStart()}`;
}
