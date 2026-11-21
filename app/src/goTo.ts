// M115 (docs/milestones/M115-every-tool-and-jump.md): Go to the session that needs you. The engine says where each session of
// the person's own AI tools runs (tool.where: the app's own name, and whether its exact tab can be found), and the notch
// offers Go to on that tool's card and on its block in the live feed (working, or finished: M105). A press sends tool.jump, which names no app and
// no folder (the engine knows them). Pure, tested in m115.test.ts; notchAsk.tsx and notchFeed.tsx draw it.
import { DONE_SIGNAL_TOOLS, OWN_APP_TOOLS, type DoneSignalTool, type ToolJumped } from "../../protocol/index.ts";
import { S } from "./strings.ts";

export type SessionWhere = { app: string; tab: boolean };
export const whereKey = (project: string, tool: string) => `${tool}\u0000${project}`;

/** A tool.where event as the model keeps it, or null for anything the protocol does not allow. */
export function whereFrom(e: unknown): { project: string; tool: DoneSignalTool; app: string; tab: boolean } | null {
  const o = e as { type?: unknown; project?: unknown; tool?: unknown; app?: unknown; tab?: unknown } | null;
  if (!o || o.type !== "tool.where" || typeof o.project !== "string" || !o.project) return null;
  if (!(DONE_SIGNAL_TOOLS as readonly unknown[]).includes(o.tool) || typeof o.tab !== "boolean") return null;
  if (typeof o.app !== "string" || !o.app.trim() || Array.from(o.app).length > 80 || /[\u0000-\u001f]/.test(o.app)) return null;
  return { project: o.project, tool: o.tool as DoneSignalTool, app: o.app, tab: o.tab };
}

/** Where this tool's session in this project runs, if the engine has said. */
export const whereFor = (m: { toolWhere?: Record<string, SessionWhere> | null }, project: string, tool: string): SessionWhere | null => m.toolWhere?.[whereKey(project, tool)] ?? null;

export const goToLabel = (w: SessionWhere): string => S.m115.goTo(w.app);

/** M115 review: Go to on a feed block, with its words. With a session seen, its app. With none yet, a tool that is an app of
 *  its own (OWN_APP_TOOLS: Cursor, VS Code, Windsurf, Antigravity, Kiro, Zed, Xcode) is opened on the project, so its Go to
 *  shows at once, named for the tool. A tool that runs in a terminal has nothing to guess: no Go to until one of its hooks ran. */
export function goToFor(m: { toolWhere?: Record<string, SessionWhere> | null }, project: string, tool: DoneSignalTool): { text: string; say: string } | null {
  const toolName = S.doneSignal.tool[tool];
  const w = whereFor(m, project, tool);
  if (w) return { text: goToLabel(w), say: S.m115.goToSay(toolName, w.app) };
  return OWN_APP_TOOLS.includes(tool) ? { text: S.m115.goTo(toolName), say: S.m115.goToOpenSay(toolName) } : null;
}

/** Answer in the tool, on a card: with a session seen it also brings that app (and tab) to the front, so one press takes the
 *  person to where the tool asks itself. */
export function inToolButton(toolName: string, w: SessionWhere | null): { text: string; say: string; jump: boolean } {
  if (!w) return { text: S.m114.inTool(toolName), say: S.m114.inToolSay(toolName), jump: false };
  return { text: S.m115.answerIn(w.app), say: S.m115.answerInSay(toolName, w.app), jump: true };
}

/** M115 review: how long the line a Go to that did not go says stays (the same as the feed's own short line). */
export const JUMP_SAID_MS = 5000;
/** The line to show now for a Go to that did not go, with its project and tool, or null once JUMP_SAID_MS has passed. */
export function jumpSaidNow(m: { jumpSaid?: { project: string; tool: DoneSignalTool; why: "unknown" | "failed"; at: number } | null }, now: number): { project: string; tool: DoneSignalTool; text: string } | null {
  const j = m.jumpSaid;
  if (!j || now - j.at >= JUMP_SAID_MS || now < j.at - JUMP_SAID_MS) return null;
  const text = jumpLine({ tool: j.tool, ok: false, why: j.why });
  return text ? { project: j.project, tool: j.tool, text } : null;
}

/** What a Go to that did not go says: a plain next step. Nothing when it went. */
export function jumpLine(e: Pick<ToolJumped, "tool" | "ok" | "why">): string | null {
  if (e.ok) return null;
  const tool = S.doneSignal.tool[e.tool];
  return e.why === "failed" ? S.m115.jumpFailed(tool) : S.m115.jumpUnknown(tool);
}
