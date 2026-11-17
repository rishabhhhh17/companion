// M104, rendered: a review's Fix it ends with a receipt that says, for each problem the review found, what the rules found
// when they looked again. One still there: Not fixed yet, never proven, and Try again sends Fix it again for that review.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { S } from "../src/strings.ts";
import { PROJECT, app, press, renderHome, runner, screen } from "./render.tsx";

const fixture = (id: string) => JSON.parse(readFileSync(new URL("../../protocol/fixtures/events.jsonl", import.meta.url), "utf8").split("\n").find((l) => l.includes(`"id":"${id}"`))!);
const AGENT = "builder-1";
const B = "rv_0a1b2c3d4e";
async function fixedFromReview(receiptId: string, o: { proof?: "passed" | "failed" } = {}) {
  await runner({ type: "review.batch", project: PROJECT, batch: B, files: [{ file: "src/pay.ts", kind: "modified" }], count: 1, capped: false, secretFiles: [], auto: false },
    { type: "review.result", project: PROJECT, batch: B, ok: true, rating: "stop", touches: [], summary: "A key was added.", notes: [], reasons: [{ kind: "secret_in_code", file: "src/pay.ts", line: 1, say: "A secret key is written into src/pay.ts." }, { kind: "checks_failed", say: "The tests failed after this change." }],
      files: [{ file: "src/pay.ts", kind: "modified" }], count: 1, capped: false, secretFiles: [], checks: "failed", checksNote: "Tests did not pass.", sendBack: "A review found this.", lane: "rules", usdEstimate: 0 });
  await press("Fix it");
  await press("Yes, fix it");
  const r = fixture(receiptId);
  await runner({ type: "agent.state", agent: AGENT, state: "working" }, { type: "checkpoint.created", project: PROJECT, agent: AGENT, checkpoint: r.checkpoint, label: "Before: fix", files: 12, skipped: [] },
    o.proof === "failed"
      ? { type: "proof.result", agent: AGENT, verdict: "failed", steps: [{ rung: "tests", label: "Running the tests", status: "failed", detail: "1 test failed: the signup form shows a thank you message.", ms: 120 }], tries: 1 }
      : { type: "proof.result", agent: AGENT, verdict: "passed", steps: [{ rung: "tests", label: "Running the tests", status: "passed", detail: "tests passed.", ms: 120 }], tries: 1 },
    o.proof === "failed" ? { ...r, proof: "failed" } : r, { type: "agent.state", agent: AGENT, state: "done" });
}
const section = () => document.querySelector(".receipt-recheck") as HTMLElement | null;

describe("fixed and proven, finding by finding", () => {
  test("every problem gone or to look at: the list says so, the result stays proven, and no Try again", async () => {
    await renderHome();
    await fixedFromReview("m104e1");
    const s = section();
    expect(s).not.toBeNull();
    expect(s!.textContent).toContain(S.fixRecheck.title);
    const rows = [...s!.querySelectorAll("li")];
    expect(rows.map((r) => r.getAttribute("data-outcome"))).toEqual(["unsure", "gone", "gone"]);
    expect(rows[0].textContent).toContain(S.fixRecheck.unsure);
    expect(rows[0].textContent).toContain(S.fixRecheck.unsureLine);
    expect(rows[1].textContent).toContain(S.fixRecheck.gone);
    expect(s!.querySelector("button")).toBeNull();
    expect(document.body.textContent).toContain(S.homeNow.resultPill.proven);
  });
  test("one still there: Not fixed yet with how many, Still there first, and Try again sends Fix it again for that review", async () => {
    await renderHome();
    await fixedFromReview("m104e2");
    const s = section()!;
    const rows = [...s.querySelectorAll("li")];
    expect(rows[0].getAttribute("data-outcome")).toBe("still");
    expect(rows[0].textContent).toContain(S.fixRecheck.still);
    expect(rows[0].textContent).toContain("A secret key is written into src/pay.ts.");
    // The M104 review: the hero says it once (Not fixed yet, and how many), so the receipt's own verdict line is not drawn
    // again and the bar's "Undo is ready" goes (the hero's actions say it).
    const hero = document.querySelector(".hero")!;
    expect(hero.textContent).toContain(S.homeNow.resultPill.failed);
    expect(hero.textContent).toContain(S.verdict.stillThere(1));
    // Said once on screen (the screen reader's own live line is not drawn).
    const seen = [...document.querySelectorAll("p, span, h1, h2, h3, div")].filter((e) => !e.closest(".sr") && [...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").includes(S.verdict.stillThere(1))));
    expect(seen.length).toBe(1);
    expect(document.querySelector(".result-verdict")).toBeNull();
    expect(document.querySelector(".bar-meta")?.textContent ?? "").not.toContain(S.home.undoReady);
    // Undo is offered where it always is.
    expect(screen.queryAllByRole("button").some((b) => (b.textContent ?? "").includes(S.home.undoFix))).toBe(true);
    const before = app.sent().filter((c) => c.type === "review.fix").length;
    await press(S.fixRecheck.tryAgain);
    const fixes = app.sent().filter((c) => c.type === "review.fix");
    expect(fixes.length).toBe(before + 1);
    expect(fixes.at(-1)).toMatchObject({ project: PROJECT, batch: B });
    // Once pressed it waits, and a second press sends nothing.
    expect(screen.getByRole("button", { name: S.fixRecheck.trying })).toHaveProperty("disabled", true);
  });
  test("all gone but one to look at: the hero is never the plain fixed headline, it asks to check first", async () => {
    await renderHome();
    await fixedFromReview("m104e1");
    const title = document.querySelector(".rest-first")?.textContent ?? "";
    expect(title).toContain(S.homeNow.butCheck("x.").slice(1));
    expect(title.endsWith(", but check these first.")).toBe(true);
  });
  test("one still there: Try again is the one next step, the follow up box is not offered beside it", async () => {
    await renderHome();
    await fixedFromReview("m104e2");
    expect(screen.queryByPlaceholderText(S.followUpPlaceholder)).toBeNull();
  });
  test("checks failed and one still there: exactly one Undo and one Try again, and Try again is the review's", async () => {
    await renderHome();
    await fixedFromReview("m104e2", { proof: "failed" });
    const names = screen.queryAllByRole("button").map((b) => (b.textContent ?? "").trim());
    expect(names.filter((n) => /^Undo/.test(n)).length).toBe(1);
    expect(names.filter((n) => n === S.fixRecheck.tryAgain || n === S.fixRun.tryAgain).length).toBe(1);
    const before = app.sent().filter((c) => c.type === "review.fix").length;
    await press(S.fixRecheck.tryAgain);
    expect(app.sent().filter((c) => c.type === "review.fix").length).toBe(before + 1);
  });
});
