// Report a problem (Settings): the page gives the Mac side only its own fixed words; the Mac side fills in the two
// versions and opens the draft (report.rs, where the address itself is tested). Nothing is sent for the person.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { S } from "./strings.ts";

const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");

describe("Report a problem", () => {
  test("the draft's words hold only the two places for the versions, and tell the person to attach the log", () => {
    const body: string = S.reportBody;
    expect(body).toContain("{version}");
    expect(body).toContain("{macos}");
    expect(body.replace("{version}", "").replace("{macos}", "")).not.toMatch(/[{}]/);
    expect(body).toMatch(/attach/i);
    expect(body).toContain("companion-logs");
    expect(body.length).toBeLessThanOrEqual(1200);
    expect(S.reportSubject.length).toBeLessThanOrEqual(120);
    expect(/[–—]/.test(body + S.reportSubject + S.reportHelp)).toBe(false);
  });
  test("the words say nothing is sent for the person", () => {
    expect(S.reportHelp).toMatch(/Nothing is sent for you/);
    expect(S.reportOpened("companion-logs-2026-10-17-1530.txt")).toContain("send it yourself");
  });
  test("Settings starts it with exactly those words and nothing else from the page", () => {
    expect(card).toContain('invoke("report_problem", { subject: S.reportSubject, body: S.reportBody })');
  });
});
