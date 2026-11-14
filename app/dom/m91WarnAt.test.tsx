// The M91 review, rendered: the notch's ring and Home's warning agree on Warn me before a big job (runway.warnAt). At 70 the
// ring is amber at 72% and Run it asks first; at 90 the ring is grey at 85% and Run it starts at once. A file of its own:
// the settings are read once per page (settingsStore.ts), so each test reads them again as a page opened with that choice.
import { describe, expect, test } from "bun:test";
import { IslandPanel } from "../src/islandPanel.tsx";
import { initial, reduce, type Model } from "../src/model.ts";
import { _resetForTests, startSettings } from "../src/settingsStore.ts";
import { S } from "../src/strings.ts";
import { PROJECT, act, app, ev, press, renderHome, renderPage, runner, screen, settle, type } from "./render.tsx";

const reread = async () => { await act(async () => { _resetForTests(); startSettings(); }); await settle(); };
const WEEK_RESET = new Date(Date.now() + 3 * 86_400_000).toISOString();
const week = (pct: number) => ({ type: "usage.runway", state: "ok", source: "plan", usedPct: pct, resetsAt: WEEK_RESET, window: "seven_day" });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, ev(e) as never), from);
const atRest = () => run([{ type: "auth.status", method: "api_key", source: "keychain" }, { type: "ui.folderShown", project: PROJECT }]);
const PROMPT = "Add a contact form to the home page.";

async function ring(pct: number, warnAt: string) {
  app.reset();
  document.body.innerHTML = "";
  await renderPage(<IslandPanel m={run([week(pct)], atRest())} line="" shown />, { settings: { "runway.warnAt": warnAt } });
  await reread();
  return screen.getByRole("img", { name: new RegExp(`The Claude week limit is ${pct}% used`) }).getAttribute("data-level");
}
async function runIt(pct: number, warnAt: string) {
  app.reset();
  document.body.innerHTML = "";
  await renderHome({ settings: { "runway.warnAt": warnAt }, answers: { ai_tools_find: { apps: [], programs: ["claude"], folders: [] } } });
  await reread();
  await type(screen.getAllByRole("textbox")[0]!, "add a contact form");
  await press("Have my AI do it");
  const req = (app.invoked("handoff_prompt")[0]!.args as { req: string }).req;
  await runner({ type: "assist.prompt.done", req, text: PROMPT, diff: [["=", PROMPT]], usdEstimate: 0, handback: "paste" });
  await runner(week(pct));
  await press("Run it");
  return { asked: !!screen.queryByRole("alertdialog", { name: S.m91.warnTitle("week") }), started: app.sent().filter((c) => c.type === "agent.start").length };
}

describe("the ring and the warning agree on the chosen mark", () => {
  test("at 70: 72% of the week is amber in the notch", async () => {
    expect(await ring(72, "70")).toBe("near");
  });
  test("at 70: 72% of the week, Run it asks first", async () => {
    expect(await runIt(72, "70")).toEqual({ asked: true, started: 0 });
  });
  test("at 90: 85% of the week is grey in the notch", async () => {
    expect(await ring(85, "90")).toBe("ok");
  });
  test("at 90: 85% of the week, Run it starts at once", async () => {
    expect(await runIt(85, "90")).toEqual({ asked: false, started: 1 });
  });
});
