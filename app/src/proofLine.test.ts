// M102, every warning shows why: the one line under each finding that says why Squibby is sure (proofLine.ts), how the card
// keeps a proof from the engine (review.ts), and where it shows (findingShape.ts, reviewHead.ts).
import { describe, expect, test } from "bun:test";
import { REVIEW_REASONS, type ReviewReason } from "../../protocol/index.ts";
import { proofLine } from "./proofLine.ts";
import { reviewReduce, type ReviewCard } from "./review.ts";
import { reviewHead } from "./reviewHead.ts";
import { shapeFindings } from "./findingShape.ts";
import { S } from "./strings.ts";

const r = (o: Partial<ReviewReason>): ReviewReason => ({ kind: "secret_in_code", say: "s", ...o });

describe("the line under a finding", () => {
  test("a fixed rule names itself and the place as file:line", () => {
    expect(proofLine(r({ proof: { by: "rule", file: "src/pay.ts", line: 2 } }))).toBe(`${S.proof.label}: ${S.proof.ruleName.secret_in_code} found it at src/pay.ts:2.`);
    expect(proofLine(r({ kind: "touches_risky", proof: { by: "rule", file: "src/auth/login.ts" } }))).toBe(`${S.proof.label}: ${S.proof.ruleName.touches_risky} found it at src/auth/login.ts.`);
    expect(proofLine(r({ kind: "touches_risky", proof: { by: "rule" } }))).toBe(`${S.proof.label}: ${S.proof.ruleName.touches_risky} found it.`);
  });
  test("an inside hunk concern says where it is, never that Squibby is sure (M102 review: a model's worry is a guess)", () => {
    const l = proofLine(r({ kind: "model_concern", proof: { by: "line", file: "src/list.ts", line: 11 } }))!;
    expect(l).toBe(`${S.proof.lineLabel}: ${S.proof.line("src/list.ts:11")}`);
    expect(S.proof.lineLabel).toBe("Where it is");
    expect(l).not.toContain(S.proof.label);
    expect(S.proof.line("src/list.ts:11")).toContain("src/list.ts:11");
    expect(S.proof.line("src/list.ts:11")).toMatch(/Try it to be sure\.$/);
    expect(S.proof.line("src/list.ts:11")).not.toMatch(/\bsure\b.*\bsure\b/);
    // Every other proof keeps Why I'm sure.
    for (const p of [{ by: "rule" }, { by: "check" }, { by: "osv", id: "GHSA-aaaa-bbbb-cccc" }, { by: "house_rule", rule: "x" }, { by: "setting" }, { by: "run" }] as const)
      expect(proofLine(r({ proof: p as never }))!.startsWith(`${S.proof.label}: `), p.by).toBe(true);
  });
  test("on the lead, the place the code box already shows is said as the line shown above (M102 review)", () => {
    const shown = { file: "src/pay.ts", line: 2 };
    expect(proofLine(r({ proof: { by: "rule", file: "src/pay.ts", line: 2 } }), { shown })).toBe(`${S.proof.label}: ${S.proof.ruleShown(S.proof.ruleName.secret_in_code)}`);
    expect(proofLine(r({ kind: "model_concern", proof: { by: "line", file: "src/pay.ts", line: 2 } }), { shown })).toBe(`${S.proof.lineLabel}: ${S.proof.lineShown}`);
    expect(proofLine(r({ kind: "package_high", proof: { by: "osv", id: "GHSA-aaaa-bbbb-cccc", file: "src/pay.ts", line: 2 } }), { shown })).not.toContain("src/pay.ts");
    // Another line or another file keeps its place.
    expect(proofLine(r({ proof: { by: "rule", file: "src/pay.ts", line: 3 } }), { shown })).toContain("src/pay.ts:3");
    expect(proofLine(r({ proof: { by: "rule", file: "src/other.ts", line: 2 } }), { shown })).toContain("src/other.ts:2");
    for (const w of [S.proof.ruleShown("x"), S.proof.lineShown]) expect(w).toContain("the line shown above");
  });
  test("a finding whose own words already hold the evidence gets the short form (M102 review)", () => {
    const house = r({ kind: "house_rule", say: 'Your house rule "Never edit src/pay/**" covers src/pay/tax.ts, and it changed.', proof: { by: "house_rule", rule: "Never edit src/pay/**", file: "src/pay/tax.ts" } });
    expect(proofLine(house)).toBe(`${S.proof.label}: ${S.proof.houseRuleShort("src/pay/tax.ts")}`);
    expect(proofLine(house)).not.toContain("Never edit");
    const osv = r({ kind: "package_critical", say: "left-pad 1.0.0: This package has a known serious problem: GHSA-aaaa-bbbb-cccc, update it.", proof: { by: "osv", id: "GHSA-aaaa-bbbb-cccc", file: "package.json", line: 7 } });
    expect(proofLine(osv)).toBe(`${S.proof.label}: ${S.proof.osvShort("package.json:7")}`);
    expect(proofLine(osv)).not.toContain("GHSA");
    // Words that do not hold it keep the long form.
    expect(proofLine({ ...house, say: "s" })).toContain("Never edit src/pay/**");
    expect(proofLine({ ...osv, say: "s" })).toContain("GHSA-aaaa-bbbb-cccc");
  });
  test("the failing check and its exit code, or the project's checks", () => {
    expect(proofLine(r({ kind: "checks_failed", proof: { by: "check", check: "Build", exit: 1 } }))).toBe(`${S.proof.label}: Build did not pass (error code 1).`);
    expect(proofLine(r({ kind: "checks_failed", proof: { by: "check", check: "Build" } }))).toBe(`${S.proof.label}: Build did not pass.`);
    expect(proofLine(r({ kind: "checks_failed", proof: { by: "check" } }))).toBe(`${S.proof.label}: ${S.proof.checks}`);
    expect(proofLine(r({ kind: "claimed_passed", proof: { by: "check", outcome: "not_run" } }))).toBe(`${S.proof.label}: ${S.proof.claimed.not_run}`);
    expect(proofLine(r({ kind: "claimed_passed", proof: { by: "check", outcome: "failed" } }))).toBe(`${S.proof.label}: ${S.proof.claimed.failed}`);
  });
  test("the OSV id, the house rule, the person's own setting, and the run", () => {
    expect(proofLine(r({ kind: "package_critical", proof: { by: "osv", id: "GHSA-aaaa-bbbb-cccc", file: "package.json", line: 7 } }))).toBe(`${S.proof.label}: OSV.dev lists GHSA-aaaa-bbbb-cccc for the package at package.json:7.`);
    expect(proofLine(r({ kind: "house_rule", proof: { by: "house_rule", rule: "Never edit src/pay/**", file: "src/pay/a.ts" } }))).toBe(`${S.proof.label}: your house rule "Never edit src/pay/**" covers src/pay/a.ts.`);
    expect(proofLine(r({ kind: "chosen_stop", proof: { by: "setting" } }))).toBe(`${S.proof.label}: ${S.proof.chosen}`);
    expect(proofLine(r({ kind: "too_many", proof: { by: "setting", count: 300, max: 200 } }))).toBe(`${S.proof.label}: ${S.proof.tooMany(300, 200)}`);
    expect(proofLine(r({ kind: "open_private_page", proof: { by: "run" } }))).toBe(`${S.proof.label}: ${S.proof.run}`);
  });
  test("no proof, no line; every kind has a rule name; plain words with no long dashes", () => {
    expect(proofLine(r({}))).toBeNull();
    for (const k of REVIEW_REASONS) expect(S.proof.ruleName[k], k).toBeTruthy();
    const words = [S.proof.label, S.proof.lineLabel, S.proof.lineShown, S.proof.ruleShown("x"), S.proof.houseRuleShort("a"), S.proof.osvShort("a:1"), S.proof.osvShown("G"), S.proof.checks, S.proof.chosen, S.proof.run, S.proof.claimed.failed, S.proof.claimed.not_run, S.proof.tooMany(3, 2), S.proof.line("a:1"), ...Object.values(S.proof.ruleName)].join("\n");
    expect(words).not.toMatch(/[–—]/);
  });
});

const P = "/Users/me/shop", B = "rv_4f2a9c01de";
const files = [{ file: "src/pay.ts", kind: "modified" }, { file: "src/list.ts", kind: "modified" }];
const run = (reasons: unknown[], rating = "stop") => [{ type: "review.batch", project: P, batch: B, files, count: 2, capped: false, secretFiles: [], auto: false },
  { type: "review.result", project: P, batch: B, ok: true, rating, touches: [], summary: "s", notes: [], reasons, files, count: 2, capped: false, secretFiles: [], checks: "passed", sendBack: "x", lane: "cheap", usdEstimate: 0 }]
  .reduce<ReviewCard | null>((c, e) => reviewReduce(c, e as { type: string }), null);

describe("on the card", () => {
  const reasons = [
    { kind: "secret_in_code", file: "src/pay.ts", line: 2, say: "A key is in src/pay.ts.", proof: { by: "rule", file: "src/pay.ts", line: 2 } },
    { kind: "model_concern", file: "src/list.ts", line: 11, say: "The list may load twice.", proof: { by: "line", file: "src/list.ts", line: 11 } },
  ];
  test("the card keeps a good proof and drops one of the wrong shape", () => {
    const c = run([...reasons, { kind: "files_removed", say: "1 file was removed.", proof: { by: "guess", text: "x" } }])!;
    expect(c.result!.reasons[0].proof).toEqual({ by: "rule", file: "src/pay.ts", line: 2 });
    expect(c.result!.reasons[2].proof).toBeUndefined();
    expect(c.result!.reasons.length).toBe(3);
  });
  test("the lead says why under its place, the others carry their own why, and so does every finding in the list", () => {
    const c = run(reasons)!;
    const h = reviewHead(c)!;
    const [a, b] = [proofLine(c.result!.reasons[0])!, proofLine(c.result!.reasons[1])!];
    // M102 review: the lead's code box shows src/pay.ts line 2, so its line says "the line shown above" instead.
    expect(h.sure).toBe(proofLine(c.result!.reasons[0], { shown: h.pointed })!);
    expect(h.sure).not.toContain("src/pay.ts:2");
    expect(h.others[0].line).toBe(b);
    const shaped = shapeFindings(c);
    // Why does this matter? has no code box, so its places stay.
    expect(shaped.map((f) => f.parts.why)).toEqual([a, b]);
  });
  test("a finding without a proof shows its place as before", () => {
    const c = run([{ kind: "removed_still_used", file: "src/cart.ts", line: 4, say: "date.ts was removed." }])!;
    expect(reviewHead(c)!.sure).toBe("");
    expect(shapeFindings(c)[0].parts.why).toBeUndefined();
  });
});

import { numbersLines } from "./settings.ts";
describe("the beta numbers say Fix it and Looks fine by kind", () => {
  test("only kinds with a count, in plain words, before the last line", () => {
    const l = numbersLines({ enabled: true, totals: { review_fix: 2, review_looks_fine: 1, "review_fix_kind:secret_in_code": 2, "review_looks_fine_kind:model_concern": 1 }, rates: {} });
    expect(l).toContain(S.proof.byKind(S.proof.fixIt, `${S.proof.kindName.secret_in_code} 2`));
    expect(l).toContain(S.proof.byKind(S.proof.looksFine, `${S.proof.kindName.model_concern} 1`));
    expect(l.at(-1)).toContain("Times you corrected a guess");
    const none = numbersLines({ enabled: true, totals: {}, rates: {} });
    expect(none.some((x) => x.includes("by kind"))).toBe(false);
    for (const k of REVIEW_REASONS) expect(S.proof.kindName[k], k).toBeTruthy();
  });
});

describe("no line says the same thing twice (M102 review)", () => {
  const house = { kind: "house_rule", file: "src/pay/tax.ts", say: 'Your house rule "Never edit src/pay/**" covers src/pay/tax.ts, and it changed.', proof: { by: "house_rule", rule: "Never edit src/pay/**", file: "src/pay/tax.ts" } };
  const osv = { kind: "package_critical", file: "package.json", line: 7, say: "left-pad 1.0.0: This package has a known serious problem: GHSA-aaaa-bbbb-cccc, update it.", proof: { by: "osv", id: "GHSA-aaaa-bbbb-cccc", file: "package.json", line: 7 } };
  const failed = { kind: "checks_failed", say: "The project's own checks did not pass. The build did not pass.", proof: { by: "check", check: "Build", exit: 1 } };
  const lead = { kind: "secret_in_code", file: "src/pay.ts", line: 2, say: "A key is in src/pay.ts.", proof: { by: "rule", file: "src/pay.ts", line: 2 } };
  test("the others rows never repeat the rule text or id of their title", () => {
    const h = reviewHead(run([lead, house, osv]))!;
    const rows = h.others.filter((f) => f.tag === "then");
    expect(rows.length).toBe(2);
    expect(rows[0].line).not.toContain("Never edit src/pay/**");
    expect(rows[0].line).toContain("src/pay/tax.ts");
    expect(rows[1].line).not.toContain("GHSA-aaaa-bbbb-cccc");
    expect(rows[1].line).toContain("package.json:7");
  });
  test("a finding in the list never repeats the id, rule text or failing check of its detail", () => {
    const shaped = shapeFindings(run([lead, failed, house, osv]));
    for (const f of shaped) {
      const why = f.parts.why ?? "", detail = f.parts.detail ?? "";
      for (const t of ["Never edit src/pay/**", "GHSA-aaaa-bbbb-cccc"]) expect(detail.includes(t) && why.includes(t), `${f.kind}: ${t}`).toBe(false);
    }
    // The failing check: its detail only says the checks failed, so the why (with the exit code) stands alone.
    const c = shaped.find((f) => f.kind === "checks_failed")!;
    expect(c.parts.detail).toBeUndefined();
    expect(c.parts.why).toBe(`${S.proof.label}: Build did not pass (error code 1).`);
  });
  test("a check's detail that says more than that it failed is kept", () => {
    const more = { ...failed, say: "The project's own checks did not pass. The server did not start within 60 seconds." };
    expect(shapeFindings(run([more])).find((f) => f.kind === "checks_failed")!.parts.detail).toBe(more.say);
    // And without a named check, the detail stays.
    expect(shapeFindings(run([{ ...failed, proof: { by: "check" } }])).find((f) => f.kind === "checks_failed")!.parts.detail).toBe(failed.say);
  });
});
