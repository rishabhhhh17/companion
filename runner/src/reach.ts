// Claude out of reach (HeyClicky v1.0.53 parity, M11). When a request to Claude fails because the connection dropped (no
// network, a name that does not resolve, a timeout) or because Claude is busy on Anthropic's side, the task is stopped with
// that named reason (sdkEngine.ts), so the card says it in plain words with Try again (app/src/model.ts plainError) and
// never blames the project or the key. Plain, testable rules; [verify] on a real Mac with the Wi-Fi off which words and
// status Claude Code really sends (it costs nothing: no request reaches Anthropic).

export type OutOfReach = "no_connection" | "claude_busy";

// Problems with the key, the account or the request itself: never called a connection problem.
const NOT_REACH = new Set(["authentication_failed", "oauth_org_not_allowed", "account_on_hold", "verification_required", "billing_error", "rate_limit", "invalid_request", "model_not_found", "max_output_tokens", "cloud_credential_error"]);
const BUSY_KIND = new Set(["overloaded", "server_error"]);
const NO_ANSWER = /connection error|connection (?:refused|reset|closed|timed out|lost)|\bECONN(?:REFUSED|RESET|ABORTED)\b|\bENOTFOUND\b|\bEAI_AGAIN\b|\bETIMEDOUT\b|\bENETUNREACH\b|\bEHOSTUNREACH\b|\bENETDOWN\b|getaddrinfo|fetch failed|network (?:error|is unreachable)|socket hang up|timed out|\btimeout\b|unable to connect|could not connect|\boffline\b|\bUND_ERR/i;

/** Was Claude out of reach? `status`: the HTTP status, null when no answer came at all (Claude Code's api_error_status);
 *  `kind`: Claude Code's own name for the error (SDKAssistantMessageError); `text`: its message. Null for anything else. */
export function outOfReach(f: { status?: number | null; kind?: string; text?: string }): OutOfReach | null {
  const kind = f.kind ?? "", text = String(f.text ?? "");
  if (NOT_REACH.has(kind)) return null;
  if (typeof f.status === "number") return f.status === 529 || (f.status >= 500 && f.status <= 599) ? "claude_busy" : null;
  if (BUSY_KIND.has(kind) || /\boverloaded\b/i.test(text)) return "claude_busy";
  return NO_ANSWER.test(text) ? "no_connection" : null;
}

/** The engine's stop message for it: the named reason first (agent.ts keeps it as the task's status), then what happened. */
export const reachMessage = (why: OutOfReach, detail: string): string =>
  why === "no_connection" ? `no_connection: Companion could not reach Claude (${detail})` : `claude_busy: Claude is busy or having trouble right now (${detail})`;
