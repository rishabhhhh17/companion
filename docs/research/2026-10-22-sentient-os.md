# Sentient OS: can we use it? (22 Oct 2026)

The founder sent an Instagram reel (fensyy19, "Your Mac just got smarter") for a Mac app called Sentient OS and asked if it is open source and usable for us. Checked live on 22 Oct 2026 from its GitHub page and its LICENSING.md. Only the repo's own words are used; I did not read its code.

## What it is
- A Mac app for Apple silicon (M1 or newer, macOS 15.4+), written in Swift. Repo: Sentient-OS-Labs/sentient-os ([github.com/Sentient-OS-Labs/sentient-os](https://github.com/Sentient-OS-Labs/sentient-os)).
- **Overnight knowledge:** at 3 AM it wakes the Mac, and a small on device model (Gemma 4 E4B, run through its own copy of LiteRT-LM on the GPU) reads what is new in mail, messages, notes and files, and builds a knowledge base of folders and text files.
- **Sidekick:** a computer use agent with its own cursor that clicks, types, attaches files and switches windows, using screenshots. Started by clicking the notch, tapping right Command to type, or holding it to talk.
- **Double Tap:** double tap right Command in a reply box and it drafts a reply in your writing style, left unsent for you to review.
- **Models:** the small on device one for the overnight work; for the hard parts you pick a frontier model: your ChatGPT or Claude account, an API key, OpenRouter or your own endpoint. It has a relay for a free OpenAI route for early users.
- **Business:** "enterprise: work integrations, commercial licensing and support". The consumer app is free.

## Is it open source? Yes, but not for us to copy
- **AGPL-3.0, with a paid commercial licence** (dual licensing; contributors sign a CLA so they can sell both). Its LICENSING.md: anything that incorporates it or offers it as a service must be released under the AGPL too; using it in a proprietary product needs a commercial licence from them.
- **So we do not copy, adapt or port its code.** Squibby is a closed, paid product, and one borrowed file would force us to open all of it or pay them. The same rule we keep for Tangerine's code.
- It is also a different build (Swift, native) from ours (Tauri, Rust and TypeScript), so there is little to reuse even if the licence allowed it.

## What is fair to learn from (ideas and public behaviour, not code)
- **Words and clip style.** The reel is a few one word captions (asked, prices, process, command, review, context) over close ups of a real Mac. One task per clip. Invite codes in the caption. We can make the same kind of clip about a stuck project going from red to green.
- **A tap to talk or type key** (right Command). We already have hold to talk and a card hotkey.
- **Draft a reply, never send it.** The same promise as our Prompt help (show a diff, paste back on accept, never send).
- **The questions in its comments** are the questions ours will get: does it need a paid ChatGPT plan, does it work offline, how is it different from ChatGPT's own app. Our answers should be ready before launch.

## Where we choose differently, on purpose
| Sentient OS | Squibby | Why |
|---|---|---|
| Reads mail, messages and files every night (Full Disk Access) | Never watches passively; the screen, other apps' text and the microphone only on a hotkey with a light first | Rules 5 and 6 |
| Double tap of a modifier key | Hotkeys that are real key combinations | Rule 8: nothing reads key events or asks for Input Monitoring. A double tap of Command needs to watch keys. [verify how it does it] |
| Does tasks for you in other apps with its own cursor | Fixes and proves projects, undo, receipts, explains why | Our niche is people who build with AI and get stuck |
| Learns your life | Memory you can read and edit; never health, money, relationships or moods | Rule 15 |

## Where it could matter
- It is a **competitor for the "Mac AI that knows my context" idea**, and a free one. We should not compete on that. Our hero (find the problem, fix it, prove it, explain it, with undo) is not what it does.
- **Its reel is proof that this launch format works** (invite codes, short clips, a free app). Worth copying as a format, not as code.
