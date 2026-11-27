// M123 slice 5: a receipt shared as a link, as the share preview shows it. Only what the engine said (receipt.shared): the link
// is on Squibby's own server, lasts 30 days, and can be deleted. Plain words for every outcome.
import { S } from "./strings.ts";

export type LinkState =
  | { stage: "none" } | { stage: "making" } | { stage: "deleting"; id: string }
  | { stage: "made"; id: string; url: string; expiresAt: string }
  | { stage: "removed" } | { stage: "failed"; reason: string; say?: string };

const ID = /^[A-Za-z0-9_-]{22}$/;

/** The share preview's next state from one runner event, or null when the event is not a receipt.shared answer to a press. */
export function sharedFrom(e: unknown): LinkState | null {
  const v = e as { type?: unknown; last?: Record<string, unknown> } | null;
  if (!v || v.type !== "receipt.shared" || !v.last || typeof v.last !== "object") return null;
  const l = v.last;
  if (l.ok === true && typeof l.removed === "string") return { stage: "removed" };
  if (l.ok === true && typeof l.url === "string" && typeof l.expiresAt === "string") {
    let u: URL; try { u = new URL(l.url); } catch { return { stage: "failed", reason: "bad_answer" }; }
    const id = u.pathname.split("/").pop() ?? "";
    if (u.protocol !== "https:" || !u.pathname.startsWith("/r/") || !ID.test(id)) return { stage: "failed", reason: "bad_answer" };
    return { stage: "made", id, url: u.href, expiresAt: l.expiresAt };
  }
  return { stage: "failed", reason: typeof l.reason === "string" ? l.reason : "refused", ...(typeof l.say === "string" ? { say: l.say.slice(0, 200) } : {}) };
}

export function linkWords(s: LinkState): string {
  const w = S.m123.link;
  if (s.stage === "making") return w.making;
  if (s.stage === "deleting") return w.deleting;
  if (s.stage === "made") return w.made(new Date(s.expiresAt).toLocaleDateString(undefined, { day: "numeric", month: "short" }));
  if (s.stage === "removed") return w.removed;
  if (s.stage === "failed") return s.reason === "signIn" ? w.signIn : s.reason === "offline" ? w.offline : s.say ? s.say : w.failed;
  return "";
}
