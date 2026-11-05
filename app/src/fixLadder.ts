// M58 (the shortlist, item 4): "Try 1 of 3" and the fixed ladder, shown on top of the engine's loop breaker (runner
// drive.ts stuckOptions). Pure: it reads only what the engine said (proof.result's tries and of, loop.stuck's rung) and
// two facts the page knows (Let tasks search the web, and Last working's time), so the card never guesses a limit.
import { S } from "./strings.ts";

export type Rung = "retry" | "research" | "lastWorking";
export type LadderRow = { id: Rung; words: string; current: boolean };

/** "Try 2 of 3" while the tries of one approach count up; past them (a different approach keeps counting checks) just
 *  "Try 4", never "4 of 3". Null when the engine did not say the limit. */
export function tryCounter(p: { tries?: number; of?: number } | null | undefined): string | null {
  if (!p || !Number.isInteger(p.tries) || (p.tries as number) < 1 || !Number.isInteger(p.of) || (p.of as number) < 1) return null;
  return (p.tries as number) <= (p.of as number) ? S.fix.tryOf(p.tries as number, p.of as number) : S.fix.tryN(p.tries as number);
}

/** The three quiet rows, the current one marked. Look up this exact error only when web search is on (hidden, not greyed,
 *  when off). With no Last working, its row says so plainly (Look deeper is offered instead, by Fix it). */
export function fixLadder(o: { rung?: Rung | null; webSearch: boolean; lastWorking: string | null }): LadderRow[] {
  // lastWorking: null = nothing saved yet; "" = a saved version whose time is not known (no bracket, never a placeholder).
  const at: Rung = o.rung === "research" && !o.webSearch ? "retry" : o.rung ?? "retry";
  const rows: LadderRow[] = [{ id: "retry", words: S.fix.ladder.retry, current: at === "retry" }];
  if (o.webSearch) rows.push({ id: "research", words: S.fix.ladder.research, current: at === "research" });
  rows.push({ id: "lastWorking", words: o.lastWorking === null ? S.fix.noLastWorking : o.lastWorking ? `${S.fix.ladder.lastWorking} (${o.lastWorking})` : S.fix.ladder.lastWorking, current: at === "lastWorking" });
  return rows;
}

/** The stuck card's option, in the page's own words when it knows the id (strings.ts), else the engine's label. */
export const optionWords = (o: { id: string; label: string }): string => S.fix.option[o.id] ?? o.label;

/** The rung the stuck card is on, from the choices it offers: the first one is the main button, and it is the same step as
 *  the ladder's current row, so the buttons and the rows can never point two ways (the engine already used its plain retries). */
export function stuckRung(options: { id: string; label?: string }[]): Rung {
  const first = options.find((o) => o.id === "different" || o.id === "research" || o.id === "lastWorking")?.id;
  return first === "research" || first === "lastWorking" ? first : "retry";
}

/** M58: after Put them back, the files back at Last working plan the next step (Look deeper), once. Stop everything
 *  disarms it first, so a restore that still lands after a stop never starts a model run (rules 11 and 13). Pure. */
export function backPlanStep(armed: boolean, ev: { type?: string; lastWorking?: boolean; project?: string } | null | undefined, here: string): { armed: boolean; plan: boolean } {
  if (ev?.type === "app.stop_everything") return { armed: false, plan: false };
  if (!armed || ev?.type !== "checkpoint.restored" || ev.lastWorking !== true) return { armed, plan: false };
  return { armed: false, plan: !!here && ev.project === here };
}
