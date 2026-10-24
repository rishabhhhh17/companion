// The operator's tool for cutting one person off, and for letting them back. The command line wrapper is scripts/suspend.ts; this
// holds the logic so it can be tested. It prints ids and plain sentences only: never a token, a hash, the secret, a plan or any text.
import type { Store } from "./store.ts";
import { USER_ID_SECRET_SETTING, findOwnerByUserId, secretProblem } from "./userid.ts";

export type OperatorResult = { code: number; lines: string[] };
const USAGE = [
  "Usage:",
  "  bun scripts/suspend.ts --user-id <the id Anthropic reported> [--apply] [--case <reference>]",
  "  bun scripts/suspend.ts --owner <our owner id> [--apply] [--case <reference>]",
  "  add --restore to let the person back in. Without --apply nothing is changed (a dry run).",
  "  <reference> is a short case number of ours (letters, digits, - and _ only), never a message.",
];
const CASE = /^[A-Za-z0-9_-]{1,40}$/;

export async function runOperator(argv: string[], env: Record<string, string | undefined>, store: Store, now: () => number): Promise<OperatorResult> {
  const bad = (why: string): OperatorResult => ({ code: 2, lines: [why, ...USAGE] });
  let userId: string | undefined, owner: string | undefined, caseId: string | undefined, apply = false, restore = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === "--user-id") userId = next();
    else if (a === "--owner") owner = next();
    else if (a === "--case") caseId = next();
    else if (a === "--apply") apply = true;
    else if (a === "--restore") restore = true;
    else return bad("That option is not known.");
  }
  if ((userId === undefined) === (owner === undefined)) return bad("Give exactly one of --user-id or --owner.");
  if ((userId !== undefined && !userId) || (owner !== undefined && !owner)) return bad("An id is needed after the option.");
  if (caseId !== undefined && !CASE.test(caseId)) return bad("The case reference may only have letters, digits, - and _ (up to 40).");

  const owners = await store.listOwnerIds();
  let ownerId: string | null;
  if (userId !== undefined) {
    const problem = secretProblem(env[USER_ID_SECRET_SETTING]);
    if (problem) return { code: 1, lines: [problem, "Nothing was changed."] };
    ownerId = await findOwnerByUserId(userId, owners, env[USER_ID_SECRET_SETTING] as string);
  } else ownerId = owners.includes(owner as string) ? (owner as string) : null;
  if (ownerId === null) return { code: 1, lines: ["No owner matches that id. Nothing was changed."] };

  const lines = [`Found owner ${ownerId}.`];
  const already = await store.isSuspended(ownerId);
  if (restore) {
    if (!already) return { code: 0, lines: [...lines, "This owner is not suspended. Nothing was changed."] };
    if (!apply) return { code: 0, lines: [...lines, "Dry run: would lift the suspension so a new token can be issued. Old tokens stay dead. Run again with --apply to do it."] };
    await store.restoreOwner(ownerId, { at: now(), caseId });
    return { code: 0, lines: [...lines, "Suspension lifted. The person can sign in again and get a new token."] };
  }
  if (already) return { code: 0, lines: [...lines, "This owner is already suspended. Nothing was changed."] };
  if (!apply) return { code: 0, lines: [...lines, "Dry run: would revoke every token of this owner and block new ones. Run again with --apply to do it."] };
  const r = await store.suspendOwner(ownerId, { at: now(), caseId });
  return { code: 0, lines: [...lines, `Suspended. ${r.tokensRevoked} ${r.tokensRevoked === 1 ? "token was" : "tokens were"} revoked, and no new token can be issued until you restore this owner.`] };
}
