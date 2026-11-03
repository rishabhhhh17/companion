// Covering secrets in text that leaves the engine: the card, the log, and the next question to the model.
import { describe, expect, test } from "bun:test";
import { redact, secretLines } from "../src/redact.ts";

describe("settings with a telling name are covered, whatever words surround it", () => {
  const HIDE: [string, string][] = [
    ["AUTH_TOKEN=abcdef123456", "abcdef123456"], ["STRIPE_WEBHOOK_SECRET=whsec_abcdefghijk", "abcdefghijk"], ["SUPABASE_SERVICE_ROLE_KEY=abc123def456", "abc123def456"],
    ["DB_PASSWORD=hunter22", "hunter22"], ["password: hunter2", "hunter2"], ["export GITHUB_TOKEN=ghx_zzzzzzzzzz1", "zzzzzzzzzz1"], ["OPENAI_API_KEY = 'abcd1234efgh'", "abcd1234efgh"],
    ["client_secret: 9f8e7d6c5b4a", "9f8e7d6c5b4a"], ["private_key=MIIEvQIBADANBgkqh", "MIIEvQIBADANBgkqh"], ["STRIPE_KEY=live_value_1234", "live_value_1234"], ["next_auth_secret=\"correct horse battery\"", "correct"],
    ["Error: connect failed {\"password\":\"p4ssw0rd!\"}", "p4ssw0rd"], ["DATABASE_PASSWORD:hunter22", "hunter22"], ["my.app.token=abcd1234", "abcd1234"],
  ];
  for (const [text, secret] of HIDE) test(text, () => { const out = redact(text); expect(out, text).not.toContain(secret); expect(out).toContain("[secret]"); });
  test("addresses with a password, and well known key shapes, still go", () => {
    for (const t of ["postgres://user:pa55word@db.example/x", "Bearer abcdefghijklmnop1234", "sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAA", "ghp_abcdefghijklmnopqrstuvwxyz0123456789", "AKIAIOSFODNN7EXAMPLE"]) expect(redact(t), t).toContain("[secret]");
  });
});

describe("ordinary text is left readable", () => {
  const KEEP = ["Cannot read properties of undefined (reading 'token')", "monkey=banana", "const total = compute(price)", "key: value", "the token is missing from the header", "Press any key to continue", "primary_key integer", "passwordless sign in", "src/auth.ts(5,3): error TS2304: Cannot find name 'x'", "user.keyboard = 'qwerty'"];
  for (const t of KEEP) test(t, () => { expect(redact(t), t).toBe(t); });
});

// Must fix 3 (3 Nov 2026): lines are judged together, so a key written over several lines is hidden whole.
describe("secret lines, judged with the lines around them", () => {
  const body = ["MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7Vq3mKx9fQe2Lw", "Z8pR4tYc1uNb6sJd0hGk3aXy5WvTq7oPmEiLr9DnBfC2zHjU8gKxQ4sMvYw1eRt", "Xw7e"];
  test("every line of a private key, from BEGIN to END, blank lines inside it too", () => {
    const run = ["const a = 1;", "", "-----BEGIN RSA PRIVATE KEY-----", "Proc-Type: 4,ENCRYPTED", "", ...body, "-----END RSA PRIVATE KEY-----", "", "const b = 2;"];
    expect(secretLines(run)).toEqual([false, false, true, true, true, true, true, true, true, false, false]);
  });
  test("a key with no END in view is hidden to the end of the run", () => {
    expect(secretLines(["-----BEGIN PGP PRIVATE KEY BLOCK-----", "", "abc", "", "def"])).toEqual([true, true, true, true, true]);
  });
  test("a key's body with no BEGIN line in view is still a secret, and so is the short last line beside it", () => {
    expect(secretLines(body)).toEqual([true, true, true]);
    expect(secretLines([`  "${body[0]}\\n" +`])).toEqual([true]);
  });
  test("a one line key is hidden on its own, and the ordinary code beside it stays readable", () => {
    expect(secretLines(["const x = 1;", 'const k = "sk_live_abcdefghijklmnop1234";', "const y = 2;", "", "const z = 3;"])).toEqual([false, true, false, false, false]);
  });
  test("a short line of key letters is hidden only beside a line of a key", () => {
    expect(secretLines([body[0], "Xw7e==", "-----END PRIVATE KEY-----", "done"])).toEqual([true, true, true, false]);
    expect(secretLines(["const a = 1;", "Xw7e", "const b = 2;"])).toEqual([false, false, false]);
  });
  test("ordinary lines stay: a git hash, a word, an id, an import", () => {
    const keep = ["9f2c4e1ab38d7f60c25e9b1a4d3f7e8c6b5a4d3e", "aVeryLongCamelCaseIdentifierWithoutAnyDigitsInItAtAll", "import { createClient } from '@supabase/supabase-js';", "data-testid-0123456789-abcdefghij-ABCDEFGHIJ", ""];
    expect(secretLines(keep)).toEqual(keep.map(() => false));
  });
});
