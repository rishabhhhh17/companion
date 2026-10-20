// The web address a "site is up" watch asks (F21). Only the person's own typed address is ever visited, only http and
// https, never an address with a password in it, and never a private or link-local address (this Mac's own network, the
// cloud "metadata" address) unless the person typed localhost for their own dev server. The same rules judge every
// redirect the address sends the check to. Pure code, tested without a network.
import { isIP } from "node:net";

export type Address = { ok: true; url: string; host: string; local: boolean } | { ok: false; reason: string };
const MAX_LENGTH = 2000;

/** A host that is this Mac itself, typed by the person: localhost, 127.0.0.1, ::1, or a name ending in .localhost. */
export function isLocalName(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  return h === "localhost" || h.endsWith(".localhost") || h === "127.0.0.1" || h === "::1";
}

function v4(parts: number[]): boolean { return parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255); }
/** The reason an IP address (v4 or v6, as the URL parser writes it) is not for a public visit, or null when it is public. */
export function privateReason(ip: string): string | null {
  const a = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const kind = isIP(a);
  if (kind === 4) {
    const p = a.split(".").map(Number);
    if (!v4(p)) return "not a real address";
    const [x, y] = p;
    if (x === 127) return "this Mac itself";
    if (x === 0) return "not a real address";
    if (x === 10 || (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168)) return "a private network";
    if (x === 169 && y === 254) return "a link local address";
    if (x === 100 && y >= 64 && y <= 127) return "a private network";
    if (x >= 224) return "not a public address";
    return null;
  }
  if (kind === 6) {
    if (a === "::" || a === "::1") return "this Mac itself";
    const mapped = /^(?:0:0:0:0:0:ffff:|::ffff:)(.+)$/.exec(a);
    if (mapped) {
      const rest = mapped[1];
      if (rest.includes(".")) return privateReason(rest);
      const hex = rest.split(":").map((h) => parseInt(h, 16));
      if (hex.length === 2 && hex.every((n) => Number.isInteger(n))) return privateReason(`${hex[0] >> 8}.${hex[0] & 255}.${hex[1] >> 8}.${hex[1] & 255}`);
      return "not a public address";
    }
    const first = parseInt(a.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return "a private network";
    if ((first & 0xffc0) === 0xfe80) return "a link local address";
    if ((first & 0xff00) === 0xff00) return "not a public address";
    return null;
  }
  return "not a real address";
}

const typedHost = (url: string): string => {
  const rest = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const authority = rest.split(/[/?#]/)[0];
  return authority.startsWith("[") ? authority.slice(1, authority.indexOf("]") < 0 ? undefined : authority.indexOf("]")) : authority.split(":")[0];
};

/** What the person typed, made into the address to visit, or the plain reason it is refused. No scheme means https (http for
 *  localhost). The check is on the text only; where a name leads is judged again when it is looked up (hostAllowed). */
export function parseTarget(text: string): Address {
  let t = String(text ?? "").trim();
  if (!t) return { ok: false, reason: "Type the web address to check." };
  if (t.length > MAX_LENGTH) return { ok: false, reason: "That address is too long." };
  if (/\s/.test(t)) return { ok: false, reason: "A web address has no spaces in it." };
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(t);
  if (!scheme) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(t) && !/^[^/]*:\d+(\/|$)/.test(t) && !/^\[/.test(t)) return { ok: false, reason: "Only web addresses that start with http or https can be watched." };
    const bare = t.startsWith("[") ? t.slice(1, t.indexOf("]") < 0 ? undefined : t.indexOf("]")) : t.split(/[/:?#]/)[0];
    t = `${isLocalName(bare) ? "http" : "https"}://${t}`;
  } else if (!/^https?$/i.test(scheme[1])) return { ok: false, reason: "Only web addresses that start with http or https can be watched." };
  let u: URL;
  try { u = new URL(t); } catch { return { ok: false, reason: "That does not look like a web address." }; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, reason: "Only web addresses that start with http or https can be watched." };
  if (u.username || u.password) return { ok: false, reason: "Leave the user name and password out of the address. Companion never keeps passwords." };
  const host = u.hostname.toLowerCase();
  if (!host) return { ok: false, reason: "That does not look like a web address." };
  // Local only when the person really typed localhost (or 127.0.0.1, or ::1): a number written another way (2130706433,
  // 0x7f000001) reads as this Mac itself after tidying, but it was not typed as localhost.
  const local = isLocalName(host) && isLocalName(typedHost(t));
  const why = hostAllowed(host, local);
  if (why) return { ok: false, reason: why };
  if (!local && !isIP(host.replace(/^\[|\]$/g, "")) && !host.includes(".")) return { ok: false, reason: "That does not look like a web address. A public one has a dot in it, like example.com." };
  u.hash = "";
  return { ok: true, url: u.toString(), host, local };
}

/** The plain reason this host may not be visited, or null. A private or link local address never; this Mac itself only
 *  when the person typed localhost for the address they gave. */
export function hostAllowed(host: string, typedLocal: boolean): string | null {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (isLocalName(h)) return typedLocal ? null : "That address is on this Mac itself. Type localhost to watch your own dev server.";
  if (isIP(h)) { const why = privateReason(h); return why ? `That address is ${why}, so Companion will not visit it.` : null; }
  if (h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan") || h.endsWith(".home.arpa")) return "That address is on a private network, so Companion will not visit it.";
  return null;
}

/** Every address a name led to must be public (or this Mac itself, for a typed localhost). */
export function resolvedAllowed(addresses: string[], typedLocal: boolean): string | null {
  if (addresses.length === 0) return "I could not find that address.";
  for (const a of addresses) {
    const why = privateReason(a);
    if (!why) continue;
    if (typedLocal && why === "this Mac itself") continue;
    return `That address leads to ${why}, so Companion will not visit it.`;
  }
  return null;
}
