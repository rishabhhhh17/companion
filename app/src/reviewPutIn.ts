// M107: Put it in on the review card (docs/milestones/M107-put-it-in.md). Plain code, tested in reviewPutIn.test.ts;
// reviewCard.tsx draws the button. The press is the shell's own Put it in of the hand off (handoff_put_in, M82): the light
// first, Accessibility asked the first time, the text typed only into a chat box the tool itself labels, never Return.
import { copyable } from "./copytext.ts";
import type { ToolId } from "./aiTools.ts";
import { LAST_TOOL_KEY, putCopied, type PutStage } from "./handoff.ts";
import { sendBackCopy, type ReviewCard } from "./review.ts";
import { S } from "./strings.ts";

/** The only tools Put it in may name: app tools with a chat box in a window. Never a terminal tool (Claude Code, Codex,
 *  Gemini CLI and the rest), where a new line could run the text. Codex waits for its app's real Mac check ([verify] c). */
export const PUT_IN_TOOLS = ["cursor", "copilot", "windsurf", "antigravity"] as const satisfies readonly ToolId[];
const isPutTool = (t: unknown): t is (typeof PUT_IN_TOOLS)[number] => (PUT_IN_TOOLS as readonly unknown[]).includes(t);

/** The text Put it in passes: exactly what Copy for my AI copies (the review's send back text, keys hidden again, through the
 *  Mac side's own check), or null when there is none. */
export function putInText(r: ReviewCard | null | undefined): string | null {
  const t = sendBackCopy(r);
  return t ? copyable(t) : null;
}

/** The tool Put it in names on this card, or null for none. The tool that finished (its done signal, M105) wins: the fix goes
 *  back to the tool that made the change, so a terminal tool gets none even when another was used here before. With no done
 *  signal, the tool last picked in this project (Have my AI do it). A background job is Claude Code's: none. */
export function putInTool(r: ReviewCard | null | undefined, last: unknown): ToolId | null {
  if (!r || r.job || !putInText(r)) return null;
  if (r.by) return isPutTool(r.by) ? r.by : null;
  return isPutTool(last) ? last : null;
}

/** The tool last picked in this project, from the page's own storage on this Mac (null when storage cannot be read). */
export function lastTool(project: string): string | null {
  try { return localStorage.getItem(LAST_TOOL_KEY(project)); } catch { return null; }
}

/** What the shell's answer means: the words said, whether the text was copied instead, and whether it reached the person's
 *  tool or clipboard (History says sent back then, as for Copy for my AI). */
export function putInAfter(stage: PutStage, name: string): { said: string; copied: boolean; sentBack: boolean } {
  return { said: S.review.put[stage](name), copied: putCopied(stage), sentBack: stage !== "stopped" };
}
