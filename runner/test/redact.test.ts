// Covering secrets in text that leaves the engine: the card, the log, and the next question to the model.
import { describe, expect, test } from "bun:test";
import { redact } from "../src/redact.ts";

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
