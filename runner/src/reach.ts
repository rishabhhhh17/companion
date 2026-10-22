// Why a turn with Claude did not finish (HeyClicky v1.0.53 parity, M11). When a request to Claude fails because the
// connection dropped (no network, a name that does not resolve, a timeout) or because Claude is busy on Anthropic's side,
// the work is stopped with that named reason, so the card says it in plain words with Try again (app/src/model.ts
// plainError) and never blames the project or the key. Any other failed request (a refused key, no credit, too many
// requests, a reply cut at its output limit) is stopped with its own kind, so the card can say that plainly too, and Claude
// Code's own text (which names its own /login) is never what the person reads. Used by the agent engine (sdkEngine.ts) and
// the fast and vision lanes (lanes.ts). Plain, testable rules; [verify] on a real Mac with the Wi-Fi off which words and
// status Claude Code really sends (it costs nothing: no request reaches Anthropic).
import { clip, redact } from "./redact.ts";
import { PRODUCT } from "./names.ts";

export type OutOfReach = "no_connection" | "claude_busy";

// Problems with the key, the account or the request itself: never called a connection problem.
const NOT_REACH = new Set(["authentication_failed", "oauth_org_not_allowed", "account_on_hold", "verification_required", "billing_error", "rate_limit", "invalid_request", "model_not_found", "max_output_tokens", "cloud_credential_error"]);
const BUSY_KIND = new Set(["overloaded", "server_error"]);
// Signs that the network itself failed: enough on their own, even for a run that stopped outside a request to Claude.
const NETWORK = /connection error|connection (?:refused|reset|closed|timed out|lost)|\bECONN(?:REFUSED|RESET|ABORTED)\b|\bENOTFOUND\b|\bEAI_AGAIN\b|\bETIMEDOUT\b|\bENETUNREACH\b|\bEHOSTUNREACH\b|\bENETDOWN\b|getaddrinfo|fetch failed|network (?:error|is unreachable)|socket hang up|unable to connect|could not connect|\bUND_ERR/i;
// A request to Claude that got no answer may also only say it timed out ("API Error: Request timed out.") or is offline.
const NO_ANSWER = /timed out|\btimeout\b|\boffline\b/i;

/** Was Claude out of reach? `status`: the HTTP status, null when no answer came at all (Claude Code's api_error_status);
 *  `kind`: Claude Code's own name for the error (SDKAssistantMessageError); `text`: its message. `from`: "api" (usual) for
 *  the words of a request to Claude; "run" for a run that stopped by itself (error_during_execution), which is a connection
 *  problem only with a network marker, never for a bare timeout (a sandbox or a hook can time out with the Mac online).
 *  Null for anything else. */
export function outOfReach(f: { status?: number | null; kind?: string; text?: string; from?: "api" | "run" }): OutOfReach | null {
  const kind = f.kind ?? "", text = String(f.text ?? "");
  if (NOT_REACH.has(kind)) return null;
  if (typeof f.status === "number") return f.status === 529 || (f.status >= 500 && f.status <= 599) ? "claude_busy" : null;
  if (BUSY_KIND.has(kind) || /\boverloaded\b/i.test(text)) return "claude_busy";
  return NETWORK.test(text) || (f.from !== "run" && NO_ANSWER.test(text)) ? "no_connection" : null;
}

/** The engine's stop message for it: the named reason first (agent.ts keeps it as the task's status), then what happened. */
export const reachMessage = (why: OutOfReach, detail: string): string =>
  why === "no_connection" ? `no_connection: ${PRODUCT} could not reach Claude (${detail})` : `claude_busy: Claude is busy or having trouble right now (${detail})`;

// The kinds of failed request Claude Code names (the pinned sdk.d.ts SDKAssistantMessageError) that the card words itself
// (app/src/strings.ts S.claudeStopped). A kind this version does not know is "unknown".
const STOP_KINDS = new Set([...NOT_REACH, "unknown"]);
/** The stop message for a failed request that is not Claude out of reach: its kind first, then what happened, which the card
 *  never shows. */
export const stoppedMessage = (kind: string, detail: string): string => `claude_stopped:${STOP_KINDS.has(kind) ? kind : "unknown"}: Claude stopped (${detail})`;

/** Claude Code's own message about a failed request, seen in the turn (an assistant message with `error`). It is never the
 *  agent's words (the one about a reply cut at its output limit included: "API Error: Claude's response exceeded the ...
 *  output token maximum", read from the pinned binary). */
export type ApiError = { kind: string; text: string };

/** What a turn's result means: null for a turn that finished, else the message to stop it with. `apiError`: the failed
 *  request Claude Code reported in the turn, if any. A limit (error_max_turns, error_max_budget_usd) keeps its own name. A
 *  turn that ended on a failed request is not finished, whatever its subtype says. */
export function turnStop(m: { subtype?: unknown; is_error?: unknown; api_error_status?: unknown; result?: unknown; errors?: unknown }, apiError?: ApiError): string | null {
  const subtype = typeof m.subtype === "string" ? m.subtype : "";
  const plain = subtype === "" || subtype === "success";
  if (subtype.startsWith("error_max_")) return `${subtype}: the run stopped`;
  if (plain && m.is_error !== true) return null;
  const errors = Array.isArray(m.errors) ? m.errors.map(String).join(" ") : "";
  const result = plain ? String(m.result ?? "") : "";
  const detail = clip(redact(result || errors || apiError?.text || "").replace(/\s+/g, " ").trim(), 200) || "no details";
  const status = typeof m.api_error_status === "number" || m.api_error_status === null ? m.api_error_status : undefined;
  const why = outOfReach({ status, kind: apiError?.kind, text: `${apiError?.text ?? ""} ${result}` }) ?? (errors ? outOfReach({ status, kind: apiError?.kind, text: errors, from: "run" }) : null);
  if (why) return reachMessage(why, detail);
  if (apiError) return stoppedMessage(apiError.kind, detail);
  return plain ? stoppedMessage("unknown", detail) : `${subtype}: the run stopped`;
}

/** A stop that is Claude's, named above (out of reach, or a failed request of a known kind). */
const NAMED = /^(no_connection|claude_busy|claude_stopped:[a-z_]+)(?=:)/;
export const isClaudeStop = (msg: string): boolean => NAMED.test(msg);
/** The same stop, for a flow with no Try again (planning, Rescue's look, Research, the lanes, looking at a picture): marked,
 *  so the card says to ask again instead of pointing at a button that is not there. */
export const withoutTryAgain = (msg: string): string => msg.replace(NAMED, "$1 (ask again)");
