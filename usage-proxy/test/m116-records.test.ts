// M116 step 1: the records. T31 says Pro and the report live on the Squibby account, set by Dodo's webhooks, with no
// license keys and no trial. T17 is marked replaced, the decisions table points at T31, and F25 says the trial is
// dropped and Pro comes from the account. Docs only, checked here so the records cannot drift back.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

const DIR = new URL("../../docs/decisions/", import.meta.url);
const read = (name: string) => readFileSync(new URL(name, DIR), "utf8");
const files = readdirSync(DIR);
const one = (prefix: string) => {
  const hits = files.filter((f) => f.startsWith(`${prefix}-`));
  expect(hits, prefix).toHaveLength(1);
  return hits[0]!;
};

describe("M116 records", () => {
  test("exactly one T31 record exists, and no other record uses its number", () => {
    expect(one("T31")).toBe("T31-pro-lives-on-the-squibby-account.md");
  });

  test("T31 is accepted, replaces T17, and drops the trial", () => {
    const t = read(one("T31"));
    expect(t.split("\n")[0]).toBe("# T31. Pro and the report live on the Squibby account, set by Dodo's webhooks. No license keys.");
    expect(t).toMatch(/\*\*Status:\*\* Accepted, 19 Nov 2026/);
    expect(t).toContain("Replaces T17");
    expect(t).toContain("**No trial.**");
    expect(t).not.toContain("/v1/trial/start");
    expect(t).not.toMatch(/unless the founder drops it/);
    expect(t).not.toMatch(/Draft, 19 Nov/);
    expect(t).not.toContain("—");
  });

  test("T31 keeps the rules a coding agent must never miss", () => {
    const t = read(one("T31"));
    for (const rule of [
      "Grant only from a verified Dodo webhook.",
      "Take the user id from the sign in token and the customer id from the server's record",
      "The sign in nonce comes from the server, lasts 10 minutes and works once.",
      "Never sell a second Pro to someone who has one",
      "The over limit words never tell a customer to add their own Claude key (F29).",
    ])
      expect(t, rule).toContain(rule);
  });

  test("T17 is marked replaced by T31 at the top, and its text stays as history", () => {
    const t = read(one("T17"));
    expect(t).toMatch(/^# T17\. .*\n\n> \*\*Replaced by T31\*\* \(19 Nov 2026\)/);
    expect(t).toContain("Pro is a Dodo license key, checked on the Mac.");
  });

  test("the decisions table lists T31 and says T17 is replaced", () => {
    const r = read("README.md");
    expect(r).toContain(`| [T31](${one("T31")}) |`);
    const t17 = r.split("\n").find((l) => l.startsWith("| [T17]"))!;
    expect(t17).toContain("replaced by T31, 19 Nov 2026");
  });

  test("F25 says the trial is dropped and Pro comes from the account, not a key", () => {
    const f = read(one("F25"));
    expect(f).toContain("The 14 day trial is dropped (founder, 19 Nov 2026).");
    expect(f).toContain("Pro comes from the Squibby account, not from a key");
    expect(f).toContain("Yearly set by F31, 13 Nov 2026: $144.");
  });
});
