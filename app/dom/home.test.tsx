// M59: Home's main flows, rendered and clicked through (not its source text): Now at rest, a review card's three ways out,
// Fix it running to proven to Undo (Undo asks first), and Stop with Undo what it did.
import { describe, expect, test } from "bun:test";
import { PROJECT, app, buttons, hasButton, press, renderHome, runner, screen, settle, type } from "./render.tsx";

const B = "rv_4f2a9c01de";
const AGENT = "builder-1";
const batch = { type: "review.batch", project: PROJECT, batch: B, files: [{ file: "src/pay.ts", kind: "modified" }], count: 1, capped: false, secretFiles: [], auto: false };
const result = (rating: "stop" | "worth_a_look") => ({
  type: "review.result", project: PROJECT, batch: B, ok: true, rating, touches: ["payments"], summary: "The payment page now starts a Stripe checkout.", notes: [],
  reasons: rating === "stop" ? [{ kind: "removed_still_used", file: "src/App.tsx", line: 1, say: "src/utils/date.ts was removed, but src/App.tsx still uses it at line 1." }] : [],
  files: [{ file: "src/pay.ts", kind: "modified" }], count: 1, capped: false, secretFiles: [], checks: rating === "stop" ? "failed" : "passed",
  ...(rating === "stop" ? { checksNote: "Build did not pass." } : {}), sendBack: "A review of the changes found this.", lane: "strong", usdEstimate: 0.02,
});
const main = () => document.querySelector("main")!;

describe("Now at rest", () => {
  test("a returning person sees the project, Check my project and the ask box, and nothing is started by itself", async () => {
    await renderHome();
    expect(main().getAttribute("data-view")).toBe("now");
    expect(main().getAttribute("data-tone")).toBe("idle");
    expect(screen.getByRole("button", { name: "Project folder: shop" })).toBeTruthy();
    expect(hasButton("Check my project")).toBe(true);
    expect(screen.getByRole("textbox")).toBeTruthy();
    // No Stop while nothing runs, and no first run.
    expect(buttons().some((b) => b.startsWith("Stop"))).toBe(false);
    expect(screen.queryByRole("region", { name: /Welcome/ })).toBeNull();
    // Only background asks went to the engine: never a task, a fix or a review.
    expect(app.sentTypes().filter((t) => ["agent.start", "review.fix", "review.now", "checkpoint.restore"].includes(t))).toEqual([]);
    // Opening Home never takes the keyboard from the person's app (rule 9): nothing on the page has focus.
    expect(document.activeElement === document.body || document.activeElement === null).toBe(true);
  });
});

describe("a review card", () => {
  test("Fix it asks first; Not now sends nothing; Yes, fix it sends one review.fix for this batch", async () => {
    await renderHome();
    await runner(batch, result("stop"));
    expect(hasButton("Fix it")).toBe(true);
    expect(hasButton("Copy for my AI")).toBe(true);
    await press("Fix it");
    expect(hasButton("Yes, fix it")).toBe(true);
    expect(app.sentTypes()).not.toContain("review.fix");
    await press("Not now");
    expect(hasButton("Yes, fix it")).toBe(false);
    expect(app.sentTypes()).not.toContain("review.fix");
    await press("Fix it");
    await press("Yes, fix it");
    const fix = app.sent().filter((c) => c.type === "review.fix");
    expect(fix.length).toBe(1);
    expect(fix[0]).toMatchObject({ project: PROJECT, batch: B, agent: AGENT });
  });

  test("Copy for my AI copies the engine's words through the shell and says so", async () => {
    await renderHome();
    await runner(batch, result("stop"));
    await press("Copy for my AI");
    const copy = app.invoked("copy_text");
    expect(copy.length).toBe(1);
    expect(String(copy[0].args?.text)).toContain("A review of the changes found this.");
    await settle();
    expect(screen.getAllByRole("status").some((s) => /copied/i.test(s.textContent ?? ""))).toBe(true);
  });

  test("Looks fine closes a worth a look card and tells the engine how it was closed", async () => {
    await renderHome();
    await runner(batch, result("worth_a_look"));
    await press("Looks fine");
    const d = app.sent().filter((c) => c.type === "review.dismiss");
    expect(d.length).toBe(1);
    expect(d[0]).toMatchObject({ project: PROJECT, batch: B, how: "looksFine" });
    expect(hasButton("Looks fine")).toBe(false);
  });

  test("a stop card offers Keep it anyway, never Looks fine", async () => {
    await renderHome();
    await runner(batch, result("stop"));
    expect(hasButton("Looks fine")).toBe(false);
    expect(hasButton("Keep it anyway")).toBe(true);
  });
});

async function provenFix() {
  await renderHome();
  await runner(batch, result("stop"));
  await press("Fix it");
  await press("Yes, fix it");
  await runner({ type: "agent.state", agent: AGENT, state: "working" });
  await runner({ type: "checkpoint.created", project: PROJECT, agent: AGENT, checkpoint: "cp_0042", label: "Before: fix", files: 12, skipped: [] });
  await runner({ type: "agent.file", agent: AGENT, file: "src/App.tsx", kind: "modified" });
}

describe("Fix it running to proven to Undo", () => {
  test("while it runs Home is working and Stop shows; once proven it says so with Keep and Undo", async () => {
    await provenFix();
    expect(main().getAttribute("data-tone")).toBe("working");
    expect(buttons().some((b) => b.startsWith("Stop"))).toBe(true);
    await runner(
      { type: "proof.result", agent: AGENT, verdict: "passed", steps: [{ rung: "checks", label: "Building and checking the code", status: "passed", detail: "build passed.", ms: 120 }], tries: 1 },
      { type: "receipt", agent: AGENT, checkpoint: "cp_0042", changed: [{ file: "src/App.tsx", kind: "modified" }], commands: 1, notUndoable: [], proof: "passed", usdEstimate: 0.1 },
      { type: "agent.state", agent: AGENT, state: "done" },
    );
    expect(main().textContent).toContain("Proven");
    expect(buttons().some((b) => b.startsWith("Stop"))).toBe(false);
    expect(hasButton("Undo")).toBe(true);
    expect(hasButton("Keep this fix and close")).toBe(true);
  });

  test("Undo asks first: Keep the changes sends nothing, Yes, undo it restores the safety copy", async () => {
    await provenFix();
    await runner(
      { type: "receipt", agent: AGENT, checkpoint: "cp_0042", changed: [{ file: "src/App.tsx", kind: "modified" }], commands: 1, notUndoable: [], proof: "passed", usdEstimate: 0.1 },
      { type: "agent.state", agent: AGENT, state: "done" },
    );
    await press("Undo");
    expect(hasButton("Yes, undo it")).toBe(true);
    expect(app.sentTypes()).not.toContain("checkpoint.restore");
    await press("Keep the changes");
    expect(app.sentTypes()).not.toContain("checkpoint.restore");
    await press("Undo");
    await press("Yes, undo it");
    const r = app.sent().filter((c) => c.type === "checkpoint.restore");
    expect(r.length).toBe(1);
    expect(r[0]).toMatchObject({ project: PROJECT, checkpoint: "cp_0042" });
  });
});

describe("Stop, and Undo what it did", () => {
  test("Stop sends one interrupt; after it stopped, Undo these changes asks first and then restores", async () => {
    await renderHome();
    await type(screen.getByRole("textbox"), "make the button blue");
    await press("Send");
    expect(app.sent().filter((c) => c.type === "agent.start")[0]).toMatchObject({ project: PROJECT, prompt: "make the button blue" });
    await runner(
      { type: "agent.state", agent: AGENT, state: "working" },
      { type: "checkpoint.created", project: PROJECT, agent: AGENT, checkpoint: "cp_0042", label: "Before: make the button blue", files: 12, skipped: [] },
      { type: "agent.file", agent: AGENT, file: "src/App.tsx", kind: "modified" },
    );
    await press(/^Stop/);
    expect(app.sent().filter((c) => c.type === "agent.interrupt")).toEqual([expect.objectContaining({ agent: AGENT })]);
    await runner(
      { type: "agent.state", agent: AGENT, state: "idle" },
      { type: "receipt", agent: AGENT, checkpoint: "cp_0042", changed: [{ file: "src/App.tsx", kind: "modified" }], commands: 0, notUndoable: [], proof: "skipped", usdEstimate: 0.02 },
    );
    expect(buttons().some((b) => b.startsWith("Stop"))).toBe(false);
    // Honest words: changed, not proven, never "fixed".
    expect(main().textContent).toContain("Changed, not proven");
    await press("Undo these changes");
    expect(app.sentTypes()).not.toContain("checkpoint.restore");
    await press("Yes, undo it");
    expect(app.sent().filter((c) => c.type === "checkpoint.restore")[0]).toMatchObject({ checkpoint: "cp_0042" });
  });

  test("Stop everything from the hotkey (the shell's app.stop_everything) ends the working state on Home", async () => {
    await renderHome();
    await runner({ type: "agent.state", agent: AGENT, state: "working" });
    expect(main().getAttribute("data-tone")).toBe("working");
    await runner({ type: "app.stop_everything" });
    expect(main().getAttribute("data-tone")).not.toBe("working");
    expect(buttons().some((b) => b.startsWith("Stop"))).toBe(false);
  });
});
