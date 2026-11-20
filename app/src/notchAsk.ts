// M114 (docs/milestones/M114-approve-from-notch.md): approve and answer from the notch, as words and steps. The engine says
// toolask.request (runner/src/toolask.ts) for a permission request of the person's own AI tool, or a question Claude Code asks
// them; here it becomes the card's words, and a question card goes one question at a time. Pure; notchAsk.tsx draws it in the
// notch's question list. Nothing here answers anything: every answer is the person's press (commands.ts answerToolAsk).
import { parseEvent, PROTOCOL_VERSION, type ToolAskRequest } from "../../protocol/index.ts";
import type { Model } from "./model.ts";
import { S } from "./strings.ts";

/** What the model keeps of an ask: the card's words, and when its wait ends. */
export type ToolAsk = Omit<ToolAskRequest, "v" | "id" | "ts" | "type">;
/** At most this many waiting asks are kept (the engine waits on at most 8). */
export const ASKS_KEPT = 8;
/** The notch shows one card at a time (it has room for one question's choices), oldest first; the rest are counted. */
export const ASKS_SHOWN = 1;

/** An ask, only when the protocol allows it (the card's words within their limits, nothing of the tool's request). */
export function toolAskFrom(e: unknown): ToolAsk | null {
  const o = e as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || o.type !== "toolask.request") return null;
  const { v: _v, id: _id, ts: _ts, ...rest } = o;
  const r = parseEvent(JSON.stringify({ ...rest, v: PROTOCOL_VERSION, id: "ask" }));
  if (!r.ok) return null;
  const { v: _v2, id: _id2, ts: _ts2, type: _type, ...ask } = r.msg as unknown as ToolAskRequest;
  return ask;
}

/** The asks still waiting, oldest first: an ask whose wait is over is not shown even before the engine says so. */
export function waitingAsks(m: Pick<Model, "toolAsks">, now: number): ToolAsk[] {
  return (m.toolAsks ?? []).filter((a) => !(Date.parse(a.expiresAt) <= now));
}

const toolName = (t: ToolAsk["tool"]): string => S.doneSignal.tool[t];
const projectName = (p: string): string => p.split("/").filter(Boolean).pop() ?? p;

export type AskButton = "deny" | "always" | "allow";
export type AskCard = {
  title: string;
  /** The command, the file or the site, drawn in code type under the title (null for a plan or a question). */
  target: string | null;
  where: string;
  /** The rule Always allow saves, and the line that says so before any press (null where there is no Always). */
  always: string | null;
  alwaysLine: string | null;
  /** The buttons of a permission or plan card, in the order drawn (the main one last). Empty for a question. */
  buttons: AskButton[];
  labels: Record<AskButton, string>;
  inTool: string;
  inToolSay: string;
  /** What VoiceOver hears for the card. */
  say: string;
  questions: NonNullable<ToolAsk["questions"]> | null;
  /** "1 of 2" for a question card with more than one question; empty for one. */
  counter: (at: number) => string;
};

/** The card's words. */
export function askCard(a: ToolAsk): AskCard {
  const tool = toolName(a.tool), where = S.m114.inProject(projectName(a.project));
  const title = a.kind === "plan" ? S.m114.plan(tool) : a.kind === "question" ? S.m114.asks(tool) : S.m114.wants[a.action ?? "tool"](tool);
  const target = a.kind === "permission" && a.target ? a.target : null;
  const always = a.kind === "permission" && a.tool === "claude" && a.always ? a.always : null;
  const qs = a.kind === "question" && a.questions?.length ? a.questions : null;
  return {
    title, target, where, always, alwaysLine: always ? S.m114.alwaysLine(always) : null,
    buttons: qs ? [] : always ? ["deny", "always", "allow"] : ["deny", "allow"],
    labels: { deny: a.kind === "plan" ? S.m114.planNo : S.dontAllow, always: S.m114.always, allow: a.kind === "plan" ? S.m114.planYes : S.allow },
    inTool: S.m114.inTool(tool), inToolSay: S.m114.inToolSay(tool),
    say: `${title}${target ? `: ${target}` : ""}. ${where}.`,
    questions: qs,
    counter: (at: number) => (qs && qs.length > 1 ? S.m114.of(at + 1, qs.length) : ""),
  };
}

/** Where a question card is: the question shown, the picks of the questions before it, and (several allowed) the choices
 *  pressed so far on this one. */
export type AskStep = { at: number; picks: number[][]; chosen: number[] };
export const ASK_START: AskStep = { at: 0, picks: [], chosen: [] };
/** One press on a question card. A choice of a one pick question picks it and goes on; on a several pick question it is
 *  toggled, and Next (or Send on the last) goes on with what is chosen. Past the last question, `send` holds every pick. A
 *  press that is not a choice, or Next with nothing chosen, changes nothing. */
export function askStep(a: ToolAsk, st: AskStep, press: { pick: number } | { next: true }): { step: AskStep; send?: number[][] } {
  const qs = a.questions ?? [];
  const q = qs[st.at];
  if (!q) return { step: st };
  const goOn = (chosen: number[]): { step: AskStep; send?: number[][] } => {
    const picks = [...st.picks.slice(0, st.at), chosen];
    return st.at + 1 >= qs.length ? { step: { at: st.at, picks, chosen: [] }, send: picks } : { step: { at: st.at + 1, picks, chosen: [] } };
  };
  if ("pick" in press) {
    const i = press.pick;
    if (!Number.isInteger(i) || i < 0 || i >= q.options.length) return { step: st };
    if (!q.multi) return goOn([i]);
    const chosen = st.chosen.includes(i) ? st.chosen.filter((x) => x !== i) : [...st.chosen, i].sort((x, y) => x - y);
    return { step: { ...st, chosen } };
  }
  if (!q.multi || st.chosen.length === 0) return { step: st };
  return goOn(st.chosen);
}
