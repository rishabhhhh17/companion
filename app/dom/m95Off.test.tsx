// M95, rendered on Learn with the switch off (in a file of its own, so the settings are read fresh): one line says so,
// nothing is listed, and the answer to an Explain check question is not noted.
import { describe, expect, test } from "bun:test";
import { S } from "../src/strings.ts";
import { _resetForTests, startSettings } from "../src/settingsStore.ts";
import { PROJECT, act, app, press, renderHome, runner, screen, settle } from "./render.tsx";

const learned = (signals: unknown[], on = true) => ({ type: "tutor.learned", on, paused: false, signals });
const region = () => screen.getByRole("region", { name: S.tutor.title });
const AGENT = "builder-1";
const B = "rv_4f2a9c01de";
// A proven fix started from a review card's Fix it (as in home.test.tsx), then its explanation with a check question.
async function provenFix(cp: string, question: { text: string; options: string[]; correct: number }) {
  await runner({ type: "review.batch", project: PROJECT, batch: B, files: [{ file: "src/pay.ts", kind: "modified" }], count: 1, capped: false, secretFiles: [], auto: false },
    { type: "review.result", project: PROJECT, batch: B, ok: true, rating: "stop", touches: [], summary: "A file was renamed.", notes: [], reasons: [{ kind: "removed_still_used", file: "src/App.tsx", line: 1, say: "src/utils/date.ts was removed, but src/App.tsx still uses it at line 1." }],
      files: [{ file: "src/pay.ts", kind: "modified" }], count: 1, capped: false, secretFiles: [], checks: "failed", checksNote: "Build did not pass.", sendBack: "A review found this.", lane: "strong", usdEstimate: 0.02 });
  await press("Fix it");
  await press("Yes, fix it");
  await runner({ type: "agent.state", agent: AGENT, state: "working" }, { type: "checkpoint.created", project: PROJECT, agent: AGENT, checkpoint: cp, label: "Before: fix", files: 12, skipped: [] },
    { type: "proof.result", agent: AGENT, verdict: "passed", steps: [{ rung: "checks", label: "Building and checking the code", status: "passed", detail: "build passed.", ms: 120 }], tries: 1 },
    { type: "receipt", agent: AGENT, checkpoint: cp, changed: [{ file: "src/App.tsx", kind: "modified" }], commands: 1, notUndoable: [], proof: "passed", usdEstimate: 0.1 },
    { type: "agent.state", agent: AGENT, state: "done" },
    { type: "explain.ready", agent: AGENT, checkpoint: cp, bullets: ["The file had a new name.", "Now the line uses it."], question, usdEstimate: 0.002 });
  const box = document.querySelector("details.explain") as HTMLDetailsElement | null;
  expect(box).not.toBeNull();
  box!.open = true;
  await settle();
}

async function openLearn(o: Parameters<typeof renderHome>[0] = {}) {
  app.reset();
  await renderHome(o);
  // The page reads its settings once as it loads (settingsStore.ts); read them again as a page opened with this one off.
  await act(async () => { _resetForTests(); startSettings(); });
  await settle();
  await press("Learn");
}

describe("the light tutor switched off", () => {
  test("with the switch off: one line says so, nothing is listed, and no answer is noted", async () => {
    await openLearn({ settings: { "tutor.on": false } });
    await runner(learned([], false));
    expect(region().textContent).toContain(S.tutor.off);
    expect(region().textContent).not.toContain(S.tutor.nextTitle);
    await press("Now");
    await provenFix("cp_0043", { text: "Why?", options: ["Because", "Not because"], correct: 0 });
    await press("Because");
    expect(app.sentTypes()).not.toContain("tutor.note");
  });
});
