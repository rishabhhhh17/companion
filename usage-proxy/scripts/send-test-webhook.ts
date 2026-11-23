// Sends one made up Dodo event to a server on this Mac (M116 step 6), signed the way Dodo signs (Standard Webhooks), so
// scripts/verify-dev.sh can prove a signed webhook turns Pro on end to end. Made up ids only; nothing goes to Dodo.
// Usage: DODO_WEBHOOK_SECRET=whsec_... METADATA_USER_ID_SECRET=... bun scripts/send-test-webhook.ts <server address> <owner id> <product id> [--unsigned]
//   The secrets come from the environment, never the command line. METADATA_USER_ID_SECRET signs the owner id in the metadata,
//   as /v1/checkout does (owner-sig.ts); the server trusts no unsigned owner id. It sends subscription.active for that owner. --unsigned
//   instead sends a forged subscription.expired with no signature, the way `dodo wh trigger` does, which the server must
//   refuse and which must leave Pro on. Prints the answer's status, then its body.
import { signDodoForTest } from "../src/dodo.ts";
import { OWNER_SIG_KEY, signOwner } from "../src/owner-sig.ts";

const [base, owner, product, flag] = process.argv.slice(2);
const local = (() => { try { return ["127.0.0.1", "localhost", "[::1]"].includes(new URL(base).hostname); } catch { return false; } })();
if (!local || !owner || !product) { console.log("Usage: bun scripts/send-test-webhook.ts http://127.0.0.1:<port> <owner id> <product id> [--unsigned]"); process.exit(2); }
const secret = process.env.DODO_WEBHOOK_SECRET ?? "";
const forged = flag === "--unsigned";
const ownerSecret = process.env.METADATA_USER_ID_SECRET ?? "";
const metadata = ownerSecret ? { companion_user_id: owner, [OWNER_SIG_KEY]: await signOwner(owner, ownerSecret) } : { companion_user_id: owner };
const now = Date.now(), id = `msg_stand_in_${now}_${forged ? "u" : "s"}`;
const body = JSON.stringify({
  business_id: "bus_stand_in", type: forged ? "subscription.expired" : "subscription.active", timestamp: new Date(now).toISOString(),
  data: {
    payload_type: "Subscription", subscription_id: "sub_stand_in", product_id: product, status: forged ? "expired" : "active",
    customer: { customer_id: "cus_stand_in" }, metadata,
    next_billing_date: new Date(now + 30 * 86_400_000).toISOString(), cancel_at_next_billing_date: false,
  },
});
const headers: Record<string, string> = { "content-type": "application/json",
  ...(forged ? { "webhook-id": id, "webhook-timestamp": String(Math.floor(now / 1000)) } : await signDodoForTest(id, body, secret, Math.floor(now / 1000))) };
const res = await fetch(new URL("/webhooks/dodo", base), { method: "POST", headers, body });
console.log(res.status);
console.log(await res.text());
