// Gmail over its REST API: search, read one message, and save a draft. There is no send: a draft waits in Gmail for the
// person to send it themselves (AGENTS.md rule 13).
import { cap, GoogleError, type GoogleClient } from "./core.ts";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";
export const GMAIL_MAX_RESULTS = 20;
export const GMAIL_BODY_MAX = 20_000;

type Header = { name?: string; value?: string };
type Part = { mimeType?: string; filename?: string; headers?: Header[]; body?: { data?: string; size?: number; attachmentId?: string }; parts?: Part[] };
type Message = { id?: string; threadId?: string; snippet?: string; payload?: Part };

const header = (p: Part | undefined, name: string): string =>
  p?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

/** Gmail's base64url, to text. */
export function fromBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}
const toBase64Url = (text: string): string => Buffer.from(text, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function gmailSearch(c: GoogleClient, query: string, max?: number): Promise<string> {
  const n = Math.max(1, Math.min(Math.floor(max ?? 10), GMAIL_MAX_RESULTS));
  const list = await c.json<{ messages?: { id: string }[] }>(`${API}/messages?q=${encodeURIComponent(query)}&maxResults=${n}`);
  const ids = (list.messages ?? []).slice(0, n).map((m) => m.id);
  if (ids.length === 0) return `No emails matched "${query}" in the ${c.account.label} account.`;
  const meta = "format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date";
  const found = await Promise.all(ids.map((id) => c.json<Message>(`${API}/messages/${encodeURIComponent(id)}?${meta}`)));
  const lines = found.map((m, i) =>
    [
      `${i + 1}. id: ${m.id ?? ids[i]}`,
      `   from: ${header(m.payload, "From")}`,
      `   subject: ${header(m.payload, "Subject") || "(no subject)"}`,
      `   date: ${header(m.payload, "Date")}`,
      `   snippet: ${(m.snippet ?? "").slice(0, 300)}`,
    ].join("\n"),
  );
  return `${found.length} email${found.length === 1 ? "" : "s"} in the ${c.account.label} account:\n\n${lines.join("\n\n")}`;
}

/** The plain text of a message: the first text/plain part, else the HTML part with its tags taken out. */
function bodyText(p: Part | undefined): string {
  const plain = findPart(p, "text/plain");
  if (plain?.body?.data) return fromBase64Url(plain.body.data);
  const html = findPart(p, "text/html");
  if (html?.body?.data) return htmlToText(fromBase64Url(html.body.data));
  return "";
}
function findPart(p: Part | undefined, type: string): Part | undefined {
  if (!p) return undefined;
  if (p.mimeType === type && !p.filename && p.body?.data) return p;
  for (const child of p.parts ?? []) {
    const hit = findPart(child, type);
    if (hit) return hit;
  }
  return undefined;
}
function attachments(p: Part | undefined, out: string[] = []): string[] {
  if (!p) return out;
  if (p.filename) out.push(p.filename);
  for (const child of p.parts ?? []) attachments(child, out);
  return out;
}
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function gmailRead(c: GoogleClient, id: string): Promise<string> {
  const m = await c.json<Message>(`${API}/messages/${encodeURIComponent(id)}?format=full`);
  const files = attachments(m.payload);
  const body = bodyText(m.payload).trim();
  return [
    `from: ${header(m.payload, "From")}`,
    `to: ${header(m.payload, "To")}`,
    `subject: ${header(m.payload, "Subject") || "(no subject)"}`,
    `date: ${header(m.payload, "Date")}`,
    `attachments: ${files.length ? files.join(", ") : "none"}`,
    "",
    body ? cap(body, GMAIL_BODY_MAX, "email") : "(This email has no plain text body.)",
  ].join("\n");
}

/** A header value with no line breaks (so nothing can be smuggled in as an extra header), encoded when not plain ASCII. */
function headerValue(v: string, what: string): string {
  if (/[\r\n]/.test(v)) throw new GoogleError(`The ${what} cannot contain a line break.`);
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`;
}

/** Save a draft. Never sends. With `replyTo`, the draft joins that email's thread as a reply. */
export async function gmailDraft(c: GoogleClient, a: { to: string; subject: string; body: string; replyTo?: string }): Promise<string> {
  const to = a.to.trim();
  if (!to) throw new GoogleError("A draft needs at least one address to send to.");
  let subject = a.subject;
  let threadId: string | undefined;
  const extra: string[] = [];
  if (a.replyTo) {
    const meta = "format=metadata&metadataHeaders=Message-ID&metadataHeaders=References&metadataHeaders=Subject";
    const orig = await c.json<Message>(`${API}/messages/${encodeURIComponent(a.replyTo)}?${meta}`);
    threadId = orig.threadId;
    const msgId = header(orig.payload, "Message-ID");
    if (msgId && !/[\r\n]/.test(msgId)) {
      const refs = header(orig.payload, "References").replace(/[\r\n]+/g, " ");
      extra.push(`In-Reply-To: ${msgId}`, `References: ${refs ? `${refs} ${msgId}` : msgId}`);
    }
    if (!subject.trim()) {
      const s = header(orig.payload, "Subject");
      subject = /^re:/i.test(s) ? s : `Re: ${s}`;
    }
  }
  const raw = [
    `To: ${headerValue(to, "address")}`,
    `Subject: ${headerValue(subject, "subject")}`,
    ...extra,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(a.body, "utf8").toString("base64").replace(/.{76}/g, "$&\r\n"),
  ].join("\r\n");
  const message: { raw: string; threadId?: string } = { raw: toBase64Url(raw) };
  if (threadId) message.threadId = threadId;
  const draft = await c.json<{ id?: string }>(`${API}/drafts`, { method: "POST", body: { message } });
  return `Saved a draft in the ${c.account.label} account's Gmail, to ${to}. It has not been sent: open Gmail to check and send it.${draft.id ? ` Draft id: ${draft.id}` : ""}`;
}
