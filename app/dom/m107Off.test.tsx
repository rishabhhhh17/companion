// M107 with its switch off (a file of its own: the settings are read once per page): Offer Put it in on the review card off
// means the card offers only Copy for my AI, even for a tool Put it in could reach.
import { describe, expect, test } from "bun:test";
import { _resetForTests, startSettings } from "../src/settingsStore.ts";
import { S } from "../src/strings.ts";
import { PROJECT, act, app, hasButton, renderHome, runner, settle } from "./render.tsx";

const reread = async () => { await act(async () => { _resetForTests(); startSettings(); }); await settle(); };
const B = "rv_7c1d2e3f4b";
const files = [{ file: "src/pay.ts", kind: "modified" }];

describe("M107 switched off", () => {
  test("review.putIn off: only Copy for my AI, and nothing is ever put in", async () => {
    await renderHome({ settings: { "review.putIn": false }, answers: { handoff_put_in: "typed" } });
    await reread();
    await runner({ type: "review.batch", project: PROJECT, batch: B, files, count: 1, capped: false, secretFiles: [], auto: true, by: "cursor" },
      { type: "review.result", project: PROJECT, batch: B, ok: true, rating: "worth_a_look", touches: [], summary: "The payment page changed.", notes: [], reasons: [{ kind: "checks_failed", say: "The project's own checks did not pass." }],
        files, count: 1, capped: false, secretFiles: [], checks: "failed", sendBack: "Please make the checks pass again.", lane: "none", usdEstimate: 0, by: "cursor" });
    expect(hasButton(S.review.sendBack)).toBe(true);
    expect(hasButton(S.m82.putIn("Cursor"))).toBe(false);
    expect(app.invoked("handoff_put_in")).toEqual([]);
  });
});
