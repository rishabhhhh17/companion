// Giving a person a sign in token. A suspended owner is refused here, so cutting someone off cannot be undone by signing up again.
import { PRODUCT } from "./names.ts";
import type { Store } from "./store.ts";
import { newToken } from "./tokens.ts";

export type Issued = { ok: true; token: string } | { ok: false; message: string };

/** A new token for `ownerId`, shown once; only its hash is stored. Refused for a suspended owner. */
export async function issueToken(store: Store, ownerId: string, plan: string): Promise<Issued> {
  if (typeof ownerId !== "string" || ownerId.length === 0) return { ok: false, message: "An owner id is needed to sign in." };
  if (await store.isSuspended(ownerId)) return { ok: false, message: `Your ${PRODUCT} account is paused, so it cannot sign in. If you think this is a mistake, you can appeal: see the acceptable use page.` };
  const t = await newToken();
  await store.addUser(t.hash, { id: ownerId, plan, status: "active" });
  return { ok: true, token: t.token };
}

export type SignedIn = Issued | { ok: false; nonceUsed: true; message: string };

/** M116 sign in: like issueToken, and the owner's email and the used nonce are kept in the same write as the token's hash.
 *  Refused for a suspended owner, and for a nonce used before (then nothing is written). */
export async function issueSignInToken(store: Store, ownerId: string, plan: string, o: { email: string; nonceId: string; nonceUntil: number; now: number }): Promise<SignedIn> {
  if (typeof ownerId !== "string" || ownerId.length === 0) return { ok: false, message: "An owner id is needed to sign in." };
  if (await store.isSuspended(ownerId)) return { ok: false, message: `Your ${PRODUCT} account is paused, so it cannot sign in. If you think this is a mistake, you can appeal: see the acceptable use page.` };
  const t = await newToken();
  if (!(await store.signIn(t.hash, { id: ownerId, plan, status: "active" }, o))) return { ok: false, nonceUsed: true, message: "Google sign in did not work. Try signing in again." };
  return { ok: true, token: t.token };
}
