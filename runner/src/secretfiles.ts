// Settings, key and credential files: never read, never sent, never added to a request, whatever their name looks like.
// Plain code with no file access, so the pages can use the same rule (app/src imports it through attach.ts).
export const isEnvFile = (p: string) => /(^|\/)\.env/i.test(p) || /(^|\/)[^/]*\.env$/i.test(p)
  || /(^|\/)(id_(rsa|dsa|ecdsa|ed25519)|\.npmrc|\.netrc|\.pgpass|\.pypirc|credentials(\.[a-z]+)?|secrets?(\.[a-z]+)?|[^/]*\.(pem|key|p12|pfx|jks|keystore)|[^/]*\.tfstate(\.backup)?|[^/]*\.tfvars)$/i.test(p);
