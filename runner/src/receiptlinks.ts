// M123 slice 5: a receipt you can send as a link, the engine side. On the person's tap only, the page the app made (the M88
// share page: redacted, and checked again by the server) goes to Squibby's own https server with the Squibby sign in, never
// the person's Claude key. The link lasts 30 days. Its delete token stays on this Mac (receipt-links.json, 0600) so Delete
// link works from History; nothing else about the page is kept here.
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type LinkAuth = { token: string; base: string };
export type LinkRow = { id: string; url: string; expiresAt: string; title?: string };
type Kept = LinkRow & { deleteToken: string };
export type ShareOutcome = ({ ok: true } & LinkRow) | { ok: false; reason: "signIn" | "offline" | "refused" | "bad_answer"; say?: string };

const ID = /^[A-Za-z0-9_-]{22}$/;
const MAX_KEPT = 200;

export class ReceiptLinks {
  constructor(private d: { dir: string; auth: () => Promise<LinkAuth | null>; fetchFn?: typeof fetch; now?: () => number }) {}

  private file() { return join(this.d.dir, "receipt-links.json"); }
  private read(): Kept[] {
    try { const j = JSON.parse(readFileSync(this.file(), "utf8")); return Array.isArray(j) ? j.filter((k) => k && ID.test(k.id) && typeof k.deleteToken === "string") : []; } catch { return []; }
  }
  private write(rows: Kept[]) {
    mkdirSync(this.d.dir, { recursive: true, mode: 0o700 });
    const tmp = `${this.file()}.tmp`;
    writeFileSync(tmp, JSON.stringify(rows.slice(-MAX_KEPT)), { mode: 0o600 });
    renameSync(tmp, this.file());
    chmodSync(this.file(), 0o600);
  }
  /** The links still alive, newest last, without their delete tokens. */
  list(): LinkRow[] {
    const now = (this.d.now ?? Date.now)();
    return this.read().filter((k) => Date.parse(k.expiresAt) > now).map(({ deleteToken: _d, ...row }) => row);
  }

  private async server(): Promise<LinkAuth | null> {
    const a = await this.d.auth().catch(() => null);
    if (!a) return null;
    try { const u = new URL(a.base); return u.protocol === "https:" ? { token: a.token, base: u.origin } : null; } catch { return null; }
  }

  async share(html: string, title?: string): Promise<ShareOutcome> {
    const a = await this.server();
    if (!a) return { ok: false, reason: "signIn" };
    let res: Response;
    try {
      res = await (this.d.fetchFn ?? fetch)(`${a.base}/v1/receipts`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${a.token}` }, body: JSON.stringify({ html }), redirect: "error", signal: AbortSignal.timeout(30_000) });
    } catch { return { ok: false, reason: "offline" }; }
    let j: Record<string, unknown> = {};
    try { j = await res.json() as Record<string, unknown>; } catch { /* checked below */ }
    if (!res.ok) return { ok: false, reason: "refused", ...(typeof j.error === "string" ? { say: j.error.slice(0, 200) } : {}) };
    const id = j.id, url = j.url, del = j.deleteToken, exp = j.expiresAt;
    if (typeof id !== "string" || !ID.test(id) || typeof url !== "string" || typeof del !== "string" || typeof exp !== "string" || Number.isNaN(Date.parse(exp))) return { ok: false, reason: "bad_answer" };
    if (url !== `${a.base}/r/${id}`) return { ok: false, reason: "bad_answer" };   // a link only ever on Squibby's own server
    const row: LinkRow = { id, url, expiresAt: exp, ...(title ? { title: title.slice(0, 120) } : {}) };
    this.write([...this.read(), { ...row, deleteToken: del }]);
    return { ok: true, ...row };
  }

  async remove(id: string): Promise<{ ok: true } | { ok: false; reason: "unknown" | "signIn" | "offline" | "refused" }> {
    const kept = this.read().find((k) => k.id === id);
    if (!kept) return { ok: false, reason: "unknown" };
    const a = await this.server();
    if (!a || !kept.url.startsWith(`${a.base}/r/`)) return { ok: false, reason: "signIn" };
    let res: Response;
    try { res = await (this.d.fetchFn ?? fetch)(`${a.base}/v1/receipts/${id}`, { method: "DELETE", headers: { "x-delete-token": kept.deleteToken }, redirect: "error", signal: AbortSignal.timeout(30_000) }); }
    catch { return { ok: false, reason: "offline" }; }
    if (!res.ok) return { ok: false, reason: "refused" };
    this.write(this.read().filter((k) => k.id !== id));
    return { ok: true };
  }
}

