// Tokenization reduction (docs/milestones + the M121 follow on): the pure helpers that keep a conversation's context
// small before it goes to the model, so the same task does not pay for every old turn it has ever had. Nothing here talks
// to a network or the model: the lanes decide when to trim and what to keep, and this only says how much the context has.
// Prototype: the helpers are real and tested, the wiring into the lanes is the next step.

/** One turn a lane can send: the conversation's own words, never a system prompt. */
export type ReduceableMessage = { role: "user" | "assistant"; content: string };

/** Rough characters to tokens, for a first cut before the model's own count is read back. */
export const roughTokens = (text: string): number => Math.max(0, Math.ceil(text.length / 4));

/** The whole context a lane sends: the system prompt plus the turns, in the order they go in. */
export const totalTokens = (messages: readonly ReduceableMessage[], system = ""): number =>
  roughTokens(system) + messages.reduce((n, m) => n + roughTokens(m.content), 0);

/**
 * Keep the newest turns of a conversation, dropping the oldest that no longer fit the cap. Pure: it returns a new array
 * and never mutates what it was given. The newest turn is kept unless it is an assistant turn with no turn of the
 * person's before it in what fits: the list never starts with an assistant turn, so it may come back empty.
 */
export function trimHistory(messages: readonly ReduceableMessage[], keepLast: number, maxTokens: number, system = ""): ReduceableMessage[] {
  const floor = Math.min(Math.max(1, keepLast), messages.length);
  let kept = [...messages].slice(-floor);
  while (kept.length > 1 && roughTokens(system) + kept.reduce((n, m) => n + roughTokens(m.content), 0) > maxTokens) kept = kept.slice(1);
  // The Messages API needs the first turn to be the person's: leading assistant turns go (the list may then be empty).
  while (kept.length && kept[0]!.role === "assistant") kept = kept.slice(1);
  return kept;
}
