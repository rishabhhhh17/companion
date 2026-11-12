// M82, Part 2: hand Squibby the job. The hand off card's states as one pure reducer, and the commands each press sends, so
// every rule is tested without a page (m82.test.ts); handoffCard.tsx draws it.
//   writing the prompt -> ready for a tool -> (Claude Code: Run it, through agent.start, the usual task path)
//                                          -> (another tool: Put it in, or Copy) -> waiting for the tool -> reviewed
//   Stop everything ends the writing, the putting in and the wait (stopped). Close leaves at any time.
// Only Claude Code, Squibby's own engine, is ever given a task (agent.start). For every other tool nothing is sent to the
// engine but the prompt help request: the person's own tool does the work, and the usual review checks it after.
import type { Command } from "../../protocol/index.ts";
import { startTask } from "./commands.ts";
import type { ToolId } from "./aiTools.ts";

/** What Put it in answered (the shell's stages, aitools.rs STAGES), plus failed for a press the shell refused. */
export const PUT_STAGES = ["typed", "notOpen", "notFront", "noBox", "refused", "needsPermission", "stopped", "hidden", "copied", "failed"] as const;
export type PutStage = (typeof PUT_STAGES)[number];

export type Handoff =
  | { stage: "idle" }
  | { stage: "writing"; tool: ToolId; words: string; req: string }
  | { stage: "ready"; tool: ToolId; words: string; prompt: string; diff: [string, string][]; own: boolean }
  | { stage: "putIn"; tool: ToolId; prompt: string }
  | { stage: "waiting"; tool: ToolId; prompt: string; put: PutStage | "copiedByHand"; signal: boolean }
  | { stage: "reviewed"; tool: ToolId }
  | { stage: "stopped"; tool: ToolId };
export const IDLE: Handoff = { stage: "idle" };

export type Action =
  /** Have my AI do it, with the words in the box and the tool picked. improve: write a clear prompt first (handoff.improve). */
  | { type: "ask"; tool: ToolId; words: string; req: string; improve: boolean }
  /** An event from the engine or the shell, for this project. */
  | { type: "event"; e: unknown; project: string }
  /** The person changed the prompt. */
  | { type: "edit"; prompt: string }
  /** The person picked another tool while the prompt is ready. */
  | { type: "pick"; tool: ToolId }
  /** Put it in <tool> was pressed (another tool only). */
  | { type: "putIn" }
  /** The shell's answer to Put it in. */
  | { type: "putResult"; stage: PutStage }
  /** Copy was pressed (another tool only). */
  | { type: "copied" }
  /** Run it was pressed (Claude Code only): the task goes through agent.start and the usual task card takes over. */
  | { type: "run" }
  /** Whether the tool's done signal is connected in this project (from donesignal.state). */
  | { type: "signal"; on: boolean }
  | { type: "close" };

/** The words a stage of Put it in leads to: everything but typed means the prompt was copied instead. */
export const putCopied = (s: PutStage | "copiedByHand"): boolean => s !== "typed" && s !== "stopped";

const isReq = (e: Record<string, unknown>, req: string) => e.req === req;

export function reduce(h: Handoff, a: Action): Handoff {
  if (a.type === "close") return IDLE;
  if (a.type === "ask") {
    const words = a.words.trim();
    if (!words) return h;
    return a.improve ? { stage: "writing", tool: a.tool, words, req: a.req } : { stage: "ready", tool: a.tool, words, prompt: words, diff: [], own: true };
  }
  if (a.type === "event") {
    const e = (a.e ?? {}) as Record<string, unknown>;
    // Stop everything ends whatever is in hand.
    if (e.type === "app.stop_everything" && (h.stage === "writing" || h.stage === "putIn" || h.stage === "waiting")) return { stage: "stopped", tool: h.tool };
    if (h.stage === "writing") {
      if (e.type === "assist.prompt.done" && isReq(e, h.req) && typeof e.text === "string" && e.text.trim()) {
        const diff = Array.isArray(e.diff) ? (e.diff as unknown[]).filter((d): d is [string, string] => Array.isArray(d) && d.length === 2 && typeof d[0] === "string" && typeof d[1] === "string") : [];
        return { stage: "ready", tool: h.tool, words: h.words, prompt: e.text, diff, own: false };
      }
      // No clearer prompt (Claude out of reach, the day's limit, Prompt help off): the person's own words, said so.
      if ((e.type === "assist.error" && isReq(e, h.req)) || (e.type === "assist.prompt.done" && isReq(e, h.req))) return { stage: "ready", tool: h.tool, words: h.words, prompt: h.words, diff: [], own: true };
      return h;
    }
    // The tool finished: the review of this project's changes begins (at once with a done signal, after the quiet time
    // without), and the usual review card takes over.
    if (h.stage === "waiting" && (e.type === "review.batch" || e.type === "review.started") && e.project === a.project) return { stage: "reviewed", tool: h.tool };
    return h;
  }
  if (a.type === "edit") return h.stage === "ready" ? { ...h, prompt: a.prompt } : h;
  if (a.type === "pick") return h.stage === "ready" ? { ...h, tool: a.tool } : h;
  if (a.type === "putIn") return h.stage === "ready" && h.tool !== "claude" && h.prompt.trim() ? { stage: "putIn", tool: h.tool, prompt: h.prompt } : h;
  if (a.type === "putResult") {
    if (h.stage !== "putIn") return h;
    if (a.stage === "stopped") return { stage: "stopped", tool: h.tool };
    return { stage: "waiting", tool: h.tool, prompt: h.prompt, put: a.stage, signal: false };
  }
  if (a.type === "copied") return h.stage === "ready" && h.tool !== "claude" && h.prompt.trim() ? { stage: "waiting", tool: h.tool, prompt: h.prompt, put: "copiedByHand", signal: false } : h;
  if (a.type === "run") return h.stage === "ready" && h.tool === "claude" && h.prompt.trim() ? IDLE : h;
  if (a.type === "signal") return h.stage === "waiting" ? { ...h, signal: a.on } : h;
  return h;
}

/** What a press sends, decided from the state before it. Have my AI do it with a clear prompt asks Prompt help's own rewrite
 *  (prompt: the shell sends assist.prompt itself, for the project open in Home, so its house rules come along; a page never
 *  names a folder for it). Run it, for Claude Code only, is the usual task (task: agent.start). Nothing else ever sends the
 *  engine a task. */
export type Effect = { kind: "prompt"; tool: ToolId; text: string; req: string } | { kind: "task"; cmd: Command };
export function effectsFor(h: Handoff, a: Action, project: string): Effect[] {
  if (a.type === "ask" && a.improve && a.words.trim() && project) return [{ kind: "prompt", tool: a.tool, text: a.words.trim(), req: a.req }];
  if (a.type === "run" && h.stage === "ready" && h.tool === "claude" && h.prompt.trim() && project) return [{ kind: "task", cmd: startTask(project, h.prompt.trim()) }];
  return [];
}

/** The tool Have my AI do it uses in this project: the one last used here if it can still be picked, else Claude Code. */
export function toolFor(last: unknown, offered: readonly ToolId[]): ToolId {
  return typeof last === "string" && (offered as readonly string[]).includes(last) ? (last as ToolId) : offered[0] ?? "claude";
}
/** The tools Have my AI do it offers: Claude Code (Squibby's own engine) always, then each tool found on this Mac. */
export function offeredTools(here: readonly ToolId[]): ToolId[] { return ["claude", ...here.filter((t) => t !== "claude")]; }
/** Where the last tool is kept, per project, on this Mac only (the page's own storage). */
export const LAST_TOOL_KEY = (project: string) => `companion.handoffTool:${project}`;
