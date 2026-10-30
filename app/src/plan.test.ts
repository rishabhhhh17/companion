// The Plan card (the overhaul spec, 3.10; T17: a Dodo license key, checked on this Mac). Every state's words, at most one
// main button, a failed check that never shows Free, and payments off today: nothing gated, nothing sent, no card form.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { deleteKeeps, gated, PAYMENTS_ON, planCard, planNow, PRICE, proOnly, PRO_WATERS, TRIAL_DAYS, type KnownPlan, type PlanState } from "./plan.ts";
import { WATERS } from "./lookfeel.ts";
import { S } from "./strings.ts";

const free = (trialOffered: boolean): KnownPlan => ({ kind: "free", left: 4, limit: 10, backOn: "1 Dec", trialOffered });
const ALL: PlanState[] = [
  { kind: "paymentsOff" }, free(false), free(true), { kind: "trial", daysLeft: 3, endsOn: "4 Nov" }, { kind: "trialEnded", endedOn: "2 Nov" },
  { kind: "waiting" }, { kind: "pro" }, { kind: "notActive" }, { kind: "cantCheck", last: { kind: "pro" }, asOf: "10:02" },
];

describe("the Plan card", () => {
  test("payments are off: Early access, nothing charged, no button, nobody gated", () => {
    expect(PAYMENTS_ON).toBe(false);
    expect(planNow()).toEqual({ kind: "paymentsOff" });
    expect(planCard(planNow())).toEqual({ line: "Early access", mark: "none", facts: ["Nothing is charged. You'll be told before that changes."], buttons: [] });
    for (const s of ALL) expect(gated(s), s.kind).toBe(false);
  });
  test("each state has its line, at most two facts and at most one main button", () => {
    for (const s of ALL) {
      const c = planCard(s);
      expect(c.line, s.kind).toBeTruthy();
      expect(c.facts.length, s.kind).toBeLessThanOrEqual(2);
      expect(c.buttons.filter((b) => b.kind === "primary").length, s.kind).toBeLessThanOrEqual(1);
      for (const t of [c.line, ...c.facts, ...c.buttons.map((b) => b.label)]) expect(t, s.kind).not.toMatch(/[–—]/);
    }
    expect(planCard(free(true)).buttons.map((b) => b.label)).toEqual(["Try Pro free for 14 days", "Compare plans"]);
    expect(planCard(free(false)).buttons.map((b) => [b.label, b.kind])).toEqual([["Compare plans", "quiet"]]);
    expect(planCard(free(true)).facts).toEqual(["4 of 10 fixes left this month. They come back on 1 Dec."]);
    expect(planCard({ kind: "trial", daysLeft: 1, endsOn: "4 Nov" }).line).toBe("Pro trial, 1 day left");
    expect(planCard({ kind: "pro" }).buttons).toEqual([{ id: "billing", label: "Billing and invoices", kind: "secondary" }]);
    expect(planCard({ kind: "notActive" })).toMatchObject({ mark: "amber", buttons: [{ id: "updatePayment", kind: "primary" }] });
    expect(planCard({ kind: "waiting" })).toMatchObject({ mark: "arc", line: "Finish paying in your browser" });
  });
  test("a failed check never shows Free: it keeps the last plan known, and says when that was (HeyClicky's bug)", () => {
    const c = planCard({ kind: "cantCheck", last: { kind: "pro" }, asOf: "10:02" });
    expect(c.line).toBe("Pro");
    expect(c.facts).toEqual(["Couldn't check your Pro key. Showing your plan as of 10:02."]);
    expect(c.buttons.map((b) => b.id)).toEqual(["checkAgain"]);
    expect(planCard({ kind: "cantCheck", last: { kind: "trial", daysLeft: 3, endsOn: "4 Nov" }, asOf: "9:00" }).line).toBe("Pro trial, 3 days left");
  });
  test("US prices, a 14 day trial, and the local price said to show at checkout", () => {
    expect(PRICE).toEqual({ month: 10, year: 96, yearPerMonth: 8 });
    expect(TRIAL_DAYS).toBe(14);
    expect(S.plan.yearPrice).toBe("$8 a month, billed $96 a year. Save 20%.");
    expect(S.plan.usPrices).toBe("US prices. Your local price and tax show at checkout.");
    expect(S.setGroupFoot["account.plan"]).toBe("You pay Anthropic directly for Claude. We never mark up your AI.");
  });
  test("only extra water colours are Pro: how lively, the theme, the size, the text size and the motion stay free", () => {
    expect(PRO_WATERS).toEqual([]);
    for (const w of WATERS) expect(proOnly("look.water", w), w).toBe(false);
    for (const [k, v] of [["character.lively", "lively"], ["look.theme", "paper"], ["look.size", "large"], ["display.textSize", "huge"], ["character.motion", "less"]]) expect(proOnly(k, v), k).toBe(false);
  });
  test("delete everything keeps the trial date once there is one (T17), and always says the projects stay", () => {
    expect(deleteKeeps(null)).toEqual([S.dangerKeepsProjects]);
    expect(deleteKeeps("2026-10-31")).toEqual([S.dangerKeepsProjects, S.dangerKeepsTrial]);
    expect(S.dangerKeepsTrial).toBe("The date your trial started, so it can't restart.");
  });
  test("no card form, no web view, no network and no Dodo secret in the app", () => {
    const src = readFileSync(new URL("./plan.ts", import.meta.url), "utf8") + readFileSync(new URL("./settingsPage.tsx", import.meta.url), "utf8");
    expect(src).not.toMatch(/fetch\(|XMLHttpRequest|dodopayments\.com\/|secret_key|DODO_|<iframe|cardNumber|<form/);
  });
});
