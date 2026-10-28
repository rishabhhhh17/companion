// The shared part of the Google tools (M21 Part B): which account a call uses, how a request goes to Google, and how
// Google's answers turn into plain words. The app's Rust shell owns sign in, refresh and the Keychain; this module only
// asks it for a fresh access token per call through `token(label)`. It never stores a token, never logs one, and scrubs
// any token it used out of every text it hands back (AGENTS.md rule 2).

export type GoogleApp = "gmail" | "calendar" | "drive";
export const APP_NAMES: Record<GoogleApp, string> = { gmail: "Gmail", calendar: "Google Calendar", drive: "Google Drive" };

/** One connected Google account, as the shell describes it. `label` is the name the person gave it (Work, Personal). */
export type GoogleAccount = { label: string; email: string; apps: GoogleApp[] };

export type GoogleDeps = {
  /** The connected accounts. A function so a connect or disconnect in Settings is seen on the next call. */
  accounts: GoogleAccount[] | (() => GoogleAccount[]);
  /** A fresh access token for the account with this label. The shell refreshes it; it may throw if it cannot. */
  token: (label: string) => Promise<string>;
  /** Injectable so tests never touch the network. */
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
};

/** A refusal or failure, already in plain words for the person. */
export class GoogleError extends Error {}

const SETTINGS = "Settings, Connections";

/** The account a call uses. With one account the label may be left out; with several it must be given. */
export function pickAccount(all: GoogleAccount[], label: string | undefined, app: GoogleApp): GoogleAccount {
  if (all.length === 0) throw new GoogleError(`No Google account is connected. Connect one in ${SETTINGS}.`);
  const labels = all.map((a) => a.label).join(", ");
  let account: GoogleAccount | undefined;
  const wanted = label?.trim();
  if (wanted) {
    account = all.find((a) => a.label.toLowerCase() === wanted.toLowerCase());
    if (!account) throw new GoogleError(`There is no Google account called "${wanted}". The connected accounts are: ${labels}.`);
  } else if (all.length === 1) {
    account = all[0];
  } else {
    throw new GoogleError(`Several Google accounts are connected (${labels}). Say which one to use.`);
  }
  if (!account!.apps.includes(app)) {
    throw new GoogleError(`${APP_NAMES[app]} is not connected for the ${account!.label} account. Connect it in ${SETTINGS} first.`);
  }
  return account!;
}

/** Cut text to `max` characters, saying so when it was cut. */
export function cap(text: string, max: number, what = "text"): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n(Cut here: the ${what} is longer than ${max} characters.)`;
}

/** Take every token used in this call out of a text before it leaves the module. */
export function scrub(text: string, tokens: Iterable<string>): string {
  let out = text;
  for (const t of tokens) if (t) out = out.split(t).join("[hidden]");
  return out;
}

/** One call's way to talk to Google for one account: the bearer token goes only into the Authorization header. */
export type GoogleClient = {
  account: GoogleAccount;
  /** JSON in, JSON out. */
  json<T = unknown>(url: string, init?: { method?: string; body?: unknown }): Promise<T>;
  /** Plain text out (exports and file contents). */
  text(url: string): Promise<string>;
};

export async function clientFor(
  deps: GoogleDeps,
  label: string | undefined,
  app: GoogleApp,
  used: Set<string>,
  signal?: AbortSignal,
): Promise<GoogleClient> {
  const all = typeof deps.accounts === "function" ? deps.accounts() : deps.accounts;
  const account = pickAccount(all, label, app);
  const doFetch = deps.fetch ?? ((u: string, i?: RequestInit) => fetch(u, i));
  let token: string;
  try {
    token = await deps.token(account.label);
  } catch {
    throw new GoogleError(noToken(account));
  }
  if (typeof token !== "string" || !token.trim()) throw new GoogleError(noToken(account));
  used.add(token);

  async function send(url: string, init: { method?: string; body?: unknown } | undefined, accept: string): Promise<Response> {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: accept };
    let body: string | undefined;
    if (init?.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(init.body);
    }
    let res: Response;
    try {
      res = await doFetch(url, { method: init?.method ?? "GET", headers, body, signal });
    } catch (e) {
      if (signal?.aborted || (e as Error)?.name === "AbortError") throw new GoogleError("Stopped before Google answered.");
      throw new GoogleError("I could not reach Google. Check the internet connection and try again.");
    }
    if (!res.ok) throw new GoogleError(await explain(res, account, app));
    return res;
  }

  return {
    account,
    async json<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
      const res = await send(url, init, "application/json");
      const raw = await res.text();
      if (!raw) return {} as T;
      try {
        return JSON.parse(raw) as T;
      } catch {
        throw new GoogleError("Google sent back an answer I could not read. Try again in a moment.");
      }
    },
    async text(url: string): Promise<string> {
      const res = await send(url, undefined, "*/*");
      return await res.text();
    },
  };
}

function noToken(a: GoogleAccount): string {
  return `I could not get access to the ${a.label} Google account. Connect it again in ${SETTINGS}.`;
}

/** Turn a Google error answer into plain words. Google's own message is kept short and only as a detail. */
async function explain(res: Response, account: GoogleAccount, app: GoogleApp): Promise<string> {
  let message = "";
  let reasons: string[] = [];
  try {
    const body = (await res.json()) as { error?: { message?: string; status?: string; errors?: { reason?: string }[]; details?: { reason?: string }[] } };
    message = String(body?.error?.message ?? "");
    reasons = [
      String(body?.error?.status ?? ""),
      ...(body?.error?.errors ?? []).map((e) => String(e?.reason ?? "")),
      ...(body?.error?.details ?? []).map((e) => String(e?.reason ?? "")),
    ];
  } catch {
    // Not JSON; the status alone says enough.
  }
  const has = (...r: string[]) => reasons.some((x) => r.includes(x));
  const detail = message ? ` Google said: ${message.replace(/\s+/g, " ").slice(0, 200)}` : "";
  if (res.status === 429 || has("rateLimitExceeded", "userRateLimitExceeded", "RESOURCE_EXHAUSTED", "RATE_LIMIT_EXCEEDED")) {
    return "Google says there have been too many requests. Wait a minute, then try again.";
  }
  if (res.status === 401) {
    return `Google did not accept the sign in for the ${account.label} account. Connect it again in ${SETTINGS}.`;
  }
  if (res.status === 403 && has("insufficientPermissions", "ACCESS_TOKEN_SCOPE_INSUFFICIENT", "PERMISSION_DENIED", "forbidden")) {
    return `The ${account.label} account has not given permission for this in ${APP_NAMES[app]}. Connect ${APP_NAMES[app]} again in ${SETTINGS}.${detail}`;
  }
  if (res.status === 404) return `Google could not find that in ${APP_NAMES[app]} for the ${account.label} account.`;
  return `Google said no (error ${res.status}).${detail}`;
}
