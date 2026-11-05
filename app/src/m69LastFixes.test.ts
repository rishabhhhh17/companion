// M69 step 4, the last fixes from the review (tests first, rule 17). Each block is one finding: F29 (Squibby pays and
// picks the model, so nobody adds a key and no cost in cents shows), honest payments words on the review card, every word
// in strings.ts, the style lints over every stylesheet Home loads, no made up address on the proof picture, and no check
// listed that may never run.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PANEL_DO, islandJobs, panelView } from "./islandPanel.ts";
import { initial, reduce, type Model } from "./model.ts";
import { heroWords } from "./homeHero.ts";
import { PAGES } from "./settingsPages.ts";
import { reviewHead } from "./reviewHead.ts";
import { outcomeTitle, resultHero } from "./homeRest.ts";
import { ShotPair } from "./homeRest.tsx";
import { updateLine } from "./updates.ts";
import { runList } from "./runList.ts";
import { ALL_CSS, FIX_CSS, HOME_NOW_CSS, PAGES_CSS } from "./ui/cssFiles.ts";
import { S } from "./strings.ts";

const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = { ...initial(), runnerUp: true }) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const started = [ev({ type: "checkpoint.created", project: "/p", agent: "a", checkpoint: "cp_1", label: "Before: fix the join button", files: 3, skipped: [] }), ev({ type: "agent.state", agent: "a", state: "working" })];
const MONEY = /\$\d|\bcents?\b|on your key/i;

describe("F29: the notch never asks for a key or to connect Claude", () => {
  test("not connected yet: one true line, no button", () => {
    const off = run([ev({ type: "auth.status", method: "none" })]);
    const v = panelView(off, islandJobs(off), { note: "", status: "" });
    expect(v).toEqual({ kind: "line", line: S.islandNotConnected });
    expect(S.islandNotConnected).not.toMatch(/connect|key|Claude|click/i);
  });
  test("the panel has no Add your key button and asks Home for no key place", () => {
    const view = code("./islandPanel.tsx");
    expect(view).not.toContain("S.home.addKey");
    expect(view).not.toContain("PANEL_DO.key");
    expect(Object.keys(PANEL_DO)).toEqual(["undo"]);
  });
});

describe("F29: no cost in dollars or cents where a customer looks", () => {
  const paid = run([...started, ev({ type: "cost.update", agent: "a", usdEstimate: 0.04 })]);
  test("Home's working line never says what the job cost", () => {
    const h = heroWords(paid, "/p");
    expect(h.line).not.toMatch(MONEY);
    expect("count" in h).toBe(false);
    expect(code("./card.tsx")).not.toContain("words={workingLine}");
  });
  test("a finished job's line says what was asked, never its cost", () => {
    const done = run([...started, ev({ type: "receipt", agent: "a", checkpoint: "cp_1", changed: [{ file: "a.js", kind: "modified" }], commands: 0, notUndoable: [], usdEstimate: 0.05, proof: "skipped", ended: "done" }), ev({ type: "agent.state", agent: "a", state: "done" })]);
    expect(heroWords(done, "/p").line).not.toMatch(MONEY);
  });
  test("the notch's job card carries no cost", () => {
    const [c] = islandJobs(paid);
    expect("cost" in c).toBe(false);
    expect(code("./islandPanel.tsx")).not.toContain(".cost");
  });
  test("the practice never says a cost", () => {
    const p = code("./practicePanel.tsx");
    for (const gone of ["S.fixCost", "S.noCost", "costWords(", "formatUsd"]) expect(p, gone).not.toContain(gone);
    expect(S.practiceFixing).not.toMatch(MONEY);
  });
  test("the plan card says no cost either", () => {
    expect(code("./card.tsx")).not.toContain("S.planCost");
  });
});

describe("F29: the key is a developer tool under Show all options, and no message sends anyone to a key", () => {
  test("Account's main groups have no key; it waits in Show all options", () => {
    expect(PAGES.account.groups.map((g) => g.id)).not.toContain("account.claude");
    const more = PAGES.account.more.find((t) => t.items.some((i) => typeof i !== "string" && i.fixed === "key"));
    expect(more?.id).toBe("more.account.developer");
    expect(S.setGroupTitles["more.account.developer"]).toBeTruthy();
  });
  test("Account's line and the plan's foot say nothing about a key or paying Anthropic", () => {
    expect(S.pages.account.sub).not.toMatch(/key|Claude/i);
    expect(S.setGroupFoot["account.plan"] ?? "").not.toMatch(/Anthropic|key/i);
  });
  test("an engine refusal never tells the person to check a key, sign in, or add credit", () => {
    for (const k of ["authentication_failed", "cloud_credential_error", "billing_error", "oauth_org_not_allowed", "account_on_hold", "verification_required", "model_not_found"]) {
      expect(S.claudeStopped(k, S.againTryAgain), k).not.toMatch(/key|sign in|console\.anthropic|credit|your account|Choose another/i);
    }
  });
});

describe("the payments headline only for a live secret payments key on the pointed line", () => {
  const card = (lines: { n: number; text: string }[]) => reviewHead({ project: "/p", batch: "b", count: 1, stage: "waiting", keys: [{ file: "src/pay.ts", line: 12, lines }] } as never);
  const PAY = S.homeNow.reviewHead.secret_in_code_pay[0], PLAIN = S.homeNow.reviewHead.secret_in_code[0];
  test("a live secret or restricted key on the pointed line is a payments password", () => {
    expect(card([{ n: 12, text: 'const k = "sk_live_…";' }])?.headline).toBe(PAY);
    expect(card([{ n: 12, text: 'const k = "rk_live_…";' }])?.headline).toBe(PAY);
  });
  test("a publishable key (public by design) or a test key (cannot spend) is not", () => {
    expect(card([{ n: 12, text: 'const k = "pk_live_…";' }])?.headline).toBe(PLAIN);
    expect(card([{ n: 12, text: 'const k = "sk_test_…";' }])?.headline).toBe(PLAIN);
  });
  test("a neighbouring line's key never decides the headline", () => {
    expect(card([{ n: 11, text: 'const STRIPE = "sk_live_…";' }, { n: 12, text: 'const OPENAI = "sk-…";' }])?.headline).toBe(PLAIN);
  });
});

describe("every word a person sees is in strings.ts", () => {
  test("a proven fix's title comes from strings.ts", () => {
    expect(outcomeTitle("fix the sign up button", "proven")).toBe(S.homeNow.fixedThing("sign up button"));
    expect(resultHero({ project: "/p", label: "fix the sign up button", kind: "proven", said: null })?.first).toBe(`${S.homeNow.fixedThing("sign up button")}.`);
    expect(code("./homeRest.ts")).not.toMatch(/\} fixed`/);
  });
  test("the update lines come from strings.ts", () => {
    expect(updateLine({ stage: "idle" }, "1.2.0", false)).toBe(`${S.updateWords.version("1.2.0")} ${S.updateWords.notSetUp}`);
    expect(updateLine({ stage: "none" }, "", true)).toBe(S.updateWords.newest);
    const src = code("./updates.ts");
    for (const gone of ["Updates are not set up", "You have the newest", "Looking for a new", "Downloading and installing"]) expect(src, gone).not.toContain(gone);
  });
});

describe("the style lints cover every stylesheet Home loads", () => {
  test("ALL_CSS has every ./ui stylesheet card.tsx imports", () => {
    const all = ALL_CSS();
    for (const [, f] of read("./card.tsx").matchAll(/^import "\.\/ui\/([\w]+\.css)";$/gm)) expect(all, f).toContain(read(`./ui/${f}`).slice(0, 400));
    expect(all).toContain(HOME_NOW_CSS().slice(0, 400));
  });
  test("styleLint checks the M69 stylesheets for upper case, theme gates and colours", () => {
    const lint = read("./ui/styleLint.test.ts");
    for (const n of ["PAGES_CSS()", "FIX_CSS()", "HOME_NOW_CSS()"]) expect(lint, n).toContain(n);
    for (const css of [PAGES_CSS(), FIX_CSS(), HOME_NOW_CSS()]) expect(css.length).toBeGreaterThan(0);
  });
});

describe("the proof picture never shows a made up address", () => {
  test("no address in the bar unless one is given", () => {
    const html = renderToStaticMarkup(createElement(ShotPair, { after: "AAAA" }));
    expect(html).not.toContain("<code>");
  });
});

describe("the run list never lists a check that may never run", () => {
  test("before any check reports: the change, then one Checking the work row", () => {
    const l = runList(run(started))!;
    expect(l.rows.map((r) => [r.key, r.words, r.state])).toEqual([["work", S.fixRun.workRow, "now"], ["plan:check", S.fixRun.waitRow, "waiting"]]);
    for (const w of Object.values(S.fixRun.planned)) expect(l.rows.map((r) => r.words)).not.toContain(w);
  });
  test("once a check reports, only the checks the engine said", () => {
    const m = run([...started, ev({ type: "agent.state", agent: "a", state: "checking" }), ev({ type: "proof.step", agent: "a", rung: "checks", label: "Building and checking the code", status: "running", detail: "" })]);
    expect(runList(m)!.rows.map((r) => r.key)).toEqual(["work", "checks"]);
  });
});
