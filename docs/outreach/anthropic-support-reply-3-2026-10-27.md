# Anthropic support, third reply (27 Oct 2026): scope, metadata.user_id, our own logs, the abuse process

**Status:** a support email from "Ricardo from Anthropic", answering the open questions the founder sent after the 23 Oct reply (`anthropic-support-reply-2-2026-10-23.md`). Save the email itself. It is written evidence from a support person, not a signed agreement.

## What it said (summary)
1. **Scope.** What was agreed covers features where **our server calls the Messages API under our own organization key**, billed inside our users' plan. It does **not** cover running Claude Code on our users' behalf. That is the separate question still with the account team.
2. **`metadata.user_id`.** Sending it on each request is good practice and a documented field. Keep it opaque (for example a hash) and free of personal data such as names or email addresses.
3. **We need our own logging.** Anthropic offers no per user cost or usage attribution today. The Usage and Cost API cannot be grouped by `user_id`. Do not design around a report that does not exist. **Our server side log, mapping the hashed user id to a request to a time, is the system of record for any abuse investigation.**
4. **Account notices** go to the organization's **owner, admin and billing** roles. There is no separate security contact field. They recommend pointing those role emails at a monitored shared mailbox.
5. **What the abuse process should include:** published acceptable use terms; per user logging we control; the ability to suspend one account quickly; a monitored abuse contact; detection beyond a daily usage cap.
6. **Restriction, and installing the program at first run:** what was said earlier still stands. Any question about the agreement itself goes to the account team.

## What it settles, and what it does not
| Question | Answer now |
|---|---|
| May the plain API light features be company paid? | Yes, as a support level answer (23 Oct and now), for calls under our own key. Not a signed agreement |
| Is the opaque `metadata.user_id` the right design? | Yes. It is built that way (`usage-proxy/src/userid.ts`) |
| Can Anthropic's reports tell us cost per user? | **No.** Our own log must do it |
| Who gets Anthropic's notices? | Org owner, admin and billing roles. **Founder to point them at a monitored shared mailbox** |
| Is the fixing engine (Claude Code) covered? | **No.** Still with the account team. The managed route keeps refusing it |
| Bundling the program, installing at first run | Unchanged from the earlier answer. Still open for the written yes |

## What we did with it (27 Oct 2026)
- Every request record in the proxy now keeps the opaque id Anthropic saw, Anthropic's own `request-id`, the plan and the time, with counts and cost only (never text). That is the log item 3 asks for. The real store must keep the same fields.
- A new counts only check, `usage-proxy/scripts/signals.ts`, names the owners worth a look beyond the daily cap: near the daily limit on several days, a burst of requests, a sudden jump against their own week. It is a reason to look, never a reason to cut off.
- `docs/legal/abuse-process.md` and `docs/launch/company-paid-go-live-checklist.md` now say how Anthropic's notices reach us and how to trace one to a person.
