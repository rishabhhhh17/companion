# Anthropic support's reply, 29 Oct 2026 (Ricardo)

Pasted by the founder into the session on 29 Oct 2026. A short record of what it says, in our words; the email itself is the source.

## What it says
- Our email reached them with an unfilled placeholder where the open question should have been ("[the question your earlier email left open: bundling the Claude binary, or the agreement for Claude Code usage]"). The placeholder is not in any draft kept in this repo; check the next email before it goes.
- **Bundling or redistributing the Claude Code CLI or its extensions inside our own product is not permitted under the standard terms.** It needs a separate agreement. Terms: `@anthropic-ai/claude-code/LICENSE.md` and the third party guidance on the Agent SDK overview (https://platform.claude.com/docs/en/agent-sdk/overview).
- **The pattern they suggest instead:** have the app install Anthropic's own build at first run, or resolve the SDK package through normal package resolution, rather than shipping the platform binary inside the app bundle.
- Support cannot confirm in writing that a specific architecture is or is not covered, and cannot grant an exception. That is contractual: start at https://claude.com/contact-sales with expected volumes, the integration shape, and that the question is about Claude Code distribution terms. The same route covers the first run install question.
- On the managed usage readiness list: not a review, not an approval, not a sign off to launch. As engineering feedback it addresses the points they raised (90 day metadata retention, search by time window and model, a near real time brake with a route level kill switch, per account suspension). Nothing further to add.

## What it changes
- AGENTS.md rule 4 and T04 ship the Claude binary inside the app (`app/vendor/`, `bundle.macOS.files`). Under the standard terms that is not allowed. Recorded in T04; the rule changes only with the founder's yes (rule 19).
- F22 (company pays) is unchanged: still off, still waiting for a written agreement.
