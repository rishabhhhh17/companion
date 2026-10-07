# F07. The Curious path is the whole companion

- **Status:** Fixed. Founder decision; do not reopen without the founder. Updated 7 Oct 2026 after review.
- **Date:** 2026-10-06
- **Source:** product_research.md section 1, decision 7
- **Related:** F03, F04, F08, F11, T10, T11, T12, T13, T15

## Decision
The Curious path is the whole companion, not only "build my project". Prompt help, Show me how (HeyClicky style pointing, which we may borrow), voice in the style of Wispr Flow, Loop Closer, Pattern Catcher, Explain, memory and Build mode all belong to it.

## Why
- Each job alone is being commoditized by a platform. None of them puts all four jobs behind one trusted character that knows your project, proves its work and never watches you (product_research.md section 12; Conclusion).
- The breadth is not a trap because every feature reuses the same four parts: characters, agent engine, memory and trust layer. Prompt help gets better because Build mode knows the project; Loop Closer finds stalled projects because the timeline knows which folders went quiet (product_research.md section 3).
- Prompt help, Show me how and voice cost Companion nothing and bring people back daily, so they sit in the free tier; Plus carries finishing and shipping (product_research.md section 15).

## What this means for the build
- Design the foundation for the whole map in product_research.md section 3 from day one, even for features that ship later. Every feature is a thin client of the shared core (product_research.md header and section 3).
- Three model lanes serve it all: agent sessions for Build, a fast lane for Prompt help and Where was I, a vision session for Show me how (technical_research.md section 1; T10).
- Releases are sliced: Alpha has presence, the ask box, voice, the questionnaire, Prompt help, Show me how, Build mode, memory, Explain and Where was I; v1.1 adds Loop Closer, Pattern Catcher and recaps (product_research.md sections 1 and 18).
- The alpha already records what v1.1 needs in the task log and leaves room for connectors and a scheduler (technical_research.md section 16; T14, T15).
- Show me how borrows from Clicky (MIT) with its licence notice kept. HeyClicky's newer walkthroughs and target rings are closed source (product_research.md section 5; T12).
- "Works with Wispr Flow" means the ask box accepts Wispr's paste and macOS Dictation cleanly (product_research.md section 4; T13).
- Each feature has its own health metric; trim or kill features that miss targets (product_research.md sections 17, 19).

## What it rules out
- Section 11 row: general screen chat as the headline feature, replaced by Show me how.
- Section 11 row: life admin agents (bookings, shopping, errands).
- Section 11 row: a voice engine of our own, or paid cloud speech.
- Selling or positioning on any single feature (product_research.md sections 12, 19).

## Revisit only if
The founder decides to.
