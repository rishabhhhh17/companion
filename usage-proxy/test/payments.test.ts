import { describe, expect, test } from "bun:test";
import { PAYMENT_PROVIDERS, paymentProviderFromSetting, webhookPathFor, webhookRouteFor } from "../src/payments.ts";

describe("which payment provider is on (default: none)", () => {
  test("nothing, an empty value or anything unknown means none", () => {
    for (const v of [undefined, null, "", "none", "NONE", "paypal", "stripe2", 5, {}, " "]) expect(paymentProviderFromSetting(v)).toBe("none");
  });
  test("stripe and dodo are read exactly (spaces and case forgiven)", () => {
    expect(paymentProviderFromSetting("stripe")).toBe("stripe");
    expect(paymentProviderFromSetting(" Dodo ")).toBe("dodo");
  });
  test("the providers are a short, fixed list", () => { expect([...PAYMENT_PROVIDERS]).toEqual(["none", "stripe", "dodo"]); });
});
describe("the webhook address for each provider", () => {
  test("each has its own path, and none has no path", () => {
    expect(webhookPathFor("stripe")).toBe("/webhooks/stripe");
    expect(webhookPathFor("dodo")).toBe("/webhooks/dodo");
    expect(webhookPathFor("none")).toBeNull();
  });
  test("no route is served unless that provider is the one switched on", () => {
    expect(webhookRouteFor("none", "POST", "/webhooks/dodo")).toBeNull();
    expect(webhookRouteFor("none", "POST", "/webhooks/stripe")).toBeNull();
    expect(webhookRouteFor("dodo", "POST", "/webhooks/stripe")).toBeNull();
    expect(webhookRouteFor("stripe", "POST", "/webhooks/dodo")).toBeNull();
    expect(webhookRouteFor("dodo", "POST", "/webhooks/dodo")).toBe("dodo");
    expect(webhookRouteFor("stripe", "POST", "/webhooks/stripe")).toBe("stripe");
  });
  test("only POST, and only the exact path (a trailing slash or a longer path is not matched)", () => {
    expect(webhookRouteFor("dodo", "GET", "/webhooks/dodo")).toBeNull();
    expect(webhookRouteFor("dodo", "POST", "/webhooks/dodo/")).toBeNull();
    expect(webhookRouteFor("dodo", "POST", "/webhooks/dodo/x")).toBeNull();
  });
});
