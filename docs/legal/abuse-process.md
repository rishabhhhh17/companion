> **DRAFT. Not legal advice. A runbook for one person (the founder), to be checked by a lawyer.**
> Written 24 Oct 2026 for the managed usage route (`usage-proxy/`), which is switched off. It exists because Anthropic's support said (23 Oct 2026) that we need a process to identify and cut off offending accounts. Nothing here is live until the route is. Items marked **[lawyer]** need a decision.

# Abuse process: from a report to a cut off account and back

The usage server keeps no prompts or replies. So we do not find abuse by reading. We find it from **a report** or **a notice from Anthropic**, and we cut off a person using the opaque id on every request.

## 0. What you need ready (before anything arrives)
- The operator environment with `METADATA_USER_ID_SECRET` (the same value the running proxy uses). Without it the lookup cannot work. Back it up somewhere safe, apart from the server: if it is lost, ids Anthropic reports can no longer be matched. **If it is changed, every id changes too**, and older reports cannot be matched. Do not rotate it casually.
- The suspend command: `usage-proxy/scripts/suspend.ts` (see `usage-proxy/README.md`). It needs the real store connected, which is not built yet.
- A place to write down each case: ids and dates only (see step 6).

## 1. How something arrives
| Source | What it contains | Where it lands |
|---|---|---|
| A notice from Anthropic | Usually the opaque `user_id` we sent, a date and the rule involved. Exact form: **not known yet** (see "Who to contact") | [the email address Anthropic uses for us: to confirm] |
| A report from a person | What they saw and when, no copy of the content | [abuse report address: founder to set up] |
| Our own signal | A strange pattern in the counts (for example one account always at its daily limit, many accounts from the same sign up source) | The daily spend check in `docs/launch/company-paid-go-live-checklist.md` |

Open a case number the moment anything arrives: a short reference like `case-2026-11-03-a` (letters, digits, - and _ only). Use it everywhere below.

## 2. Find the owner
- From an Anthropic notice: `bun scripts/suspend.ts --store <store module> --user-id <the id in the notice> --case <case>` (a dry run). It derives each owner's id again with the secret and prints the owner id that matches. Nothing is stored in plain, so this is the only way from the id to the person.
- From a report: it names an account or an email. Find our owner id in the store by that. Then continue with `--owner <owner id>`.
- If it says "No owner matches": check the id was copied whole (64 characters of 0 to 9 and a to f), check the secret is the one in use, and check the date: the owner may have been deleted. Write that down in the case and ask Anthropic for more detail if the notice allows it.

## 3. Check before cutting off
Do not take more than a few minutes on this for a serious notice. Check:
1. **Is the notice real?** Anthropic notices come from an address we have confirmed (placeholder until known). Do not act on a message that only claims to be from Anthropic.
2. **Is it the right person?** The dry run printed one owner id. Look at the counts (not messages, we have none): the plan, the days active, the spend. A burst of use around the notice date fits.
3. **How serious is it?** Anything about children, weapons, or an Anthropic notice that says to stop: cut off first, look after. Everything else: look first, within the target below.
4. **Is it a second offence?** Check the case notes for earlier cases on the same owner.

## 4. How fast (targets, not promises) **[lawyer: do not promise these in public text]**
- Most serious (children, weapons, Anthropic says stop now): within **one hour** of reading the message, during the day you read mail.
- Everything else: within **24 hours**.
- Appeal: first reply within **3 working days**.
You are one person. Write in the case when you were away, so a delay has a reason on record.

## 5. Cut off
1. Run the same command with `--apply`. It revokes every token of that owner and blocks new ones. It says how many tokens were cut.
2. Check it worked: the next request from that person gets a 403 with a plain message saying the account is paused (the tests prove this against the in memory store only).
3. Their Dodo subscription: decide what to do with the money. Pause or cancel in the Dodo dashboard by hand, and refund or not as the terms say **[lawyer: refund wording]**. The suspend command does not touch Dodo.
4. If the notice came from Anthropic, reply to it (once the right contact is known) to say what you did and when.

## 6. Tell the person
Send a short, plain email from the support address, with no accusation beyond the rule:
- Your [Product name] account is paused because of a report that it was used against rule [number and name from the acceptable use page].
- This pauses included usage only. Your own Claude key is not affected.
- You can appeal by replying to this message. We will answer within [3 working days].
Do not copy the notice or any content into the email. If Anthropic asked you not to say why, say only that the account is paused and how to appeal. **[lawyer: can we always say why?]**

## 7. What to record (ids and dates only)
Keep one line per event, in a file only you can read, **never message text, never screenshots, never the person's content**:
`case id | date | source (anthropic / report / own) | owner id | rule number | action (dry run / suspended / restored / appeal received / appeal answered) | who did it`
The store also keeps its own log of suspend and restore (owner id, date, case id). Keep the case file for [retention period: lawyer to decide].

## 8. Appeal and restore
1. The person replies. Read what they say. We cannot check content, so the decision rests on what Anthropic told us, on the person's account, and on judgement.
2. If the pause was a mistake, or the decision is to let them back: `bun scripts/suspend.ts --store <store module> --restore --owner <owner id> --case <case>` (dry run), then with `--apply`. This allows a new sign in. **The old tokens stay dead on purpose**: the person signs in again and gets a new one.
3. Tell them. Record it.
4. If Anthropic gave the notice, tell them it was reviewed.

## 9. After a cut off: things that can go wrong
- **The person signs up again with another email.** The block is on the owner, not the person. Compare signals you have (payment fingerprints in Dodo, the sign up source). A repeat offender is a case note and a manual block on the new owner too.
- **A late payment event.** The suspension is its own flag. A payment event that sets a plan does not lift it. Check once after the first real run that this holds with the real store: not proven yet.
- **The secret leaked.** Anyone with it and a list of owner ids could match ids to people. Change it, accept that old ids can no longer be matched, and note the date in the case file.

## Who to contact at Anthropic
**Not yet known.** The founder asked in an email on 23 Oct 2026 how Anthropic contacts us about misuse and who we contact. Placeholder: [Anthropic abuse or trust and safety contact: to fill in when they answer]. Until then: reply to the thread of the support email (`docs/outreach/anthropic-support-reply-2-2026-10-23.md`) and keep every notice they send.

## Not proven
- The exact shape of an Anthropic notice and whether it will contain the `user_id` we send.
- That `metadata.user_id` is shown to Anthropic's reviewers in the way the docs imply; it is documented as an opaque identifier for the end user, nothing more.
- The suspend command against a real store: only the in memory store exists, and the command is tested against it.
