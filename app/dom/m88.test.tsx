// M88, rendered and clicked through in History: Your numbers asks for nothing until its row is pressed, shows the counts,
// shows the exact JSON on Send these numbers, and only Open a mail draft hands it to the shell; Share what my AI did shows
// the preview first and only Save hands the page to the shell. The week is the protocol's own fixture (m79e2).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { S } from "../src/strings.ts";
import { weekFrom, weekPage } from "../src/weekSummary.ts";
import { PROJECT, app, press, renderHome, runner, screen } from "./render.tsx";

const fixture = (id: string) => ({ ...JSON.parse(readFileSync(new URL("../../protocol/fixtures/events.jsonl", import.meta.url), "utf8").split("\n").find((l) => l.includes(`"id":"${id}"`))!), project: PROJECT });
const now = Date.now();
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
const tasks = { type: "tasks.list", project: PROJECT, tasks: [
  { id: 3, label: "Add a contact form", status: "done", usd: 0.04, startedAt: iso(120_000), endedAt: iso(60_000), checkpoint: "cp_0001", changed: 2, proof: "passed" },
] };

/** The page the preview's frame shows (its srcdoc). */
const frameOf = (el: HTMLElement) => el.querySelector("iframe")?.getAttribute("srcdoc") ?? "";

async function openHistory() {
  app.reset();
  await renderHome();
  await press("History");
  await runner(tasks);
}

describe("Your numbers in History", () => {
  test("nothing is asked until the press; the counts show; the JSON shows before anything; only Open a mail draft sends", async () => {
    await openHistory();
    const count = (t: string) => app.sent().filter((c) => c.type === t).length;
    const weeksBefore = count("week.show"), toolsBefore = count("donesignal.show");
    await press(S.m88.numbers.openLabel);
    expect(count("week.show")).toBe(weeksBefore + 1);
    expect(count("donesignal.show")).toBe(toolsBefore + 1);
    expect(app.sent().filter((c) => c.type === "donesignal.show").at(-1)).toEqual(expect.objectContaining({ project: PROJECT }));
    await runner(fixture("m79e2"));
    const page = () => screen.getByRole("region", { name: S.m88.numbers.title });
    expect(page().textContent).toContain(S.m88.numbers.rows.jobs);
    expect(page().textContent).toContain(S.m88.numbers.rows.reviews);
    // The range in words, as This week says it; the days as numbers stay in the JSON only.
    expect(page().textContent).toContain(weekPage(weekFrom(fixture("m79e2"), PROJECT)!).range);
    expect(page().textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    await press(S.m88.numbers.send);
    // Who the numbers go to: no address is set yet, and the page says so.
    expect(page().textContent).toContain(S.m88.numbers.noAddress);
    const json = screen.getByLabelText(S.m88.numbers.sendTitle, { selector: "pre" }).textContent!;
    expect(JSON.parse(json)).toMatchObject({ numbers: 1, changesReviewed: 6, jobsHanded: 4, daysUsed: 5 });
    expect(json).not.toContain("shop");
    expect(app.invoked("numbers_mail")).toEqual([]);
    await press(S.m88.numbers.cancel);
    expect(app.invoked("numbers_mail")).toEqual([]);
    await press(S.m88.numbers.send);
    await press(S.m88.numbers.openMail);
    const sent = app.invoked("numbers_mail");
    expect(sent.length).toBe(1);
    expect(sent[0].args).toEqual({ json, subject: S.m88.numbers.mailSubject });
  });
});

describe("Share what my AI did", () => {
  test("from a task's row: the preview first, then Save hands the checked page to the shell", async () => {
    await openHistory();
    await press("Star, Name it: Add a contact form");
    await press(S.m88.share.buttonLabel("Add a contact form"));
    const preview = screen.getByRole("group", { name: S.m88.share.previewTitle });
    // The preview is the file itself: the words are in the frame's page, never drawn a second time.
    const shown = frameOf(preview);
    expect(shown).toContain("Add a contact form");
    expect(shown).toContain(S.m88.share.proof.passed);
    expect(shown).not.toContain(PROJECT);
    expect(preview.querySelector("iframe")?.getAttribute("sandbox")).toBe("allow-same-origin");
    expect(app.invoked("save_receipt")).toEqual([]);
    await press(S.m88.share.save);
    const saved = app.invoked("save_receipt");
    expect(saved.length).toBe(1);
    const html = String(saved[0].args?.html ?? "");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("Add a contact form");
    expect(html).not.toContain("/Users/");
    expect(html.toLowerCase()).not.toContain("<script");
    // What is saved is exactly what was shown.
    expect(html).toBe(shown);
  });
  test("from This week: the counts and lines, never the decisions", async () => {
    await openHistory();
    await press(S.m79.week.openLabel);
    await runner(fixture("m79e2"));
    await press(S.m88.share.button);
    const preview = screen.getByRole("group", { name: S.m88.share.previewTitle });
    expect(frameOf(preview)).toContain(S.m88.share.weekHead);
    expect(frameOf(preview)).not.toContain("never edit pricing.txt");
    await press(S.m88.share.close);
    expect(screen.queryByRole("group", { name: S.m88.share.previewTitle })).toBeNull();
    expect(app.invoked("save_receipt")).toEqual([]);
  });
});
