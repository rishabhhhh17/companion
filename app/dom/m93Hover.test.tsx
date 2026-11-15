// M93, a minimal notch hover (docs/milestones/M93-minimal-hover.md), rendered: the panel reads as one glance in every state
// (a greeting, at most one line, one button and Open Home), and what left it is in Home (here: the usage ring on Now).
import { describe, expect, test } from "bun:test";
import { IslandPanel } from "../src/islandPanel.tsx";
import { initial, reduce, type Model } from "../src/model.ts";
import { S } from "../src/strings.ts";
import { PROJECT, ev, renderHome, renderPage, runner, screen, settle } from "./render.tsx";

const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, ev(e) as never), from);
const atRest = () => run([{ type: "auth.status", method: "api_key", source: "keychain" }, { type: "ui.folderShown", project: PROJECT }]);
const batch = { type: "review.batch", project: PROJECT, batch: "rv_4f2a9c01de", files: [{ file: "src/a.ts", kind: "modified" }], count: 2, capped: false, secretFiles: [], auto: false };
const job = [{ type: "agent.state", agent: "builder-1", state: "working" }, { type: "checkpoint.created", project: PROJECT, agent: "builder-1", checkpoint: "cp_0042", label: "Before: make the button blue", files: 12, skipped: [] }];

describe("one glance in every state", () => {
  const states: [string, () => Model, string, string | null][] = [
    ["not checked yet", atRest, S.m93.act.check, null],
    ["changes to review", () => run([batch], atRest()), S.m93.act.review, S.m93.line.changes(2)],
    ["Claude Code waits", () => run([{ type: "hook.waiting", project: PROJECT, waiting: true, message: "" }], atRest()), S.m93.act.claude, S.m93.line.claude],
    ["a job runs", () => run(job, atRest()), S.m93.act.stop, null],
    ["the engine stopped", () => ({ ...atRest(), runnerUp: false }), S.m93.act.seeWhy, S.m93.line.off],
    ["no project", () => run([{ type: "auth.status", method: "api_key", source: "keychain" }]), S.m93.act.pick, null],
  ];
  for (const [name, m, action, line] of states) test(name, async () => {
    await renderPage(<IslandPanel m={m()} line="" shown />);
    const panel = document.querySelector(".island-panel")!;
    expect(panel.children.length).toBe(2);
    expect(panel.querySelector(".ip-greet-big")?.textContent).toMatch(/^Hey /);
    expect(panel.querySelectorAll(".ip-line").length).toBeLessThanOrEqual(1);
    if (line) expect(panel.querySelector(".ip-line")?.textContent).toBe(line);
    expect(panel.querySelectorAll(".ip-cta").length).toBe(1);
    expect(panel.querySelector(".ip-cta")?.textContent).toContain(action);
    expect(panel.querySelectorAll("button").length).toBeLessThanOrEqual(2);
    expect(panel.querySelectorAll(".ip-face").length).toBe(1);
  });
});

describe("what left the hover is in Home", () => {
  test("the usage ring shows on Now once Claude says how full the limit is", async () => {
    await renderHome({ answers: { ai_tools_find: { apps: [], programs: ["claude"], folders: [] } } });
    expect(document.querySelector(".now-runway")).toBeNull();
    await runner({ type: "usage.runway", state: "near", source: "plan", usedPct: 91, resetsAt: new Date(Date.now() + 2 * 3600_000).toISOString(), window: "five_hour" });
    await settle();
    expect(screen.getByRole("img", { name: /The Claude 5 hour limit is 91% used/ })).toBeTruthy();
    expect(document.querySelector(".now-runway")?.textContent).toContain(S.m93.runwayLabel);
  });
});
