// M97: how many fixes the plan allowances cover, from a JSON file of measured fix costs (M100's runs on fixture projects).
// Usage: bun scripts/allowance.ts costs.json [plan]
// The file is a list of amounts, a list of records with costUsd, { "costsUsd": [...] }, or measure-fixes --out. A free run's file
// (standIn) is refused. It prints plain sentences and
// changes nothing: the allowance in src/plans.ts is the founder's to set ("measure, then decide", 15 Nov 2026).
import { readFileSync } from "node:fs";
import PRICES from "../../app/src/prices.json";
import { PLANS, allowanceReport, costsFrom } from "../src/plans.ts";

const [file, only] = process.argv.slice(2);
if (!file) { console.error("Give a JSON file of measured fix costs: bun scripts/allowance.ts costs.json [plan]"); process.exit(1); }
let costs: number[] = [], data: unknown;
try { data = JSON.parse(readFileSync(file, "utf8")); costs = costsFrom(data); }
catch { console.error(`Could not read ${file} as JSON.`); process.exit(1); }
// A free run's numbers are a stand in model's made up token counts: never a basis for an allowance (M100 review).
if (data && typeof data === "object" && (data as { standIn?: unknown }).standIn === true) {
  console.error("These are stand in numbers from a free run, not real fix costs, so no report was made. Measure real fixes first (measure-fixes.ts --spend).");
  process.exit(1);
}
console.log(`Pro is ${PRICES.symbol}${PRICES.proMonthly} a month or ${PRICES.symbol}${PRICES.proYearly} a year (app/src/prices.json).`);
let any = false;
for (const plan of Object.values(PLANS)) {
  if (only && plan.name !== only) continue;
  const r = allowanceReport(plan, costs);
  if (!r) continue;
  any = true;
  console.log("");
  for (const l of r.lines) console.log(l);
}
if (!any) { console.error(only && !Object.hasOwn(PLANS, only) ? `There is no plan called ${only}.` : "The file holds no real costs."); process.exit(1); }
