// Memory must never hold health, money, relationships, moods or secrets (rule 15). Strict wins every tie:
// a good line wrongly skipped costs little, a private one saved breaks the promise.
import { describe, expect, test } from "bun:test";
import { screenLine } from "../src/memory/filter.ts";

const ok = (t: string) => expect(screenLine(t), t).toEqual({ ok: true });
const no = (t: string) => expect(screenLine(t).ok, t).toBe(false);

describe("lines that are fine", () => {
  test.each([
    "Uses React and Vite", "Deploys to Cloudflare Pages", "Never touch the auth folder", "Prefers short answers",
    "Run the tests with npm test", "Done means the build passes and the page opens", "The happy path is the signup flow",
    "Likes plain words, no jargon", "Stack: Next.js, Supabase, Tailwind", "Decided: use Stripe Checkout, not a custom form",
    "The product is a booking page for a dog groomer",
  ])("%s", ok);
});

describe("secrets are refused", () => {
  test.each([
    "Stripe key is sk_live_abcdefghijklmnop1234", "password: hunter2hunter2", "API_KEY=abcd1234efgh5678ijkl",
    "token ghp_abcdefghijklmnopqrstuvwxyz0123456789", "postgres://admin:secretpass@db.example.com/app", "Bearer abcdefghijklmnopqrstuvwxyz0123456789",
  ])("%s", no);
});

describe("health, money, relationships and moods are refused, even when worded differently", () => {
  test.each([
    "Has depression and works at night", "Takes medication in the morning", "Recovering from surgery", "Has ADHD so keep steps small", "Doctor says rest",
    "Earns a salary of 90k", "Has credit card debt", "Saving for a mortgage", "Bank account is with Chase", "Needs to pay rent this week",
    "Wife is called Maya", "Going through a divorce", "His girlfriend helps with design", "Kids go to bed at eight", "Lives with my mother",
    "Feels stressed about the launch", "Is anxious about money", "I'm feeling overwhelmed", "In a bad mood today", "Burned out lately",
  ])("%s", no);
});

describe("personal contact details and oversize lines are refused", () => {
  test.each(["Email is maya@example.com", "Call 415-555-0134", "x".repeat(400), "", "   "])("%s", (t) => no(t));
});
