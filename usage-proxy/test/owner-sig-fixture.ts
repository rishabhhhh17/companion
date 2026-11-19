// Test fixture for the signed owner id in Dodo checkout metadata (owner-sig.ts, audit run 2 finding 1). Real Dodo events carry
// the companion_sig that /v1/checkout put in the metadata; this adds it to a made up event, so tests that are about something
// else keep sending events the way Dodo would. A test about forged metadata builds its own events instead.
import { OWNER_ID_KEY, OWNER_SIG_KEY, signOwner } from "../src/owner-sig.ts";

/** The made up METADATA_USER_ID_SECRET the fixture signs with, when a test has none of its own. */
export const OWNER_SECRET = "owner-sig-fixture-secret-0123456789abcdef";

/** A copy of the event whose metadata owner id is signed with `secret`. An event with no owner id, or one that already has a
 *  signature key, is copied unchanged. */
export async function withOwnerSig<T>(event: T, secret: string = OWNER_SECRET): Promise<T> {
  if (!event || typeof event !== "object") return event;
  const copy = JSON.parse(JSON.stringify(event)) as { data?: { metadata?: Record<string, unknown> } };
  const m = copy.data?.metadata;
  if (m && typeof m === "object" && typeof m[OWNER_ID_KEY] === "string" && m[OWNER_ID_KEY] && !(OWNER_SIG_KEY in m)) m[OWNER_SIG_KEY] = await signOwner(m[OWNER_ID_KEY] as string, secret);
  return copy as T;
}
