// Put it online after Stop everything or an engine restart (audit A28): the Online box never stays on a busy line with
// nothing running, so its Close is back and an update can be installed again.
import { describe, expect, test } from "bun:test";
import { initial, reduce, type Model } from "./model.ts";
import { isBusy } from "./updates.ts";

const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const at = (stage: string) => run([ev({ type: "ship.status", project: "/p", stage, detail: "Working on it.", previewUrl: stage === "checking_preview" ? "https://a.vercel.app" : undefined })]);

describe("a ship step that was running when everything stopped", () => {
  for (const stage of ["checking_gates", "deploying", "checking_preview"]) {
    for (const stop of ["app.stop_everything", "app.runner_restarted"]) {
      test(`${stop} during ${stage} ends the Online box as stopped`, () => {
        const m = run([ev({ type: stop })], at(stage));
        expect(m.shipFlow).toMatchObject({ stage: "failed", detail: "Stopped. Nothing went live.", canGoLive: false });
        expect(isBusy(m)).toBe(false);
      });
    }
  }
  test("stopped while being made live, it is never said that nothing went live", () => {
    for (const stop of ["app.stop_everything", "app.runner_restarted"]) {
      const promoting = run([ev({ type: "ship.status", project: "/p", stage: "deploying", detail: "Making it live.", previewUrl: "https://a.vercel.app" })]);
      const m = run([ev({ type: stop })], promoting);
      expect(m.shipFlow).toMatchObject({ stage: "failed", previewUrl: "https://a.vercel.app" });
      expect(m.shipFlow?.detail).toMatch(/could not confirm whether it went live/);
      expect(m.shipFlow?.detail).not.toMatch(/Nothing went live/);
      expect(isBusy(m)).toBe(false);
    }
  });
  test("a finished Online box is left as it was", () => {
    for (const stop of ["app.stop_everything", "app.runner_restarted"]) {
      const ready = run([ev({ type: "ship.status", project: "/p", stage: "ready", detail: "Works.", previewUrl: "https://a.vercel.app", canGoLive: true })]);
      expect(run([ev({ type: stop })], ready).shipFlow).toEqual(ready.shipFlow);
      expect(run([ev({ type: stop })]).shipFlow).toBeNull();
    }
  });
});
