# F29. People pay Squibby, Squibby picks the model and pays for it. Nobody signs in to an AI provider.

- **Status:** Founder decision, 1 Nov 2026.
- **Related:** F10 (bring your own Claude, replaced by this record), F22 (company pays, gated), T02, T03, T10, M50.

## Decision
The founder (1 Nov 2026), in his own words: "I don't want them to log in through any of the LLMs or anything. For everything they do, we decide what LLM it is, because imagine, just like HeyClicky, they just need to pay us, and then we do everything."

What this means:
- A person signs up for Squibby and pays Squibby.
- They never create an API key, never sign in to Claude or to any other AI provider, and never see a choice of provider.
- For every job, Squibby picks the model and pays the bill.

## Why
- The people Squibby is for are not engineers. A key or a provider sign in is the biggest thing stopping them.
- Charging only makes sense when Squibby carries the cost.
- HeyClicky works this way.

## What it changes
- **F10 is replaced.** Bring your own key, the subscription sign in route, and their screens are not part of the product. Code that already exists for them may stay behind switches as a developer and testing tool, never shown to customers.
- **F22's gate still holds for Claude Code.** Anthropic's terms say a product built on Claude Code may not pay for or resell its users' usage, and may not restrict the sign in methods built into Claude Code, unless Anthropic agrees otherwise. So the fixing engine can only run on Squibby's key through Claude Code with a written agreement. The sales message of 1 Nov 2026 asks for exactly that.
- **The route that needs no agreement:**
  - Squibby's own agent loop on the plain Messages API, under Squibby's key. Anthropic support called this "a standard setup" (23 Oct 2026).
  - The same loop can run other providers' models, so "we decide what LLM it is" holds for every job.
  - This becomes the main engine plan unless Anthropic agrees to the Claude Code route first.
- **Rules to update in AGENTS.md** when the build starts:
  - Rule 1 (never pay for or route usage).
  - Rule 2 (the user's key).
  - Rule 3 (the API key route as the polished default).
  - Rule 4 (the shipped Claude binary).

  They stay as written until the engine milestone's plan is approved, because code still depends on them.

## Revisit only if
Anthropic or another provider changes its terms, or the costs of paying for every user make the plans unworkable.
