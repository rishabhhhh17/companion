// M87: the pages' side of Why is live broken? (runner/src/ship/livecheck.ts does the reading). Pure: the state from the
// engine's events, each part in words (strings.ts whyLive), the one line at the top, and Copy for my AI. Nothing here
// starts work; the check runs only on the person's press (card.tsx).
import { LIVE_PARTS, LIVE_STATES, LIVE_WHY, type LivePart } from "../../protocol/index.ts";
import { S } from "./strings.ts";

/** interrupted: the helper restarted or went away mid check, so no final answer will come (the review of M87). */
export type WhyLiveStage = "asked" | "running" | "done" | "stopped" | "interrupted";
/** from: which panel's button started it, so the result shows right below that button. before: offered before anything
 *  is live (Ready to go live?), so it carries the pre launch words. reason: why nothing ran (the engine's code). */
export type WhyLive = { project: string; stage: WhyLiveStage; parts: LivePart[]; liveUrl?: string; from?: "gates" | "online"; reason?: "not_set_up" };
const busyStage = (s: WhyLiveStage) => s === "asked" || s === "running";

/** A part the pages may show: one of the four, a known state and a reason that part can give. Anything else is dropped. */
export function partOk(p: unknown): p is LivePart {
  const o = p as Record<string, unknown> | null;
  return !!o && typeof o === "object" && (LIVE_PARTS as readonly unknown[]).includes(o.id) && (LIVE_STATES as readonly unknown[]).includes(o.state)
    && (LIVE_WHY[o.id as LivePart["id"]] as readonly unknown[]).includes(o.why);
}

export function whyLiveReduce(w: WhyLive | null | undefined, e: { type: string; [k: string]: unknown }): WhyLive | null {
  const cur = w ?? null;
  switch (e.type) {
    case "ui.whyLiveAsked": {
      // Check again keeps the panel where it was; a first press says which panel it came from.
      const from = e.from === "gates" || e.from === "online" ? e.from : cur && cur.project === e.project ? cur.from : undefined;
      return { project: String(e.project ?? ""), stage: "asked", parts: [], ...(from ? { from } : {}) };
    }
    case "ui.whyLiveClosed": return null;
    case "ship.whyLive": {
      // Only the check this page asked for: an event for another project is not this one's answer.
      if (!cur || cur.project !== e.project) return cur;
      const stage = e.stage === "done" || e.stage === "stopped" || e.stage === "running" ? e.stage : null;
      if (!stage) return cur;
      const parts = Array.isArray(e.parts) ? e.parts.filter(partOk) : [];
      // A stop that names no parts keeps what was already shown.
      // A late answer after the helper restarted is not taken: that check was already ended on the page.
      if (cur.stage === "interrupted") return cur;
      return { project: cur.project, stage, parts: stage === "stopped" && !parts.length ? cur.parts : parts, ...(typeof e.liveUrl === "string" ? { liveUrl: e.liveUrl } : cur.liveUrl ? { liveUrl: cur.liveUrl } : {}),
        ...(cur.from ? { from: cur.from } : {}), ...(e.reason === "not_set_up" ? { reason: "not_set_up" as const } : {}) };
    }
    case "app.stop_everything": return cur && busyStage(cur.stage) ? { ...cur, stage: "stopped" } : cur;
    // The helper restarted or went away: no final answer will come, so the panel stops waiting, and says why.
    case "app.runner_restarted": case "app.runner_down": return cur && busyStage(cur.stage) ? { ...cur, stage: "interrupted" } : cur;
    case "ui.projectChanged": return null;
    default: return cur;
  }
}

export type PartView = { id: LivePart["id"]; title: string; state: LivePart["state"] | "waiting"; mark: string; line: string; next?: string; where?: string[] };

/** One part in words. A missing value is named with the file and line that reads it. */
export function partView(p: LivePart): PartView {
  const say = (S.whyLive.say as Record<string, Record<string, (x: LivePart) => { line: string; next?: string }>>)[p.id]?.[p.why];
  const w = say ? say(p) : { line: S.whyLive.say.env.failed!(p).line };
  return { id: p.id, title: S.whyLive.parts[p.id]!, state: p.state, mark: S.whyLive.marks[p.state]!, line: w.line, ...(w.next ? { next: w.next } : {}),
    ...(p.where?.length ? { where: p.where.map((x) => `${x.name}: ${S.whyLive.at(x.file, x.line)}`) } : {}) };
}

/** Every part in order: the ones done, then the ones still waiting while it runs. */
export function partViews(w: WhyLive): PartView[] {
  const done = new Map(w.parts.map((p) => [p.id, p]));
  const busy = busyStage(w.stage);
  return LIVE_PARTS.flatMap((id) => {
    const p = done.get(id);
    if (p) return [partView(p)];
    return busy ? [{ id, title: S.whyLive.parts[id]!, state: "waiting" as const, mark: S.whyLive.marks.waiting!, line: "" }] : [];
  });
}

/** The one line at the top. */
export function whyLiveHeadline(w: WhyLive): string {
  if (busyStage(w.stage)) return S.whyLive.running;
  if (w.stage === "stopped") return S.whyLive.stopped;
  if (w.stage === "interrupted") return S.whyLive.interrupted;
  if (w.reason === "not_set_up") return S.whyLive.notSetUp;
  const broken = w.parts.filter((p) => p.state === "problem").length;
  if (broken) return S.whyLive.problems(broken);
  // Nothing ran to an answer: never a partial all clear (the review of M87).
  if (!w.parts.some((p) => p.state === "ok")) return S.whyLive.nothingChecked;
  return w.parts.some((p) => p.state === "skipped" && !["not_used", "no_private_pages"].includes(p.why) || p.state === "could_not") ? S.whyLive.noneButSkipped : S.whyLive.noneFound;
}

/** The live address box shows when the pages part needs one, or the person may want to try another. */
export const needsAddress = (w: WhyLive): boolean => !busyStage(w.stage) && w.parts.some((p) => (p.id === "pages" && p.why === "no_address") || (p.id === "stripe" && p.why === "endpoint_unknown"));

/** Only a plain https address with a dot in its name, as the engine takes it (protocol ship.whyLive url). */
export function addressOk(raw: string): string | null {
  const t = raw.trim();
  if (!/^https:\/\/[^\s/]+\.[^\s/]+/i.test(t) || t.length > 500) return null;
  try { const u = new URL(t); return u.username || u.password ? null : u.origin; } catch { return null; }
}

/** Copy for my AI: what is broken first, each with its next step and the place in the code, then what could not be
 *  checked, then the ask. Names only: no value is ever known here. Empty until there is something to say. */
export function whyLiveCopy(w: WhyLive, project: string): string {
  if (busyStage(w.stage) || !w.parts.length) return "";
  const views = w.parts.map(partView);
  const broken = views.filter((v) => v.state === "problem");
  const unsure = views.filter((v) => v.state === "could_not" || (v.state === "skipped" && !["not_used", "no_private_pages", "none_in_code"].includes(w.parts.find((p) => p.id === v.id)!.why)));
  if (!broken.length && !unsure.length) return "";
  const lines = [S.whyLive.copyHead(project), ""];
  for (const v of broken) {
    lines.push(`- ${v.title}: ${v.line}`);
    for (const x of v.where ?? []) lines.push(`  ${x}`);
    if (v.next) lines.push(`  ${S.whyLive.next(v.next)}`);
  }
  if (unsure.length) {
    if (broken.length) lines.push("");
    lines.push(S.whyLive.copyNotChecked);
    for (const v of unsure) lines.push(`- ${v.title}: ${v.line}`);
  }
  lines.push("", S.whyLive.copyAsk);
  return lines.join("\n");
}
