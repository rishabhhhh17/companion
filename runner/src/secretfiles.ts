// Settings, key and credential files: never read, never sent, never added to a request, whatever their name looks like.
// Plain code with no file access, so the pages can use the same rule (app/src imports it through attach.ts).
// M74: the person may add their own names or patterns (privacy.neverSend, Files never sent to Claude). They only add to the
// built in rule: nothing a person types can make a .env or key file readable again.
import { coveredBy, patternTests } from "./pathglob.ts";

/** The built in rule: .env files, keys, certificates and credential files. Always applies. */
export const isBuiltInSecretFile = (p: string) => /(^|\/)\.env/i.test(p) || /(^|\/)[^/]*\.env$/i.test(p)
  || /(^|\/)(id_(rsa|dsa|ecdsa|ed25519)|\.npmrc|\.netrc|\.pgpass|\.pypirc|credentials(\.[a-z]+)?|secrets?(\.[a-z]+)?|[^/]*\.(pem|key|p12|pfx|jks|keystore)|[^/]*\.tfstate(\.backup)?|[^/]*\.tfvars)$/i.test(p);

let own: RegExp[] = [];
/** The person's own patterns, from privacy.neverSend (the engine sets them each time the shell applies settings). */
export function setOwnSecretPatterns(list: unknown): void { own = patternTests(list); }
/** How many of the person's own patterns are in force (for tests and the engine's own checks). */
export const ownSecretPatternCount = (): number => own.length;

/** A file that is never read, never sent and never added to a request: the built in rule, or one of the person's own. */
export const isEnvFile = (p: string): boolean => isBuiltInSecretFile(p) || coveredBy(p, own);
