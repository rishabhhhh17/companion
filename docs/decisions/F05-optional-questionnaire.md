# F05. Optional questionnaire, then visible learning

- **Status:** Fixed. Founder decision; do not reopen without the founder.
- **Date:** 2026-10-06
- **Source:** product_research.md section 1, decision 5
- **Related:** F07, F11, T02, T14

## Decision
Onboarding has an optional questionnaire. After that, the companion learns from the user over time, and always visibly.

## Why
- A setup form before anything works kills first session value (product_research.md section 11).
- Value comes before forms. Duolingo saw about 20% more daily users after letting people try a lesson before signing up (secondhand). Appcues (vendor) says aim for three questions, cap at five (product_research.md section 4).
- The target is a working agent, or a first Prompt help or Show me how result, within five minutes of install (product_research.md section 4).

## What this means for the build
- At most five questions, skippable, asked by the character. Each answer visibly changes the next screen and is saved in the memory page (product_research.md section 4).
- The five: what you are building, how technical you are, how much it should do on its own, how you like updates, when it should stay quiet. Each maps to real behaviour, such as Drive defaults, message length or presentation mode (product_research.md section 4).
- A demo project runs before anything is connected (product_research.md section 4).
- The profile learns only from explicit signals inside Companion: questionnaire answers, approvals and rejections, undo clicks, corrections, stated preferences (product_research.md section 8).
- Project memory may be filled in from the granted folder and agent runs, always visibly and with its source, so there is never a setup form (product_research.md section 8).
- The "What I know about you" page shows the source of every line, with Edit and Forget, plus Pause, Erase all and an off the record switch. A toast with Undo for ten seconds follows every save (technical_research.md section 11).
- The profile is a plain file, `profile.md` in Application Support, capped near 200 lines (technical_research.md section 11; T14).
- Claude Code's auto memory is turned off with `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, so nothing is remembered where the user cannot see it (technical_research.md section 3; T02).
- Never saved: health, money, relationships, moods, secrets, anything from other apps or the screen. Tests must prove it (technical_research.md section 19, pitfall 43).
- Lands in M8; a fresh user must reach a working agent or a first Prompt help result within 5 minutes (technical_research.md section 18).

## What it rules out
- Section 11 row: a setup "Brief" form before anything works, replaced by memory without forms and the optional questionnaire.
- Section 11 row: memory synced to the cloud in v1.
- Hidden memory, and mood check ins (product_research.md section 4, manners 7).

## Revisit only if
The founder decides to.
