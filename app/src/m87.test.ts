// M87: the pages' side of Why is live broken? (whyLive.ts): the state from the engine's events, each part in plain words,
// the top line, the live address box and Copy for my AI. Pure, no engine; the fixtures are the protocol's own (m87e1-3).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { LIVE_WHY, type LivePart } from "../../protocol/index.ts";
import { initial, reduce } from "./model.ts";
import { S } from "./strings.ts";
import { addressOk, needsAddress, partView, partViews, whyLiveCopy, whyLiveHeadline, whyLiveReduce, type WhyLive } from "./whyLive.ts";

const fixture = (id: string) => JSON.parse(readFileSync(new URL("../../protocol/fixtures/events.jsonl", import.meta.url), "utf8").split("\n").find((l) => l.includes(`"id":"${id}"`))!);
const asked = (project = "p_9f2c"): WhyLive => ({ project, stage: "asked", parts: [] });

describe("the state follows only the check this page asked for", () => {
  test("asked, then each part as it comes, then done", () => {
    let w = whyLiveReduce(null, { type: "ui.whyLiveAsked", project: "p_9f2c" });
    expect(w).toEqual(asked());
    w = whyLiveReduce(w, fixture("m87e1"));
    expect(w).toMatchObject({ stage: "running", parts: [{ id: "env", why: "missing" }] });
    w = whyLiveReduce(w, fixture("m87e2"));
    expect(w).toMatchObject({ stage: "done", liveUrl: "https://shop.example.com" });
    expect(w!.parts.map((p) => p.id)).toEqual(["env", "stripe", "pages", "database"]);
  });
  test("an answer for another project, or with no press, is not this page's", () => {
    expect(whyLiveReduce(null, fixture("m87e2"))).toBeNull();
    expect(whyLiveReduce(asked("/other"), fixture("m87e2"))).toEqual(asked("/other"));
  });
  test("a part the pages do not know is dropped, never shown", () => {
    const w = whyLiveReduce(asked(), { type: "ship.whyLive", project: "p_9f2c", stage: "done", parts: [{ id: "env", state: "ok", why: "all_present", count: 1 }, { id: "cookies", state: "ok", why: "x" }, { id: "stripe", state: "ok", why: "nonsense" }] });
    expect(w!.parts.map((p) => p.id)).toEqual(["env"]);
  });
  test("Stop everything ends a running check and keeps what was found; a new project closes it", () => {
    const running = whyLiveReduce(asked(), fixture("m87e1"));
    const stopped = whyLiveReduce(running, { type: "app.stop_everything" });
    expect(stopped).toMatchObject({ stage: "stopped", parts: [{ id: "env" }] });
    expect(whyLiveReduce(stopped, { type: "ui.projectChanged" })).toBeNull();
    // A stop that names no parts keeps the ones shown.
    expect(whyLiveReduce(running, { type: "ship.whyLive", project: "p_9f2c", stage: "stopped", parts: [] })!.parts.length).toBe(1);
  });
  test("the page's model carries it", () => {
    let m = reduce(initial(), { type: "ui.whyLiveAsked", project: "p_9f2c" });
    m = reduce(m, fixture("m87e2"));
    expect(m.whyLive?.stage).toBe("done");
    expect(reduce(m, { type: "ui.whyLiveClosed" }).whyLive).toBeNull();
    expect(reduce(reduce(reduce(initial(), { type: "ui.whyLiveAsked", project: "p_9f2c" }), fixture("m87e1")), { type: "app.stop_everything" }).whyLive?.stage).toBe("stopped");
  });
});

describe("every reason has plain words, and a next step when the person has something to do", () => {
  const sample: Omit<LivePart, "id" | "state" | "why"> = { names: ["A_NAME"], more: ["B_NAME"], count: 2, at: "2026-11-13T21:04:00.000Z", mode: "live", detail: "The database check's own line." };
  test("all of them", () => {
    for (const [id, whys] of Object.entries(LIVE_WHY)) for (const why of whys) {
      const v = partView({ id: id as LivePart["id"], state: "problem", why, ...sample });
      expect(v.line.length, `${id}:${why}`).toBeGreaterThan(10);
      expect(`${v.line} ${v.next ?? ""}`, `${id}:${why}`).not.toMatch(/—|\bundefined\b|\bnull\b|NaN/);
    }
  });
  test("the skipped ones say exactly what to do, and never ask for a key", () => {
    for (const [id, why, want] of [["env", "no_cli", /npm install -g vercel/], ["env", "not_signed_in", /vercel login/], ["env", "not_linked", /vercel link/], ["stripe", "no_cli", /brew install stripe/], ["stripe", "not_signed_in", /stripe login/], ["pages", "no_address", /Type it below/]] as const) {
      const v = partView({ id, state: "skipped", why });
      expect(v.next, `${id}:${why}`).toMatch(want);
      expect(`${v.line} ${v.next}`).not.toMatch(/paste.*key|enter.*key|your api key/i);
    }
  });
  test("a missing value is named with the file and line that reads it (E4)", () => {
    const v = partView(fixture("m87e1").parts[0]);
    expect(v.line).toContain("STRIPE_WEBHOOK_SECRET");
    expect(v.line).toContain("SENTRY_DSN");
    expect(v.where).toEqual(["STRIPE_WEBHOOK_SECRET: app/api/webhooks/stripe/route.ts, line 9"]);
    expect(v.next).toMatch(/Environment Variables.*Production/);
  });
  test("failing webhooks say how many, which kinds, where and what a 405 means (E3)", () => {
    const v = partView(fixture("m87e2").parts[1]);
    expect(v.line).toMatch(/could not deliver 12 events in live mode \(checkout\.session\.completed, invoice\.paid\) to shop\.example\.com\/api\/webhooks\/stripe/);
    expect(v.next).toMatch(/405/);
  });
});

describe("the top line, the waiting rows and the address box", () => {
  test("while it runs, the parts not done yet wait in order", () => {
    const w = whyLiveReduce(asked(), fixture("m87e1"))!;
    expect(whyLiveHeadline(w)).toBe(S.whyLive.running);
    expect(partViews(w).map((v) => `${v.id}:${v.state}`)).toEqual(["env:problem", "stripe:waiting", "pages:waiting", "database:waiting"]);
  });
  test("done: how many look broken; nothing broken but some skipped says so", () => {
    expect(whyLiveHeadline(whyLiveReduce(asked(), fixture("m87e2"))!)).toBe(S.whyLive.problems(2));
    const quiet: WhyLive = { project: "p", stage: "done", parts: [{ id: "env", state: "ok", why: "all_present", count: 3 }, { id: "stripe", state: "skipped", why: "not_used" }, { id: "pages", state: "skipped", why: "no_private_pages" }, { id: "database", state: "skipped", why: "not_used" }] };
    expect(whyLiveHeadline(quiet)).toBe(S.whyLive.noneFound);
    expect(whyLiveHeadline({ ...quiet, parts: [...quiet.parts.slice(0, 1), { id: "stripe", state: "skipped", why: "no_cli" }] })).toBe(S.whyLive.noneButSkipped);
  });
  test("M87 review: when no part was checked to an answer, the top line never reads as a partial all clear", () => {
    const none: WhyLive = { project: "p", stage: "done", parts: [{ id: "env", state: "skipped", why: "no_cli" }, { id: "stripe", state: "skipped", why: "not_signed_in", mode: "live" }, { id: "pages", state: "skipped", why: "no_address" }, { id: "database", state: "skipped", why: "not_used" }] };
    expect(whyLiveHeadline(none)).toBe(S.whyLive.nothingChecked);
    expect(whyLiveHeadline({ ...none, parts: [{ id: "pages", state: "could_not", why: "unreachable", names: ["/dashboard"], at: "https://shop.example.com" }] })).toBe(S.whyLive.nothingChecked);
    expect(whyLiveHeadline(whyLiveReduce(asked(), fixture("m87e5"))!)).toBe(S.whyLive.nothingChecked);
    expect(whyLiveHeadline(whyLiveReduce(asked(), fixture("m87e4"))!)).toBe(S.whyLive.notSetUp);
  });
  test("M87 review: a site that did not answer is never fine, and the pages that did not answer are named", () => {
    const v = partView(fixture("m87e5").parts[2]);
    expect(v.state).toBe("could_not");
    expect(v.line).toContain("/dashboard");
    expect(v.line).toMatch(/did not answer/);
    expect(v.line).toContain("These asked for a sign in: /settings");
    expect(v.line).not.toMatch(/Fine/);
  });
  test("M87 review: failed Stripe events are the account's; no endpoint is blamed unless the engine named the one", () => {
    const p = fixture("m87e2").parts[1];
    const { more: _m, ...noTarget } = p;
    expect(partView(noTarget).line).toMatch(/to your Stripe account's webhook endpoints\./);
    expect(partView(noTarget).line).not.toContain("shop.example.com");
    const u = partView(fixture("m87e5").parts[1]);
    expect(u.line).toMatch(/could not tell which one is this project's/);
    expect(needsAddress(whyLiveReduce(asked(), fixture("m87e5"))!)).toBe(true);
  });
  test("M87 review: a helper restart or exit ends the wait, and its late answer is not taken", () => {
    for (const type of ["app.runner_restarted", "app.runner_down"]) {
      const w = whyLiveReduce(whyLiveReduce(asked(), fixture("m87e1")), { type })!;
      expect(w.stage, type).toBe("interrupted");
      expect(whyLiveHeadline(w)).toBe(S.whyLive.interrupted);
      expect(whyLiveReduce(w, fixture("m87e2"))!.stage).toBe("interrupted");
    }
    // Done stays done.
    const done = whyLiveReduce(asked(), fixture("m87e2"))!;
    expect(whyLiveReduce(done, { type: "app.runner_restarted" })).toBe(done);
    expect(reduce(reduce(reduce(initial(), { type: "ui.whyLiveAsked", project: "p_9f2c" }), fixture("m87e1")), { type: "app.runner_restarted" }).whyLive?.stage).toBe("interrupted");
  });
  test("M87 review: Check again keeps the panel where it was opened", () => {
    const g = whyLiveReduce(null, { type: "ui.whyLiveAsked", project: "p_9f2c", from: "gates" })!;
    expect(g.from).toBe("gates");
    expect(whyLiveReduce(whyLiveReduce(g, fixture("m87e2")), { type: "ui.whyLiveAsked", project: "p_9f2c" })!.from).toBe("gates");
    expect(whyLiveReduce(g, { type: "ui.whyLiveAsked", project: "/other" })!.from).toBeUndefined();
  });
  test("the address box shows only when the pages part needs one, and takes only a plain https address", () => {
    expect(needsAddress({ project: "p", stage: "done", parts: [{ id: "pages", state: "skipped", why: "no_address" }] })).toBe(true);
    expect(needsAddress(whyLiveReduce(asked(), fixture("m87e2"))!)).toBe(false);
    expect(addressOk(" https://shop.example.com/dashboard ")).toBe("https://shop.example.com");
    for (const bad of ["shop.example.com", "http://shop.example.com", "https://localhost", "https://a:b@shop.example.com", "javascript:alert(1)"]) expect(addressOk(bad), bad).toBeNull();
  });
});

describe("Copy for my AI", () => {
  test("what is broken first, each with its next step and place, then what was not checked, then the ask", () => {
    const w: WhyLive = { project: "p", stage: "done", parts: [fixture("m87e1").parts[0], { id: "stripe", state: "skipped", why: "not_signed_in", mode: "live" }, { id: "pages", state: "skipped", why: "no_private_pages" }, { id: "database", state: "skipped", why: "not_used" }] };
    const text = whyLiveCopy(w, "shop");
    const lines = text.split("\n");
    expect(lines[0]).toBe(S.whyLive.copyHead("shop"));
    expect(text).toContain(`- ${S.whyLive.parts.env}: `);
    expect(text).toContain("  STRIPE_WEBHOOK_SECRET: app/api/webhooks/stripe/route.ts, line 9");
    expect(text.indexOf(S.whyLive.copyNotChecked)).toBeGreaterThan(text.indexOf("STRIPE_WEBHOOK_SECRET"));
    expect(text).toContain(`- ${S.whyLive.parts.stripe}: `);
    expect(text).not.toContain(S.whyLive.parts.pages);   // nothing to check there is not "not checked"
    expect(lines.at(-1)).toBe(S.whyLive.copyAsk);
    expect(S.whyLive.copyAsk).toMatch(/Never show me or write down any secret value/);
  });
  test("nothing to say while it runs or when all is fine", () => {
    expect(whyLiveCopy(whyLiveReduce(asked(), fixture("m87e1"))!, "shop")).toBe("");
    expect(whyLiveCopy({ project: "p", stage: "done", parts: [{ id: "env", state: "ok", why: "all_present", count: 1 }] }, "shop")).toBe("");
  });
});
