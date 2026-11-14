// M86 (a), Watch what changed: after each review the runner builds a fact sheet (the files changed and which part of the app
// each is, the checks with their exit codes, the proof screenshot's path) and turns it into 3 to 6 beats, each one sentence
// and one drawing step. A validator rejects any beat that names something not in the sheet (research visuals.md feature 1,
// "the model never invents facts"; user-needs B8, "27 false claims in a day", CC #106546). Written before replay.ts.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { estimateUsd, MODELS } from "../src/models.ts";
import { factSheet, makeReplay, MAX_REPLAY_CHARS, MAX_REPLAY_TOKENS, partOf, replayRequest, ruleBeats, validateBeats, type Beat, type FactSheet } from "../src/review/replay.ts";
import type { FastLike, FastReq } from "../src/lanes.ts";

const files = [
  { file: "src/pages/Checkout.tsx", kind: "modified" as const },
  { file: "src/api/pay.ts", kind: "added" as const },
  { file: "supabase/migrations/002_orders.sql", kind: "added" as const },
  { file: "src/index.css", kind: "modified" as const },
];
const runs = [
  { label: "The build", rung: "checks", status: "passed" as const, exit: 0 },
  { label: "The tests", rung: "tests", status: "failed" as const, exit: 1 },
];
const sheet = (o: Partial<Parameters<typeof factSheet>[0]> = {}): FactSheet => factSheet({ files, count: 4, checks: "failed", runs, shot: "/tmp/receipts/review-1.jpg", rating: "worth_a_look", ...o });

describe("the parts of the app a file belongs to", () => {
  test("each file gets one plain part, the same every time", () => {
    expect(partOf("src/pages/Checkout.tsx")).toBe("pages");
    expect(partOf("app/dashboard/page.tsx")).toBe("pages");
    expect(partOf("src/components/Button.jsx")).toBe("pages");
    expect(partOf("src/api/pay.ts")).toBe("server");
    expect(partOf("app/api/stripe/route.ts")).toBe("server");
    expect(partOf("supabase/migrations/002_orders.sql")).toBe("data");
    expect(partOf("prisma/schema.prisma")).toBe("data");
    expect(partOf("src/index.css")).toBe("looks");
    expect(partOf("tests/pay.test.ts")).toBe("tests");
    expect(partOf("src/pay.spec.ts")).toBe("tests");
    expect(partOf("package.json")).toBe("packages");
    expect(partOf("bun.lockb")).toBe("packages");
    expect(partOf(".github/workflows/ci.yml")).toBe("settings");
    expect(partOf("vite.config.ts")).toBe("settings");
    expect(partOf("README.md")).toBe("other");
  });
});

describe("the fact sheet", () => {
  test("holds the files with their parts, the checks with exit codes and the proof screenshot path, nothing else", () => {
    const s = sheet();
    expect(s.files).toEqual([
      { file: "src/pages/Checkout.tsx", kind: "modified", part: "pages" },
      { file: "src/api/pay.ts", kind: "added", part: "server" },
      { file: "supabase/migrations/002_orders.sql", kind: "added", part: "data" },
      { file: "src/index.css", kind: "modified", part: "looks" },
    ]);
    expect(s.count).toBe(4);
    expect(s.more).toBe(0);
    expect(s.checks).toEqual([{ label: "The build", status: "passed", exit: 0 }, { label: "The tests", status: "failed", exit: 1 }]);
    expect(s.outcome).toBe("failed");
    expect(s.shot).toBe("/tmp/receipts/review-1.jpg");
    expect(s.rating).toBe("worth_a_look");
  });
  test("at most 8 files are drawn; the rest are counted, and settings and key files never show their names", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ file: `src/pages/P${i}.tsx`, kind: "modified" as const }));
    const s = factSheet({ files: [...many, { file: ".env.local", kind: "modified" }], count: 13, checks: "not_run", rating: "safe" });
    expect(s.files.length).toBe(8);
    expect(s.more).toBe(5);
    expect(s.files.some((f) => f.file.includes(".env"))).toBe(false);
    expect(s.checks).toEqual([]);
    expect(s.shot).toBeUndefined();
  });
  test("a check that never said its exit code keeps none, rather than a made up one", () => {
    const s = sheet({ runs: [{ label: "The browser check", rung: "browser", status: "passed" }] });
    expect(s.checks).toEqual([{ label: "The browser check", status: "passed" }]);
  });
});

describe("beats from the rules alone (no model, no cost)", () => {
  test("3 to 6 beats, each one sentence and one drawing step, and every one passes the validator", () => {
    for (const s of [sheet(), sheet({ runs: [], checks: "not_run", shot: undefined }), sheet({ files: [files[0]], count: 1, runs: [runs[0]], checks: "passed", rating: "safe" }), sheet({ files: [{ file: ".env.local", kind: "modified" }], count: 1, runs: [], checks: "not_run", shot: undefined })]) {
      const beats = ruleBeats(s);
      expect(beats.length).toBeGreaterThanOrEqual(3);
      expect(beats.length).toBeLessThanOrEqual(6);
      for (const b of beats) {
        expect(b.say.split(/[.!?](\s|$)/).filter((x) => x && x.trim()).length, b.say).toBe(1);
        expect(["count", "file", "part", "check", "verdict"]).toContain(b.draw);
      }
      expect(validateBeats(beats, s)).toEqual({ ok: true, beats });
      // The verdict once, and last.
      expect(beats.filter((b) => b.draw === "verdict").length).toBe(1);
      expect(beats[beats.length - 1].draw).toBe("verdict");
    }
  });
  test("a failing check is said as failing with its exit code; the proof screenshot gets no beat until the picture itself can be shown", () => {
    const beats = ruleBeats(sheet());
    const check = beats.find((b) => b.draw === "check" && b.ref === "The tests");
    expect(check?.say).toContain("did not pass");
    expect(check?.say).toContain("exit 1");
    expect(beats.some((b) => (b.draw as string) === "shot")).toBe(false);
    expect(beats[beats.length - 1].draw).toBe("verdict");
  });
  test("the opening beat names every part it draws: it draws the whole list of files, not only the first part", () => {
    const beats = ruleBeats(sheet());
    expect(beats[0].say).toContain("the pages");
    expect(beats[0].say).toContain("the server code");
    expect(beats[0].draw).toBe("count");
    expect(beats[0].ref).toBeUndefined();
  });
  test("checks that did not run are never said to pass", () => {
    const beats = ruleBeats(sheet({ runs: [], checks: "not_run", shot: undefined }));
    expect(beats.map((b) => b.say).join(" ")).not.toMatch(/\bpass/i);
    expect(beats.some((b) => (b.draw as string) === "shot")).toBe(false);
  });
});

describe("the validator rejects any beat naming something not in the sheet", () => {
  const VERDICT: Beat = { say: "It is worth a look before you keep it.", draw: "verdict" };
  const good: Beat[] = [
    { say: "Your AI changed 4 files.", draw: "count" },
    { say: "The checkout page in src/pages/Checkout.tsx changed.", draw: "file", ref: "src/pages/Checkout.tsx" },
    { say: "The tests did not pass, exit 1.", draw: "check", ref: "The tests" },
    VERDICT,
  ];
  // Each bad beat goes in third, before the verdict, so the set fails for that beat alone.
  const w = (b: unknown) => [...good.slice(0, 2), b, VERDICT];
  test("a good set is accepted as it is", () => { expect(validateBeats(good, sheet())).toEqual({ ok: true, beats: good }); });
  const bad: [string, unknown][] = [
    ["a file not in the sheet, in the words", w({ say: "It also changed src/secret/keys.ts.", draw: "count" })],
    ["a file not in the sheet, as the drawing", w({ say: "A helper changed.", draw: "file", ref: "src/util/date.ts" })],
    ["a check not in the sheet", w({ say: "The lint check passed.", draw: "check", ref: "The lint check" })],
    ["a part with no file in it", w({ say: "The tests part changed.", draw: "part", ref: "tests" })],
    ["a screenshot when there was none", null],
    ["a pass when nothing passed", null],
    ["an exit code no check gave", w({ say: "The tests did not pass, exit 2.", draw: "check", ref: "The tests" })],
    ["a file count that is not the count", [{ say: "Your AI changed 9 files.", draw: "count" }, ...good.slice(1)]],
    ["two sentences in one beat", w({ say: "The tests failed. Then the build passed.", draw: "check", ref: "The tests" })],
    ["too few beats", good.slice(0, 2)],
    ["too many beats", [...good, ...good, good[0]]],
    ["markup", w({ say: "<b>The tests</b> did not pass.", draw: "check", ref: "The tests" })],
    ["an unknown drawing step", w({ say: "Look here.", draw: "explode" })],
    ["not a list", { beats: good }],
    ["a beat too long", w({ say: `The tests did not pass ${"and ".repeat(40)}then stopped.`, draw: "check", ref: "The tests" })],
  ];
  for (const [name, beats] of bad) {
    test(name, () => {
      if (name === "a screenshot when there was none") {
        expect(validateBeats(w({ say: "Your page opened in a browser.", draw: "shot" }), sheet({ shot: undefined })).ok).toBe(false);
        // Not even with a screenshot: the board cannot show the picture yet, so no beat may promise it.
        expect(validateBeats(w({ say: "Your page opened in a browser.", draw: "shot" }), sheet()).ok).toBe(false);
        return;
      }
      if (name === "a pass when nothing passed") {
        const s = sheet({ runs: [{ label: "The tests", rung: "tests", status: "failed", exit: 1 }] });
        expect(validateBeats([...good.slice(0, 3), { say: "Everything passed.", draw: "verdict" }], s).ok).toBe(false);
        return;
      }
      const r = validateBeats(beats, sheet());
      expect(r.ok, name).toBe(false);
      if (!r.ok) expect(r.why.length).toBeGreaterThan(0);
    });
  }
  test("a file may be named by its whole path or its own name, as the sheet has it", () => {
    expect(validateBeats([good[0], { say: "Checkout.tsx changed.", draw: "file", ref: "src/pages/Checkout.tsx" }, good[2], VERDICT], sheet()).ok).toBe(true);
  });
  test("the verdict is the last beat, and there is exactly one", () => {
    expect(validateBeats(good.slice(0, 3).concat([{ say: "The build passed, exit 0.", draw: "check", ref: "The build" }]), sheet()).ok).toBe(false);   // none
    expect(validateBeats([VERDICT, ...good.slice(1)], sheet()).ok).toBe(false);   // first and last
    expect(validateBeats([good[0], VERDICT, good[2], VERDICT], sheet()).ok).toBe(false);   // twice
  });
  test("a done claim (works, fixed, ready, safe, proven, done, all good) needs a check that passed and none that failed", () => {
    const none = sheet({ runs: [], checks: "not_run", shot: undefined });
    const failing = sheet();
    const passing = sheet({ runs: [runs[0]], checks: "passed" });
    for (const say of ["The new payment route works and is ready.", "The checkout bug is fixed.", "It is safe to keep.", "The change is proven.", "All good, nothing to do.", "Your AI is done and it is working.", "There are no problems."]) {
      const beats = [good[0], good[1], { say: "In the pages: Checkout.tsx.", draw: "file", ref: "src/pages/Checkout.tsx" }, { say, draw: "verdict" }];
      expect(validateBeats(beats, none).ok, `${say} with no checks`).toBe(false);
      expect(validateBeats(beats, failing).ok, `${say} with a failing check`).toBe(false);
      expect(validateBeats(beats, passing).ok, `${say} with a passing check`).toBe(true);
    }
    // Said as not done, it is fine with no checks at all (the rules' own verdict says so).
    const not = [good[0], good[1], { say: "In the pages: Checkout.tsx.", draw: "file", ref: "src/pages/Checkout.tsx" }, { say: "Nothing stands out, but it is not proven because the checks did not run.", draw: "verdict" }];
    expect(validateBeats(not, none).ok).toBe(true);
  });
});

/** A stand in model: it answers what it is told to and counts its tokens the way the API reports them (about four letters a
 *  token for the words in, and the words out), so the cost of one replay can be measured without spending anything. */
function standIn(answer: string): FastLike & { asked: FastReq[]; usage: { input_tokens: number; output_tokens: number } } {
  const me = {
    asked: [] as FastReq[], usage: { input_tokens: 0, output_tokens: 0 },
    async run(req: FastReq, onDelta: (t: string) => void, signal: AbortSignal) {
      me.asked.push(req);
      const input_tokens = Math.ceil(((req.system ?? "").length + req.text.length) / 4);
      let out = "";
      for (const part of answer.match(/.{1,40}/gs) ?? []) { if (signal.aborted) break; out += part; onDelta(part); }
      const output_tokens = Math.ceil(out.length / 4);
      me.usage = { input_tokens, output_tokens };
      return { text: out, costUsd: estimateUsd(MODELS.fast, me.usage) };
    },
  };
  return me;
}

describe("one capped model call per review, on the person's own key", () => {
  const modelBeats = JSON.stringify({ beats: [
    { say: "Your AI changed 4 files.", draw: "count" },
    { say: "The checkout page changed.", draw: "file", ref: "src/pages/Checkout.tsx" },
    { say: "A new payment step was added on the server.", draw: "part", ref: "server" },
    { say: "The tests did not pass, exit 1.", draw: "check", ref: "The tests" },
    { say: "It is worth a look before you keep it.", draw: "verdict" },
  ] });
  test("the model only arranges the sheet: its beats are used when every one is in the sheet", async () => {
    const m = standIn(modelBeats);
    const r = await makeReplay({ sheet: sheet(), model: m, useModel: true, room: 1, signal: new AbortController().signal });
    expect(r.by).toBe("model");
    expect(r.beats.length).toBe(5);
    // The request is the sheet as data, never the code: no file text, only names, parts, checks and the count.
    const req = m.asked[0];
    expect(req.raw).toBe(true);
    expect(req.maxTokens).toBe(MAX_REPLAY_TOKENS);
    expect(req.text).toContain("src/pages/Checkout.tsx");
    expect(req.text).not.toContain("import ");
  });
  test("a model answer naming anything not in the sheet is thrown away and the rules' beats are used instead", async () => {
    const lie = JSON.stringify({ beats: [{ say: "Your AI changed 4 files.", draw: "verdict" }, { say: "It deleted src/auth/login.ts.", draw: "verdict" }, { say: "All the tests passed.", draw: "verdict" }] });
    const r = await makeReplay({ sheet: sheet(), model: standIn(lie), useModel: true, room: 1, signal: new AbortController().signal });
    expect(r.by).toBe("rules");
    expect(r.beats).toEqual(ruleBeats(sheet()));
    expect(r.usd).toBeGreaterThan(0);   // it was still paid for, so it is still booked
  });
  test("turned off, at the day's limit, or with no model: the rules' beats, and no call at all", async () => {
    for (const o of [{ useModel: false, room: 1 }, { useModel: true, room: 0 }]) {
      const m = standIn(modelBeats);
      const r = await makeReplay({ sheet: sheet(), model: m, ...o, signal: new AbortController().signal });
      expect(r).toEqual({ beats: ruleBeats(sheet()), by: "rules", usd: 0 });
      expect(m.asked.length).toBe(0);
    }
    expect((await makeReplay({ sheet: sheet(), model: null, useModel: true, room: 1, signal: new AbortController().signal })).by).toBe("rules");
  });
  test("the answer is cut off at the cap, whatever lane it runs on", async () => {
    const m = standIn("x".repeat(MAX_REPLAY_CHARS * 3));
    const r = await makeReplay({ sheet: sheet(), model: m, useModel: true, room: 1, signal: new AbortController().signal });
    expect(r.by).toBe("rules");
    expect(m.usage.output_tokens).toBeLessThanOrEqual(Math.ceil((MAX_REPLAY_CHARS + 40) / 4));
  });
  test("cut off, timed out or failed on a lane that throws when stopped: what was already spent is still booked", async () => {
    // A real lane throws once its call is stopped; the letters it sent before that were paid for.
    const throwing: FastLike = { async run(req, onDelta, signal) { for (let i = 0; i < 200; i++) { if (signal.aborted) throw new Error("cancelled"); onDelta("x".repeat(40)); } return { text: "", costUsd: 0 }; } };
    const r = await makeReplay({ sheet: sheet(), model: throwing, useModel: true, room: 1, signal: new AbortController().signal });
    expect(r.by).toBe("rules");
    expect(r.usd).toBeGreaterThan(0);
    const req = replayRequest(sheet());
    expect(r.usd).toBeCloseTo(estimateUsd(MODELS.fast, { input_tokens: Math.ceil(((req.system ?? "").length + req.text.length) / 4), output_tokens: Math.ceil((MAX_REPLAY_CHARS + 40) / 4) }), 6);
    // Stopped by its own time limit before a single letter: the question was sent, so it is booked too.
    const slow: FastLike = { run: (_req, _d, signal) => new Promise((_, no) => signal.addEventListener("abort", () => no(new Error("cancelled")))) };
    const stop = new AbortController();
    const p = makeReplay({ sheet: sheet(), model: slow, useModel: true, room: 1, signal: stop.signal });
    stop.abort();
    expect((await p).usd).toBeGreaterThan(0);
    // Refused before it began (nothing came back and nobody stopped it): nothing was used, nothing is booked.
    const refused: FastLike = { async run() { throw new Error("overloaded"); } };
    expect((await makeReplay({ sheet: sheet(), model: refused, useModel: true, room: 1, signal: new AbortController().signal })).usd).toBe(0);
  });
  test("measured cost: one replay is well under a cent on the quick model (stand in token counts), so the switch is on as usual (the plan: off only past a few cents)", async () => {
    // The biggest sheet a replay can have: 8 files with long paths, 4 checks, a screenshot.
    const big = factSheet({
      files: Array.from({ length: 8 }, (_, i) => ({ file: `src/features/payments/checkout/components/Step${i}Summary.tsx`, kind: "modified" as const })), count: 31,
      checks: "failed", runs: [{ label: "The install", rung: "install", status: "passed", exit: 0 }, { label: "The build", rung: "checks", status: "passed", exit: 0 }, { label: "The tests", rung: "tests", status: "failed", exit: 1 }, { label: "The browser check", rung: "browser", status: "skipped" }],
      shot: "/Users/x/Library/Application Support/receipts/review-abc.jpg", rating: "stop",
    });
    const req = replayRequest(big);
    const inTokens = Math.ceil(((req.system ?? "").length + req.text.length) / 4);
    const worst = estimateUsd(MODELS.fast, { input_tokens: inTokens, output_tokens: MAX_REPLAY_TOKENS });
    // Recorded in docs/milestones/M86-watch-and-label.md: about 700 tokens in and at most 600 out.
    expect(inTokens).toBeLessThan(1200);
    expect(worst).toBeLessThan(0.01);
  });
});

describe("where it runs", () => {
  test("the review service builds the sheet from the review's own data and adds the rules' replay to review.result", () => {
    const src = readFileSync(join(import.meta.dir, "../src/review/service.ts"), "utf8");
    expect(src).toContain("factSheet({ files: b.files, count: b.count, checks, runs: checkRuns, shot: checkShot, rating: shown.rating })");
    expect(src).toContain('if (sheet && this.deps.setting("replay.model") === true && !rulesOnly && !checksOnly) void this.replayByModel(');
    expect(src).toContain('this.deps.setting("replay.show") !== false');
    expect(src).toContain("...(replay ? { replay } : {})");
  });
  test("the review card never waits for the model: review.result goes first with the rules' replay, the model's follows as review.replay", () => {
    const src = readFileSync(join(import.meta.dir, "../src/review/service.ts"), "utf8");
    const result = src.indexOf('type: "review.result", project: b.project, batch: b.id, ok: true');
    const model = src.indexOf("void this.replayByModel(b, sheet, abort.signal, gen)");
    expect(result).toBeGreaterThan(0);
    expect(model).toBeGreaterThan(result);
    expect(src).toContain('type: "review.replay"');
    // Its own short limit, so a slow lane never holds anything up for long.
    expect(src).toContain("REPLAY_TIMEOUT_MS");
  });
});

describe("the replay in the protocol (shared fixtures, read by the pages too)", () => {
  const { parseEvent } = require("../../protocol/index.ts") as typeof import("../../protocol/index.ts");
  const line = readFileSync(join(import.meta.dir, "../../protocol/fixtures/events.jsonl"), "utf8").split("\n").find((l) => l.includes('"id":"m86e2"'))!;
  test("a review with its replay keeps to the protocol", () => { expect(parseEvent(line).ok).toBe(true); });
  test("a beat that draws something the replay's own sheet does not have is refused", () => {
    const e = JSON.parse(line);
    for (const bad of [{ say: "A helper changed.", draw: "file", ref: "src/util/date.ts" }, { say: "Lint passed.", draw: "check", ref: "Lint" }, { say: "The page opened.", draw: "shot" }, { say: "Data changed.", draw: "part", ref: "data" }]) {
      const x = structuredClone(e); x.replay.beats[1] = bad;
      expect(parseEvent(JSON.stringify(x)).ok, bad.say).toBe(false);
    }
    const two = structuredClone(e); two.replay.beats = two.replay.beats.slice(0, 2);
    expect(parseEvent(JSON.stringify(two)).ok).toBe(false);
  });
  test("the verdict is last and once in the protocol too, and the model's replay that follows keeps to the same rules", () => {
    const e = JSON.parse(line);
    const first = structuredClone(e); first.replay.beats = [first.replay.beats[4], ...first.replay.beats.slice(1, 4)];
    expect(parseEvent(JSON.stringify(first)).ok).toBe(false);
    const twice = structuredClone(e); twice.replay.beats[1] = { say: "It is worth a look.", draw: "verdict" };
    expect(parseEvent(JSON.stringify(twice)).ok).toBe(false);
    const later = readFileSync(join(import.meta.dir, "../../protocol/fixtures/events.jsonl"), "utf8").split("\n").find((l) => l.includes('"id":"m86e3"'))!;
    expect(parseEvent(later).ok).toBe(true);
    const bad = JSON.parse(later); bad.replay.beats[1] = { say: "A helper changed.", draw: "file", ref: "src/util/date.ts" };
    expect(parseEvent(JSON.stringify(bad)).ok).toBe(false);
    expect(parseEvent(JSON.stringify({ ...JSON.parse(later), batch: undefined })).ok).toBe(false);
  });
});
