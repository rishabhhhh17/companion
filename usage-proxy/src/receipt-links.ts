// M123 slice 5: a receipt you can send as a link. The app makes the page (the M88 share page, redacted there and checked
// again by the shell); this server only keeps it for 30 days and shows it.
//  - Signed in only, and only on the person's tap in the app (rule 13). A daily limit per person.
//  - The page is checked here too (checkPage): an allowlist of plain tags, no attribute that runs or links, no address of any
//    kind, pictures only as JPEG or PNG inside the page. It is then served with a policy that lets nothing run, load or be
//    framed, and asks search engines not to keep it.
//  - Each link has a delete token, shown to the app once and kept here only as its hash; the owner can delete it too.
//  - Off unless SHARE_ON is set and the RECEIPTS KV namespace is bound (Cloudflare free tier). Off, nothing answers.
import { hashToken, tokenFromHeaders } from "./tokens.ts";
import { jsonNoStore, readCapped } from "./http.ts";

export const RECEIPTS_PATH = "/v1/receipts";
export const PAGE_PREFIX = "/r/";
export const LINK_DAYS = 30;
export const DAILY_LINKS = 30;
/** S16: the app's share page carries one screenshot (a JPEG at quality 75), well under this. 4 MB a page at 30 a day let a few
 *  accounts fill Cloudflare's free 1 GB of KV for everyone. */
export const MAX_PAGE = 1_500_000;
export const MAX_PICTURES = 6;

export type LinkStore = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, o?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
};
export type LinkDeps = {
  links?: LinkStore;
  on: () => boolean;
  /** The signed in person a token belongs to (accounts store), or null. active: not paused, revoked or cancelled. */
  userOf: (token: string) => Promise<{ id: string; active: boolean } | null>;
  origin: string;
  now: () => number;
  /** S16: counts a new link against the person's DAILY_LINKS in one step on their own record (and keeps its id there, so an
   *  account delete deletes it, S13). False: over the day's limit. */
  madeLink: (ownerId: string, id: string, now: number) => Promise<boolean>;
};

const TAGS = new Set(["html", "head", "meta", "title", "style", "body", "main", "header", "footer", "section", "article", "div", "span", "p",
  "h1", "h2", "h3", "h4", "ul", "ol", "li", "b", "strong", "em", "i", "small", "img", "figure", "figcaption", "table", "thead", "tbody", "tr", "th", "td", "br", "hr", "code", "pre", "dl", "dt", "dd"]);
const ATTRS = new Set(["class", "alt", "src", "charset", "name", "content", "lang", "width", "height", "data-tone", "data-result", "aria-label", "role", "title", "style", "http-equiv"]);

/** Why a page may not be kept, or null when it may. */
export function checkPage(html: string): string | null {
  if (typeof html !== "string" || html.length > MAX_PAGE) return "too_big";
  if (!/^\s*<!doctype html>/i.test(html)) return "not_a_page";
  const lower = html.toLowerCase();
  if (/javascript:|vbscript:|expression\s*\(|@import|url\s*\(|\b(?:https?|file|ftp|data):\/\//i.test(lower)) return "address_or_code";
  let pictures = 0;
  for (const m of html.matchAll(/<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g)) {
    const tag = m[2].toLowerCase(), attrs = m[3] ?? "";
    if (m[1]) { if (!TAGS.has(tag)) return `tag_${tag}`; continue; }
    if (!TAGS.has(tag)) return `tag_${tag}`;
    for (const a of attrs.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g)) {
      const name = a[1].toLowerCase(), value = (a[2] ?? "").replace(/^["']|["']$/g, "");
      if (name === "/") continue;
      if (!ATTRS.has(name)) return `attr_${name}`;
      if (name === "src") { if (tag !== "img" || !/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return "picture"; pictures++; }
      if (tag === "meta" && name === "content" && /refresh|url/i.test(value)) return "meta";
      if (name === "http-equiv" && (tag !== "meta" || value.toLowerCase() !== "content-security-policy")) return "meta";
    }
    if (tag === "img" && !/\bsrc\s*=/.test(attrs)) return "picture";
  }
  if (/<\s*!(?!doctype)/i.test(html.replace(/^\s*<!doctype html>/i, ""))) return "markup";
  if (pictures > MAX_PICTURES) return "too_many_pictures";
  return null;
}

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const ID = /^[A-Za-z0-9_-]{22}$/;
const PAGE_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox",
  "x-content-type-options": "nosniff", "x-frame-options": "DENY", "referrer-policy": "no-referrer",
  "x-robots-tag": "noindex, nofollow, noarchive", "cache-control": "private, max-age=300",
};
const notHere = () => new Response("This receipt is not here. It may have been deleted, or its 30 days ended.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
type Kept = { html: string; owner: string; del: string; exp: number };

export function makeLinkRoutes(d: LinkDeps): (req: Request, url: URL) => Promise<Response | null> {
  const ready = () => d.on() && !!d.links;
  async function share(req: Request): Promise<Response> {
    const token = tokenFromHeaders(req.headers);
    const user = token ? await d.userOf(token) : null;
    if (!user) return jsonNoStore({ error: "Sign in to share a receipt as a link." }, 401);
    if (!user.active) return jsonNoStore({ error: "This account cannot share links right now." }, 403);
    const raw = await readCapped(req, MAX_PAGE + 1024);
    let html: unknown;
    try { html = raw === null ? null : (JSON.parse(raw) as { html?: unknown }).html; } catch { html = null; }
    const why = typeof html === "string" ? checkPage(html) : "no_page";
    if (why) return jsonNoStore({ error: "This page cannot be shared as a link.", why }, 400);
    const now = d.now(), id = b64url(crypto.getRandomValues(new Uint8Array(16))), deleteToken = b64url(crypto.getRandomValues(new Uint8Array(24)));
    if (!(await d.madeLink(user.id, id, now))) return jsonNoStore({ error: `You can make ${DAILY_LINKS} links a day. Saving as a file still works.` }, 429);
    const exp = now + LINK_DAYS * 86_400_000;
    const kept: Kept = { html: html as string, owner: user.id, del: await hashToken(deleteToken), exp };
    await d.links!.put(`r:${id}`, JSON.stringify(kept), { expirationTtl: LINK_DAYS * 86_400 });
    return jsonNoStore({ id, url: `${d.origin}${PAGE_PREFIX}${id}`, deleteToken, expiresAt: new Date(exp).toISOString() });
  }
  async function read(id: string): Promise<Kept | null> {
    if (!ID.test(id)) return null;
    try { const k = JSON.parse(await d.links!.get(`r:${id}`) ?? "null") as Kept | null; return k && k.exp > d.now() ? k : null; } catch { return null; }
  }
  async function remove(req: Request, id: string): Promise<Response> {
    const k = await read(id);
    if (!k) return jsonNoStore({ deleted: true });   // already gone: the same answer, so nothing is learnt about ids
    const del = req.headers.get("x-delete-token"), token = tokenFromHeaders(req.headers);
    const byToken = !!del && (await hashToken(del)) === k.del;
    const byOwner = !byToken && !!token && (await d.userOf(token))?.id === k.owner;
    if (!byToken && !byOwner) return jsonNoStore({ error: "Only the person who made this link can delete it." }, 403);
    await d.links!.delete(`r:${id}`);
    return jsonNoStore({ deleted: true });
  }
  return async (req, url) => {
    const p = url.pathname;
    const ours = p === RECEIPTS_PATH || p.startsWith(`${RECEIPTS_PATH}/`) || p.startsWith(PAGE_PREFIX);
    if (!ours) return null;
    if (!ready()) return notHere();
    if (req.method === "POST" && p === RECEIPTS_PATH) return share(req);
    if (req.method === "DELETE" && p.startsWith(`${RECEIPTS_PATH}/`)) return remove(req, p.slice(RECEIPTS_PATH.length + 1));
    if (req.method === "GET" && p.startsWith(PAGE_PREFIX)) { const k = await read(p.slice(PAGE_PREFIX.length)); return k ? new Response(k.html, { headers: PAGE_HEADERS }) : notHere(); }
    return notHere();
  };
}
