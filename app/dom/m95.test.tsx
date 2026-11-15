// M95, rendered on Learn: Practise next and What you have learned, from the protocol's own fixture (m95e1). Learn asks
// the engine what it keeps; a press on Forget forgets exactly that line; a practice the record says is done is told once;
// the answer to an Explain check question is noted; with the switch off nothing is listed and nothing is noted.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { S } from "../src/strings.ts";
import { CATALOG } from "../src/practice.ts";
import { PROJECT, app, press, renderHome, renderPage, runner, screen, settle, within } from "./render.tsx";
import { TutorPanel } from "../src/tutorPanel.tsx";

const fixture = (id: string) => JSON.parse(readFileSync(new URL("../../protocol/fixtures/events.jsonl", import.meta.url), "utf8").split("\n").find((l) => l.includes(`"id":"${id}"`))!);
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
  await press("Learn");
}

describe("the light tutor on Learn", () => {
  test("with no history: Learn asks, the list says what will appear in short words, and only the featured card suggests a practice", async () => {
    await openLearn();
    expect(app.sentTypes()).toContain("tutor.list");
    await runner(learned([]));
    const text = region().textContent!;
    expect(text).toContain(S.tutor.noneTitle);
    expect(text).toContain(S.tutor.noneLine);
    // The tutor makes no second suggestion: the practice list's featured card is Practise next.
    expect(text).not.toContain(S.tutor.nextTitle);
    expect(within(region()).queryAllByRole("button").map((b) => b.getAttribute("aria-label") ?? "").filter((l) => l.startsWith(S.tutor.start))).toEqual([]);
    const first = CATALOG[0];
    const title = S.practices[first.id as keyof typeof S.practices].title;
    expect(document.querySelector(".learn-lead .ui-lead-title")?.textContent).toBe(title);
    await press(`${S.practiceStart}: ${title}`);
    expect(app.invoked("create_practice").map((c) => c.args)).toEqual([{ which: first.id }]);
  });
  test("with some history: each line with its source, Forget forgets that line, and Not this one forgets what the suggestion came from", async () => {
    await openLearn();
    await runner(fixture("m95e1"));
    const text = region().textContent!;
    // Found and moved counts only the practice; the review is said as a source, never as a move the person made.
    expect(text).toContain("A key written into the code: found and moved to settings, once");
    expect(text).toContain(`${S.tutor.from}: ${S.tutor.sources.review}, 14 Nov; ${S.tutor.sources.practice}, 12 Nov`);
    // The missed check question leads: the practice list's featured card is the renamed file practice, with the tutor's
    // why, and the tutor makes no second suggestion of its own.
    expect(text).not.toContain(S.tutor.nextTitle);
    const lead = document.querySelector(".learn-lead") as HTMLElement;
    expect(lead.querySelector(".ui-lead-title")?.textContent).toBe(S.practices.import.title);
    expect(lead.textContent).toContain(S.tutor.why.missed(S.tutor.kinds.renamed_file.about));
    await press(S.tutor.forgetLine(S.tutor.kinds.key_in_code.title));
    expect(app.sent().filter((c) => c.type === "tutor.forget").map(({ kind, part }) => ({ kind, part }))).toEqual([{ kind: "key_in_code", part: "learned" }]);
    await press(`${S.tutor.notThis}: ${S.practices.import.title}`);
    expect(app.sent().filter((c) => c.type === "tutor.forget").at(-1)).toMatchObject({ kind: "renamed_file", part: "missed" });
    // Nothing else was started by these presses.
    expect(app.sentTypes().filter((t) => ["agent.start", "review.fix"].includes(t))).toEqual([]);
  });
  test("with every practice done: the practices the record holds are told once, and Practise next says every one is done", async () => {
    const practices = CATALOG.map((e) => ({ id: e.id, path: `/Users/me/Squibby practice ${e.id}`, there: true, started: "2026-11-01", done: "2026-11-02" }));
    await openLearn({ answers: { practice_list: { practices, damaged: false } } });
    await runner(learned([]));
    await settle(80);
    const notes = app.sent().filter((c) => c.type === "tutor.note");
    expect(notes.map((c) => c.practice).sort()).toEqual(CATALOG.map((e) => e.id).sort());
    expect(notes.every((c) => c.source === "practice" && c.project === PROJECT)).toBe(true);
    await runner(learned([]));
    await settle(80);
    expect(app.sent().filter((c) => c.type === "tutor.note").length).toBe(CATALOG.length);   // never twice in a session
    // The practice list says every one is done; the tutor does not say it again.
    expect(region().textContent).not.toContain(S.tutor.allDone);
    expect(document.querySelector(".learn-lead .ui-lead-title")?.textContent).toBe(S.practiceAllDoneTitle);
  });
  test("an Explain check question answered sends the checkpoint and whether it was right, and nothing else", async () => {
    await openLearn();
    await press("Now");
    await provenFix("cp_0042", { text: "Why did it stop?", options: ["The old name was used", "The computer was slow"], correct: 0 });
    await press("The computer was slow");
    expect(app.sent().filter((c) => c.type === "tutor.note")).toEqual([expect.objectContaining({ type: "tutor.note", project: PROJECT, source: "check", checkpoint: "cp_0042", right: false })]);
  });
  test("on its own (no practice list under it): Not this one sits inside the Practise next row, and nothing is suggested before the rows load", async () => {
    const forgot: string[] = [];
    const act = { start: () => {}, open: () => {}, lesson: () => {}, forget: (k: string, p: string) => { forgot.push(`${k}:${p}`); } };
    const rows = CATALOG.map((e) => ({ id: e.id, state: "notStarted" as const, there: false, title: S.practices[e.id as keyof typeof S.practices].title }));
    const missed = { on: true, paused: false, signals: [{ kind: "renamed_file" as const, source: "check" as const, date: "2026-11-14", missed: true as const }] };
    await renderPage(<TutorPanel learned={missed} rows={rows} lessons={[]} busy={false} act={act as never} />);
    const row = screen.getByRole("button", { name: `${S.tutor.notThis}: ${S.practices.import.title}` }).closest("li.ui-mrow");
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain(S.tutor.why.missed(S.tutor.kinds.renamed_file.about));
    expect(document.querySelector(".tutor > .row")).toBeNull();
    await press(`${S.tutor.notThis}: ${S.practices.import.title}`);
    expect(forgot).toEqual(["renamed_file:missed"]);
  });
  test("on its own, before the practice record has loaded: no Practise next and no empty line under it", async () => {
    await renderPage(<TutorPanel learned={{ on: true, paused: false, signals: [] }} rows={[]} lessons={[]} busy={false} act={{ start: () => {}, open: () => {}, lesson: () => {}, forget: () => {} }} />);
    expect(screen.getByRole("region", { name: S.tutor.title }).textContent).not.toContain(S.tutor.nextTitle);
  });
  test("on its own, with only practices that need Node left: the row says it needs Node and has no Start", async () => {
    const rows = CATALOG.map((e) => ({ id: e.id, state: (e.id === "signup" ? "notStarted" : "done") as "notStarted" | "done", there: true, title: S.practices[e.id as keyof typeof S.practices].title, needsNode: e.id === "signup" }));
    await renderPage(<TutorPanel learned={{ on: true, paused: false, signals: [] }} rows={rows} lessons={[]} busy={false} act={{ start: () => {}, open: () => {}, lesson: () => {}, forget: () => {} }} />);
    const text = screen.getByRole("region", { name: S.tutor.title }).textContent!;
    expect(text).toContain(S.practices.signup.title);
    expect(text).toContain(S.practiceNeedsNode);
    expect(screen.queryByRole("button", { name: `${S.tutor.start}: ${S.practices.signup.title}` })).toBeNull();
  });
});
