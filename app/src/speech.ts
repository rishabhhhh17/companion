// Spoken replies, page side: the switch (off unless turned on) and which line, if any, goes with what the card shows.
// The Mac side says it with the built in voice and refuses anything unsafe; nothing here makes a sound.
import { leadMs } from "./sequence.ts";
import { receiptProofWords, waitsForAnswer, type Model } from "./model.ts";
import { S } from "./strings.ts";
import { keysIn, keysNow, type Keys } from "./keys.ts";
import { setting } from "./settingsStore.ts";

// Speak to me: talk.speak in the registry (T16), off unless turned on, read through settingsStore.ts.
export const speechOn = (): boolean => setting("talk.speak") === true;

type Walk = { id: string; index: number; variant: string; stage: string; say: string; note?: string } | null;
type ShowMe = { stage: string; message: string; req?: string; step?: number; of?: number } | null;

/** A line to say: `text` is the whole of it. `short`: with Say steps short (talk.shortSteps) on, the same step with its
 *  explanation left out, only when there is any to leave out; which of the two is said is decided after speakWhen
 *  (wordsToSay), since an answer said whole is said all of it. */
export type Line = { key: string; text: string; short?: string; delayMs?: number };

/** The one line to say for what is on the card right now, with a key so the same thing is said once. delayMs: wait this
 *  long before saying it (a step of a multi step answer is said when its pointer lands, after the lead in at the chosen
 *  pace). A lesson's words name the usual keys; they are said with the keys in use (`k`, the keys now unless given), as
 *  the card shows them. */
export function lineFor(m: { walk: Walk; showme: ShowMe }, k: Keys = keysNow(), pace?: unknown, short?: unknown): Line | null {
  // Say steps short, one at a time (talk.shortSteps): a step also carries its short line; anything else is said whole.
  const step = (key: string, t: string, wrap: (x: string) => string = (x) => x): Line => {
    const s = short === true ? shortLine(t) : "";
    return { key, text: wrap(t), ...(s && s !== t.replace(/\s+/g, " ").trim() ? { short: wrap(s) } : {}) };
  };
  const w = m.walk;
  if (w) {
    // While a lesson is on, only the lesson speaks (its ring's caption says nearly the same thing).
    if (w.stage === "step" || w.stage === "asking") return w.say ? step(`walk:${w.id}:${w.index}:${w.variant}`, keysIn(w.say, k)) : null;
    // After a pause: the step, then the question. Its own key, so "No, show me" says the step again as a step to do.
    if (w.stage === "already") return w.say ? step(`walk:${w.id}:${w.index}:already`, keysIn(w.say, k), (x) => `${x} ${S.lessonAlready}`) : null;
    if (w.stage === "help" && w.note) return { key: `walk:${w.id}:${w.index}:help`, text: keysIn(w.note, k) };
    if (w.stage === "done") return { key: `walk:${w.id}:done`, text: S.lessonDone };
    return null;
  }
  const s = m.showme;
  if (!s || !s.message) return null;
  const seq = typeof s.of === "number" && s.of > 1 && typeof s.step === "number";
  const key = `show:${s.req ?? ""}:${s.stage}${seq ? `:${s.step}` : ""}`;
  const lead = seq ? { delayMs: leadMs(pace) } : {};
  if (s.stage === "pointing") return { ...step(key, s.message), ...lead };
  if (s.stage === "pointing_roughly") return { ...step(key, s.message, (x) => `I think it is here. ${x}`), ...lead };
  if (["not_sure", "needs_permission", "error", "window_changed"].includes(s.stage)) return { key, text: s.message };
  return null;
}

/** The words to say for a line, once speakWhen has said it is said: the whole line when it is said as a whole answer
 *  (Answer out loud, to a question asked by voice; with Speak to me off that is the only way a line is said), otherwise
 *  the short line when there is one (Speak to me with Say steps short on). */
export const wordsToSay = (line: Line, when: { say: boolean; whole: boolean }): string => (when.whole || !line.short ? line.text : line.short);

// ---- Say steps short, one at a time (talk.shortSteps) ----
// A step is cut only at the end of a sentence, never inside one, and only when its first sentence says what to do and
// every sentence after it is explanation. Lesson writers put warnings, keys and second actions in later sentences
// ("If unsure, choose Private.", "Do not paste it anywhere else."), so any of those keeps the whole step.
/** Words that open what to do, after a lead in such as Then or Now. */
const ACTIONS = new Set([
  "click", "double", "double-click", "right", "right-click", "press", "tap", "open", "choose", "select", "pick", "type", "enter", "paste", "copy",
  "drag", "drop", "scroll", "go", "run", "sign", "log", "look", "find", "refresh", "reload", "leave", "keep", "use", "turn", "switch", "set", "save",
  "close", "wait", "check", "read", "add", "make", "hold", "put", "move", "hover", "download", "install", "restart", "start", "stop", "quit", "return",
  "follow", "visit", "share", "send", "delete", "remove", "rename", "allow", "accept", "confirm", "unpack", "unzip", "connect", "create", "fill",
  "write", "change", "edit", "name", "mark", "release", "unlock", "lock", "enable", "disable", "expand", "collapse", "view", "show", "hide", "try",
  "retry", "upload", "attach", "search", "zoom", "apply", "insert", "format", "resize", "crop", "give", "tick", "untick", "uncheck", "toggle",
  "export", "import", "print", "draw", "filter", "let", "ask", "answer", "tell", "reply", "swipe", "highlight", "place", "invite", "join", "do", "dont",
  "skip", "pause", "resume", "play", "sort", "pin", "unpin", "duplicate", "undo", "redo", "cut", "fix", "publish", "redeploy", "deploy", "push", "commit",
  // Less common openings of a second thing to do: it is said, never left out as explanation.
  "dismiss", "submit", "continue", "proceed", "approve", "ignore", "review", "grant", "launch", "decline", "reject", "cancel", "acknowledge",
  "authorize", "authorise", "finish", "finalize", "verify", "grab", "agree", "register", "subscribe", "unsubscribe", "navigate", "browse",
]);
/** Words that may come before the action ("Then click OK."). */
const LEADS = new Set(["then", "now", "next", "first", "finally", "also", "and", "so", "just"]);
/** Words that make a later sentence part of the step, never explanation: a warning, a limit, a condition, a check, or a
 *  question the app will put to the person ("Mail asks whether to apply it"). */
const KEEP = /\b(?:asks|whether|not|no|never|only|must|cannot|live|public|private|secret|secrets|password|passwords|key|keys|unsure|sure|careful|confirm|safe|warning|important|wait|before|after|until|unless|if|when|otherwise|instead|or)\b|n't\b/i;
/** Key names as the app writes them (keys.ts): a sentence that names one is never left out. */
const KEY_NAMES = /\b(?:Command|Control|Option|Shift|Return|Enter|Escape|Esc|Tab|Space|Fn|Delete)\b/;
/** The ends of sentences: a stop after a word (never a lone dot, as in "git add ."), then a space and a new sentence. */
const SENTENCE_END = /(?<=[^\s][.!?])\s+(?=["'(A-Z0-9])/;
const word = (w: string | undefined) => (w ?? "").toLowerCase().replace(/[^a-z-]/g, "");
/** The sentence's first word after any lead in. */
function opening(s: string): string {
  const ws = s.replace(/^[^A-Za-z]+/, "").split(" ");
  let i = 0;
  while (i < ws.length - 1 && LEADS.has(word(ws[i]))) i++;
  return word(ws[i]);
}
/** Whether a sentence says something to do: it opens with an action, or one follows a comma, a colon, "and", "then",
 *  "or" or "so" ("In Companion, choose Open from a link"). */
function asksToDo(s: string): boolean {
  if (ACTIONS.has(opening(s))) return true;
  for (const m of s.matchAll(/(?:[,;:]\s+|\s(?:and|then|or|so)\s+)((?:(?:then|now|next|first|finally|also|so|and|just)\s+)*)([A-Za-z-]+)/gi)) if (ACTIONS.has(word(m[2]))) return true;
  return false;
}
/** A step as one short spoken line: its first sentence, when that says what to do (it opens with an action and is not a
 *  question) and every sentence after it is only explanation (nothing to do, no warning, condition or limit, no key, no
 *  question). Otherwise the whole step, however long: a sentence is never cut. Only ever shorter than the words given, so
 *  it always fits in the step's time (sequence.ts lineMs). */
export function shortLine(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "";
  const [first, ...rest] = t.split(SENTENCE_END);
  if (!rest.length) return t;
  if (/\?\s*$/.test(first) || !ACTIONS.has(opening(first))) return t;
  if (rest.some((s) => asksToDo(s) || KEEP.test(s) || s.includes("?") || KEY_NAMES.test(s))) return t;
  return first;
}

// ---- Also say out loud (speak.alsoSay in Settings; nothing more unless chosen) ----
/** The extra short lines Speak to me may say: when something needs the person (a question to answer, the loop card, a
 *  pause, a plan) and when a task ends (taskEndLines). Fixed words only, never anything from the task or the question, so
 *  nothing secret looking is ever in them; the Mac side still refuses anything that looks secret and stays quiet during
 *  calls. Each has its own key, said once. */
export function alsoSayLines(m: Model, project: string, items: readonly string[]): { key: string; text: string }[] {
  const out: { key: string; text: string }[] = [];
  const n = S.alsoSay.needsYou;
  if (items.includes("needsYou")) {
    if (m.approvals.length) out.push({ key: `needs:approval:${m.approvals[0].id}`, text: n.approval });
    else if (m.agentsAsk) out.push({ key: "needs:agents", text: n.agents });
    else if (m.stuck) out.push({ key: `needs:stuck:${m.stuck.index}:${m.stuck.title}`, text: n.stuck });
    else if (m.paused) out.push({ key: `needs:paused:${m.paused.reason}`, text: n.paused });
    else if (m.plan) out.push({ key: `needs:plan:${m.plan.agent}:${m.plan.steps.length}`, text: n.plan });
    else if (waitsForAnswer(m)) out.push({ key: `needs:asks:${m.receipt?.checkpoint ?? ""}`, text: n.asks });
  }
  if (items.includes("taskDone")) out.push(...taskEndLines(m, project));
  return out;
}

/** When a task ends, said only once it has really ended: the agent's state that follows the receipt (agent.ts) says how.
 *  Done: what the proof really says (passed, some checks skipped, or not checked; never passed for a skipped check).
 *  Error: a failed check, or stopped before it was finished (the turns or the spending ran out); never "done" (rule 14).
 *  Stopped by the person (Stop, Stop everything), or after Stop everything, which forgets every agent's state: nothing.
 *  A Drive plan is one task to the person: its steps say nothing, and the plan says one line when it ends, unless it was
 *  stopped. A task asked for after the plan is its own task again. */
function taskEndLines(m: Model, project: string): { key: string; text: string }[] {
  const d = S.alsoSay.taskDone;
  const out: { key: string; text: string }[] = [];
  const f = m.drive?.finished;
  if (f && f.status !== "interrupted") {
    out.push({ key: `plan:${project}:${m.planCheckpoints.at(-1) ?? "none"}:${f.status}:${f.completed}/${f.total}`, text: f.status === "done" ? d.planDone : d.planStopped });
  }
  const r = m.receipt;
  if (!r?.checkpoint || !m.task || m.planCheckpoints.includes(r.checkpoint)) return out;
  const state = m.agents[m.task.agent];
  const p = r.proof;
  const text = state === "done" ? (p === "passed" ? d.passed : p === "partial" ? d.gaps : p === "failed" ? d.failed : d.none)
    : state === "error" ? (p === "failed" ? d.failed : d.stopped) : null;
  if (text) out.push({ key: `receipt:${project}:${r.checkpoint}`, text });
  return out;
}

// ---- answers said out loud for a question asked by voice (M11 wave 4, item 2; off by default, T13) ----
// Answer out loud: talk.speakReplies in the registry, read the same way.
export const repliesOn = (): boolean => setting("talk.speakReplies") === true;

/** How long after a question asked by voice was sent its answer still counts as the answer to it. */
export const VOICE_ASK_MS = 10 * 60 * 1000;
/** What a question sent from the box asks for: a task (its answer is the result), a research answer, a Show me, a plan. */
export type AskKind = "task" | "research" | "showme" | "plan";
/** The last question sent while the box held words from hold to talk, and when. null: the last one was typed or pressed.
 *  req: for a Show me, its own request, once its "Finding it" has named it (followVoiceShowMe). */
export type VoiceQuestion = { kind: AskKind; at: number; req?: string } | null;
/** Whether an answer of this kind is the answer to the question asked by voice: the same kind, within ten minutes. */
export const askedByVoice = (q: VoiceQuestion, kind: AskKind, nowMs: number): boolean =>
  q !== null && q.kind === kind && nowMs >= q.at && nowMs - q.at < VOICE_ASK_MS;
/** Which question a spoken line (lineFor) answers: a Show me line answers the Show me request its key names (empty when it
 *  names none: Point at the problem, a hint, a window that changed); a lesson's line answers none. */
export function lineAnswers(key: string): { kind: AskKind; req: string } | null {
  return key.startsWith("show:") ? { kind: "showme", req: key.split(":")[1] ?? "" } : null;
}
/** Whether a Show me request is the one the person asked for by voice: its own request, within ten minutes. Only that
 *  answer's lines are its answer; any other line that shows meanwhile is not. */
export const voiceShowMe = (q: VoiceQuestion, req: string, nowMs: number): boolean =>
  askedByVoice(q, "showme", nowMs) && !!q?.req && q.req === req;
/** Whether a spoken line (by its lineFor key) is the answer to the question asked by voice. */
export function lineByVoice(q: VoiceQuestion, key: string, nowMs: number): boolean {
  const a = lineAnswers(key);
  return a !== null && a.kind === "showme" && voiceShowMe(q, a.req, nowMs);
}
/** How a Show me asked by voice is ended. Not "done": the last step said in words takes the pointer away first and its
 *  words come after, and they are still its answer. */
const SHOWME_ENDS = ["your_turn_done", "done_for_you", "error", "needs_permission", "window_changed"];
/** A Show me asked by voice, as Show me's own events arrive (app.showme, and assist.error for a request): it takes the
 *  request the first "Finding it" after it names, and it ends when that answer ends (the click, Do it for me, an error, a
 *  missing permission, a window that changed) or another question takes the pointer (another request's "Finding it").
 *  A question of another kind is left alone. */
export function followVoiceShowMe(q: VoiceQuestion, ev: unknown): VoiceQuestion {
  if (!q || q.kind !== "showme" || typeof ev !== "object" || ev === null) return q;
  const e = ev as { type?: unknown; stage?: unknown; req?: unknown };
  const req = typeof e.req === "string" ? e.req : "";
  if (e.type === "assist.error") return req && req === q.req ? null : q;
  if (e.type !== "app.showme" || typeof e.stage !== "string") return q;
  if (e.stage === "thinking" && req.startsWith("sm_")) return q.req === undefined ? { ...q, req } : q.req === req ? q : null;
  return SHOWME_ENDS.includes(e.stage) ? null : q;
}

/** Whether to say something, and whether as a whole answer: "Speak to me" says short lines; "Answer out loud" says the
 *  whole short answer, and only to a question the person asked by voice. */
export function speakWhen(o: { speech: boolean; replies: boolean; byVoice: boolean }): { say: boolean; whole: boolean } {
  const whole = o.replies && o.byVoice;
  return { say: o.speech || whole, whole };
}

export type Reply = { key: string; text: string; kind: AskKind };
/** The answers on the card now: a finished task's result and a research answer, one key each, so each is said once.
 *  Show me's answers are lineFor's. A rescue is started by its button, never by voice, so it is not here. `project`: the
 *  card's project, part of each key, since checkpoints and research notes are numbered and named per project (each
 *  project's first task ends with cp_0001). */
export function repliesIn(m: Model, project: string): Reply[] {
  const out: Reply[] = [];
  if (m.receipt?.checkpoint) out.push({ key: `receipt:${project}:${m.receipt.checkpoint}`, text: receiptProofWords(m), kind: "task" });
  // Each answer by its own number (n): one asked off the record has no file, and two such answers must not share a key.
  if (m.research?.answer) out.push({ key: `research:${project}:${m.research.n ?? m.research.file}`, text: m.research.answer, kind: "research" });
  return out;
}
/** The answer that was not on the card before (an older one may still be shown beside it), or null. */
export function newReply(all: Reply[], seen: ReadonlySet<string>): Reply | null {
  return all.find((r) => !seen.has(r.key)) ?? null;
}

/** What the app answered to "speak": when the Mac's sound is off nothing was said, and the first time the card says so. */
export function spokenNote(r: unknown): string | null {
  const o = (typeof r === "object" && r !== null ? r : {}) as Record<string, unknown>;
  return o.said === false && o.why === "sound" && o.tell === true ? S.soundOffSaid : null;
}
