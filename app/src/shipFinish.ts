// M58 UI 6 and UI 13, as plain code (tested in shipFinish.test.ts; shipPanels.tsx draws it):
//  - going live has a finish line: once every gate passed, the check before going live has one main button, Put it online
//    (card.tsx shipOnline: the Pro gate, then ship.preview, which reuses the check that just passed on this exact version).
//    A blocked gate gets its own Fix it, an ordinary checked fix of what that gate found; the panel stays on screen until
//    the task's first event takes its place.
//  - signing in to Vercel is a step the person starts, without Terminal (runner/src/ship/signin.ts). The page opens only
//    Vercel's own page, and only after their press; going online again afterwards is their next press, never a timer.
import type { Command } from "../../protocol/index.ts";
import { fixFound } from "./commands.ts";
import type { ShipFlow } from "./model.ts";

export type Gate = { id: string; label: string; status: "passed" | "blocked" | "could_not_check" | "not_applicable"; detail: string; findings?: string[]; overridable?: boolean };

/** Put it online is the panel's main button: every gate passed (or is not needed), the engine says it may ship, and this
 *  is not a practice copy (a practice is never put on the internet). */
export function putOnlineShown(ship: { gates: Gate[]; canShip: boolean } | null | undefined, practice: boolean): boolean {
  if (!ship || practice || !ship.canShip || !ship.gates.length) return false;
  return ship.gates.every((g) => g.status === "passed" || g.status === "not_applicable");
}

// The checked gate (runner/src/ship/gates.ts proofGate) is blocked for four reasons; only a check that failed has something
// to fix. The others (never checked, changed since, did not finish) need the check run again. Pinned against proofGate.
const CHECK_FAILED = "The last check of this version failed.";
/** What a gate's row offers: fix (Fix it), check (run the check again), confirm (I checked this myself), or nothing. */
export function gateAction(g: Gate): "fix" | "check" | "confirm" | null {
  if (g.status === "blocked") return g.id !== "checked" || g.detail.startsWith(CHECK_FAILED) ? "fix" : "check";
  if (g.status === "could_not_check") return g.overridable ? "confirm" : null;
  return null;
}
/** A blocked gate's Fix it: one ordinary checked fix of what that gate found (its own words; the engine already hid any
 *  secret in them). A safety copy first, as for every fix. */
export function gateFixCommand(project: string, g: Gate): Command {
  return fixFound(project, { label: g.label, detail: [g.detail, ...(g.findings ?? []).filter((f) => !g.detail.includes(f))].join(" ").slice(0, 2000) });
}

export type SignIn = NonNullable<ShipFlow["signIn"]>;
const vercelPage = (u: unknown): u is string => {
  if (typeof u !== "string" || u.length > 500 || !/^https:\/\/vercel\.com\//.test(u)) return false;
  try { const x = new URL(u); return x.protocol === "https:" && x.hostname === "vercel.com" && !x.username && !x.password && !x.port; } catch { return false; }
};
/** The Online box after a sign in press or event. Anything else, and the box is as it was. */
export function signInReduce(f: ShipFlow | null, e: { type?: string; [k: string]: unknown }): ShipFlow | null {
  if (!f) return f;
  switch (e.type) {
    case "ui.signInAsked": return { ...f, signIn: { stage: "asked" } };
    case "ship.signIn": {
      if (e.stage === "opened") return vercelPage(e.url) ? { ...f, signIn: { stage: "opened", url: e.url } } : f;
      if (e.stage === "done") return { ...f, signIn: { stage: "done" } };
      if (e.stage === "failed") return { ...f, signIn: { stage: "failed", reason: typeof e.reason === "string" ? e.reason.slice(0, 400) : "", ...(e.lesson === true ? { lesson: true } : {}) } };
      return f;
    }
    case "app.stop_everything": return signInStopped(f);
    default: return f;
  }
}
/** Stop everything (or an engine restart): a sign in still waiting is ended, so the box offers Sign in to Vercel again. */
export function signInStopped(f: ShipFlow | null): ShipFlow | null {
  if (!f?.signIn || (f.signIn.stage !== "asked" && f.signIn.stage !== "opened")) return f;
  const { signIn: _gone, ...rest } = f;
  return rest;
}

/** A sign in is still waiting: asked, or its page is ready and the person has not finished. Close and Stop end it. */
export const signingIn = (f: ShipFlow | null | undefined): boolean => f?.signIn?.stage === "asked" || f?.signIn?.stage === "opened";
/** The box's detail line ("Press Sign in to Vercel, then try again") shows only before that press: after it the button is
 *  gone and the line would send the person to a button that is not there. */
export const detailShown = (f: ShipFlow | null | undefined): boolean => !f?.signIn || f.signIn.stage === "failed";
export type SignInView = { show: "none" | "ask" | "busy" | "done" } | { show: "opened"; url: string } | { show: "failed"; reason: string; lesson?: true };
/** What the Online box shows for signing in to Vercel. */
export function signInView(f: ShipFlow | null | undefined): SignInView {
  const s = f?.signIn;
  if (s?.stage === "asked") return { show: "busy" };
  if (s?.stage === "opened") return vercelPage(s.url) ? { show: "opened", url: s.url } : { show: "busy" };
  if (s?.stage === "done") return { show: "done" };
  if (s?.stage === "failed") return { show: "failed", reason: s.reason ?? "", ...(s.lesson ? { lesson: true as const } : {}) };
  return f?.stage === "not_signed_in" ? { show: "ask" } : { show: "none" };
}
