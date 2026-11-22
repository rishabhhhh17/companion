// M117 step 7: the money rules in the review of every change. Only what the change added; only Worth a look, never Stop,
// at any strictness and with any chosen stops; never what a rule cannot tell. A limit added in the same change, or already
// in middleware the change did not touch, raises nothing. After Fix it the same rule checks again (M104). No model call.
// Temporary folders and stand in engines only: no model, no key, no real project, the person's git never touched.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEvent, PROTOCOL_VERSION, REVIEW_SILENCE_LINES, REVIEW_STRICTNESS, reviewSilenced, type Command } from "../../protocol/index.ts";
import { CheckpointStore } from "../src/checkpoints.ts";
import { moneyReasons } from "../src/money/review.ts";
import type { WatchFn } from "../src/review/batcher.ts";
import type { FixCheck, FixFinding } from "../src/review/fixcheck.ts";
import { applyStrictness, recheckHolds, STOP_KINDS } from "../src/review/look.ts";
import { rate, type RateInput } from "../src/review/rate.ts";
import { NO_SIGN_UPS, sendBackText } from "../src/review/sendback.ts";
import { ReviewService, type ReviewDeps } from "../src/review/service.ts";

const PKG = JSON.stringify({ dependencies: { next: "15", openai: "4" } });
const AI_ROUTE = `import OpenAI from "openai";\nconst ai = new OpenAI();\n\nexport async function POST(req: Request) {\n  return new Response("x");\n}\n`;
const LIMITED = `import OpenAI from "openai";\nimport { Ratelimit } from "@upstash/ratelimit";\nconst rl = new Ratelimit({});\n\nexport async function POST(req: Request) {\n  await rl.limit("ip");\n  return new Response("x");\n}\n`;
const kinds = (r: { items: { reason: { kind: string } }[] }) => r.items.map((x) => x.reason.kind);

describe("only what the change added", () => {
  const before = { "package.json": PKG };
  test("a new AI route with no limit is paid_route_open with its file and line, and says it could be set in a dashboard", () => {
    const r = moneyReasons({ changed: ["app/api/chat/route.ts"], before, after: { ...before, "app/api/chat/route.ts": AI_ROUTE } });
    expect(r.items.map((x) => x.reason)).toEqual([{ kind: "paid_route_open", file: "app/api/chat/route.ts", line: 4, say: "app/api/chat/route.ts at line 4 (POST /api/chat) calls OpenAI, and nothing limits how often it can be called. If you set a limit in your host's dashboard, this is already covered." }]);
  });
  test("the same route already there before the change: nothing", () => {
    const was = { ...before, "app/api/chat/route.ts": AI_ROUTE };
    expect(kinds(moneyReasons({ changed: ["app/api/chat/route.ts"], before: was, after: { ...was, "app/api/chat/route.ts": AI_ROUTE.replace('"x"', '"y"') } }))).toEqual([]);
  });
  test("a limit added in the same change: nothing; a limit in middleware.ts the change did not touch: nothing", () => {
    expect(kinds(moneyReasons({ changed: ["app/api/chat/route.ts"], before, after: { ...before, "app/api/chat/route.ts": LIMITED } }))).toEqual([]);
    const mw = { ...before, "middleware.ts": `import { Ratelimit } from "@upstash/ratelimit";\nconst rl = new Ratelimit({});\nexport async function middleware() { await rl.limit("x"); }\nexport const config = { matcher: ["/api/:path*"] };\n` };
    expect(kinds(moneyReasons({ changed: ["app/api/chat/route.ts"], before: mw, after: { ...mw, "app/api/chat/route.ts": AI_ROUTE } }))).toEqual([]);
  });
  test("what a rule cannot tell (a matcher made by code) is never raised in a review", () => {
    const mw = { ...before, "middleware.ts": `import { Ratelimit } from "@upstash/ratelimit";\nconst rl = new Ratelimit({});\nexport async function middleware() { await rl.limit("x"); }\nexport const config = { matcher: LIST };\n` };
    expect(kinds(moneyReasons({ changed: ["app/api/chat/route.ts"], before: mw, after: { ...mw, "app/api/chat/route.ts": AI_ROUTE } }))).toEqual([]);
  });
  test("a tracker added with no consent is tracker_no_consent; with consent added in the same change, nothing", () => {
    const after = { ...before, "app/layout.tsx": `export default function L({ children }) {\n  return <html><body>{children}<script>fbq("init", "1")</script></body></html>;\n}\n` };
    expect(kinds(moneyReasons({ changed: ["app/layout.tsx"], before, after }))).toEqual(["tracker_no_consent"]);
    const consented = { ...after, "app/layout.tsx": `import CookieConsent from "react-cookie-consent";\n${after["app/layout.tsx"]}` };
    expect(kinds(moneyReasons({ changed: ["app/layout.tsx"], before, after: consented }))).toEqual([]);
  });
  test("a new public form with no bot check is form_open; a told one is not raised", () => {
    const after = { ...before, "app/page.tsx": `export default () => <form action="/api/waitlist"><input type="email" name="email" /></form>;\n` };
    expect(kinds(moneyReasons({ changed: ["app/page.tsx"], before, after }))).toEqual(["form_open"]);
    expect(kinds(moneyReasons({ changed: ["app/page.tsx"], before, after, told: ["Bot check for app/page.tsx is set up outside the code (you told me)."] }))).toEqual([]);
  });
  test("a change that starts using a paid AI service gets one spending note, never a reason", () => {
    const r = moneyReasons({ changed: ["lib/ai.ts"], before: { "package.json": "{}" }, after: { "package.json": "{}", "lib/ai.ts": `import Anthropic from "@anthropic-ai/sdk";\n` } });
    expect(r.items).toEqual([]);
    expect(r.notes).toEqual(["This change starts using Anthropic. Set a monthly budget and an alert in its dashboard."]);
  });
});

describe("never Stop", () => {
  const reasons = [
    { kind: "paid_route_open" as const, file: "a.ts", line: 1, say: "x" }, { kind: "form_open" as const, file: "b.tsx", line: 2, say: "y" }, { kind: "tracker_no_consent" as const, file: "c.tsx", line: 3, say: "z" },
  ];
  const input: RateInput = { changes: [{ file: "a.ts", kind: "added" }], touches: [], secrets: [], stillUsed: [], secretFiles: [], checks: "passed", count: 1, capped: false, found: reasons };
  test("at every strictness and with every chosen stop the rating is worth a look at most", () => {
    for (const stopTouches of [[], ["sign_in"], ["payments"], ["sign_in", "payments"]] as const) {
      const r = rate({ ...input, stopTouches });
      expect(r.rating).toBe("worth_a_look");
      for (const s of REVIEW_STRICTNESS) expect(applyStrictness(r, s, new Set()).rating).not.toBe("stop");
    }
    for (const r of reasons) expect(STOP_KINDS.has(r.kind)).toBe(false);
  });
  test("Quiet hides each; Don't flag this kind here again silences each; Careful shows them", () => {
    const r = rate(input);
    expect(applyStrictness(r, "quiet", new Set()).reasons).toEqual([]);
    for (const k of ["paid_route_open", "form_open", "tracker_no_consent"] as const) {
      const line = REVIEW_SILENCE_LINES[k]!;
      expect(line).toBeTruthy();
      const silenced = reviewSilenced([line]);
      expect(applyStrictness(r, "normal", silenced).reasons.map((x) => x.kind)).not.toContain(k);
      expect(applyStrictness(r, "careful", silenced).reasons.map((x) => x.kind)).toContain(k);
    }
  });
  test("Copy for my AI adds the no sign ups line, outside the quote", () => {
    const text = sendBackText({ rating: "worth_a_look", reasons, touches: [], files: [{ file: "a.ts", kind: "added" }], count: 1, summary: "", notes: [] });
    expect(text).toContain(NO_SIGN_UPS);
    expect(text.split("\n").find((l) => l.includes("Do not sign up"))!.startsWith(">")).toBe(false);
    expect(sendBackText({ rating: "safe", reasons: [], touches: [], files: [], count: 0, summary: "", notes: [] })).not.toContain(NO_SIGN_UPS);
  });
  test("the recheck runs the same rule: holds while there is no limit, not once one is added", () => {
    const t = { how: "money" as const, kind: "paid_route_open" as const, file: "app/api/chat/route.ts", anchor: "POST|/api/chat", context: ["package.json"] };
    const state = (route: string) => ({ text: { "package.json": PKG, "app/api/chat/route.ts": route }, changedSinceBefore: new Set<string>(), migrations: {} });
    expect(recheckHolds(t, state(AI_ROUTE))).toBe(true);
    expect(recheckHolds(t, state(LIMITED))).toBe(false);
    expect(recheckHolds(t, { text: {}, changedSinceBefore: new Set(), migrations: {} })).toBe(false);
  });
});

// ---------- the review service, with no model ----------

const made: string[] = [];
const services: ReviewService[] = [];
afterEach(() => { while (services.length) services.pop()!.stop(); while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-m117-${l}-`))); made.push(d); return d; };
const write = (dir: string, files: Record<string, string>) => { for (const [p, c] of Object.entries(files)) { mkdirSync(join(dir, p, ".."), { recursive: true }); writeFileSync(join(dir, p), c); } };
type Ev = Record<string, any>;

function setup(files: Record<string, string>, values: Record<string, unknown> = {}) {
  const project = tmp("proj"), shadow = tmp("shadow");
  write(project, files);
  const store = new CheckpointStore(join(shadow, "p.git"), project);
  const events: Ev[] = [];
  let send: ((rel: string) => void) | null = null;
  const watch: WatchFn = (_d, on) => { send = on; return { close: () => { send = null; } }; };
  let modelCalls = 0;
  const answers: unknown[] = [];
  let fixWrites: Record<string, string> = {};
  const all: Record<string, unknown> = { "review.mode": "ask", "flow.on": true, ...values };
  const deps: ReviewDeps = {
    emit: (e) => events.push(e), setting: (k) => all[k], store: () => store,
    cheap: { run: async () => { modelCalls++; return { text: "{}", costUsd: 0 }; } } as never, strong: null,
    spend: { room: () => 0, book: () => {} },
    fix: async (_cmd, check?: FixCheck) => { write(project, fixWrites); const after = await store.snapshot("After: the fix"); answers.push(check ? await check({ after: after.id, proof: "passed" }) : null); },
    watch, graceMs: 20, quietMs: () => 30,
  };
  const svc = new ReviewService(deps);
  services.push(svc);
  const change = (f: Record<string, string>) => { write(project, f); for (const r of Object.keys(f)) send?.(r); };
  const until = async (pred: () => boolean, ms = 8000) => { for (let i = 0; i < ms / 20 && !pred(); i++) await sleep(20); expect(pred()).toBe(true); };
  const of = (t: string) => events.filter((e) => e.type === t);
  const cmd = (type: string, extra: Record<string, unknown> = {}) => ({ v: PROTOCOL_VERSION, id: `c_${type}_${events.length}`, type, project, ...extra }) as Command;
  return { project, svc, events, of, change, until, cmd, answers, setFix: (w: Record<string, string>) => { fixWrites = w; }, modelCalls: () => modelCalls };
}
async function reviewed(t: ReturnType<typeof setup>, change: Record<string, string>) {
  t.svc.setProject(t.project); await t.svc.ready();
  t.change(change);
  await t.until(() => t.of("review.batch").length === 1);
  const batch = t.of("review.batch")[0].batch as string;
  await t.svc.handle(t.cmd("review.now", { batch }) as never);
  const r = t.of("review.result")[0];
  expect(parseEvent(JSON.stringify({ v: 1, id: "x", ...r })).ok).toBe(true);
  return { batch, r };
}

describe("in the review service", () => {
  test("a change adding an unlimited AI route is Worth a look with paid_route_open, never Stop, with no model call; Fix it shows it Gone once a limit is added", async () => {
    const t = setup({ "package.json": PKG, "app/page.tsx": "export default () => null;\n" }, { "review.send": "checksOnly" });
    const { batch, r } = await reviewed(t, { "app/api/chat/route.ts": AI_ROUTE });
    expect(r.rating).toBe("worth_a_look");
    const i = r.reasons.findIndex((x: Ev) => x.kind === "paid_route_open");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(r.reasons[i]).toMatchObject({ file: "app/api/chat/route.ts", line: 4, proof: { by: "rule", file: "app/api/chat/route.ts", line: 4 } });
    expect(r.sendBack).toContain(NO_SIGN_UPS);
    expect(t.modelCalls()).toBe(0);
    t.setFix({ "app/api/chat/route.ts": LIMITED });
    await t.svc.handle(t.cmd("review.fix", { batch, agent: "builder-1", model: "m", budgetUsd: 1 }) as never);
    await t.until(() => t.answers.length === 1);
    const a = t.answers[0] as { findings: FixFinding[] };
    expect(a.findings[i].outcome).toBe("gone");
  });
  test("Fix it that adds no limit shows it Still there", async () => {
    const t = setup({ "package.json": PKG }, { "review.send": "checksOnly" });
    const { batch, r } = await reviewed(t, { "app/api/chat/route.ts": AI_ROUTE });
    const i = r.reasons.findIndex((x: Ev) => x.kind === "paid_route_open");
    t.setFix({ "app/api/chat/route.ts": AI_ROUTE.replace('"x"', '"still open"') });
    await t.svc.handle(t.cmd("review.fix", { batch, agent: "builder-1", model: "m", budgetUsd: 1 }) as never);
    await t.until(() => t.answers.length === 1);
    expect((t.answers[0] as { findings: FixFinding[] }).findings[i].outcome).toBe("still");
  });
  test("Fix it that adds a new lib/ratelimit.ts and calls its limit in the route shows it Gone", async () => {
    const t = setup({ "package.json": PKG }, { "review.send": "checksOnly" });
    const { batch, r } = await reviewed(t, { "app/api/chat/route.ts": AI_ROUTE });
    const i = r.reasons.findIndex((x: Ev) => x.kind === "paid_route_open");
    expect(i).toBeGreaterThanOrEqual(0);
    t.setFix({
      "lib/ratelimit.ts": `import { Ratelimit } from "@upstash/ratelimit";\nexport const ratelimit = new Ratelimit({});\n`,
      "app/api/chat/route.ts": `import OpenAI from "openai";\nimport { ratelimit } from "@/lib/ratelimit";\n\nexport async function POST(req: Request) {\n  await ratelimit.limit("ip");\n  return new Response("x");\n}\n`,
    });
    await t.svc.handle(t.cmd("review.fix", { batch, agent: "builder-1", model: "m", budgetUsd: 1 }) as never);
    await t.until(() => t.answers.length === 1);
    expect((t.answers[0] as { findings: FixFinding[] }).findings[i].outcome).toBe("gone");
  });
  test("a new route under a middleware that limits through a helper file raises nothing", async () => {
    const t = setup({
      "package.json": JSON.stringify({ dependencies: { next: "15", openai: "4", "@upstash/ratelimit": "2" } }),
      "lib/ratelimit.ts": `import { Ratelimit } from "@upstash/ratelimit";\nexport const ratelimit = new Ratelimit({});\n`,
      "middleware.ts": `import { ratelimit } from "@/lib/ratelimit";\nexport async function middleware() { await ratelimit.limit("x"); }\nexport const config = { matcher: ["/api/:path*"] };\n`,
    }, { "review.send": "checksOnly" });
    const { r } = await reviewed(t, { "app/api/chat/route.ts": AI_ROUTE });
    expect(r.reasons.map((x: Ev) => x.kind)).not.toContain("paid_route_open");
  });
  test("a new Express router file mounted by a server.js outside the fixed list, which limits every route, raises nothing", async () => {
    const t = setup({
      "package.json": JSON.stringify({ dependencies: { express: "4", openai: "4", "express-rate-limit": "7" } }),
      "backend/server.js": `const express = require("express");\nconst rateLimit = require("express-rate-limit");\nconst chat = require("./chat");\nconst app = express();\napp.use(rateLimit({ max: 5 }));\napp.use("/api", chat);\n`,
    }, { "review.send": "checksOnly" });
    const { r } = await reviewed(t, { "backend/chat.js": `const express = require("express");\nconst OpenAI = require("openai");\nconst router = express.Router();\nrouter.post("/chat", async (req, res) => res.json(await new OpenAI().x()));\nmodule.exports = router;\n` });
    expect(r.reasons.map((x: Ev) => x.kind)).not.toContain("paid_route_open");
  });
  test("money.checks off raises nothing", async () => {
    const t = setup({ "package.json": PKG }, { "review.send": "checksOnly", "money.checks": false });
    const { r } = await reviewed(t, { "app/api/chat/route.ts": AI_ROUTE });
    expect(r.reasons.map((x: Ev) => x.kind)).not.toContain("paid_route_open");
  });
});
