// The Google accounts the shell sent (protocol google.accounts, M21): who, for which apps, and a short lived access token
// each. Kept in memory only, replaced whole by each line, and never written, logged or sent on. The shell keeps the lasting
// sign in in the Keychain and sends fresh tokens before these run out (main.rs google_push).
import { GoogleError, type GoogleAccount, type GoogleApp, type GoogleDeps } from "./core.ts";

type Live = GoogleAccount & { token: string; until: number };
const APPS: readonly GoogleApp[] = ["gmail", "calendar", "drive"];
let live: Live[] = [];

/** Takes the shell's line. Anything malformed in it is left out, never guessed. A token is used until a minute before it ends. */
export function setGoogleAccounts(list: unknown, now = Date.now()): number {
  const out: Live[] = [];
  for (const a of Array.isArray(list) ? list : []) {
    if (!a || typeof a !== "object") continue;
    const o = a as Record<string, unknown>;
    if (typeof o.label !== "string" || !o.label.trim() || typeof o.email !== "string" || typeof o.token !== "string" || !o.token) continue;
    const apps = (Array.isArray(o.apps) ? o.apps : []).filter((x): x is GoogleApp => APPS.includes(x as GoogleApp));
    if (!apps.length) continue;
    const secs = typeof o.expiresInSecs === "number" && Number.isFinite(o.expiresInSecs) ? o.expiresInSecs : 3600;
    out.push({ label: o.label.trim(), email: o.email, apps, token: o.token, until: now + Math.max(0, secs - 60) * 1000 });
  }
  live = out;
  return live.length;
}

/** Whether any Google account is connected for some app. */
export function googleConnected(): boolean { return live.length > 0; }

/** What the Google tools need (google/tools.ts): the accounts as they are now, and each one's token while it lasts. */
export function googleDeps(now: () => number = Date.now): GoogleDeps {
  return {
    accounts: () => live.map(({ label, email, apps }) => ({ label, email, apps })),
    token: async (label: string) => {
      const a = live.find((l) => l.label.toLowerCase() === String(label).toLowerCase());
      if (!a) throw new GoogleError(`No Google account is connected as "${label}".`);
      if (now() >= a.until) throw new GoogleError("The Google sign in is being renewed. Try again in a minute.");
      return a.token;
    },
  };
}

/** The line for the model when Google is connected: which accounts, and that they are used only when the person asks. */
export function googleNote(): string {
  if (!live.length) return "";
  const who = live.map((a) => `${a.label} (${a.apps.join(", ")})`).join("; ");
  return `Connected Google accounts: ${who}. Use the google tools only when the person asks about their email, calendar or files. Never send an email (there is no send tool); a calendar event waits for their OK.`;
}
