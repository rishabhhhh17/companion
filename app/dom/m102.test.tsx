// M102: every warning shows why, rendered. The lead finding says why Squibby is sure under its place, the others carry their
// own why in their one line, Why does this matter? lists each finding with its why, and a worry the engine turned into a
// note shows only as a note (no warning, no why).
import { describe, expect, test } from "bun:test";
import { PROJECT, press, renderHome, runner } from "./render.tsx";
import { S } from "../src/strings.ts";

const B = "rv_6c4d1e23f0";
const files = [{ file: "src/pay.ts", kind: "modified" }, { file: "src/pay/tax.ts", kind: "modified" }];
const batch = { type: "review.batch", project: PROJECT, batch: B, files, count: 2, capped: false, secretFiles: [], auto: false };
const result = (o: Record<string, unknown>) => ({ type: "review.result", project: PROJECT, batch: B, ok: true, rating: "stop", touches: ["payments"], summary: "The checkout now adds tax.", notes: [], reasons: [],
  files, count: 2, capped: false, secretFiles: [], checks: "failed", checksNote: "The build did not pass.", sendBack: "A review found this.", lane: "cheap", usdEstimate: 0, ...o });
const reasons = [
  { kind: "checks_failed", say: "The project's own checks did not pass.", proof: { by: "check", check: "Build", exit: 1 } },
  { kind: "model_concern", file: "src/pay/tax.ts", line: 14, say: "Tax may be added twice at checkout.", proof: { by: "line", file: "src/pay/tax.ts", line: 14 } },
];

describe("why I'm sure, on the card", () => {
  test("the lead's why, the other finding's why, and both again under Why does this matter?", async () => {
    await renderHome();
    await runner(batch, result({ reasons }));
    const lead = `${S.proof.label}: Build did not pass (error code 1).`;
    // M102 review: a model's worry says where it is, never Why I'm sure.
    const other = `${S.proof.lineLabel}: ${S.proof.line("src/pay/tax.ts:14")}`;
    expect(document.querySelector(".rv-sure")?.textContent).toBe(lead);
    expect(document.querySelector(".rv-other-line")?.textContent).toBe(other);
    await press(S.homeNow.whyMatters);
    const list = [...document.querySelectorAll(".finding-sure")].map((x) => x.textContent);
    expect(list).toEqual([lead, other]);
    expect([...document.querySelectorAll(".finding-sure b")].map((x) => x.textContent)).toEqual([`${S.proof.label}:`, `${S.proof.lineLabel}:`]);
    // The failing check's own words only said the checks failed: the why with its exit code says it once.
    const failing = document.querySelector('.review-reasons li[data-kind="checks_failed"]')!;
    expect(failing.textContent).not.toContain("The project's own checks did not pass.");
    expect(document.body.textContent).not.toMatch(/[–—]/);
  });
  test("a worry with no place is a note: the card stays Looks safe and says no why", async () => {
    await renderHome();
    await runner(batch, result({ rating: "safe", touches: [], checks: "passed", checksNote: undefined, notes: ["Tax may be added twice at checkout."] }));
    expect(document.querySelector(".rv-sure")).toBeNull();
    expect(document.querySelector(".finding-sure")).toBeNull();
  });
});

describe("the lead's code box (M102 review)", () => {
  test("the sure line does not repeat the place the box shows, and the file name is whole", async () => {
    await renderHome();
    const key = { kind: "secret_in_code", file: "src/pay/tax.ts", line: 14, say: "A key is in src/pay/tax.ts.", proof: { by: "rule", file: "src/pay/tax.ts", line: 14 },
      lines: [{ n: 13, text: "const a = 1;" }, { n: 14, text: "const k = 2;" }, { n: 15, text: "const b = 3;" }] };
    await runner(batch, result({ reasons: [key], checks: "passed", checksNote: undefined }));
    expect(document.querySelector(".rv-sure")?.textContent).toBe(`${S.proof.label}: ${S.proof.ruleShown(S.proof.ruleName.secret_in_code)}`);
    expect(document.querySelector(".cp-file")?.textContent).toBe("src/pay/tax.ts");
    expect(document.querySelector(".cp-file")?.getAttribute("title")).toBe("src/pay/tax.ts");
  });
});
