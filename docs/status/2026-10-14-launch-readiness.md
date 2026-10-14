# Launch readiness, 14 Oct 2026

Refreshes `2026-10-12-launch-readiness.md`. Same columns. **Built** = code exists and the full suite passes (runner 1395, Rust shell 265 plus 4 ignored, pages 278, exit 0). **Real Claude** = also checked with a real Claude run on the test login. **Person tried** = the founder used it on a real Mac. **Nothing in this table has been tried by a person yet** (nothing since 9 Oct). Source of truth for scope: `docs/decisions/F17-teaching-engine-and-launch-scope.md`.

## M10, the friends preview, against F17

| Part | Built | Real check | Left or weak |
|---|---|---|---|
| Point at the problem, visual receipt, your turn, reactions, open Lovable/Bolt/Replit projects | Yes (before 12 Oct) | Yes, as in the 12 Oct table | Real Cursor, Screen Recording, a real Vercel deploy |
| Fast lane fix (Explain and diagrams no longer wrapped as Prompt help) | Yes | 4 of 4 Explain requests and the diagram re-run | none |
| Sample stuck moment, practice run in the first run | Yes | Real Claude fixed it 3 of 3 (small model) and once with Sonnet | The first run in the built app |
| Draw it for me (hand drawn sketch) | Yes | Real diagram named the true cause 3 of 3 | How it looks beside a real app. Draw-or-circle-to-ask cut by the founder |
| Walkthrough engine (15 step cap, data lessons, progress log, resume, proof per step, failed step never repeated) | Yes | Machine tests only; the bundled engine answers walk.list with all 7 lessons | A full lesson on a real screen |
| Rings clipped to their window, cleared if it changes (rule 22) | Yes | Pure logic tested | Real windows, menus, dialogs, several displays |
| Anywhere mode (did that work, no repeats, 15 steps) | Yes | none | A real third party app |
| Lesson packs | Seven lessons, all **drafts** (Vercel x2, Lovable x2, permissions x3) written from the makers' help pages and checked against them | none | Must be walked by a person on real screens. Supabase cut by the founder |
| Settings guidance (own permissions only, by the founder's cut) | Yes: Walk me through it in Settings | none | Real System Settings |
| Beta numbers (local counts, opt in) | Yes | none | Retention and the Sean Ellis score come from the founder's own follow ups |
| Settings, delete everything, log export, installer, privacy note | Yes | Delete everything run against a fake home with a throwaway Keychain | The button flow in the built app |
| Updater | Yes, off until the founder makes the key and a public release repo | Signing tool with a throwaway key; app launched with the plugin | A real update from a real address |
| Spoken replies (Speak to me) | Yes, off by default, Mac's built in voice | Rules and page logic tested without a sound; the build was made and the engine inside it checked | **Never heard by a person**: the voice, speed and wording | 
| Visible progress list in lessons | Yes | none | A real lesson |
| Targeting rule: low confidence draws nothing, screenshot text is a guess unless the app's structure confirms it | Yes (found by the 14 Oct read of the code) | tested | How often soft rings appear on real screens |
| Character | **Parked** | n/a | Designs from the founder |
| Notarized, signed release | Script written, never run | n/a | Apple approval |

## Overall

| Measure | 12 Oct | 14 Oct | Why |
|---|---|---|---|
| Features written and tested by machine | about 85% | about 95% | Everything in F17's friends preview list is built except the character, the packs being unproven drafts, and what needs the founder |
| Also tried by a person on a real Mac | about 25% | about 15% | The built-but-untried pile grew; nothing has been tried since 9 Oct |
| Ready to hand to a stranger | about 45% | about 50% | Installer, settings, updates plumbing and lessons exist; no notarized build, no hands on session |

Judgement calls, not measurements. The second row moves only when the hands on session happens.

## Checked on 14 Oct (a read of the whole code against the rules)

Fixed: the character's endless motions ignored reduce motion; the runner's type check had 5 errors and was not in the suite (now it is); dead code and 18 compiler warnings removed; a spike probe that could read other apps' window titles removed from the shipped program; Show me broke the targeting rule in two places (see the changelog). Found nothing in: network calls, key event APIs, focus stealing, git use, `bypassPermissions`, secrets in the repo, the no em dash rule. Known and left: the product name is spread over about 58 files (`docs/rename.md`); the Show me aim is not yet compared with the Computer Use technique (needs an API key run); the built app was built and its engine checked but not **launched** since 14 Oct's updater fix (a launch shows a window, so it waits for you).

## What blocks launch (all the founder's)

Hands on session on a real Mac; Apple approval and a notarized build; the update key and a public release repo; character designs; a product name; the T12 reading of rule 5; the Mania link; review of INSTALL.md and PRIVACY.md; website, terms, billing, privacy policy, where feedback goes; Anthropic's written word on plan sign in.

## Lessons from building this stretch

- A merge was gated on reading test output once (PR 34) and went in with failures: merges are now gated on `sh scripts/test-all.sh` exiting 0.
- Every second pass review found real bugs, including one that crashed the app at launch (the updater plugin without its config block) while every test passed: always launch the built app after a plugin change.
