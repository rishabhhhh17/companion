// The Google tools the AI can use when the person asks (M21 Part B): Gmail, Google Calendar and Google Drive, as one
// in process MCP server built with the SDK's createSdkMcpServer. Nothing here is wired into an agent yet; the engine
// adds `googleServer(deps)` to `mcpServers` and `googleAllowedTools()` to `allowedTools` when the person has a Google
// account connected (T15: MCP tools need explicit allowedTools entries).
//
// No tool sends email. calendar_create changes the person's calendar and can invite people, so it needs their tap:
// it carries `_meta["anthropic/requiresUserInteraction"]` (T15) so Claude Code never runs it unattended, and it is in
// GOOGLE_TAP_TOOLS so the app's own approval code (the PreToolUse hook and canUseTool card, AGENTS.md rule 12) can
// require a tap in code, not just trust the flag.
import { createSdkMcpServer, type McpSdkServerConfigWithInstance, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { calendarCreate, calendarFree, calendarList } from "./calendar.ts";
import { clientFor, GoogleError, scrub, type GoogleApp, type GoogleClient, type GoogleDeps } from "./core.ts";
import { driveRead, driveSearch } from "./drive.ts";
import { gmailDraft, gmailRead, gmailSearch } from "./gmail.ts";

export { GoogleError, pickAccount, type GoogleAccount, type GoogleApp, type GoogleDeps } from "./core.ts";

/** The server's name in `mcpServers`, which makes each tool's full name `mcp__google__<tool>`. */
export const GOOGLE_SERVER = "google";
export const GOOGLE_TOOL_NAMES = [
  "gmail_search",
  "gmail_read",
  "gmail_draft",
  "calendar_list",
  "calendar_free",
  "calendar_create",
  "drive_search",
  "drive_read",
] as const;
export type GoogleToolName = (typeof GOOGLE_TOOL_NAMES)[number];
/** The tools that must wait for the person's tap every time. */
export const GOOGLE_TAP_TOOLS: readonly GoogleToolName[] = ["calendar_create"];
export const REQUIRES_TAP_META = "anthropic/requiresUserInteraction";

/** Full names, as Claude Code sees them, for `allowedTools`. */
export function googleAllowedTools(server = GOOGLE_SERVER): string[] {
  return GOOGLE_TOOL_NAMES.map((t) => `mcp__${server}__${t}`);
}
/** Full names of the tools that need a tap, for the approval code. */
export function googleTapTools(server = GOOGLE_SERVER): string[] {
  return GOOGLE_TAP_TOOLS.map((t) => `mcp__${server}__${t}`);
}

const account = z
  .string()
  .optional()
  .describe("The label of the Google account to use, such as Work or Personal. Leave out when only one account is connected.");

type Spec = {
  name: GoogleToolName;
  app: GoogleApp;
  description: string;
  shape: z.ZodRawShape;
  readOnly: boolean;
  run: (c: GoogleClient, args: any) => Promise<string>;
};

const SPECS: Spec[] = [
  {
    name: "gmail_search",
    app: "gmail",
    readOnly: true,
    description: "Search the person's Gmail with Gmail's search words (from:, subject:, newer_than:7d and so on). Returns up to 20 emails: id, from, subject, date and a short snippet.",
    shape: { account, query: z.string().describe("Gmail search words."), max: z.number().int().min(1).max(20).optional().describe("How many emails, 1 to 20. Default 10.") },
    run: (c, a) => gmailSearch(c, a.query, a.max),
  },
  {
    name: "gmail_read",
    app: "gmail",
    readOnly: true,
    description: "Read one email by its id from gmail_search: from, to, subject, date, the plain text body (cut if very long) and the names of any attachments.",
    shape: { account, id: z.string().min(1).describe("The email id from gmail_search.") },
    run: (c, a) => gmailRead(c, a.id),
  },
  {
    name: "gmail_draft",
    app: "gmail",
    readOnly: false,
    description: "Save an email as a draft in the person's Gmail. It is never sent: the person opens Gmail to check and send it. Give replyTo (an email id) to draft a reply in that thread.",
    shape: {
      account,
      to: z.string().min(1).describe("Who it is to: one address, or several separated by commas."),
      subject: z.string().describe("The subject. May be empty for a reply, which then uses Re: and the original subject."),
      body: z.string().describe("The email text, plain text."),
      replyTo: z.string().optional().describe("The id of the email this replies to."),
    },
    run: (c, a) => gmailDraft(c, a),
  },
  {
    name: "calendar_list",
    app: "calendar",
    readOnly: true,
    description: "List events on the person's main Google Calendar between two times. Returns up to 50: title, start, end, location and how many people are invited.",
    shape: {
      account,
      from: z.string().describe("Start of the range, as a date and time with its offset, such as 2026-11-03T00:00:00+01:00."),
      to: z.string().describe("End of the range, in the same form."),
      max: z.number().int().min(1).max(50).optional().describe("How many events, 1 to 50. Default 50."),
    },
    run: (c, a) => calendarList(c, a.from, a.to, a.max),
  },
  {
    name: "calendar_free",
    app: "calendar",
    readOnly: true,
    description: "Find free times of at least a given length on the person's main Google Calendar between two times. Choose a range that covers the hours the person wants (for example their working day).",
    shape: {
      account,
      from: z.string().describe("Start of the range, as a date and time with its offset."),
      to: z.string().describe("End of the range, in the same form."),
      minutes: z.number().int().min(5).max(1440).describe("How long the free time must be, in minutes."),
    },
    run: (c, a) => calendarFree(c, a.from, a.to, a.minutes),
  },
  {
    name: "calendar_create",
    app: "calendar",
    readOnly: false,
    description: "Add an event to the person's main Google Calendar. The person must tap to approve it first. If attendees are given, Google emails them an invitation.",
    shape: {
      account,
      title: z.string().min(1).describe("The event's title."),
      start: z.string().describe("Start, as a date and time with its offset (2026-11-03T14:00:00+01:00), or a date (2026-11-03) for an all day event."),
      end: z.string().describe("End, in the same form. For an all day event, the day after the last day."),
      attendees: z.array(z.string()).optional().describe("Email addresses to invite."),
      description: z.string().optional().describe("Notes for the event."),
      location: z.string().optional().describe("Where it happens."),
    },
    run: (c, a) => calendarCreate(c, a),
  },
  {
    name: "drive_search",
    app: "drive",
    readOnly: true,
    description: "Search the person's Google Drive by file name or words inside. Only files the person opened or picked with this app are visible. Returns up to 20: id, name, type and when it was changed.",
    shape: { account, query: z.string().describe("Words to look for."), max: z.number().int().min(1).max(20).optional().describe("How many files, 1 to 20. Default 10.") },
    run: (c, a) => driveSearch(c, a.query, a.max),
  },
  {
    name: "drive_read",
    app: "drive",
    readOnly: true,
    description: "Read one Drive file by its id as text: Google Docs and Slides as plain text, Sheets as CSV, and plain text files. Cut if very long. Other kinds of file return only their name and type.",
    shape: { account, id: z.string().min(1).describe("The file id from drive_search.") },
    run: (c, a) => driveRead(c, a.id),
  },
];

type Result = { content: { type: "text"; text: string }[]; isError?: boolean };

/** Run one tool for the given deps: pick the account, get its token, call Google, and hand back plain text. */
async function call(deps: GoogleDeps, spec: Spec, args: Record<string, unknown>, extra: unknown): Promise<Result> {
  const used = new Set<string>();
  const signal = (extra as { signal?: AbortSignal } | undefined)?.signal;
  try {
    const client = await clientFor(deps, typeof args.account === "string" ? args.account : undefined, spec.app, used, signal);
    const text = await spec.run(client, args);
    return { content: [{ type: "text", text: scrub(text, used) }] };
  } catch (e) {
    const text = e instanceof GoogleError ? e.message : "Something went wrong talking to Google. Try again in a moment.";
    return { content: [{ type: "text", text: scrub(text, used) }], isError: true };
  }
}

/** The tool definitions, in the SDK's own shape, ready for createSdkMcpServer. */
export function googleTools(deps: GoogleDeps): SdkMcpToolDefinition<any>[] {
  return SPECS.map((spec) => ({
    name: spec.name,
    description: spec.description,
    inputSchema: spec.shape,
    annotations: { readOnlyHint: spec.readOnly, destructiveHint: false, openWorldHint: true },
    ...(GOOGLE_TAP_TOOLS.includes(spec.name) ? { _meta: { [REQUIRES_TAP_META]: true } } : {}),
    handler: (args: Record<string, unknown>, extra: unknown) => call(deps, spec, args, extra),
  }));
}

/** Each tool's input as plain JSON Schema, for anything outside the SDK that wants to show or check it. */
export function googleToolSchemas(): Record<GoogleToolName, unknown> {
  return Object.fromEntries(SPECS.map((s) => [s.name, z.toJSONSchema(z.object(s.shape))])) as Record<GoogleToolName, unknown>;
}

/** The in process MCP server. Not wired into any agent here. */
export function googleServer(deps: GoogleDeps, name = GOOGLE_SERVER): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({ name, version: "1.0.0", tools: googleTools(deps) });
}
