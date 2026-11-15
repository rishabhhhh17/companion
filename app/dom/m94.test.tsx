// M94, rendered in History: What Squibby saved you under Your numbers, and its one line on This week, from the protocol's
// own fixture (m94e1). An older engine's week (m79e2, no counts) says Not counted, never a made up zero. Nothing is asked
// before a press.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { S } from "../src/strings.ts";
import { sparedLine, weekFrom } from "../src/weekSummary.ts";
import { PROJECT, app, press, renderHome, runner, screen } from "./render.tsx";

const fixture = (id: string) => ({ ...JSON.parse(readFileSync(new URL("../../protocol/fixtures/events.jsonl", import.meta.url), "utf8").split("\n").find((l) => l.includes(`"id":"${id}"`))!), project: PROJECT });
const tasks = { type: "tasks.list", project: PROJECT, tasks: [] };

async function openHistory() {
  app.reset();
  await renderHome();
  await press("History");
  await runner(tasks);
}

describe("What Squibby saved you", () => {
  test("Your numbers shows every count with its label, and Send these numbers carries the same counts only", async () => {
    await openHistory();
    await press(S.m88.numbers.openLabel);
    await runner(fixture("m94e1"));
    const part = () => screen.getByRole("region", { name: S.m94.title });
    for (const k of Object.keys(S.m94.rows) as (keyof typeof S.m94.rows)[]) expect(part().textContent).toContain(S.m94.rows[k]);
    expect(part().textContent).toContain(S.m94.lead);
    expect(part().textContent).not.toContain(S.m94.notCounted);
    const cells = [...part().querySelectorAll("td.numbers-n")].map((c) => c.textContent);
    expect(cells).toEqual(["2", "1", "1", "2", "1"]);
    expect(part().textContent).toContain(`${S.m94.rows.paused} (1 stopped or undone by you)`);
    await press(S.m88.numbers.send);
    const json = JSON.parse(screen.getByLabelText(S.m88.numbers.sendTitle, { selector: "pre" }).textContent!);
    expect(json.spared).toEqual({ loopsStopped: 2, paused: 1, pausedStopped: 1, foundNoModel: 1, wrongCaught: 2, liveAsks: 1 });
    expect(app.invoked("numbers_mail")).toEqual([]);
  });
  test("an older engine's week says Not counted, and its JSON has no saved part", async () => {
    await openHistory();
    await press(S.m88.numbers.openLabel);
    await runner(fixture("m79e2"));
    const part = screen.getByRole("region", { name: S.m94.title });
    expect(part.textContent).toContain(S.m94.notCounted);
    expect(part.querySelectorAll("td").length).toBe(0);
    await press(S.m88.numbers.send);
    expect(JSON.parse(screen.getByLabelText(S.m88.numbers.sendTitle, { selector: "pre" }).textContent!).spared).toBeUndefined();
  });
  test("This week gives it a title and a list of the parts above zero, and says nothing about it when nothing was counted", async () => {
    await openHistory();
    await press(S.m79.week.openLabel);
    await runner(fixture("m94e1"));
    const week = () => screen.getByRole("region", { name: S.m79.week.title });
    const parts = sparedLine(weekFrom(fixture("m94e1"), PROJECT)!.spared);
    expect(parts.length).toBe(5);
    const list = screen.getByRole("list", { name: S.m94.title });
    expect([...list.querySelectorAll("li")].map((l) => l.textContent)).toEqual(parts);
    expect(week().textContent).toContain(S.m94.title);
    await press(S.m79.week.close);
    await press(S.m79.week.openLabel);
    await runner(fixture("m79e2"));
    expect(week().textContent).not.toContain(S.m94.title);
    expect(screen.queryByRole("list", { name: S.m94.title })).toBeNull();
  });
  test("a week whose only events are what was saved does not say nothing happened", async () => {
    await openHistory();
    await press(S.m79.week.openLabel);
    const e = fixture("m94e1");
    e.week = { ...e.week, reviews: 0, files: 0, proven: 0, undone: 0, saved: 0, savedUsed: 0, caught: { keys: 0, weakened: 0, falseDones: 0, packages: 0 },
      spared: { loopsStopped: 1, paused: 1, pausedStopped: 1, foundNoModel: 0, wrongCaught: 0, liveAsks: 0 } };
    await runner(e);
    const week = screen.getByRole("region", { name: S.m79.week.title });
    expect(week.textContent).not.toContain(S.m79.week.empty);
    expect([...screen.getByRole("list", { name: S.m94.title }).querySelectorAll("li")].map((l) => l.textContent))
      .toEqual(["1 fix loop stopped", "1 task paused for using far more than usual (1 stopped or undone by you)"]);
  });
});
