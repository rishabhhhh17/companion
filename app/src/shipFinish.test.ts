// M58 UI 6 and UI 13: going live has a finish line, and signing in to Vercel is a visible step the person starts, without
// Terminal. Plain code in shipFinish.ts; card.tsx and shipPanels.tsx draw it.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseCommand, parseEvent } from "../../protocol/index.ts";
import { proofGate } from "../../runner/src/ship/gates.ts";
import { NOT_SIGNED_IN } from "../../runner/src/ship/deploy.ts";
import { gateAction, gateFixCommand, putOnlineShown, signInReduce, signInView, type Gate } from "./shipFinish.ts";
import { shipSignIn } from "./commands.ts";
import { initial, reduce, type Model, type ShipFlow } from "./model.ts";
import { S } from "./strings.ts";

const P = "/Users/me/shop";
const g = (status: Gate["status"], id = "secrets", detail = "Found a Stripe live key in src/pay.js (line 3).", overridable?: boolean): Gate => ({ id, label: id, status, detail, ...(overridable !== undefined ? { overridable } : {}) });
const report = (gates: Gate[], canShip = gates.every((x) => x.status === "passed" || x.status === "not_applicable")) => ({ gates, canShip, blockedBy: gates.filter((x) => x.status === "blocked").map((x) => x.id), needsYou: gates.filter((x) => x.status === "could_not_check").map((x) => x.id), confirmed: [] });
const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
const panels = readFileSync(new URL("./shipPanels.tsx", import.meta.url), "utf8");

describe("Put it online after every gate passed (UI 6)", () => {
  test("shown as the panel's main button only when every gate passed, outside a practice copy", () => {
    expect(putOnlineShown(report([g("passed", "checked"), g("passed"), g("not_applicable", "database_access")]), false)).toBe(true);
    expect(putOnlineShown(report([g("passed", "checked"), g("blocked")]), false)).toBe(false);
    expect(putOnlineShown(report([g("passed", "checked"), g("could_not_check", "secrets", "d", true)]), false)).toBe(false);
    // A practice copy is never put on the internet.
    expect(putOnlineShown(report([g("passed", "checked")]), true)).toBe(false);
    expect(putOnlineShown(null, false)).toBe(false);
    // The engine's own canShip wins: never shown when it says no.
    expect(putOnlineShown(report([g("passed")], false), false)).toBe(false);
  });
  test("it sends the deploy step, which reuses the check that just passed (no second check of the same version)", () => {
    expect(panels).toMatch(/onPutOnline/);
    // card.tsx hands the panel shipOnline, the one way online that goes through the Pro gate and sends ship.preview.
    expect(card).toMatch(/onPutOnline=\{shipOnline\}/);
  });
});

describe("Fix it on a blocked gate (UI 6)", () => {
  test("a blocked gate gets Fix it; the version that was never checked or changed since gets Check again instead", () => {
    expect(gateAction(g("blocked"))).toBe("fix");
    expect(gateAction(proofGate({ verdict: "failed", unchangedSince: true }) as Gate)).toBe("fix");
    expect(gateAction(proofGate(undefined) as Gate)).toBe("check");
    expect(gateAction(proofGate({ verdict: "passed", unchangedSince: false }) as Gate)).toBe("check");
    expect(gateAction(proofGate({ verdict: "cancelled", unchangedSince: true }) as Gate)).toBe("check");
  });
  test("a gate that could not check and may be confirmed keeps I checked this myself; a passed gate has nothing", () => {
    expect(gateAction(g("could_not_check", "secrets", "d", true))).toBe("confirm");
    expect(gateAction(g("could_not_check", "secrets", "d", false))).toBeNull();
    expect(gateAction(g("passed"))).toBeNull();
    expect(gateAction(g("not_applicable"))).toBeNull();
  });
  test("its Fix it is an ordinary checked fix of what the gate found, a valid command", () => {
    const c = gateFixCommand(P, g("blocked")) as { type: string; project: string; prompt: string };
    expect(parseCommand(JSON.stringify(c)).ok).toBe(true);
    expect(c.type).toBe("agent.start");
    expect(c.project).toBe(P);
    expect(c.prompt).toContain("Found a Stripe live key in src/pay.js (line 3).");
  });
  test("the found problem stays on screen until the engine's first event: no plan request clears the panel first", () => {
    // The gate's own Fix it never dispatches ui.planRequested (that would close the panel before the work starts): the
    // task's first event (its safety copy, checkpoint.created) is what takes the panel's place.
    const fix = card.match(/const gateFix = [^\n]+/)?.[0] ?? "";
    expect(fix).toMatch(/sendOrExplain\(gateFixCommand/);
    expect(fix).not.toMatch(/ui\.planRequested/);
    const m: Model = { ...initial(), folder: P, ship: report([g("blocked")]) as never };
    expect(reduce(m, { type: "checkpoint.created", agent: "builder-1", project: P, checkpoint: "cp_1", label: "Before: fix" } as never).ship).toBeNull();
    // "Starting the fix" shows on that gate at once, from the press.
    expect(panels).toMatch(/S\.going\.fixStarting/);
  });
});

describe("Sign in to Vercel without Terminal (UI 13)", () => {
  test("the not signed in words never say Open Terminal", () => {
    expect(NOT_SIGNED_IN).not.toMatch(/Terminal|vercel login/i);
    expect(NOT_SIGNED_IN).toContain(S.going.signIn);
  });
  test("the command names the project and passes the protocol", () => {
    const c = shipSignIn(P);
    expect(c).toMatchObject({ type: "ship.signIn", project: P });
    expect(parseCommand(JSON.stringify(c)).ok).toBe(true);
  });
  const base: ShipFlow = { stage: "not_signed_in", detail: NOT_SIGNED_IN };
  const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", type: "ship.signIn", project: P, ...o });
  test("not signed in: the one line first, then Sign in to Vercel, a step the person starts", () => {
    expect(signInView(base)).toEqual({ show: "ask" });
    expect(S.going.signInLine).toBe(`Your browser opens Vercel's own sign in page. ${S.going.product} never sees your password.`);
    expect(signInView({ ...base, stage: "ready" })).toEqual({ show: "none" });
  });
  test("asked, opened, done and failed each say where it is; the page that opens is Vercel's own", () => {
    const asked = signInReduce(base, { type: "ui.signInAsked" });
    expect(signInView(asked)).toEqual({ show: "busy" });
    const opened = signInReduce(asked, ev({ stage: "opened", url: "https://vercel.com/oauth/device?user_code=ABCD-EFGH" }));
    expect(signInView(opened)).toEqual({ show: "opened", url: "https://vercel.com/oauth/device?user_code=ABCD-EFGH" });
    const fake = signInReduce(asked, ev({ stage: "opened", url: "https://vercel.com.evil.example/login" }));
    expect(signInView(fake)).toEqual({ show: "busy" });
    expect(signInView(signInReduce(opened, ev({ stage: "done" })))).toEqual({ show: "done" });
    expect(signInView(signInReduce(opened, ev({ stage: "failed", reason: "Vercel did not finish the sign in.", lesson: true })))).toEqual({ show: "failed", reason: "Vercel did not finish the sign in.", lesson: true });
  });
  test("Stop everything ends a sign in that was waiting: it is never left on a busy line", () => {
    const asked = signInReduce(base, { type: "ui.signInAsked" });
    expect(signInView(signInReduce(asked, { type: "app.stop_everything" }))).toEqual({ show: "ask" });
  });
  test("a sign in event reaches the Online box through the model, and parses", () => {
    const m: Model = { ...initial(), folder: P, shipFlow: base };
    const e = ev({ stage: "opened", url: "https://vercel.com/oauth/device?user_code=ABCD-EFGH" });
    expect(parseEvent(JSON.stringify(e)).ok).toBe(true);
    expect(signInView(reduce(m, e as never).shipFlow)).toMatchObject({ show: "opened" });
    expect(reduce(m, ev({ stage: "done" }) as never).shipFlow?.signIn?.stage).toBe("done");
  });
  test("Check again after signing in is the person's tap, never a timer", () => {
    expect(panels).toMatch(/S\.going\.checkAgain/);
    expect(panels).not.toMatch(/setInterval/);
    expect(panels.match(/setTimeout/g) ?? []).toHaveLength(0);
  });
  test("Vercel's page opens only on the person's press of its Open button, and a lesson is there when it cannot run", () => {
    // A link opens only from a button's click, in card.tsx (links.test.ts): the step hands its page to OpenButton.
    expect(panels).not.toMatch(/open_link/);
    expect(card).toMatch(/open=\{\(url\) => <OpenButton url=\{url\}/);
    expect(card).toMatch(/beginLesson\("vercel-sign-in", false\)/);
    expect(panels).toMatch(/vercel-sign-in/);
  });
});
