// The signed owner id in Dodo checkout metadata (security audit run 2, finding 1). Dodo copies a checkout's metadata onto its
// payment and subscription events, and a static /buy/ link lets anyone set metadata_companion_user_id to any value. So the owner
// id alone proves nothing. /v1/checkout adds companion_sig, an HMAC of the owner id, and the webhook trusts the metadata only
// when that signature checks out.
//
// The HMAC key is derived from METADATA_USER_ID_SECRET under its own label, as the sign in nonce's and the deleted line's are:
// no new secret, and a value made for one purpose is never valid for another. Without a usable secret nothing is signed and no
// metadata is trusted.
import { secretProblem } from "./userid.ts";

const LABEL = "squibby-dodo-owner-v1";
/** The metadata key that carries the signature, next to companion_user_id. */
export const OWNER_SIG_KEY = "companion_sig";
/** The metadata key that carries the owner id (the same name the Stripe path uses). */
export const OWNER_ID_KEY = "companion_user_id";

const enc = new TextEncoder();
const keys = new Map<string, Promise<CryptoKey>>();
function sigKey(secret: string): Promise<CryptoKey> {
  let k = keys.get(secret);
  if (!k) {
    k = (async () => {
      const base = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const derived = new Uint8Array(await crypto.subtle.sign("HMAC", base, enc.encode(LABEL)));
      return crypto.subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    })();
    keys.set(secret, k);
  }
  return k;
}

/** The signature for an owner id: 64 hex characters. Throws when the secret is missing or short, or the owner id is empty. */
export async function signOwner(ownerId: string, secret: string): Promise<string> {
  const problem = secretProblem(secret);
  if (problem) throw new Error(problem);
  if (typeof ownerId !== "string" || ownerId.length === 0) throw new Error("An owner id is needed.");
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", await sigKey(secret), enc.encode(ownerId)));
  return [...mac].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** Compares two texts without stopping at the first difference. */
function sameText(a: string, b: string): boolean {
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}

/** The owner id the metadata names, only when its signature checks out with this secret. Null otherwise, and always null when
 *  the secret is missing or short (fail closed). */
export async function verifiedOwner(metadata: unknown, secret: string | undefined): Promise<string | null> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const m = metadata as Record<string, unknown>, ownerId = m[OWNER_ID_KEY], sig = m[OWNER_SIG_KEY];
  if (typeof ownerId !== "string" || !ownerId || typeof sig !== "string" || !/^[0-9a-f]{64}$/.test(sig)) return null;
  if (typeof secret !== "string" || secretProblem(secret)) return null;
  return sameText(await signOwner(ownerId, secret), sig) ? ownerId : null;
}
