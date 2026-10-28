// The Google tools (M21 Part B) against a stand in for Google: no network. Each test checks the request the tool sends
// (address, method, bearer token, body), how it reads a realistic answer, the account rules, the tap list, the size caps,
// and that the access token never shows up in anything handed back.
import { describe, expect, test } from "bun:test";
import { freeSlots } from "../src/google/calendar.ts";
import { GMAIL_BODY_MAX, fromBase64Url } from "../src/google/gmail.ts";
import { DRIVE_TEXT_MAX } from "../src/google/drive.ts";
import {
  GOOGLE_TAP_TOOLS,
  GOOGLE_TOOL_NAMES,
  googleAllowedTools,
  googleServer,
  googleTapTools,
  googleToolSchemas,
  googleTools,
  REQUIRES_TAP_META,
  type GoogleAccount,
  type GoogleDeps,
} from "../src/google/tools.ts";

const TOKEN = "ya29.test-token-SHOULD-NEVER-LEAK";
type Seen = { url: string; method: string; headers: Record<string, string>; body?: any };
type Route = (url: string, init: RequestInit) => Response | Promise<Response> | undefined;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const b64u = (s: string) => Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const WORK: GoogleAccount = { label: "Work", email: "me@work.example", apps: ["gmail", "calendar", "drive"] };
const HOME: GoogleAccount = { label: "Personal", email: "me@home.example", apps: ["gmail"] };

function setup(routes: Route[], o: { accounts?: GoogleAccount[]; token?: GoogleDeps["token"] } = {}) {
  const seen: Seen[] = [];
  const tokensAskedFor: string[] = [];
  const deps: GoogleDeps = {
    accounts: o.accounts ?? [WORK],
    token: o.token ?? (async (label) => (tokensAskedFor.push(label), `${TOKEN}-${label}`)),
    fetch: async (url, init = {}) => {
      const headers = { ...(init.headers as Record<string, string>) };
      seen.push({ url, method: init.method ?? "GET", headers, body: init.body ? JSON.parse(String(init.body)) : undefined });
      for (const r of routes) {
        const res = await r(url, init);
        if (res) return res;
      }
      return json({ error: { code: 404, message: "Not found" } }, 404);
    },
  };
  const tools = Object.fromEntries(googleTools(deps).map((t) => [t.name, t]));
  const run = async (name: string, args: Record<string, unknown>) => {
    const r = (await tools[name]!.handler(args as any, {})) as { content: { text: string }[]; isError?: boolean };
    const text = r.content.map((c) => c.text).join("\n");
    expect(text).not.toContain(TOKEN);
    return { text, isError: !!r.isError };
  };
  return { seen, run, deps, tokensAskedFor };
}
const on = (pred: (u: URL, init: RequestInit) => boolean, res: () => Response): Route => (url, init) => (pred(new URL(url), init) ? res() : undefined);

describe("the tool list", () => {
  test("has every tool and no send tool", () => {
    const names = googleTools(setup([]).deps).map((t) => t.name);
    expect(names).toEqual([...GOOGLE_TOOL_NAMES]);
    expect(names.some((n) => /send/i.test(n))).toBe(false);
  });

  test("only calendar_create needs a tap, and it carries the SDK's flag", () => {
    expect([...GOOGLE_TAP_TOOLS]).toEqual(["calendar_create"]);
    expect(googleTapTools()).toEqual(["mcp__google__calendar_create"]);
    for (const t of googleTools(setup([]).deps)) {
      const flagged = (t._meta as Record<string, unknown> | undefined)?.[REQUIRES_TAP_META] === true;
      expect(flagged).toBe(t.name === "calendar_create");
    }
  });

  test("allowedTools names and JSON schemas", () => {
    expect(googleAllowedTools()).toContain("mcp__google__gmail_search");
    expect(googleAllowedTools("g")).toContain("mcp__g__drive_read");
    const s = googleToolSchemas() as Record<string, any>;
    expect(s.calendar_create.properties.start.type).toBe("string");
    expect(s.gmail_search.required).toEqual(["query"]);
  });

  test("builds an in process MCP server", () => {
    const server = googleServer(setup([]).deps);
    expect(server.type).toBe("sdk");
    expect(server.name).toBe("google");
    expect(server.instance).toBeDefined();
  });
});

describe("which account", () => {
  const ok = on((u) => u.pathname.endsWith("/messages"), () => json({ messages: [] }));

  test("one account may be left out", async () => {
    const { run, tokensAskedFor } = setup([ok]);
    const r = await run("gmail_search", { query: "x" });
    expect(r.isError).toBe(false);
    expect(tokensAskedFor).toEqual(["Work"]);
  });

  test("several accounts and none named: a plain error listing the labels, no token asked for", async () => {
    const { run, seen, tokensAskedFor } = setup([ok], { accounts: [WORK, HOME] });
    const r = await run("gmail_search", { query: "x" });
    expect(r.isError).toBe(true);
    expect(r.text).toContain("Work, Personal");
    expect(seen).toHaveLength(0);
    expect(tokensAskedFor).toHaveLength(0);
  });

  test("the label picks the account, ignoring case", async () => {
    const { run, seen, tokensAskedFor } = setup([ok], { accounts: [WORK, HOME] });
    await run("gmail_search", { query: "x", account: "personal" });
    expect(tokensAskedFor).toEqual(["Personal"]);
    expect(seen[0]!.headers.Authorization).toBe(`Bearer ${TOKEN}-Personal`);
  });

  test("an unknown label lists the real ones", async () => {
    const r = await setup([ok], { accounts: [WORK, HOME] }).run("gmail_search", { query: "x", account: "School" });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('"School"');
    expect(r.text).toContain("Work, Personal");
  });

  test("an account without the app is refused, naming the app", async () => {
    const { run, seen } = setup([], { accounts: [WORK, HOME] });
    const r = await run("calendar_list", { account: "Personal", from: "2026-11-01T00:00:00Z", to: "2026-11-02T00:00:00Z" });
    expect(r.isError).toBe(true);
    expect(r.text).toContain("Google Calendar is not connected for the Personal account");
    expect(seen).toHaveLength(0);
  });

  test("no accounts at all", async () => {
    const r = await setup([], { accounts: [] }).run("drive_search", { query: "x" });
    expect(r.text).toContain("No Google account is connected");
  });

  test("accounts may be a function, read on each call", async () => {
    let list: GoogleAccount[] = [];
    const s = setup([ok]);
    s.deps.accounts = () => list;
    const tools = Object.fromEntries(googleTools(s.deps).map((t) => [t.name, t]));
    const first = (await tools.gmail_search!.handler({ query: "x" } as any, {})) as any;
    expect(first.isError).toBe(true);
    list = [WORK];
    const second = (await tools.gmail_search!.handler({ query: "x" } as any, {})) as any;
    expect(second.isError).toBeUndefined();
  });
});

describe("errors in plain words, never with the token", () => {
  test("the shell cannot give a token", async () => {
    const r = await setup([], { token: async () => { throw new Error(`refresh failed for ${TOKEN}`); } }).run("gmail_search", { query: "x" });
    expect(r.isError).toBe(true);
    expect(r.text).toContain("could not get access to the Work Google account");
  });

  test("an empty token", async () => {
    const r = await setup([], { token: async () => "" }).run("gmail_search", { query: "x" });
    expect(r.text).toContain("could not get access");
  });

  test("401, 403 missing permission, 429, 403 rate limit, 500, network", async () => {
    const cases: [Response | (() => never), string][] = [
      [json({ error: { code: 401, message: "Invalid Credentials" } }, 401), "did not accept the sign in for the Work account"],
      [json({ error: { code: 403, message: "Request had insufficient authentication scopes.", status: "PERMISSION_DENIED", details: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }] } }, 403), "has not given permission for this in Gmail"],
      [json({ error: { code: 429, message: "Too many" } }, 429), "too many requests"],
      [json({ error: { code: 403, message: "Rate", errors: [{ reason: "userRateLimitExceeded" }] } }, 403), "too many requests"],
      [json({ error: { code: 500, message: `Backend error ${TOKEN}-Work` } }, 500), "Google said no (error 500)"],
      [() => { throw new TypeError("fetch failed"); }, "could not reach Google"],
    ];
    for (const [res, words] of cases) {
      const r = await setup([() => (typeof res === "function" ? res() : res.clone())]).run("gmail_search", { query: "x" });
      expect(r.isError).toBe(true);
      expect(r.text).toContain(words);
    }
  });
});

describe("Gmail", () => {
  const msg = (id: string, from: string, subject: string) => ({
    id,
    threadId: `t-${id}`,
    snippet: `Snippet of ${subject}`,
    payload: { headers: [{ name: "From", value: from }, { name: "Subject", value: subject }, { name: "Date", value: "Mon, 2 Nov 2026 09:00:00 +0000" }] },
  });

  test("gmail_search: list then metadata, capped at 20", async () => {
    const ids = Array.from({ length: 25 }, (_, i) => ({ id: `m${i}`, threadId: `t${i}` }));
    const { run, seen } = setup([
      on((u) => u.pathname === "/gmail/v1/users/me/messages", () => json({ messages: ids, resultSizeEstimate: 25 })),
      (url) => {
        const m = /messages\/(m\d+)\?/.exec(url);
        return m ? json(msg(m[1]!, "Ana <ana@example.com>", `Invoice ${m[1]}`)) : undefined;
      },
    ]);
    const r = await run("gmail_search", { query: "from:ana invoice", max: 99 });
    const list = new URL(seen[0]!.url);
    expect(list.origin + list.pathname).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    expect(list.searchParams.get("q")).toBe("from:ana invoice");
    expect(list.searchParams.get("maxResults")).toBe("20");
    expect(seen[0]!.method).toBe("GET");
    expect(seen[0]!.headers.Authorization).toBe(`Bearer ${TOKEN}-Work`);
    expect(seen).toHaveLength(21);
    const meta = new URL(seen[1]!.url);
    expect(meta.searchParams.get("format")).toBe("metadata");
    expect(meta.searchParams.getAll("metadataHeaders")).toEqual(["From", "Subject", "Date"]);
    expect(r.text).toContain("20 emails in the Work account");
    expect(r.text).toContain("id: m0");
    expect(r.text).toContain("from: Ana <ana@example.com>");
    expect(r.text).toContain("subject: Invoice m0");
    expect(r.text).toContain("date: Mon, 2 Nov 2026");
    expect(r.text).toContain("snippet: Snippet of Invoice m0");
  });

  test("gmail_search with nothing found", async () => {
    const r = await setup([on((u) => u.pathname.endsWith("/messages"), () => json({ resultSizeEstimate: 0 }))]).run("gmail_search", { query: "zzz" });
    expect(r.text).toContain('No emails matched "zzz"');
  });

  test("gmail_read: headers, plain text body, attachment names only", async () => {
    const full = {
      id: "m1",
      payload: {
        mimeType: "multipart/mixed",
        headers: [
          { name: "From", value: "Ana <ana@example.com>" },
          { name: "To", value: "me@work.example" },
          { name: "Subject", value: "Contract" },
          { name: "Date", value: "Tue, 3 Nov 2026 10:00:00 +0000" },
        ],
        parts: [
          { mimeType: "multipart/alternative", parts: [
            { mimeType: "text/plain", body: { data: b64u("Hi,\nthe contract is attached.\nAna") } },
            { mimeType: "text/html", body: { data: b64u("<p>Hi</p>") } },
          ] },
          { mimeType: "application/pdf", filename: "contract.pdf", body: { attachmentId: "att1", size: 12345 } },
        ],
      },
    };
    const { run, seen } = setup([on((u) => u.pathname.endsWith("/messages/m1"), () => json(full))]);
    const r = await run("gmail_read", { id: "m1" });
    expect(new URL(seen[0]!.url).searchParams.get("format")).toBe("full");
    expect(r.text).toContain("from: Ana <ana@example.com>");
    expect(r.text).toContain("to: me@work.example");
    expect(r.text).toContain("subject: Contract");
    expect(r.text).toContain("attachments: contract.pdf");
    expect(r.text).toContain("the contract is attached.");
    expect(r.text).not.toContain("<p>");
    expect(seen).toHaveLength(1);
  });

  test("gmail_read falls back to HTML without tags, and caps the body", async () => {
    const long = "word ".repeat(10_000);
    const html = { id: "m2", payload: { mimeType: "text/html", headers: [], body: { data: b64u(`<div>Hello &amp; welcome<br>${long}</div>`) } } };
    const r = await setup([on((u) => u.pathname.endsWith("/messages/m2"), () => json(html))]).run("gmail_read", { id: "m2" });
    expect(r.text).toContain("Hello & welcome");
    expect(r.text).not.toContain("<div>");
    expect(r.text).toContain(`longer than ${GMAIL_BODY_MAX} characters`);
    expect(r.text.length).toBeLessThan(GMAIL_BODY_MAX + 1000);
  });

  test("gmail_draft: POSTs a draft (never send) with the right raw email", async () => {
    const { run, seen } = setup([on((u, i) => u.pathname.endsWith("/drafts") && i.method === "POST", () => json({ id: "d1", message: { id: "m9" } }))]);
    const r = await run("gmail_draft", { to: "bo@example.com", subject: "Lunch", body: "Friday at 1? Café okay." });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/drafts");
    expect(seen[0]!.method).toBe("POST");
    expect(seen[0]!.headers["Content-Type"]).toBe("application/json");
    expect(seen.some((s) => /send/.test(s.url))).toBe(false);
    const raw = fromBase64Url(seen[0]!.body.message.raw);
    expect(raw).toContain("To: bo@example.com\r\n");
    expect(raw).toContain("Subject: Lunch\r\n");
    const body = raw.split("\r\n\r\n")[1]!.replace(/\r\n/g, "");
    expect(Buffer.from(body, "base64").toString("utf8")).toBe("Friday at 1? Café okay.");
    expect(seen[0]!.body.message.threadId).toBeUndefined();
    expect(r.text).toContain("has not been sent");
    expect(r.text).toContain("Draft id: d1");
  });

  test("gmail_draft as a reply joins the thread", async () => {
    const orig = { id: "m5", threadId: "t5", payload: { headers: [{ name: "Message-ID", value: "<abc@mail>" }, { name: "Subject", value: "Plans" }, { name: "References", value: "<zzz@mail>" }] } };
    const { run, seen } = setup([
      on((u) => u.pathname.endsWith("/messages/m5"), () => json(orig)),
      on((u) => u.pathname.endsWith("/drafts"), () => json({ id: "d2" })),
    ]);
    await run("gmail_draft", { to: "bo@example.com", subject: "", body: "Yes", replyTo: "m5" });
    expect(new URL(seen[0]!.url).searchParams.getAll("metadataHeaders")).toContain("Message-ID");
    const draft = seen[1]!.body.message;
    expect(draft.threadId).toBe("t5");
    const raw = fromBase64Url(draft.raw);
    expect(raw).toContain("Subject: Re: Plans");
    expect(raw).toContain("In-Reply-To: <abc@mail>");
    expect(raw).toContain("References: <zzz@mail> <abc@mail>");
  });

  test("gmail_draft refuses a line break in a header and a non ASCII subject is encoded", async () => {
    const { run, seen } = setup([on((u) => u.pathname.endsWith("/drafts"), () => json({ id: "d3" }))]);
    const bad = await run("gmail_draft", { to: "a@b.c\r\nBcc: evil@x.y", subject: "Hi", body: "x" });
    expect(bad.isError).toBe(true);
    expect(seen).toHaveLength(0);
    await run("gmail_draft", { to: "a@b.c", subject: "Grüße", body: "x" });
    expect(fromBase64Url(seen[0]!.body.message.raw)).toContain(`Subject: =?UTF-8?B?${Buffer.from("Grüße").toString("base64")}?=`);
  });
});

describe("Calendar", () => {
  test("calendar_list: request and parsing, cancelled events left out", async () => {
    const items = [
      { summary: "Standup", start: { dateTime: "2026-11-02T09:00:00+01:00" }, end: { dateTime: "2026-11-02T09:15:00+01:00" }, attendees: [{}, {}, {}] },
      { summary: "Holiday", start: { date: "2026-11-03" }, end: { date: "2026-11-04" } },
      { summary: "Dentist", location: "Main St 4", start: { dateTime: "2026-11-02T15:00:00+01:00" }, end: { dateTime: "2026-11-02T16:00:00+01:00" } },
      { summary: "Gone", status: "cancelled", start: { dateTime: "2026-11-02T17:00:00+01:00" }, end: { dateTime: "2026-11-02T18:00:00+01:00" } },
    ];
    const { run, seen } = setup([on((u) => u.pathname === "/calendar/v3/calendars/primary/events", () => json({ items }))]);
    const r = await run("calendar_list", { from: "2026-11-02T00:00:00+01:00", to: "2026-11-05T00:00:00+01:00", max: 500 });
    const u = new URL(seen[0]!.url);
    expect(u.origin).toBe("https://www.googleapis.com");
    expect(u.searchParams.get("timeMin")).toBe("2026-11-01T23:00:00.000Z");
    expect(u.searchParams.get("timeMax")).toBe("2026-11-04T23:00:00.000Z");
    expect(u.searchParams.get("singleEvents")).toBe("true");
    expect(u.searchParams.get("orderBy")).toBe("startTime");
    expect(u.searchParams.get("maxResults")).toBe("50");
    expect(seen[0]!.headers.Authorization).toBe(`Bearer ${TOKEN}-Work`);
    expect(r.text).toContain("3 events");
    expect(r.text).toContain("1. Standup");
    expect(r.text).toContain("attendees: 3");
    expect(r.text).toContain("2026-11-03 (all day)");
    expect(r.text).toContain("location: Main St 4");
    expect(r.text).not.toContain("Gone");
  });

  test("calendar_list refuses a time it cannot read, before calling Google", async () => {
    const { run, seen } = setup([]);
    const r = await run("calendar_list", { from: "next tuesday", to: "2026-11-05T00:00:00Z" });
    expect(r.isError).toBe(true);
    expect(r.text).toContain("not a time I can read");
    expect(seen).toHaveLength(0);
  });

  test("calendar_free: freeBusy request and gaps", async () => {
    const busy = [
      { start: "2026-11-02T10:00:00Z", end: "2026-11-02T11:00:00Z" },
      { start: "2026-11-02T10:30:00Z", end: "2026-11-02T12:00:00Z" },
      { start: "2026-11-02T12:20:00Z", end: "2026-11-02T16:00:00Z" },
    ];
    const { run, seen } = setup([on((u, i) => u.pathname === "/calendar/v3/freeBusy" && i.method === "POST", () => json({ calendars: { primary: { busy } } }))]);
    const r = await run("calendar_free", { from: "2026-11-02T09:00:00Z", to: "2026-11-02T17:00:00Z", minutes: 30 });
    expect(seen[0]!.body).toEqual({ timeMin: "2026-11-02T09:00:00.000Z", timeMax: "2026-11-02T17:00:00.000Z", items: [{ id: "primary" }] });
    expect(r.text).toContain("1. 2026-11-02T09:00:00.000Z to 2026-11-02T10:00:00.000Z");
    expect(r.text).toContain("2. 2026-11-02T16:00:00.000Z to 2026-11-02T17:00:00.000Z");
    expect(r.text).not.toContain("12:00:00.000Z to 2026-11-02T12:20");
  });

  test("freeSlots edge cases", () => {
    const d = (h: number) => new Date(Date.UTC(2026, 10, 2, h));
    expect(freeSlots(d(9), d(17), [], 60)).toEqual([{ start: d(9), end: d(17) }]);
    expect(freeSlots(d(9), d(17), [{ start: d(8), end: d(18) }], 60)).toEqual([]);
    expect(freeSlots(d(9), d(12), [{ start: d(10), end: d(11) }], 60)).toEqual([{ start: d(9), end: d(10) }, { start: d(11), end: d(12) }]);
  });

  test("calendar_create: POSTs the event and invites attendees", async () => {
    const { run, seen } = setup([on((u, i) => u.pathname === "/calendar/v3/calendars/primary/events" && i.method === "POST", () => json({ id: "e1", htmlLink: "https://calendar.google.com/event?eid=e1" }))]);
    const r = await run("calendar_create", {
      title: "Review",
      start: "2026-11-03T14:00:00+01:00",
      end: "2026-11-03T15:00:00+01:00",
      attendees: ["bo@example.com"],
      description: "Go over the draft",
    });
    expect(seen[0]!.method).toBe("POST");
    expect(new URL(seen[0]!.url).searchParams.get("sendUpdates")).toBe("all");
    expect(seen[0]!.body).toEqual({
      summary: "Review",
      start: { dateTime: "2026-11-03T14:00:00+01:00" },
      end: { dateTime: "2026-11-03T15:00:00+01:00" },
      description: "Go over the draft",
      attendees: [{ email: "bo@example.com" }],
    });
    expect(r.text).toContain('Added "Review" to the Work calendar');
    expect(r.text).toContain("invitations to bo@example.com");
  });

  test("calendar_create: all day, no attendees, no emails sent", async () => {
    const { run, seen } = setup([on((u) => u.pathname.endsWith("/events"), () => json({ id: "e2" }))]);
    await run("calendar_create", { title: "Off", start: "2026-11-05", end: "2026-11-06" });
    expect(seen[0]!.body.start).toEqual({ date: "2026-11-05" });
    expect(new URL(seen[0]!.url).searchParams.get("sendUpdates")).toBe("none");
  });

  test("calendar_create refuses an end before the start and a bad address", async () => {
    const { run, seen } = setup([]);
    expect((await run("calendar_create", { title: "X", start: "2026-11-03T15:00:00Z", end: "2026-11-03T14:00:00Z" })).text).toContain("end after it starts");
    expect((await run("calendar_create", { title: "X", start: "2026-11-03T14:00:00Z", end: "2026-11-03T15:00:00Z", attendees: ["bob"] })).text).toContain("not an email address");
    expect(seen).toHaveLength(0);
  });
});

describe("Drive", () => {
  test("drive_search: query with quotes escaped, capped at 20", async () => {
    const files = Array.from({ length: 3 }, (_, i) => ({ id: `f${i}`, name: `Budget ${i}`, mimeType: "application/vnd.google-apps.spreadsheet", modifiedTime: "2026-10-01T10:00:00.000Z" }));
    const { run, seen } = setup([on((u) => u.pathname === "/drive/v3/files", () => json({ files }))]);
    const r = await run("drive_search", { query: "Ana's budget", max: 50 });
    const u = new URL(seen[0]!.url);
    expect(u.searchParams.get("q")).toBe("(name contains 'Ana\\'s budget' or fullText contains 'Ana\\'s budget') and trashed = false");
    expect(u.searchParams.get("pageSize")).toBe("20");
    expect(u.searchParams.get("fields")).toBe("files(id,name,mimeType,modifiedTime)");
    expect(seen[0]!.headers.Authorization).toBe(`Bearer ${TOKEN}-Work`);
    expect(r.text).toContain("1. Budget 0");
    expect(r.text).toContain("id: f0");
    expect(r.text).toContain("type: application/vnd.google-apps.spreadsheet");
    expect(r.text).toContain("modified: 2026-10-01T10:00:00.000Z");
  });

  const meta = (id: string, mimeType: string, size?: string): Route => on((u) => u.pathname === `/drive/v3/files/${id}` && !u.searchParams.has("alt"), () => json({ id, name: `File ${id}`, mimeType, size }));

  test("drive_read: a Google Doc is exported as plain text", async () => {
    const { run, seen } = setup([meta("d1", "application/vnd.google-apps.document"), on((u) => u.pathname === "/drive/v3/files/d1/export", () => new Response("Meeting notes\nItem one"))]);
    const r = await run("drive_read", { id: "d1" });
    expect(new URL(seen[1]!.url).searchParams.get("mimeType")).toBe("text/plain");
    expect(seen[1]!.headers.Authorization).toBe(`Bearer ${TOKEN}-Work`);
    expect(r.text).toContain("name: File d1");
    expect(r.text).toContain("Meeting notes\nItem one");
  });

  test("drive_read: a Sheet is exported as CSV", async () => {
    const { run, seen } = setup([meta("s1", "application/vnd.google-apps.spreadsheet"), on((u) => u.pathname.endsWith("/s1/export"), () => new Response("a,b\n1,2"))]);
    const r = await run("drive_read", { id: "s1" });
    expect(new URL(seen[1]!.url).searchParams.get("mimeType")).toBe("text/csv");
    expect(r.text).toContain("a,b\n1,2");
  });

  test("drive_read: a plain text file is downloaded and capped", async () => {
    const { run, seen } = setup([meta("t1", "text/plain", "50000"), on((u) => u.pathname.endsWith("/t1") && u.searchParams.get("alt") === "media", () => new Response("x".repeat(50_000)))]);
    const r = await run("drive_read", { id: "t1" });
    expect(seen[1]!.url).toContain("alt=media");
    expect(r.text).toContain(`longer than ${DRIVE_TEXT_MAX} characters`);
    expect(r.text.length).toBeLessThan(DRIVE_TEXT_MAX + 500);
  });

  test("drive_read: other kinds return name and type only, no download", async () => {
    const { run, seen } = setup([meta("p1", "image/png")]);
    const r = await run("drive_read", { id: "p1" });
    expect(seen).toHaveLength(1);
    expect(r.text).toContain("type: image/png");
    expect(r.text).toContain("only its name and type");
  });

  test("drive_read: a huge text file is not downloaded", async () => {
    const { run, seen } = setup([meta("big", "text/plain", "999999999")]);
    const r = await run("drive_read", { id: "big" });
    expect(seen).toHaveLength(1);
    expect(r.text).toContain("too big");
  });

  test("ids are escaped in the address", async () => {
    const { run, seen } = setup([]);
    await run("drive_read", { id: "../about?x=1" });
    expect(seen[0]!.url).toContain("/files/..%2Fabout%3Fx%3D1?");
  });
});

describe("the token stays out of every answer", () => {
  test("even if Google echoes it back", async () => {
    const r = await setup([on((u) => u.pathname.endsWith("/messages/m1"), () => json({ id: "m1", payload: { mimeType: "text/plain", headers: [{ name: "Subject", value: `${TOKEN}-Work` }], body: { data: b64u(`token ${TOKEN}-Work`) } } }))]).run("gmail_read", { id: "m1" });
    expect(r.text).toContain("[hidden]");
  });
});
