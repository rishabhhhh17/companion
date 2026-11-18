// M105, which tool finished, and did it work (docs/milestones/M105-which-tool-finished.md), rendered: the notch's one pill
// says the result in the tool's name and opens the review card; Now says Codex is waiting with where to answer and no words of
// its question; Settings lists Codex's waiting row and says which tools cannot tell when they wait.
import { describe, expect, test } from "bun:test";
import { IslandPanel } from "../src/islandPanel.tsx";
import { initial, reduce, type Model } from "../src/model.ts";
import { S } from "../src/strings.ts";
import { PROJECT, ev, renderHome, renderPage, runner, settle } from "./render.tsx";

const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, ev(e) as never), from);
const atRest = () => run([{ type: "auth.status", method: "api_key", source: "keychain" }, { type: "ui.folderShown", project: PROJECT }]);
const batch = { type: "review.batch", project: PROJECT, batch: "rv_5a0b1c2d3e", files: [{ file: "src/pay.ts", kind: "modified" }, { file: "src/App.tsx", kind: "modified" }], count: 2, capped: false, secretFiles: [], auto: true, by: "codex" };
const result = { type: "review.result", project: PROJECT, batch: "rv_5a0b1c2d3e", ok: true, rating: "stop", touches: ["payments"], summary: "The payment page now starts a checkout.", notes: [],
  reasons: [{ kind: "secret_in_code", file: "src/pay.ts", line: 2, say: "A key or password is written into src/pay.ts at line 2." }, { kind: "checks_failed", say: "The project's own checks did not pass." }],
  files: batch.files, count: 2, capped: false, secretFiles: [], checks: "failed", sendBack: "x", lane: "none", usdEstimate: 0, by: "codex" };
const works = { ...result, batch: "rv_5a0b1c2d3f", rating: "safe", reasons: [], checks: "passed", by: "cursor" };

describe("the notch's one pill names the tool's result", () => {
  test("Codex finished with 2 problems: the pill says so with a dot, and the row's name says which tool", async () => {
    await renderPage(<IslandPanel m={run([batch, result], atRest())} line="" shown />);
    const panel = document.querySelector(".island-panel")!;
    expect(panel.querySelectorAll(".nb-pill").length).toBe(1);
    expect(panel.querySelector(".nb-pill")?.textContent).toBe("See 2 problems");
    expect(panel.querySelector(".nb-row")?.getAttribute("aria-label")).toContain("Codex finished in shop: 2 problems");
    expect(panel.querySelector(".nb-pill .nb-dot")).toBeTruthy();
    expect(panel.querySelector(".nb-pill")?.getAttribute("data-act")).toBe("finished");
  });
  test("Cursor finished and it works: a calm pill, no dot", async () => {
    await renderPage(<IslandPanel m={run([{ ...batch, batch: "rv_5a0b1c2d3f", by: "cursor" }, works], atRest())} line="" shown />);
    const panel = document.querySelector(".island-panel")!;
    expect(panel.querySelector(".nb-pill")?.textContent).toBe(S.m105.pill.works);
    expect(panel.querySelector(".nb-row")?.getAttribute("aria-label")).toContain("Cursor finished in shop: works");
    expect(panel.querySelector(".nb-dot")).toBeNull();
  });
  test("Codex waiting: the pill says so in Codex's name", async () => {
    await renderPage(<IslandPanel m={run([{ type: "hook.waiting", project: PROJECT, waiting: true, tool: "codex" }], atRest())} line="" shown />);
    const panel = document.querySelector(".island-panel")!;
    expect(panel.querySelector(".nb-pill")?.textContent).toBe("Codex is waiting");
    expect(panel.querySelector(".nb-row")?.getAttribute("aria-label")).toContain("Codex is waiting for you");
  });
});

describe("Home", () => {
  test("Now says Codex is waiting, where to answer, and nothing of its question", async () => {
    await renderHome();
    await runner({ type: "hook.waiting", project: PROJECT, waiting: true, tool: "codex" });
    await settle();
    const n = document.querySelector('[data-kind="claude-waiting"]')!;
    expect(n.getAttribute("data-tool")).toBe("codex");
    expect(n.textContent).toBe(`Codex is waiting for you in shop. ${S.m105.waitingLine("Codex")}`);
    await runner({ type: "hook.waiting", project: PROJECT, waiting: false });
    await settle();
    expect(document.querySelector('[data-kind="claude-waiting"]')).toBeNull();
  });
});
