// M79 (docs/milestones/M79.md), the pages' side: no memory words that claim savings; a risky package in the fixed finding
// shape (Must fix for critical, Should fix for high); the weekly summary (counts only, an empty week said plainly, on a
// press only); payments built and switched off (prices in one config, what each plan includes in one list with limits
// written as "with limits", no checkout and no report offer while payments are off).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { REVIEW_REASONS } from "../../protocol/index.ts";
import { FINDING_LEVEL, findingParts } from "./findingShape.ts";
import { getProSheet, OFF, planIncludes, PRICES, pricesFrom, reportOffer, reportStatusFrom, statusFrom } from "./plan.ts";
import { placeOf } from "./settingsPages.ts";
import { S } from "./strings.ts";
import { weekEmpty, weekFrom, weekPage } from "./weekSummary.ts";
import { showWeek } from "./commands.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const NO_DASH = /—|–/;
const fixture = (id: string) => JSON.parse(read("../../protocol/fixtures/events.jsonl").split("\n").find((l) => l.includes(`"id":"${id}"`))!);
const flat = (v: unknown): string[] => (typeof v === "string" ? [v] : typeof v === "function" ? [String((v as (...a: unknown[]) => unknown)(2, 3))] : Array.isArray(v) ? v.flatMap(flat) : v && typeof v === "object" ? Object.values(v).flatMap(flat) : []);

describe("the memory lab: no claim that memory saves tokens, money or time", () => {
  test("every memory word, and the start hook's card says the allowed claim", () => {
    const memoryWords = [...flat(S.m78), S.doneSignal.hookLine.start, S.doneSignal.askWhatFor.start, S.doneSignal.hookTitle.start,
      ...Object.entries(S.set).filter(([k]) => k.startsWith("memory.")).flatMap(([, v]) => flat(v)),
      ...Object.entries(S.short).filter(([k]) => k.startsWith("memory.")).flatMap(([, v]) => flat(v))];
    for (const t of memoryWords) expect(/sav(e|es|ing) (you )?(tokens|money|time)|cheaper|faster|fewer (tokens|tries|turns)|less (money|tokens)/i.test(t), t).toBe(false);
    expect(S.doneSignal.hookLine.start).toContain("Claude Code gets your house rules and decisions at the start of each session and keeps to them");
    // Nowhere in the app's words is memory said to save tokens.
    expect(/(save|saves|saving|fewer|less) (you )?tokens/i.test(read("./strings.ts"))).toBe(false);
  });
});

describe("risky packages on the page", () => {
  test("critical is Must fix and high is Should fix, each with its own plain words", () => {
    for (const k of ["package_critical", "package_high"]) expect((REVIEW_REASONS as readonly string[]).includes(k)).toBe(true);
    expect(FINDING_LEVEL.package_critical).toBe("must");
    expect(FINDING_LEVEL.package_high).toBe("should");
    const e = fixture("m79e1");
    const p = findingParts("package_critical", e.reasons[0].say);
    expect(p.wrong).toBe("A new package has a known critical problem.");
    expect(p.detail).toBe("lodash 4.17.20: This package has a known serious problem: GHSA-aaaa-bbbb-cccc, fixed in 4.17.21.");
    expect(p.how).toContain("fixed version");
    expect(p.fine).toBeUndefined();
    expect(findingParts("package_high", "").fine).toBeDefined();
    for (const t of [...flat(p), ...flat(findingParts("package_high", "")), S.set["packages.check"].label, S.set["packages.check"].help, S.short["packages.check"]]) expect(NO_DASH.test(t), t).toBe(false);
  });
  test("the switch lives with the review's other settings and says what leaves the Mac", () => {
    expect(placeOf("packages.check")).toMatchObject({ topic: "more.fixing.review" });
    expect(S.set["packages.check"].help).toContain("only its name and version to OSV.dev");
    expect(S.set["packages.check"].help).toContain("Never your code");
    expect(S.set["packages.check"].help).toContain("not checked");
  });
  test("the privacy note and the research's section 10 say what leaves the Mac, to whom, when, and the off switch", () => {
    const note = read("../../docs/alpha/PRIVACY.md").split("\n").find((l) => l.includes(S.set["packages.check"].label))!;
    for (const w of ["OSV.dev", "its name and its version, nothing else", "No file name, no line, no code", "for a day", "Checks only", "not checked"]) expect(note, w).toContain(w);
    const research = read("../../docs/research/product_research.md").split("\n").find((l) => l.startsWith("| Risky packages"))!;
    for (const w of ["OSV.dev", "name and version", "never code", "Check new packages for known problems"]) expect(research, w).toContain(w);
    expect(read("../../docs/decisions/T18-risky-packages-on-osv.md")).toContain("**What leaves the Mac:**");
  });
});

describe("the weekly summary", () => {
  test("only on a press: the row's command, and nothing in the app sends it on its own", () => {
    expect(showWeek("/p")).toMatchObject({ type: "week.show", project: "/p" });
    const sends = ["./card.tsx", "./homeRest.tsx", "./app.tsx", "./notch.tsx"].filter((f) => { try { return read(f).includes("weekAsk(") || read(f).includes("showWeek("); } catch { return false; } });
    expect(sends).toEqual([]);
    const part = read("./weekSummary.tsx");
    expect(part).toContain("const press = () =>");
    expect(part.match(/send\(weekAsk\(/g)?.length).toBe(1);
    expect(part).not.toMatch(/setInterval|setTimeout|Notification/);
  });
  test("a week with something in it: plain counts, parts at zero left out, the decisions as written", () => {
    const w = weekFrom(fixture("m79e2"), "p_9f2c")!;
    expect(weekEmpty(w)).toBe(false);
    const p = weekPage(w);
    expect(p.lines).toEqual(["6 changes reviewed, 14 files in all.", "3 fixes proven by their checks.", "1 Undo used.", "2 copies saved before a destructive command, 1 of them used by Undo."]);
    expect(p.caught).toEqual(["1 key written into the code", "1 test or check weakened", "2 dones that were not done", "1 change with a risky package"]);
    expect(p.decisions).toEqual(["House rule: never edit pricing.txt", "Decided: payments go through Stripe, because the client already has an account"]);
    expect(p.rules).toBe("No review found a change against your house rules.");
    // No streak, no praise, no score, no amount.
    for (const t of [...flat(p), ...flat(S.m79.week)]) { expect(/streak|great|well done|awesome|nice work|score|\$|usd/i.test(t), t).toBe(false); expect(NO_DASH.test(t), t).toBe(false); }
  });
  test("an empty week says so plainly; anything that is not a week, or another project's, is dropped", () => {
    const w = weekFrom(fixture("m79e3"), "p_9f2c")!;
    expect(weekEmpty(w)).toBe(true);
    const p = weekPage(w);
    expect(p.empty).toBe(true);
    expect(p.lines).toEqual([]); expect(p.caught).toEqual([]); expect(p.rules).toBe("");
    expect(S.m79.week.empty).toBe("Nothing happened in this project in the last seven days: no changes reviewed, nothing caught and no fixes.");
    expect(weekFrom(fixture("m79e2"), "other")).toBeNull();
    expect(weekFrom({ ...fixture("m79e2"), week: { ...fixture("m79e2").week, reviews: -2 } }, "p_9f2c")).toBeNull();
    expect(weekFrom({ type: "tasks.list", project: "p_9f2c" }, "p_9f2c")).toBeNull();
  });
  test("the row sits in History, next to the week's line", () => {
    const card = read("./card.tsx");
    expect(card).toContain("<WeekPart project={project} send={send} />");
  });
});

describe("payments, built and switched off", () => {
  test("prices live in one config: Pro $15 a month, the report $29 one time, and (M88, F31) yearly at 20% off", () => {
    const file = JSON.parse(read("./prices.json"));
    // M88 (F31, 13 Nov 2026): the founder set yearly billing at 20% off, so the yearly price is no longer empty.
    expect(file).toMatchObject({ currency: "USD", symbol: "$", proMonthly: 15, proYearly: 144, reportOnce: 29 });
    expect(PRICES).toEqual({ symbol: "$", proMonthly: 15, proYearly: 144, reportOnce: 29 });
    expect(pricesFrom({ proMonthly: -1, proYearly: "15", reportOnce: 0 })).toEqual({ symbol: "$", proMonthly: null, proYearly: null, reportOnce: null });
    // No dollar amount written anywhere in the app's own code or words: only prices.json.
    for (const f of ["./plan.ts", "./planCard.tsx", "./strings.ts", "./m76Panels.tsx", "./weekSummary.ts", "./card.tsx"]) expect(read(f).split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n"), f).not.toMatch(/\$\d|\b(15|29) a month/);
  });
  test("with payments off (today) no checkout, no plan list and no report offer shows to anyone", () => {
    expect(statusFrom(null)).toEqual(OFF);
    expect(getProSheet(OFF).ready).toBe(false);
    expect(getProSheet(OFF).choices.every((c) => !c.ready)).toBe(true);
    expect(planIncludes(OFF)).toEqual([]);
    expect(reportOffer(reportStatusFrom({ paymentsOn: false, needed: true, checkout: true })).show).toBe(false);
    expect(reportOffer(reportStatusFrom(null)).show).toBe(false);
    expect(reportOffer(reportStatusFrom("yes")).show).toBe(false);
  });
  test("what Free, Pro and the report include: one list, every limit written as with limits, Undo and Stop always", () => {
    const on = statusFrom({ paymentsOn: true, plan: "free", state: "free", checkout: { monthly: true, report: true }, portal: true });
    const inc = planIncludes(on);
    expect(inc.map((x) => [x.id, x.title, x.price])).toEqual([["free", "Free", ""], ["pro", "Pro", "$15 a month"], ["report", "The go live report", "$29 one time"]]);
    const free = inc[0].lines.join(" ");
    expect(free).toContain("with limits");
    expect(free).toContain("Undo and Stop");
    // No measured number is promised yet: limits are words, not counts.
    for (const l of [...S.m79.includes.free, ...S.m79.includes.pro]) expect(/\d/.test(l), l).toBe(false);
    expect(S.m79.alwaysWork).toBe("Undo and Stop always work, at any limit.");
    expect(read("./planCard.tsx")).toContain("planIncludes(status)");
  });
  test("the report offer shows only with payments on and the plan not including it; the answer stays free", () => {
    const o = reportOffer(reportStatusFrom({ paymentsOn: true, needed: true, checkout: true }));
    expect(o).toEqual({ show: true, line: S.m79.reportNeeded, buy: "Get this report, $29 one time", ready: true });
    expect(S.m79.reportNeeded).toContain("The answer above stays free");
    expect(reportOffer(reportStatusFrom({ paymentsOn: true, needed: false, checkout: true })).show).toBe(false);
    expect(reportOffer(reportStatusFrom({ paymentsOn: true, needed: true, checkout: false })).ready).toBe(false);
    const panel = read("./m76Panels.tsx");
    expect(panel).toContain('proCommands.openCheckout("report")');
    expect(panel).toContain("offer.show ?");
    expect(S.plan.problems.reportNotBought).toBeDefined(); expect(S.plan.problems.reportUsed).toBeDefined();
  });
});
