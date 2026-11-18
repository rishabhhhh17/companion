// The sign in nonce (M116). The app asks GET /v1/signin/nonce, puts the answer in its Google request, and Google copies it
// into the ID token's `nonce` claim. The server then checks the claim is a nonce it signed itself in the last 10 minutes, and
// (in the store, in the same write that keeps the new sign in token's hash) that it was never used before. A nonce the app
// made up would prove nothing: anyone holding an ID token can read its claim. So a leaked ID token cannot be traded for a
// Squibby token later, or twice.
//
// The form is v1.<random>.<time in ms>.<HMAC>. The HMAC key is derived from METADATA_USER_ID_SECRET under its own label, so
// there is no new secret, and a value made for one purpose is never valid for another. Making a nonce writes nothing.
import { secretProblem } from "./userid.ts";

/** How long a nonce works after it was made. */
export const NONCE_TTL_MS = 10 * 60 * 1000;
/** Clock difference allowed between server instances. A nonce stamped later than now plus this is refused. */
export const NONCE_SKEW_MS = 60 * 1000;
const LABEL = "squibby-signin-nonce-v1";
const MAX_CHARS = 200;
const FORM = /^v1\.([A-Za-z0-9_-]{22})\.(\d{13})\.([A-Za-z0-9_-]{43})$/;

const enc = new TextEncoder();
const b64url = (b: Uint8Array): string => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

const keys = new Map<string, Promise<CryptoKey>>();
/** The nonce key: HMAC(secret, label), used as its own HMAC key. Kept per secret for this server instance. */
function nonceKey(secret: string): Promise<CryptoKey> {
  let k = keys.get(secret);
  if (!k) {
    k = (async () => {
      const base = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const derived = new Uint8Array(await crypto.subtle.sign("HMAC", base, enc.encode(LABEL)));
      return crypto.subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    })();
    keys.set(secret, k);
  }
  return k;
}

/** A fresh nonce made at `now`. Throws when the secret is missing or short (the route answers 503 before that). */
export async function makeNonce(secret: string, now: number): Promise<string> {
  const problem = secretProblem(secret);
  if (problem) throw new Error(problem);
  const id = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const body = `v1.${id}.${String(Math.floor(now)).padStart(13, "0")}`;
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", await nonceKey(secret), enc.encode(body)));
  return `${body}.${b64url(mac)}`;
}

export type NonceCheck = { ok: true; id: string; until: number } | { ok: false; reason: "bad_nonce" | "nonce_expired" };

/** Is this a nonce this server signed, made no more than 10 minutes ago? `id` is what the store marks used, until `until`. */
export async function checkNonce(nonce: unknown, secret: string, now: number): Promise<NonceCheck> {
  if (secretProblem(secret) || typeof nonce !== "string" || nonce.length > MAX_CHARS) return { ok: false, reason: "bad_nonce" };
  const m = FORM.exec(nonce);
  if (!m) return { ok: false, reason: "bad_nonce" };
  const [, id, ms, mac] = m;
  let good = false;
  try { good = await crypto.subtle.verify("HMAC", await nonceKey(secret), fromB64url(mac), enc.encode(`v1.${id}.${ms}`)); }
  catch { good = false; }
  if (!good) return { ok: false, reason: "bad_nonce" };
  const at = Number(ms);
  if (at > now + NONCE_SKEW_MS) return { ok: false, reason: "bad_nonce" };
  if (now - at > NONCE_TTL_MS) return { ok: false, reason: "nonce_expired" };
  return { ok: true, id, until: at + NONCE_TTL_MS + NONCE_SKEW_MS };
}
