# M124: Squibby for teams, the team layer

Status: plan written and built 28 Nov 2026 (branch m124/team, not committed until the suite is green). Not tried on a real Mac; the server is not deployed (TEAMS_ON off). The founder said "continue building whatever is promised on the website" (28 Nov 2026). The site's teams, pricing and features pages promise a team layer and mark it "planned, not built"; this milestone builds it. Branch m124/team, on top of m123/asked.

## What the site promises (teams.html, pricing.html, features.html)

1. **A receipt for every change, shared with the team.** Works on one Mac today; sharing with a team is planned.
2. **Everything across the team, with proof.** One view of every change from every person and every AI tool, the receipt behind each verdict. "The admin view comes with the team plan."
3. **House rules for everyone.** One set of rules for the whole team, every person's AI in every tool. Rules only ever make things stricter.
4. **One bill.** Waits on payments (switched off until accounts go live, F31, M116). Not in this milestone.

Studio (client go live reports) and Business (single sign on, audit logs) are later plans; not here.

## Design

- **Server** (usage-proxy, Cloudflare free tier, the same account server as M116): one Durable Object per team.
  - `POST /v1/teams` make a team (the maker is its admin) and get an invite code.
  - `POST /v1/teams/join` with the invite code and a display name the person types.
  - `GET /v1/teams/<id>` members, roles, the team's rules. Members only.
  - `POST /v1/teams/<id>/receipts` one receipt summary; `GET` the latest receipts. Members only.
  - `PUT /v1/teams/<id>/rules` admin only. The same five kinds as house rules, at most 50.
  - `POST /v1/teams/<id>/leave`; `DELETE /v1/teams/<id>/members/<name>` admin only; `POST /v1/teams/<id>/invite` a new code (the old one stops working).
  - Signed in only (the Squibby sign in, never a Claude key). Off unless `TEAMS_ON`.
- **What a shared receipt holds:** the person's typed name, the project's name (never its folder), the AI tool, the verdict, up to six plain lines of what changed and what was checked, flags and what you asked (counts). Never code, file contents, paths, keys or the conversation. Redacted on the Mac, checked again on the server.
- **Engine:** sharing is off until the person joins a team and turns on "Share my receipts with my team" (rule 13: nothing leaves the Mac without a yes). Team rules are fetched and added to the project's own house rules, never replacing them, so they can only make things stricter.
- **App:** a Team page: join or make a team, the team's receipts (the admin view), the team's rules (admins edit), leave.

## Rules this keeps

- Never pay for, resell or route model usage (rule 1): the team layer carries receipts and rules only.
- Nothing about a person's work leaves the Mac without their yes; a receipt is the redacted summary only.
- Safety lives in code: team rules are enforced by the same house rule code (rule 12).
- Memory rules (rule 15): nothing about health, money, relationships, moods or secrets; no conversation is shared.

## Order, tests first

1. Server: team store and routes, with tests (abuse, membership, admin only, sizes, redaction check, off switch).
2. Engine: the team client (join, make, share, fetch rules), the receipt summary builder (redaction tested), rules merged stricter only.
3. Protocol and app: the Team page, the share switch, the rules view.
4. Site copy where the stamps change; CHANGELOG.

## Not in this milestone

One bill and seat billing (payments are off), Studio client reports, single sign on and audit logs.

## Built (28 Nov 2026)

- Server: `usage-proxy/src/teams.ts` (team object ops), `usage-proxy/src/team-routes.ts` (routes, `cleanReceipt`, `cleanRules`), wired in `worker.ts` behind `TEAMS_ON`. Tests: `usage-proxy/test/m124-teams.test.ts`.
- Engine: `runner/src/team.ts` (`TeamClient`, `receiptSummary`), `rules.ts` `setTeamRules` (team rules added to each project's own, strict kinds only), `main.ts` commands, `agent.ts` and `review/service.ts` hand each finished check's summary to the sharer (never off the record or a practice). Tests: `runner/test/m124-team.test.ts`, additions in `agent-retry.test.ts` and `review-service.test.ts`.
- Protocol: `team.show/make/join/leave/share/rules/invite/remove`, event `team.state`.
- App: `teamPanel.tsx` and `teamState.ts`, mounted in History beside This week and Your numbers. Tests: `app/src/m124.test.ts`.
- Known limits: the team's receipts are fetched on a press (no live push); seat billing waits for payments; the team page has no picture of the app (the shared summary is words only, by design).
- Studio, the go live report for a client: `m76Panels.tsx` ShareReport gets "Copy a link for a client" (the same page that is saved, through `receipt.share`, M123 slice 5). The report page passes the link server's `checkPage` (tested in `app/src/m124.test.ts`).
