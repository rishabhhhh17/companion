// Which payment provider is on, and where its webhook lives. Default: none, and then no webhook address is served at all.
// The operator turns one on with a single setting (PAYMENT_PROVIDER = stripe or dodo). Managed usage itself stays behind its
// own switch (F22): choosing a provider here does not switch it on.

export const PAYMENT_PROVIDERS = ["none", "stripe", "dodo"] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

/** The setting as the operator typed it. Anything that is not exactly "stripe" or "dodo" (spaces and case aside) means none. */
export function paymentProviderFromSetting(value: unknown): PaymentProvider {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  return v === "stripe" || v === "dodo" ? v : "none";
}

/** The path each provider's webhook is served on, or null when no provider is on. */
export function webhookPathFor(provider: PaymentProvider): string | null {
  return provider === "stripe" ? "/webhooks/stripe" : provider === "dodo" ? "/webhooks/dodo" : null;
}

/** Which webhook handler a request is for. Only the provider that is switched on has a route; everything else gets null (not found). */
export function webhookRouteFor(provider: PaymentProvider, method: string, pathname: string): "stripe" | "dodo" | null {
  const path = webhookPathFor(provider);
  return path !== null && method === "POST" && pathname === path ? (provider as "stripe" | "dodo") : null;
}
