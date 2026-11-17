// M93, a minimal notch hover (docs/milestones/M93-minimal-hover.md), rendered: the panel reads as one glance in every state
// (a greeting, at most one line, one button and Open Home), and what left it is in Home (here: the usage ring on Now).
import { describe, expect, test } from "bun:test";
import { IslandPanel } from "../src/islandPanel.tsx";
import { initial, reduce, type Model } from "../src/model.ts";
import { S } from "../src/strings.ts";
import { PROJECT, act, ev, renderHome, renderPage, runner, screen, settle } from "./render.tsx";
import { _resetForTests, startSettings } from "../src/settingsStore.ts";

const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, ev(e) as never), from);
const atRest = () => run([{ type: "auth.status", method: "api_key", source: "keychain" }, { type: "ui.folderShown", project: PROJECT }]);
const batch = { type: "review.batch", project: PROJECT, batch: "rv_4f2a9c01de", files: [{ file: "src/a.ts", kind: "modified" }], count: 2, capped: false, secretFiles: [], auto: false };
const job = [{ type: "agent.state", agent: "builder-1", state: "working" }, { type: "checkpoint.created", project: PROJECT, agent: "builder-1", checkpoint: "cp_0042", label: "Before: make the button blue", files: 12, skipped: [] }];

// M96 (changed on purpose, the founder approved the HeyClicky style mock, 15 Nov 2026): one glance is now one row: the face
// and a lowercase hello (one button), then one pill with the action's own words; the line is the row's name, never drawn.
describe("one glance in every state", () => {
  const states: [string, () => Model, string, string | null][] = [
    ["not checked yet", atRest, S.m96.act.check, null],
    ["changes to review", () => run([batch], atRest()), S.m96.changes(2), S.m93.line.changes(2)],
    ["Claude Code waits", () => run([{ type: "hook.waiting", project: PROJECT, waiting: true, message: "" }], atRest()), S.m96.act.claude, S.m93.line.claude],
    ["a job runs", () => run(job, atRest()), S.m96.act.stop, null],
    ["the engine stopped", () => ({ ...atRest(), runnerUp: false }), S.m96.act.seeWhy, S.m93.line.off],
    ["no project", () => run([{ type: "auth.status", method: "api_key", source: "keychain" }]), S.m96.act.pick, null],
  ];
  for (const [name, m, pill, line] of states) test(name, async () => {
    await renderPage(<IslandPanel m={m()} line="" shown />);
    const panel = document.querySelector(".island-panel")!;
    expect(panel.children.length).toBe(1);
    expect(panel.querySelector(".nb-greet")?.textContent).toMatch(/^hey /);
    expect(panel.querySelectorAll(".ip-line").length).toBe(0);
    if (line) expect(panel.querySelector(".nb-row")?.getAttribute("aria-label")).toContain(line);
    expect(panel.querySelectorAll(".nb-pill").length).toBe(1);
    expect(panel.querySelector(".nb-pill")?.textContent).toBe(pill);
    expect(panel.querySelectorAll(".nb-pill svg, .nb-pill .ui-mtile").length).toBe(0);
    expect(panel.querySelectorAll("button").length).toBe(2);
    // Changed on purpose (founder round 1, 17 Nov 2026: "I don't want the Flowflow symbol to be on there"): the face shows
    // in the row only while Flowflow lives in the notch (the m96 round 1 tests hold that); on the screen edge, the hello alone.
    expect(panel.querySelectorAll(".ip-face").length).toBe(0);
  });
});

describe("round 1: Flowflow's face in the notch's row only while it lives there", () => {
  test("tucked into the notch, the face is the handle to drag it out; on the screen edge, the hello alone", async () => {
    await renderPage(<IslandPanel m={atRest()} line="" shown />, { settings: { "character.lives": "notch" } });
    await act(async () => { _resetForTests(); startSettings(); });
    await settle();
    expect(document.querySelectorAll(".island-panel .ip-face").length).toBe(1);
    expect(document.querySelector(".island-panel .nb-hi")?.hasAttribute("data-tucked")).toBe(true);
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
