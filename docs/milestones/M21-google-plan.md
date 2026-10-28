# M21: Google (sign in with Google, and connect Gmail, Calendar and Drive)

**Decided by the founder, 29 Oct 2026:** "both": a Squibby account you sign into with Google, and connecting Google apps the way HeyClicky does (several accounts, labelled). The same day M15 to M20 were merged into main so the repo can be cloned on a PC.

## What HeyClicky has (changelog, newest 23 Oct 2026)
Connectors to Gmail, Google Calendar, Google Workspace and Notion; several accounts per connected app with labels like Work or Personal; agents that act on them with "Allow once", "Always allow" and "Not now".

## The rules this must keep
- Google's sign in page opens in the person's own browser, never inside Squibby (the same rule as Claude's sign in, rule 2). Squibby never sees a Google password.
- Tokens live in the Keychain, held by the shell; the engine gets a short lived access token only for the request it is making. Nothing about a mailbox, calendar or file is stored except what a task's answer shows (rule 6: read on the person's request, indexed on the device only, deleted on disconnect).
- Sending an email, creating or changing a calendar event, and sharing or deleting a file always wait for a tap (rule 13). Drafts are fine.
- Disconnecting deletes that account's tokens at once and tells Google to revoke them.

## Part A: Sign in with Google
1. **The shell (Rust) runs Google's sign in:** PKCE with a loopback redirect on 127.0.0.1 (T15), the browser opens Google's own page, the code comes back to the loopback, the shell exchanges it and keeps the refresh token in the Keychain. Only the name, email and picture from the ID token are shown.
2. **Settings, Account:** "Sign in with Google", who is signed in, Sign out. The first run offers it as an optional step; nothing needs it today (your own Claude key still works without any account).
3. **The usage proxy** gets a "sign in with Google" route that checks the ID token with Google's public keys and gives back a Squibby token (built and tested, still not deployed: F22's switch is unchanged).

## Part B: Connect Google apps
4. **Connect a Google account** in Settings, Connections: pick Gmail, Calendar and Drive (each asks Google for its own permission), name it Work or Personal; several accounts at once.
5. **Tools the AI can use when you ask:** Gmail: search, read, draft (never send without a tap); Calendar: list, find a free time, create an event (tap first); Drive: search and read the files you open or pick. They run in the engine as Squibby's own tools, with the account chosen by its label.
6. **Disconnect** removes the account, its tokens and anything kept from it.

## What only the founder can do (Google's console)
1. Make a Google Cloud project, set up the OAuth consent screen (External, in Testing), and add yourself and testers as test users (up to 100).
2. Make an OAuth client of type Desktop app; put its client id in `app/google.json` (the id is not a secret for a desktop app using PKCE; nothing secret goes in the repo).
3. Turn on the Gmail, Calendar and Drive APIs.
4. **Before a public launch:** Gmail's read scopes are "restricted", so Google requires a security assessment (our earlier estimate $540 to $4,500 a year, 6 to 10 weeks). Until then Google limits the app to 100 test users. Calendar and Drive (with the per file scope) are "sensitive", which needs Google's review but no paid assessment.

## How it is built
Tests first for every risky part: the PKCE pair and the sign in address, the loopback answer (state must match, only the first answer counts, it closes itself), token storage and refresh, the ID token check (signature, audience, issuer, expiry) on the proxy, every tool's request and its "tap first" rule, and disconnect deleting everything. All tests run without a network (Google is a stand in). The full suite and the app build after each part; nothing merged without the founder.
