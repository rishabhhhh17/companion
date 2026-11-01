// Pro on the pages (the payments spec, sections 3, 4, 6, 8, 9a, 10 and 13; T17). Every row of 9a has its words and
// buttons; the trial is hidden in Settings before the first proven fix and shown on the limit and Pro tag cards; every
// card has at most one main button and a way out; no renewal date, no local price and no dollar amount outside strings.ts;
// and with payments off the pages behave exactly as before: Early access, no tag, no gate, no limit card, no change to
// Delete everything.
import { afterAll, beforeAll, describe, expect, setSystemTime, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  askTurnOffPro, atLimit, dayWords, deleteGoesPro, deleteKeeps, FREE_FIXES, getProSheet, lastFreeLine, limitCard, limitShown, OFF, planCard, planProblem,
  planRow, proCovers, proDeleteProblem, proInventoryFrom, proOnly, proTag, PRO_WATERS, statusFrom, tidyKey, TRIAL_DAYS, trialOffered, usageFrom, usageNow,
  type LimitView, type PlanStatus, type Row, type Usage,
} from "./plan.ts";
import { WATERS } from "./lookfeel.ts";
import { initial, reduce } from "./model.ts";
import { PRODUCT, S } from "./strings.ts";

const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");

// The fixtures say the month resets on 2026-11-01. On and after that day the pages (rightly) count a new month, so these
// cases fail on the real clock from 1 Nov 2026 on. They run on the day they were written for.
beforeAll(() => setSystemTime(new Date(2026, 9, 31, 12, 0, 0)));
afterAll(() => setSystemTime());
/** What the shell sends with payments on (license.rs status_json), changed where a case needs it. */
const on = (o: Partial<PlanStatus> = {}): PlanStatus => statusFrom({
  paymentsOn: true, plan: "free", state: "free", key: null, trial: null, trialUsed: false, checkout: { yearly: true, monthly: true }, portal: true, ...o,
});
const use = (used: number, everUsed = used > 0): Usage => ({ used, limit: 3, resetsOn: "2026-11-01", everUsed });
const KEY = { last4: "ABCD", email: "r…@gmail.com", check: "ok" as const, daysSinceCheck: 0 };
const TRIAL = { startedAt: "2026-10-31T09:30:00Z", endsAt: "2026-11-14T09:30:00Z", daysLeft: 9, ended: false };

/** One case for each row of section 9a. */
const ROWS: [Row, PlanStatus, Usage | null][] = [
  ["off", OFF, null],
  ["freeNew", on(), use(0)],
  ["free", on(), use(1)],
  ["freeLast", on(), use(2)],
  ["freeLimit", on(), use(3)],
  ["trial", on({ plan: "trial", state: "trial", trial: TRIAL, trialUsed: true }), use(0)],
  ["trialEnded", on({ state: "trialEnded", trial: { ...TRIAL, daysLeft: 0, ended: true }, trialUsed: true }), use(1)],
  ["pro", on({ plan: "pro", state: "pro", key: KEY }), null],
  ["proOverdue", on({ plan: "pro", state: "proOverdue", key: { ...KEY, check: "overdue", daysSinceCheck: 10 } }), null],
  ["proOffline", on({ state: "proOffline", key: { ...KEY, check: "offline", daysSinceCheck: 15 } }), use(0)],
  ["inactive", on({ state: "inactive", key: { ...KEY, check: "inactive" } }), use(0)],
];
const words = (s: PlanStatus, u: Usage | null) => { const c = planCard(s, u); return [c.line, ...c.facts, ...c.buttons.map((b) => b.label)]; };

describe("payments off: the pages behave exactly as before", () => {
  test("the shell's off status, nothing at all, or anything odd reads as payments off", () => {
    const shellOff = { paymentsOn: false, plan: "free", state: "off", key: null, trial: null, trialUsed: false, checkout: { yearly: false, monthly: false }, portal: false };
    for (const v of [shellOff, undefined, null, "", 0, {}, { paymentsOn: "true", state: "pro" }, { paymentsOn: 1 }]) expect(statusFrom(v)).toEqual(OFF);
  });
  test("the Plan card is today's Early access card, whatever the count says", () => {
    for (const u of [null, use(0), use(2), use(3), use(9)]) {
      expect(planCard(OFF, u)).toEqual({ row: "off", line: "Early access", mark: "none", facts: ["Nothing is charged. You'll be told before that changes."], buttons: [] });
    }
  });
  test("no gate, no tag, no line under Fix it, no trial and no checkout", () => {
    for (const u of [null, use(0), use(2), use(3)]) {
      expect(atLimit(OFF, u)).toBe(false);
      expect(lastFreeLine(OFF, u)).toBeNull();
      expect(trialOffered("settings", OFF, u)).toBe(false);
      expect(trialOffered("card", OFF, u)).toBe(false);
    }
    expect(proCovers(OFF)).toBe(true);
    for (const f of ["ship", "recaps", "looks"] as const) expect(proTag(f, OFF)).toBe(false);
    expect(getProSheet(OFF).ready).toBe(false);
  });
  test("Delete everything asks nothing new, keeps only the projects and names no Pro item", () => {
    expect(proInventoryFrom(null)).toBeNull();
    expect(askTurnOffPro(null)).toBe(false);
    expect(deleteKeeps(null, false)).toEqual([S.dangerKeepsProjects]);
    expect(deleteGoesPro(null)).toEqual([]);
    const page = read("./settingsPage.tsx");
    expect(page).toContain("...(askTurnOffPro(pro) ? { withPro } : {})");
  });
  test("Home: the limit card needs payments on, the Pro tag needs a plan without Pro, and the recap is asked as before", () => {
    const card = read("./card.tsx");
    expect(card).toContain("const proLimit = pro.paymentsOn ? m.proLimit ?? null : null;");
    expect(card).toContain('const shipTags = proTag("ship", pro);');
    expect(card).toContain('const shipTagged = main === "shipCheck" && shipTags;');
    expect(card).toContain("{shipTagged && <ProTag />}");
    expect(card).toContain("else if (proCovers(planNow())) void send(askRecap(");
    expect(card).toContain('if (a === "fix" && atFreeLimit(pro, usage))');
  });
  test("the page model never changes on its own: only plan.usage and plan.limit, which the engine sends only with payments on", () => {
    const m = initial();
    expect(m.proUsage ?? null).toBeNull();
    expect(m.proLimit ?? null).toBeNull();
    for (const e of [{ type: "runner.hello", runnerVersion: "1", sdk: "1" }, { type: "agent.state", agent: "a", state: "working" }]) expect(reduce(m, e).proLimit ?? null).toBeNull();
  });
});

describe("the Plan card, every row of section 9a", () => {
  test("each case lands on its row", () => {
    for (const [row, s, u] of ROWS) expect(planRow(s, u), row).toBe(row);
    expect(planRow(on(), null)).toBe("freeNew");
  });
  test("the words and buttons of each row", () => {
    const at = (r: Row) => ROWS.find((x) => x[0] === r)!;
    const shown = (r: Row) => { const [, s, u] = at(r); const c = planCard(s, u); return { line: c.line, facts: c.facts, buttons: c.buttons.map((b) => [b.label, b.kind]) }; };
    expect(shown("freeNew")).toEqual({ line: "Free. 3 fixes a month.", facts: [], buttons: [["Get Pro", "primary"]] });
    expect(shown("free")).toEqual({ line: "Free. 1 of 3 fixes used this month.", facts: [], buttons: [["Try Pro free for 14 days", "primary"], ["Get Pro", "secondary"]] });
    expect(shown("freeLast")).toEqual({ line: "Free. 2 of 3 fixes used this month.", facts: ["Last free fix this month. More on 1 Nov."], buttons: [["Try Pro free for 14 days", "primary"], ["Get Pro", "secondary"]] });
    expect(shown("freeLimit")).toEqual({ line: "You have used this month's 3 free fixes.", facts: ["They come back on 1 Nov."], buttons: [["Try Pro free for 14 days", "primary"], ["Get Pro", "secondary"]] });
    expect(shown("trial")).toEqual({ line: "Pro trial. 9 days left. No card needed.", facts: [], buttons: [["Get Pro", "primary"]] });
    expect(shown("trialEnded")).toEqual({ line: "Your Pro trial ended. Free still works: 3 fixes a month, every safety feature. Get Pro to keep unlimited fixes.", facts: [], buttons: [["Get Pro", "primary"]] });
    expect(shown("pro")).toEqual({ line: "Pro. Key ends in ABCD.", facts: ["For r…@gmail.com."], buttons: [["Billing and invoices", "secondary"], ["Use Pro on another Mac", "quiet"]] });
    expect(shown("proOverdue")).toEqual({ line: `${PRODUCT} could not check your Pro key for 10 days. Connect to the internet to keep Pro.`, facts: [], buttons: [["Check again", "primary"]] });
    expect(shown("proOffline").line).toBe("Connect to the internet to check Pro.");
    expect(shown("proOffline").buttons).toEqual([["Check again", "primary"]]);
    expect(shown("inactive")).toEqual({ line: "This Pro key is not active now.", facts: ["If you changed plans, paste the new key from your email. If a payment failed, fix it in billing."],
      buttons: [["Billing and invoices", "primary"], ["Paste new key", "secondary"], ["Check again", "quiet"]] });
    expect(planCard(on({ plan: "trial", state: "trial", trial: { ...TRIAL, daysLeft: 1 }, trialUsed: true }), null).line).toBe("Pro trial. 1 day left. No card needed.");
  });
  test("a trial already used is never offered again: Get Pro is the main button", () => {
    const used = on({ trialUsed: true });
    expect(planCard(used, use(1)).buttons.map((b) => [b.id, b.kind])).toEqual([["getPro", "primary"]]);
    expect(planCard(used, use(3)).buttons.map((b) => [b.id, b.kind])).toEqual([["getPro", "primary"]]);
    // A trial that ended and is now at the limit is the limit row, with Get Pro alone.
    const ended = on({ state: "trialEnded", trial: { ...TRIAL, ended: true }, trialUsed: true });
    expect(planCard(ended, use(3))).toMatchObject({ row: "freeLimit", buttons: [{ id: "getPro", kind: "primary" }] });
  });
  test("every row: one line, at most two facts, at most one main button, plain words, no dash", () => {
    for (const [row, s, u] of ROWS) {
      const c = planCard(s, u);
      expect(c.line, row).toBeTruthy();
      expect(c.facts.length, row).toBeLessThanOrEqual(2);
      expect(c.buttons.filter((b) => b.kind === "primary").length, row).toBeLessThanOrEqual(1);
      for (const t of words(s, u)) expect(t, row).not.toMatch(/[–—]/);
    }
  });
  test("no renewal date, no price, no Due today and no account row in any state", () => {
    for (const [row, s, u] of ROWS) for (const t of words(s, u)) expect(t, row).not.toMatch(/\$|Renews|renews|Due today|No card on file|account|\bEnds \d/);
    expect(JSON.stringify(S.plan)).not.toMatch(/Renews|Due today|No card on file|Sign in/);
  });
  test("only the last 4 characters of a key ever reach the card", () => {
    const s = on({ plan: "pro", state: "pro", key: { ...KEY, last4: "dodo-lic-1234-ABCD" } });
    expect(s.key?.last4).toBe("ABCD");
    expect(planCard(s, null).line).toBe("Pro. Key ends in ABCD.");
  });
});

describe("the trial (section 6)", () => {
  test("hidden in Settings before the first proven fix, shown after it", () => {
    expect(trialOffered("settings", on(), use(0, false))).toBe(false);
    expect(trialOffered("settings", on(), null)).toBe(false);
    expect(planCard(on(), use(0, false)).buttons.map((b) => b.id)).toEqual(["getPro"]);
    expect(trialOffered("settings", on(), use(0, true))).toBe(true);
    expect(planCard(on(), use(0, true))).toMatchObject({ row: "free", line: "Free. 0 of 3 fixes used this month." });
  });
  test("shown on the limit card and on the card behind a Pro tag, even before the first proven fix", () => {
    for (const reason of ["fixes", "ship", "looks"] as const) {
      expect(limitCard({ reason }, on(), use(0, false)).buttons.map((b) => [b.id, b.kind]), reason).toEqual([["trial", "primary"], ["getPro", "secondary"], ["notNow", "quiet"]]);
    }
  });
  test("never during a trial or Pro, never twice, never with a key here", () => {
    for (const s of [on({ plan: "trial", state: "trial", trial: TRIAL, trialUsed: true }), on({ plan: "pro", state: "pro", key: KEY }), on({ trialUsed: true }),
      on({ state: "inactive", key: KEY }), on({ state: "proOffline", key: KEY })]) {
      expect(trialOffered("card", s, use(1)), s.state).toBe(false);
      expect(trialOffered("settings", s, use(1)), s.state).toBe(false);
    }
    // The shell's trial item counts as used even when trialUsed was left out.
    expect(statusFrom({ paymentsOn: true, state: "trialEnded", trial: TRIAL }).trialUsed).toBe(true);
    expect(TRIAL_DAYS).toBe(14);
  });
});

describe("Home: the limit card, the last free fix line and the Pro tags (section 3)", () => {
  test("the limit card: three calm lines' worth, the trial while unused, and Not now as the way out", () => {
    const c = limitCard({ reason: "fixes", resetsOn: "2026-11-01" }, on(), use(3));
    expect(c.lines).toEqual(["You have used this month's 3 free fixes.", "They come back on 1 Nov. Checking your project, Undo and Stop still work."]);
    expect(c.buttons.map((b) => b.label)).toEqual(["Try Pro free for 14 days", "Get Pro", "Not now"]);
    const used = limitCard({ reason: "fixes", resetsOn: "2026-12-01" }, on({ trialUsed: true }), use(3));
    expect(used.lines[1]).toBe("They come back on 1 Dec. Checking your project, Undo and Stop still work.");
    expect(used.buttons.map((b) => [b.label, b.kind])).toEqual([["Get Pro", "primary"], ["Not now", "quiet"]]);
  });
  test("the card behind a Pro tag is worded for its feature", () => {
    expect(limitCard({ reason: "ship" }, on(), use(0)).lines).toEqual(["Ship with rollback is part of Pro.", "Your free fixes, Undo and every safety feature keep working."]);
    expect(limitCard({ reason: "looks" }, on(), use(0)).lines[0]).toBe("Extra water colours are part of Pro.");
  });
  test("every card has a way out and at most one main button", () => {
    for (const reason of ["fixes", "ship", "looks", "recaps"] as const) for (const s of [on(), on({ trialUsed: true }), on({ state: "inactive", key: KEY })]) {
      const c = limitCard({ reason }, s, use(3));
      expect(c.buttons.at(-1)?.id, reason).toBe("notNow");
      expect(c.buttons.filter((b) => b.kind === "primary").length, reason).toBe(1);
    }
  });
  test("the last free fix line shows only when one is left on Free", () => {
    expect(lastFreeLine(on(), use(2))).toBe("Last free fix this month. More on 1 Nov.");
    for (const u of [null, use(0), use(1), use(3)]) expect(lastFreeLine(on(), u)).toBeNull();
    expect(lastFreeLine(on({ plan: "pro", state: "pro", key: KEY }), use(2))).toBeNull();
    expect(lastFreeLine(on({ plan: "trial", state: "trial", trial: TRIAL, trialUsed: true }), use(2))).toBeNull();
  });
  test("at the limit only on Free with payments on", () => {
    expect(atLimit(on(), use(3))).toBe(true);
    expect(atLimit(on(), use(2))).toBe(false);
    expect(atLimit(on(), null)).toBe(false);
    expect(atLimit(on({ plan: "pro", state: "pro", key: KEY }), use(3))).toBe(false);
    expect(atLimit(on({ plan: "trial", state: "trial", trial: TRIAL, trialUsed: true }), use(3))).toBe(false);
  });
  test("Pro tags: only on a plan without Pro, and only on Ship, Recaps and the waters that are not the usual one", () => {
    expect(PRO_WATERS).toEqual(WATERS.filter((w) => w !== "ocean"));
    expect(proOnly("look.water", "ocean")).toBe(false);
    for (const w of PRO_WATERS) expect(proOnly("look.water", w), w).toBe(true);
    for (const [k, v] of [["character.lively", "lively"], ["look.theme", "paper"], ["look.size", "large"], ["display.textSize", "huge"], ["character.motion", "less"]]) expect(proOnly(k, v), k).toBe(false);
    expect(proTag("ship", on())).toBe(true);
    for (const s of [on({ plan: "pro", state: "pro", key: KEY }), on({ plan: "trial", state: "trial", trial: TRIAL, trialUsed: true })]) expect(proTag("ship", s)).toBe(false);
    // The tag is drawn on every way into Ship on Home (the main button, the Is it safe chip, Put it online) and on the water
    // colours in Settings, and nowhere else.
    const uses = ["./card.tsx", "./settingsPage.tsx", "./home.ts", "./homeHero.ts", "./lookfeel.ts", "./skins.ts"].flatMap((f) => read(f).split("\n").filter((l) => l.includes("<ProTag")).map((l) => `${f}: ${l.trim()}`));
    expect(uses.length).toBe(4);
    expect(uses[0]).toContain("{shipTagged && <ProTag />}");
    expect(uses[1]).toContain("{S.look.chipSafe}{shipTags && <ProTag />}");
    expect(uses[2]).toContain("{S.onlineButton}{shipTags && <ProTag />}");
    expect(uses[3]).toContain('{tagged && proOnly("look.water", w) && <ProTag corner />}');
  });
  test("a recap the page asks by itself never shows a card", () => {
    expect(limitShown({ reason: "recaps" })).toBe(false);
    expect(reduce(initial(), { type: "plan.limit", reason: "recaps", command: "recap.ask" }).proLimit ?? null).toBeNull();
  });
});

describe("what the reviewers found (31 Oct 2026)", () => {
  test("the month resets on the 1st, local time, on the pages too: Fix it is not held back by last month's count", () => {
    const full = use(3);   // resetsOn 2026-11-01
    const before = new Date(2026, 9, 31, 23, 59, 59), after = new Date(2026, 10, 1, 0, 0, 1);
    expect(atLimit(on(), full, before)).toBe(true);
    expect(atLimit(on(), full, after)).toBe(false);
    expect(lastFreeLine(on(), use(2), after)).toBeNull();
    expect(lastFreeLine(on(), use(2), before)).toBe("Last free fix this month. More on 1 Nov.");
    expect(planCard(on(), full, after)).toMatchObject({ row: "free", line: "Free. 0 of 3 fixes used this month." });
    expect(limitCard({ reason: "fixes" }, on(), full, after).lines[1]).toContain("1 Dec");
    expect(usageNow(full, after)).toEqual({ used: 0, limit: 3, resetsOn: "2026-12-01", everUsed: true });
    expect(usageNow(full, before)).toBe(full);
    expect(usageNow({ ...full, resetsOn: "soon" }, after)).toEqual({ ...full, resetsOn: "soon" });
    // Home's own checks read the count this way: the main button and Plan it.
    const card = read("./card.tsx");
    expect(card).toContain('if (a === "fix" && atFreeLimit(pro, usage))');
    expect(card).toContain("if (atFreeLimit(planNow(), m.proUsage ?? null)) { dispatch({ type: \"ui.proLimit\", reason: \"fixes\"");
  });
  test("every way into Ship asks first and, on a plan without Pro, sends nothing and clears nothing", () => {
    const card = read("./card.tsx");
    expect(card).toContain('const shipGate = (): boolean => { if (!proTag("ship", planNow())) return true; dispatch({ type: "ui.proLimit", reason: "ship" }); return false; };');
    expect(card).toContain("const shipIt = (o: { runChecks?: boolean; confirm?: string[] } = {}) => { if (!project || !shipGate()) return;");
    expect(card).toContain("const shipOnline = () => { if (!project || !shipGate()) return;");
    // No other line sends a ship command or asks for the ship clearing.
    const code = card.split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l));
    // Every other line that sends one is the practice's own files check (its lesson, never a ship) or Make it live, which
    // only a preview the gate let through can show.
    for (const l of code.filter((l) => /send\((?:checkShip|shipPreview|shipLive)\(/.test(l))) expect(/shipGate\(\)|e\.find === "gate"|e\.prove === "gate"|send\(shipLive\(project, f\.previewUrl!\)\)/.test(l), l.trim()).toBe(true);
    expect(code.filter((l) => l.includes('"ui.planRequested", ship: true')).length).toBe(2);
    // The card behind the tag keeps the result: ui.proLimit never clears the task or its receipt.
    const m = { ...initial(), receipt: { checkpoint: "c1" } as unknown as ReturnType<typeof initial>["receipt"] };
    expect(reduce(m, { type: "ui.proLimit", reason: "ship" }).receipt).toBe(m.receipt);
  });
  test("the Plan card hides billing until the portal is filled in, and its reasons are its own", () => {
    expect(planCard(on({ plan: "pro", state: "pro", key: KEY, portal: false }), null).buttons.map((b) => [b.id, b.kind])).toEqual([["otherMac", "quiet"]]);
    expect(planCard(on({ state: "inactive", key: { ...KEY, check: "inactive" }, portal: false }), null).buttons.map((b) => [b.id, b.kind])).toEqual([["pasteKey", "primary"], ["checkAgain", "secondary"]]);
    expect(planProblem("portalNotReady")).toBe("Billing is not ready to open yet. Your Pro key still works.");
    expect(planProblem("browser")).toBe("Your browser did not open. Try again.");
  });
  test("a Keychain that cannot be read: a calm line, Check again, and nothing gated or offered", () => {
    const k = on({ state: "keychain", trialUsed: true });
    expect(k.state).toBe("keychain");
    expect(planCard(k, use(3))).toMatchObject({ row: "keychain", buttons: [{ id: "checkAgain", kind: "secondary" }] });
    expect(planCard(k, null).line).toBe(S.plan.keychainLine);
    expect(proCovers(k)).toBe(true);
    expect(atLimit(k, use(3))).toBe(false);
    expect(proTag("ship", k)).toBe(false);
    expect(lastFreeLine(k, use(2))).toBeNull();
    expect(trialOffered("card", k, use(1))).toBe(false);
  });
  test("a trial that ended long ago is plain Free on the card (the shell sends free with the trial used)", () => {
    const old = on({ state: "free", trial: { ...TRIAL, daysLeft: 0, ended: true }, trialUsed: true });
    expect(planCard(old, use(1))).toMatchObject({ row: "free", line: "Free. 1 of 3 fixes used this month.", buttons: [{ id: "getPro", kind: "primary" }] });
  });
});

describe("the page model: plan.usage and plan.limit", () => {
  test("plan.usage is kept, and anything odd is not", () => {
    const m = reduce(initial(), { type: "plan.usage", used: 2, limit: 3, resetsOn: "2026-11-01", everUsed: true });
    expect(m.proUsage).toEqual({ used: 2, limit: 3, resetsOn: "2026-11-01", everUsed: true });
    expect(reduce(m, { type: "plan.usage", used: "x" }).proUsage).toEqual(m.proUsage);
    expect(usageFrom({ used: 1, limit: 3, resetsOn: "2026-11-01" })?.everUsed).toBe(true);
  });
  test("plan.limit shows the card and stops whatever waited on that command; Not now, new work and another folder close it", () => {
    let m: ReturnType<typeof initial> = { ...initial(), followUp: "sending" };
    m = reduce(m, { type: "plan.limit", reason: "fixes", resetsOn: "2026-11-01", command: "agent.send", agent: "a" });
    expect(m.proLimit).toEqual({ reason: "fixes", resetsOn: "2026-11-01", command: "agent.send" } satisfies LimitView);
    expect(m.followUp).toBe("idle");
    expect(m.error).toBeNull();
    expect(reduce(m, { type: "ui.proLimitClosed" }).proLimit).toBeNull();
    expect(reduce(m, { type: "agent.state", agent: "a", state: "working" }).proLimit).toBeNull();
    expect(reduce(m, { type: "ui.projectChanged", project: "/p" }).proLimit).toBeNull();
    expect(reduce(m, { type: "plan.limit", reason: "nonsense" })).toEqual(m);
  });
  test("the limit is never the not fixed look: Flowflow's state is untouched", () => {
    const m = reduce(initial(), { type: "ui.proLimit", reason: "fixes", resetsOn: "2026-11-01" });
    expect(m.character).toBe(initial().character);
    expect(m.agents).toEqual(initial().agents);
  });
});

describe("Get Pro (section 4)", () => {
  test("Yearly first, then Monthly, with the US prices line; nothing chosen for the person", () => {
    const g = getProSheet(on());
    expect(g.choices.map((c) => [c.term, c.label, c.ready])).toEqual([["yearly", "Yearly, $96 a year (save $24)", true], ["monthly", "Monthly, $10 a month", true]]);
    expect(g.lines).toEqual(["US prices. Your local price and tax show at checkout.", "Checkout opens in your browser. Dodo handles the payment, tax and receipts."]);
  });
  test("during a trial it says billing starts today", () => {
    expect(getProSheet(on({ plan: "trial", state: "trial", trial: TRIAL, trialUsed: true })).lines).toContain("Billing starts today if you buy now.");
  });
  test("with no product or checkout host filled in, it calmly says checkout is not ready yet", () => {
    const g = getProSheet(on({ checkout: { yearly: false, monthly: false } }));
    expect(g.ready).toBe(false);
    expect(g.choices.every((c) => !c.ready)).toBe(true);
    expect(g.lines.at(-1)).toBe("Checkout is not ready yet. Nothing has been charged.");
    expect(planProblem("notReady")).toBe("Checkout is not ready yet. Nothing has been charged.");
  });
  test("a pasted key loses the spaces and line breaks an email adds", () => {
    expect(tidyKey("  ABCD-1234\n-EFGH \t")).toBe("ABCD-1234-EFGH");
  });
});

describe("what could not be done, in calm words (section 8)", () => {
  test("each of the shell's reason words has its line, and anything else is a plain try again", () => {
    expect(planProblem("notFound")).toBe(`${PRODUCT} could not find that key. Check it against the email from Dodo.`);
    expect(planProblem("limit")).toBe("This key is already on 3 Macs. Choose Use Pro on another Mac on one of them, or contact support.");
    expect(planProblem("wrongProduct")).toBe("This key is for a different product.");
    expect(planProblem("inactive")).toBe(S.plan.problems.inactive);
    for (const w of ["paymentsOff", "notReady", "keyShape", "notFound", "inactive", "limit", "wrongProduct", "unreachable", "keychain", "noKey", "trialUsed", "alreadyPro", "notCard", "portalNotReady", "browser", "proUnreachable", "proKeychain"]) {
      expect(planProblem(w), w).not.toBe(S.plan.problems.other);
      expect(planProblem(w), w).not.toMatch(/[–—]/);
    }
    // A sentence from somewhere else (curl, the Keychain, a key) never reaches the page.
    for (const raw of ["curl: (6) Could not resolve host", "dodo_lic_ABCDEFGH", new Error("boom"), undefined]) expect(planProblem(raw)).toBe(S.plan.problems.other);
  });
  test("Delete everything's Pro reasons are said; every other answer is left to the page as before", () => {
    expect(proDeleteProblem("proUnreachable")).toContain("nothing was deleted");
    expect(proDeleteProblem("proKeychain")).toContain("nothing was deleted");
    expect(proDeleteProblem("not confirmed")).toBeNull();
  });
});

describe("Delete everything with payments on (section 10, Option 2)", () => {
  test("the trial date is always kept and named; the free fix count starts again and is said", () => {
    const p = proInventoryFrom({ keySaved: false, trialKept: true, fixCountResets: true });
    expect(askTurnOffPro(p)).toBe(false);
    expect(deleteKeeps(p, false)).toEqual([S.dangerKeepsProjects, "The date your trial started, so it can't restart."]);
    expect(deleteGoesPro(p)).toEqual(["This month's free fix count, which starts again."]);
  });
  test("with a key: asked, and the key is named as kept unless the person says turn off Pro", () => {
    const p = proInventoryFrom({ keySaved: true, trialKept: false, fixCountResets: true });
    expect(askTurnOffPro(p)).toBe(true);
    expect(deleteKeeps(p, false)).toEqual([S.dangerKeepsProjects, "Your Pro key, in your Keychain."]);
    expect(deleteKeeps(p, true)).toEqual([S.dangerKeepsProjects]);
    expect(S.plan.turnOffPro).toBe("Also turn off Pro on this Mac");
  });
});

describe("the dates", () => {
  test("a day as 1 Nov, and a date that cannot be read as the 1st of next month", () => {
    expect(dayWords("2026-11-01")).toBe("1 Nov");
    expect(dayWords("2027-01-01")).toBe("1 Jan");
    expect(dayWords("", new Date(2026, 11, 15))).toBe("1 Jan");
    expect(FREE_FIXES).toBe(3);
  });
});

describe("no card form, no web view, no network, no dollar amount and no clipboard read without a press", () => {
  const files = ["./plan.ts", "./planCard.tsx", "./usePlan.ts"].map((f) => [f, read(f)] as const);
  const code = (src: string) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l)).join("\n");
  test("nothing here talks to Dodo or draws a card or login form; checkout and billing go through the shell", () => {
    for (const [f, src] of files) expect(code(src), f).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket|dodopayments\.com|secret|DODO_|<iframe|<webview|<form|cardNumber|password=/i);
    const tauri = read("./tauri.ts");
    for (const c of ["license_status", "license_activate", "license_check_now", "license_deactivate", "plan_open_checkout", "plan_open_portal", "trial_start"]) {
      expect(tauri, c).toContain(`invoke("${c}"`);
      expect(read("../src-tauri/src/main.rs"), c).toMatch(new RegExp(`[ ,]${c}[,\\]]`));
    }
  });
  test("no timer in the plan's page code: it waits for the shell's event", () => {
    for (const [f, src] of files) expect(code(src), f).not.toMatch(/setInterval|setTimeout|requestAnimationFrame/);
  });
  test("no dollar amount outside strings.ts", () => {
    for (const [f, src] of [...files, ["./card.tsx", read("./card.tsx")] as const, ["./settingsPage.tsx", read("./settingsPage.tsx")] as const]) {
      expect(code(src), f).not.toMatch(/\$\s?\d|\d+\s?(?:USD|dollars)/);
    }
  });
  test("the clipboard is read in one place, called only from the Paste key button's press", () => {
    const card = read("./planCard.tsx");
    const reads = card.split("\n").filter((l) => /clipboard/.test(l) && !/^\s*(\/\/|\*|\/\*\*)/.test(l));
    expect(reads.length).toBe(1);
    expect(reads[0]).toContain("navigator.clipboard?.readText()");
    expect(card.match(/pasteFromClipboard\(/g)?.length).toBe(2);   // its definition and its one call
    expect(card).toContain("const paste = () => {\n    setHint(\"\");\n    void pasteFromClipboard()");
    expect(card.match(/\bpaste\b(?!\w)/g)?.filter(Boolean).length).toBeGreaterThan(0);
    expect(card).toContain("onClick={paste}");
    expect(card).not.toMatch(/useEffect\([^)]*clipboard|onFocus=\{[^}]*paste/);
    for (const f of ["./card.tsx", "./settingsPage.tsx", "./usePlan.ts", "./plan.ts"]) expect(code(read(f)), f).not.toContain("readText");
  });
  test("the key field is emptied at once on Turn on Pro, and is a password field", () => {
    const card = read("./planCard.tsx");
    expect(card).toContain('setKey("");   // emptied at once');
    expect(card).toContain('<Field type="password" value={key} label={S.plan.keyLabel}');
  });
  test("every button a Pro card can show does something", () => {
    const card = read("./planCard.tsx");
    for (const id of ["trial", "getPro", "billing", "otherMac", "checkAgain", "pasteKey", "notNow"]) expect(card, id).toContain(`case "${id}":`);
    for (const [, s, u] of ROWS) for (const b of planCard(s, u).buttons) expect(Object.keys(S.plan.buttons)).toContain(b.id);
  });
});
