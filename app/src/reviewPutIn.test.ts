// M107, Put it in on the review card (docs/milestones/M107-put-it-in.md). Which tool may be named, the exact text it gets,
// and what each answer of the shell means. The rules: app tools only, never a terminal; the fix goes back to the tool that
// finished; the text is exactly what Copy for my AI copies.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { LIST } from "./aiTools.ts";
import { copyable } from "./copytext.ts";
import { DONE_TOOLS } from "./doneSignal.ts";
import { PUT_STAGES } from "./handoff.ts";
import { sendBackCopy, type ReviewCard } from "./review.ts";
import { PUT_IN_TOOLS, putInAfter, putInText, putInTool } from "./reviewPutIn.ts";
import { S } from "./strings.ts";

const card = (o: Partial<ReviewCard> = {}, sendBack = "The review found a key written into src/pay.ts at line 2. Please move it out of the code."): ReviewCard => ({
  project: "/Users/me/shop", batch: "rv_5a0b1c2d3e", stage: "reviewed", files: [{ file: "src/pay.ts", kind: "modified" }], count: 1, capped: false, secretFiles: [],
  auto: true, proof: true, asked: false, fix: null, note: null,
  result: { rating: "stop", touches: [], summary: "", notes: [], reasons: [], checks: "failed", sendBack, lane: "none", usdEstimate: 0 },
  ...o,
});

describe("which tool Put it in names", () => {
  test("only the four app tools of the plan, each with an app id on the one list", () => {
    expect([...PUT_IN_TOOLS]).toEqual(["cursor", "copilot", "windsurf", "antigravity"]);
    for (const t of PUT_IN_TOOLS) expect((LIST.find((x) => x.id === t)?.apps ?? []).length).toBeGreaterThan(0);
  });
  test("the tool that finished comes first, even when another was picked here before", () => {
    for (const t of PUT_IN_TOOLS) expect(putInTool(card({ by: t }), "windsurf")).toBe(t);
  });
  test("a terminal tool, or any tool not checked yet, never gets Put it in, and never falls back to the last tool", () => {
    for (const t of DONE_TOOLS.filter((x) => !(PUT_IN_TOOLS as readonly string[]).includes(x))) {
      expect(putInTool(card({ by: t }), "cursor")).toBeNull();
      expect(putInTool(card(), t)).toBeNull();
    }
    for (const t of ["claude", "codex", "gemini", "copilotcli"]) expect(putInTool(card({ by: t as never }), "cursor")).toBeNull();
  });
  test("with no done signal: the tool last picked in this project, when it is one of the four", () => {
    expect(putInTool(card(), "cursor")).toBe("cursor");
    expect(putInTool(card(), "copilot")).toBe("copilot");
    expect(putInTool(card(), null)).toBeNull();
    expect(putInTool(card(), "")).toBeNull();
    expect(putInTool(card(), "notepad")).toBeNull();
    expect(putInTool(card(), 7)).toBeNull();
  });
  test("a background job's card never offers it (the job is Claude Code's), and nor does a card with nothing to send", () => {
    expect(putInTool(card({ by: "cursor", job: "fix-login" }), "cursor")).toBeNull();
    expect(putInTool(null, "cursor")).toBeNull();
    expect(putInTool(card({ by: "cursor" }, ""), "cursor")).toBeNull();
  });
  test("each of the four is known to the paste code by every app id, so its chat box can be confirmed", () => {
    const paste = readFileSync(new URL("../src-tauri/src/pastehere.rs", import.meta.url), "utf8");
    const appOf = paste.slice(paste.indexOf("pub fn app_of("), paste.indexOf("pub fn site_of("));
    for (const t of PUT_IN_TOOLS) for (const a of LIST.find((x) => x.id === t)!.apps) expect(appOf).toContain(`"${a}"`);
  });
});

describe("the text Put it in passes", () => {
  test("exactly what Copy for my AI copies: the review's send back text, keys hidden again", () => {
    const r = card({ by: "cursor" }, "Move the key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789 out of src/pay.ts.");
    expect(putInText(r)).toBe(copyable(sendBackCopy(r)));
    expect(putInText(r)).not.toContain("abcdefghijklmnopqrstuvwxyz0123456789");
  });
  test("nothing when there is nothing to send, or text the Mac side would refuse", () => {
    expect(putInText(card({}, ""))).toBeNull();
    expect(putInText(card({}, "line\u001b[2Jcleared"))).toBeNull();
    expect(putInText(card({ result: null }))).toBeNull();
  });
});

describe("what the shell's answer means", () => {
  test("typed: in the tool's chat box, the person sends it; counted as sent back", () => {
    expect(putInAfter("typed", "Cursor")).toEqual({ said: S.review.put.typed("Cursor"), copied: false, sentBack: true });
  });
  test("stopped: nothing was put in and nothing copied; not sent back", () => {
    expect(putInAfter("stopped", "Cursor")).toEqual({ said: S.review.put.stopped("Cursor"), copied: false, sentBack: false });
  });
  test("every other answer copied the text instead, and says why in the tool's name", () => {
    for (const s of PUT_STAGES.filter((x) => x !== "typed" && x !== "stopped")) {
      const a = putInAfter(s, "Windsurf");
      expect(a).toEqual({ said: S.review.put[s]("Windsurf"), copied: true, sentBack: true });
      expect(a.said).not.toContain("—");
    }
  });
  test("M107 review: the card calls the text the fix request, as its help and the setting do, never the prompt", () => {
    for (const s of PUT_STAGES) {
      expect(S.review.put[s]("Cursor")).not.toMatch(/prompt/i);
      if (s !== "typed" && s !== "stopped") expect(S.review.put[s]("Cursor")).toContain("fix request");
    }
    expect(S.review.putInHelp("Cursor")).toContain("fix request");
    // The hand off keeps its own lines: there the text is a prompt.
    expect(S.m82.put.noBox("Cursor")).toContain("prompt");
  });
});
