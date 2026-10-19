// "Fixes it with you": what a follow up, a Try again and a different approach say to Claude. Plain, testable text.
// Each one runs as a task of its own (see AgentRunner.followUp); this file only holds the words.
import { clip, redact } from "./redact.ts";
import { triedLine, type LoopEnd } from "./drive.ts";

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
// The last task ended on a question to the person (asks.ts), so what they type next is their answer.
export const answerPrompt = (text: string) =>
  `The person answered your question:\n${said(text)}\n\nCarry on with the task. Keep the change small, and keep what already works.`;
export const freshAnswerPrompt = (goal: string, text: string) =>
  `${freshStart(goal)}\n\nYou asked the person a question, and they answered:\n${said(text)}\n\nCarry on with the task. Keep the change small, and keep what already works.`;

/** How the last attempt ended, so Try again never tells Claude something false about it. */
export type Ending = "failed_check" | "spending_limit" | "error" | "no_connection" | "claude_busy" | "asked" | "stopped" | "unfinished" | "finished";
/** From the task's status and its check: a check that failed is said first, even if the task then stopped. */
export const endingOf = (status: string, proof: string): Ending =>
  proof === "failed" ? "failed_check" : status === "error_max_budget_usd" ? "spending_limit" : status === "error" ? "error" : status === "no_connection" ? "no_connection" : status === "claude_busy" ? "claude_busy" : status === "needs_you" ? "asked" : status === "interrupted" ? "stopped" : status === "done" ? "finished" : "unfinished";
const ENDED: Record<Ending, string> = {
  failed_check: "The last attempt did not pass the checks.",
  spending_limit: "The last attempt stopped before it finished, because it reached its spending limit.",
  error: "The last attempt stopped before it finished, because of an error.",
  no_connection: "The last attempt stopped before it finished, because the connection to Claude dropped.",
  claude_busy: "The last attempt stopped before it finished, because Claude was busy.",
  asked: "The last attempt stopped to ask the person a question, and they want it tried again without an answer.",
  stopped: "The last attempt was stopped before it finished.",
  unfinished: "The last attempt stopped before it finished.",
  finished: "The last attempt finished, and the person wants it tried again.",
};
const RETRY_FIX = "Find the cause first, then make the smallest change that fixes it. Do not change or weaken the tests to make them pass.";
const RETRY_FINISH = "Look at what is already in the project, then finish the request with the smallest change that works. Do not change or weaken the tests.";
// Only a failed check has evidence to give.
const ended = (how: Ending, failure?: Failure) => `${ENDED[how]}${how === "failed_check" ? failedLines(failure) : ""}\n\n${how === "failed_check" ? RETRY_FIX : RETRY_FINISH}`;
export const retryPrompt = (goal: string, how: Ending, failure?: Failure) =>
  `Please try this again: ${clip(goal.trim(), MAX_FOLLOW_UP_CHARS)}\n\n${ended(how, failure)}`;
// goal: what the last turn was for; first: the conversation's first request (the same when there was no follow up).
export const freshRetryPrompt = (first: string, goal: string, how: Ending, failure?: Failure) =>
  `${freshStart(first)}${goal.trim() !== first.trim() ? `\n\nThen the person asked:\n${said(goal)}` : ""}\n\n${ended(how, failure)}`;

// How the tries ran out (drive.ts triedLine): the usual three identical failures say exactly what they always said.
export const differentTaskPrompt = (failure: Failure, end?: LoopEnd) =>
  `${triedLine(end)}${failedLines(failure)}\n\nTake a clearly different approach. Keep the change small.`;
export const freshDifferentTaskPrompt = (goal: string, failure: Failure, end?: LoopEnd) =>
  `${freshStart(goal)}\n\n${triedLine(end)}${failedLines(failure)}\n\nTake a clearly different approach. Keep the change small.`;
