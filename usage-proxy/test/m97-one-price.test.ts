// M97: one price everywhere. The documents the founder, a lawyer or a checkout setup acts on say the price in
// app/src/prices.json, and none of them still names an old price or the Max plan.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import PRICES from "../../app/src/prices.json";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const ACTED_ON = ["docs/launch/company-paid-go-live-checklist.md", "docs/launch/legal/lawyer-questions.md", "docs/architecture.md", "usage-proxy/README.md"];

// Max may be named only to say it is gone or refused. Everything else that says Max (any case, any wording) counts as
// naming it as a plan: "Max ($100 a month)", "a Max plan", "max at $100" all fail.
const MAX_ALLOWED = [/there is no max plan/gi, /\bno max plan\b/gi, /names `max` is refused/gi];
const namesMax = (s: string) => /\bmax\b/i.test(MAX_ALLOWED.reduce((t, re) => t.replace(re, ""), s));

describe("one price everywhere", () => {
  test("the documents people act on say Pro's monthly and yearly price from prices.json", () => {
    const monthly = `$${PRICES.proMonthly} a month`, yearly = `$${PRICES.proYearly} a year`;
    for (const p of ["docs/launch/company-paid-go-live-checklist.md", "docs/launch/legal/lawyer-questions.md", "docs/architecture.md"]) {
      const s = read(p);
      expect(s, p).toContain(monthly);
      expect(s, p).toContain(yearly);
    }
  });
  test("none of them names an old price, or Max as a plan we sell", () => {
    for (const p of ACTED_ON) {
      const s = read(p);
      expect(s, p).not.toMatch(/\$(10|20|100) a month|\$(96|72) a year|\$8 a month|Pro \$20|Max \$100/);
      expect(s, p).not.toMatch(/`pro` or `max`|\(Free, Pro, Max\)|\| Max \|/);
      expect(namesMax(s), p).toBe(false);
    }
  });
  test("the Max check catches any wording, and lets through only saying Max is gone", () => {
    for (const bad of ["Max ($100 a month)", "Pick a Max plan.", "max at $100", "| Max |", "`pro` or `max`", "MAX tier", "There is no Max plan, but Max is $100."])
      expect(namesMax(bad), bad).toBe(true);
    for (const ok of ["There is no Max plan.", "Free and Pro; no Max plan.", "A table that still names `max` is refused.", "maxItems", "the maximum"])
      expect(namesMax(ok), ok).toBe(false);
  });
  test("the example product table maps only to Pro, monthly and yearly (M116: plus the one time report, never a plan)", () => {
    const t = JSON.parse(read("usage-proxy/dodo-products.example.json")) as Record<string, { item: string; plan?: string; once?: boolean }>;
    expect(Object.values(t).filter((e) => e.plan !== undefined).map((e) => e.plan)).toEqual(["pro", "pro"]);
    expect(Object.values(t).map((e) => e.item)).toEqual(["pro_monthly", "pro_yearly", "report"]);
    expect(Object.values(t).find((e) => e.item === "report")).toEqual({ item: "report", once: true });
    expect(Object.keys(t).join(" ")).toMatch(/MONTHLY.*YEARLY/);
  });
  test("the dated history docs say at the top that their prices are superseded", () => {
    for (const p of ["docs/design/2026-10-31-dodo-payments-spec.md", "docs/design/2026-10-31-uiux-overhaul-spec.md", "docs/launch/sales/pricing-options.md"]) {
      expect(read(p).split("\n")[0], p).toMatch(/^> \*\*(Prices superseded|Replaced) \(15 Nov 2026, M97\)/);
    }
    expect(read("docs/decisions/F25-pricing-free-and-pro.md")).toContain("Yearly set by F31, 13 Nov 2026: $144.");
  });
});
