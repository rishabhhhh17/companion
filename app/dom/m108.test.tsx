// M108 review, rendered: the Memory page's start part shows exactly what each AI tool set up is handed, one view per tool
// (from the shared fixture m108e1: Claude Code's block and Gemini CLI's, which holds AGENTS.md's shared line too).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { StartBlockPart } from "../src/memoryStart.tsx";
import { startFrom } from "../src/memoryStart.ts";
import { PROJECT, renderPage } from "./render.tsx";

const fixture = (id: string) => JSON.parse(readFileSync(new URL("../../protocol/fixtures/events.jsonl", import.meta.url), "utf8").split("\n").find((l) => l.includes(`"id":"${id}"`))!);

describe("the Memory page shows each tool's view", () => {
  test("one details per tool, each its exact text, named for the tool", async () => {
    const st = startFrom(fixture("m108e1").start)!;
    await renderPage(<StartBlockPart start={st} project={PROJECT} send={() => undefined} onSettings={() => undefined} />);
    const ds = [...document.querySelectorAll(".mem-start-raw")];
    expect(ds.map((d) => d.querySelector("summary")?.textContent)).toEqual(["Show it exactly as Claude Code sees it", "Show it exactly as Gemini CLI sees it"]);
    expect(ds.map((d) => d.querySelector("pre")?.textContent)).toEqual(st.forms!.map((f) => f.text));
    // The rows include the shared line Gemini CLI is handed.
    expect(document.querySelector(".mem-start")?.textContent).toContain("payments go through Stripe");
  });
});
