// The opaque id sent to Anthropic as metadata.user_id on every forwarded request, so abuse can be tied to one person and not to
// the whole key. It is a keyed hash (HMAC SHA256) of our own owner id with a secret only the operator holds:
//   - stable: the same person always gets the same id;
//   - not reversible without the secret, and no email, name or phone is in it (our owner id is not one either);
//   - never stored: to find the owner from an id Anthropic reports, derive the id of each owner again and compare
//     (`findOwnerByUserId`). Nothing maps ids to people in plain.
// The secret comes from the operator's environment under USER_ID_SECRET_SETTING. There is no default, ever.
import { constantTimeEqual } from "./dodo.ts";

export const USER_ID_SECRET_SETTING = "METADATA_USER_ID_SECRET";
/** A secret shorter than this is refused: a guessable key would make the ids guessable. */
export const MIN_SECRET_CHARS = 32;
const SEPARATOR = "metadata-user-id-v1";   // so the same secret used for something else would give different values
const HEX64 = /^[0-9a-f]{64}$/;

/** A plain sentence saying what is wrong with the secret, or null when it is usable. */
export function secretProblem(secret: unknown): string | null {
  if (typeof secret !== "string" || secret.trim().length < MIN_SECRET_CHARS) {
    return `The setting ${USER_ID_SECRET_SETTING} is missing or too short (at least ${MIN_SECRET_CHARS} characters). Set it in the operator's environment.`;
  }
  return null;
}

export async function deriveUserId(ownerId: string, secret: string): Promise<string> {
  const problem = secretProblem(secret);
  if (problem) throw new Error(problem);
  if (typeof ownerId !== "string" || ownerId.length === 0) throw new Error("An owner id is needed to make a user id.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${SEPARATOR}\0${ownerId}`));
  return [...new Uint8Array(mac)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** The owner whose derived id equals `userId`, from the operator's list of owners and the secret; null when nobody matches. */
export async function findOwnerByUserId(userId: string, owners: readonly string[], secret: string): Promise<string | null> {
  const problem = secretProblem(secret);
  if (problem) throw new Error(problem);
  const want = typeof userId === "string" ? userId.trim().toLowerCase() : "";
  if (!HEX64.test(want)) return null;
  let found: string | null = null;
  for (const o of owners) if (constantTimeEqual(await deriveUserId(o, secret), want) && found === null) found = o;
  return found;
}
