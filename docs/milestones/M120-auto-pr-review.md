# M120: Automated pull request review and cross tool integration

Status: plan written (2026-11-24). Founder approved to start the next build.

Builds on M119 (cross repo shared context board and multi agent attention state).

Built so far (24 Nov 2026): only `runner/src/attention.ts` `severityToState` and `prFindingToSession`, tested in `runner/test/m120-pr-review-attention.test.ts`. Nothing calls them yet, so no pull request finding reaches the notch.

## What it does

1. **GitHub review entry.**
   - A pull request event enters Squibby, runs the check (reads the changes, real browser proof, plain words, blast radius), and lands the finding in the attention state.
   - The finding maps to urgency (needs approval, blocked, finished with issues) so the notch can name the agent or the PR that needs the person.

2. **Prioritization.**
   - Map severity levels to the attention ordering Squibby already has, so the top of the list is the PR that needs the person now.

3. **Cross tool integration.**
   - GitHub, GitLab, Bitbucket, MCP, and per IDE / per LLM adapters so the check runs where the code is being written, not only inside Squibby's own task loop.

## Out of scope

- The autonomous fix loop. That is a later milestone.

## Tests

- Runner: review entry and urgency mapping.
- UI: attention ring rendering from the new entry.
- Full suite via scripts/test-all.sh.

## Founder approval

- Plan approved to start (2026-11-24). Feature code follows.
