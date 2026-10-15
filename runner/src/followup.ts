// "Fixes it with you": what a follow up, a Try again and a different approach say to Claude. Plain, testable text.
// Each one runs as a task of its own (see AgentRunner.followUp); this file only holds the words.
import { clip, redact } from "./redact.ts";

/** A follow up is one line from the card. Anything longer is cut, so a pasted log cannot fill the conversation. */
export const MAX_FOLLOW_UP_CHARS = 2000;
export type Failure = { label: string; detail: string };

/** The failing step of the last check, as Claude is shown it: secrets hidden, and short. */
export const evidence = (f: Failure): Failure => ({ label: clip(redact(f.label).replace(/\s+/g, " ").trim(), 120), detail: clip(redact(f.detail).trim(), 1500) });
const failedLines = (f?: Failure) => {
  if (!f) return "";
  const e = evidence(f);
  return `\n\nFailed check: ${e.label}\nWhat happened: ${e.detail}`;
};
const said = (text: string) => clip(text.trim(), MAX_FOLLOW_UP_CHARS);
// Off the record nothing of the earlier conversation was saved, so a new turn starts afresh and is told what came before.
const freshStart = (goal: string) => `You were asked to do this in the project:\n${clip(goal.trim(), MAX_FOLLOW_UP_CHARS)}\n\nEarlier work on it may already be in the project's files, so look before you change anything.`;

export const followUpPrompt = (text: string) =>
  `The person has a follow up about the work you just did:\n${said(text)}\n\nKeep the change small, and keep what already works.`;
export const freshFollowUpPrompt = (goal: string, text: string) =>
  `${freshStart(goal)}\n\nThe person now says:\n${said(text)}\n\nKeep the change small, and keep what already works.`;

const RETRY_ASK = "Find the cause first, then make the smallest change that fixes it. Do not change or weaken the tests to make them pass.";
export const retryPrompt = (goal: string, failure?: Failure) =>
  `Please try this again: ${clip(goal.trim(), MAX_FOLLOW_UP_CHARS)}\n\nThe last attempt did not pass the checks.${failedLines(failure)}\n\n${RETRY_ASK}`;
// goal: what the last turn was for; first: the conversation's first request (the same when there was no follow up).
export const freshRetryPrompt = (first: string, goal: string, failure?: Failure) =>
  `${freshStart(first)}${goal.trim() !== first.trim() ? `\n\nThen the person asked:\n${said(goal)}` : ""}\n\nThe last attempt did not pass the checks.${failedLines(failure)}\n\n${RETRY_ASK}`;

const DIFFERENT = "The same check has failed three times in a row with the same problem, so the current approach is not working.";
export const differentTaskPrompt = (failure: Failure) =>
  `${DIFFERENT}${failedLines(failure)}\n\nTake a clearly different approach. Keep the change small.`;
export const freshDifferentTaskPrompt = (goal: string, failure: Failure) =>
  `${freshStart(goal)}\n\n${DIFFERENT}${failedLines(failure)}\n\nTake a clearly different approach. Keep the change small.`;
