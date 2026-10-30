// The Plan card on Account (the overhaul spec, 3.10; T17: Pro is a Dodo license key, checked on this Mac). What the card
// says in each state, as plain data, so plan.test.ts can check every state: a verdict style line, at most two facts, and
// at most one main button. Payments are off until the founder switches them on (F25), so today every person sees "Early
// access" and nothing is gated, checked or sent anywhere. No card form, no web view and no Dodo secret ever live here:
// checkout and the billing portal open in the person's own browser once payments are on.
import { S } from "./strings.ts";

/** The remote switch for payments (F25, T17). Off: no gating, no network, no trial offer. */
export const PAYMENTS_ON = false;
/** US prices only; the local price and tax show at Dodo's checkout. */
export const PRICE = { month: 10, year: 96, yearPerMonth: 8 } as const;
export const TRIAL_DAYS = 14;

/** A plan we know for sure (never "can't check": that state keeps showing the last of these). */
export type KnownPlan =
  | { kind: "paymentsOff" }
  | { kind: "free"; left: number; limit: number; backOn: string; trialOffered: boolean }
  | { kind: "trial"; daysLeft: number; endsOn: string }
  | { kind: "trialEnded"; endedOn: string }
  | { kind: "waiting" }
  | { kind: "pro" }
  | { kind: "notActive" };
export type PlanState = KnownPlan | { kind: "cantCheck"; last: KnownPlan; asOf: string };

export type PlanButton = { id: "trial" | "keepPro" | "getPro" | "compare" | "pasteKey" | "cancelWait" | "billing" | "updatePayment" | "checkAgain"; label: string; kind: "primary" | "secondary" | "quiet" };
export type PlanCard = { line: string; mark: "none" | "arc" | "amber"; facts: string[]; buttons: PlanButton[] };

const P = () => S.plan;
const btn = (id: PlanButton["id"], kind: PlanButton["kind"]): PlanButton => ({ id, kind, label: P().buttons[id] });

/** The card for one state. A failed check never shows Free: it keeps the last known plan, with when that was. */
export function planCard(s: PlanState): PlanCard {
  switch (s.kind) {
    case "paymentsOff": return { line: P().earlyAccess, mark: "none", facts: [P().nothingCharged], buttons: [] };
    case "free": return {
      line: P().free, mark: "none", facts: [P().fixesLeft(s.left, s.limit, s.backOn)],
      buttons: s.trialOffered ? [btn("trial", "primary"), btn("compare", "quiet")] : [btn("compare", "quiet")],
    };
    case "trial": return { line: P().trialLine(s.daysLeft), mark: "none", facts: [P().trialEnds(s.endsOn)], buttons: [btn("keepPro", "primary"), btn("compare", "quiet")] };
    case "trialEnded": return { line: P().free, mark: "none", facts: [P().trialEnded(s.endedOn)], buttons: [btn("getPro", "primary"), btn("compare", "quiet")] };
    case "waiting": return { line: P().finishInBrowser, mark: "arc", facts: [P().keyArrives], buttons: [btn("pasteKey", "secondary"), btn("cancelWait", "quiet")] };
    case "pro": return { line: P().pro, mark: "none", facts: [P().proFacts], buttons: [btn("billing", "secondary")] };
    case "notActive": return { line: P().notActive, mark: "amber", facts: [P().notActiveWhy], buttons: [btn("updatePayment", "primary")] };
    case "cantCheck": {
      const last = planCard(s.last);
      return { line: last.line, mark: last.mark, facts: [P().cantCheck(s.asOf)], buttons: [btn("checkAgain", "secondary")] };
    }
  }
}

/** The plan in force. With payments off there is nothing to check and nothing is sent: Early access. Once the founder
 *  switches payments on, this reads the license key's last check and the trial kept on this Mac (the payments spec). */
export function planNow(): PlanState {
  return { kind: "paymentsOff" };
}
/** Whether anything is limited by plan now. Off while payments are off (F25: nobody is gated). */
export const gated = (s: PlanState): boolean => PAYMENTS_ON && s.kind !== "paymentsOff";

/** "Looks" in Pro means extra water colours only (the spec, 3.10). How lively, the theme, the size, the text size and the
 *  motion are free on every plan, and today's five waters stay free. */
export const PRO_WATERS: readonly string[] = [];
export function proOnly(key: string, value: unknown): boolean {
  return key === "look.water" && typeof value === "string" && PRO_WATERS.includes(value);
}

/** What Delete everything keeps (the spec, 3.9; T17: the trial date stays, so a trial cannot restart by deleting). The
 *  trial line shows only once a trial date exists. */
export function deleteKeeps(trialStarted: string | null): string[] {
  return [S.dangerKeepsProjects, ...(trialStarted ? [S.dangerKeepsTrial] : [])];
}
