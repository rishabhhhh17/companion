// Reads the API key from the macOS Keychain. The key lives only there: it goes to the
// runner when it starts and to Claude Code, never to a log, an event or an agent command.
// Arguments are passed as a list (no shell), so a service name cannot run anything.

export type KeychainRef = { service: string; account: string; keychain?: string };

export const DEFAULT_REF: KeychainRef = { service: "companion", account: "anthropic" };

async function run(args: string[]): Promise<{ code: number; out: string }> {
  const p = Bun.spawn(["security", ...args], { stdout: "pipe", stderr: "pipe" });
  const [out] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  return { code: await p.exited, out };
}

const refArgs = (r: KeychainRef, extra: string[]) =>
  ["find-generic-password", "-s", r.service, "-a", r.account, ...extra, ...(r.keychain ? [r.keychain] : [])];

// True when an item exists. Does not read the secret (no -w), so no password prompt.
export async function hasApiKey(r: KeychainRef = DEFAULT_REF): Promise<boolean> {
  const { code } = await run(refArgs(r, []));
  return code === 0;
}

// macOS prints a stored value as hex digits when it holds a newline or other unprintable
// character (for example a key pasted with trailing whitespace). Real keys contain dashes,
// so a value made only of hex digits that decodes to text is that case.
function decodeIfHex(out: string): string {
  const t = out.trim();
  if (t.length >= 2 && t.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(t)) {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(t.match(/../g)!.map((h) => parseInt(h, 16))));
      if (/[^0-9a-fA-F\s]/.test(text)) return text;
    } catch { /* not text: leave as is */ }
  }
  return out;
}

// The key, trimmed, or null when there is none (or it is blank).
export async function getApiKey(r: KeychainRef = DEFAULT_REF): Promise<string | null> {
  const { code, out } = await run(refArgs(r, ["-w"]));
  if (code !== 0) return null;
  const key = decodeIfHex(out).trim();
  return key.length > 0 ? key : null;
}

export type Auth = { method: "api_key"; source: "keychain"; apiKey: string } | { method: "none" };

// How the agent signs in. Never falls back silently to another account.
export async function resolveAuth(r: KeychainRef = DEFAULT_REF): Promise<Auth> {
  const key = await getApiKey(r);
  return key ? { method: "api_key", source: "keychain", apiKey: key } : { method: "none" };
}
