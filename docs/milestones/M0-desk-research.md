# M0 desk research: what we checked before the spikes

**Date:** 6 and 7 Oct 2026. **Full detail, claim by claim, with sources:** `M0-desk-research-details.md`.

Before running any spike, we checked every fact the spikes depend on against today's official sources: Apple's and Anthropic's docs, the source code of the libraries we plan to use, package registries, open bug reports, and the apps installed on your Mac. One research agent per spike did the checking. A second agent then re-checked every claim that disagreed with the research docs, trying to prove the first agent wrong.

## The numbers

| | Claims |
|---|---|
| Checked | 129 |
| Confirmed by a current source | 65 |
| Differed from the research docs | 39 |
| ...of which the double check found the doc **wrong** | 34 |
| ...of which the doc was right but worth sharpening | 5 |
| Can only be settled by running the spike | 25 |

Plus 13 quotes and paraphrases of Anthropic's terms, all still accurate. The docs missed some important sentences next to them (finding 4 below).

## The findings that change plans

| # | What the docs said | What's true today | What changes |
|---|---|---|---|
| 1 | Ship Anthropic's binary as a Tauri "externalBin" and tell Tauri not to sign it | Tauri re-signs every externalBin with `--force`, with no setting to skip one. That would replace Anthropic's signature, the most literal kind of "modified" | Copy the binary in through `bundle.macOS.files`, a Tauri setting that copies files into the app without signing them. Spike (b) proves it with a before and after test |
| 2 | Screenshots for Show me how never touch disk | The vision session would write a transcript with the screenshot to disk unless `persistSession: false` is set. Reading the Claude Code binary also suggests it may keep received images in a temp folder | `persistSession: false` added (it tells Claude Code not to save the session to disk). Spike (e) watches the temp folders. If images land there, you choose a fix before M6 |
| 3 | Send images up to about 2380 px for dense screens; whether Claude Code resizes them was an open question | Claude Code shrinks images over 2000 px and recompresses very large ones, which would shift the pointer | Show me how images are capped at 2000 px |
| 4 | The legal page's carve out lets users sign in with their plan, and the only counter text is in the SDK overview | The same legal page also says developers building products, including with the Agent SDK, should use API keys, and must not route requests through users' Free, Pro or Max plans on their behalf. Running Claude Code in a product also requires accepting Anthropic's Commercial Terms | The email to Anthropic now quotes that sentence and asks about it directly. Accepting the Commercial Terms joins your setup list |
| 5 | Run `claude auth status` at launch to detect the login | An open Claude Code bug shows `auth status` can sign users out when their token is near expiry | Never run it on a timer. Routine detection reads the SDK's account info instead |
| 6 | Three login states, and removing two variables protects the plan login | There are four states (plan, API key, cloud, none), and ten more variables (plus one setting) can silently override a plan login. One user report describes $447 billed to the API instead of a Max plan because a stray key won, which is why the list matters | Four states, and a longer strip list, tested in spike (c) |
| 7 | API usage means pasting a key into Companion | `claude auth login --console` lets someone pay by API usage by signing in with Anthropic, so Companion never sees a key | Your decision: offer it as a fourth way in? |
| 8 | ChatGPT for Mac may be native | Since 9 July 2026 it's a Chromium based app that ignores the accessibility switch the docs planned to use | Spike (d) tries a different trigger for it |
| 9 | Electron apps open their accessibility tree when asked | They open it about 2 seconds after being asked. Just reading the app's role opens a basic version at once | Prompt help wakes each app once per session and retries briefly |
| 10 | Save and restore your clipboard (whether Apple's clipboard alert is enforced was an open question) | macOS has an opt in clipboard privacy alert, and Apple removed its preview switch in the 27.2 betas. It may soon be on for everyone | Clipboard restore becomes optional, used only when macOS allows it silently. Don't update to 27.2 before spike (d) |
| 11 | The named Rust crates for reading text and pressing keys | Two are dormant, and `enigo`'s released version crashes when called off the main thread in a Tauri app | Build on Apple's APIs directly through the `objc2` crates (Rust libraries that call Apple's own functions) |
| 12 | The panel can switch "can take typing" on and off at runtime | That setting is fixed per panel type. There's an open bug report that clicking such a panel on macOS 27 makes the app active | Spike (a) tests the real recipe, with a plan B that keeps the docked character from ever taking typing |
| 13 | The fast lane turns off thinking with a low effort setting | Haiku 4.5 ignores effort; thinking must be turned off explicitly. Also, text starting with `/` would run as a Claude Code command | Fixed settings, and Prompt help always wraps your text |
| 14 | Use `whisper-rs`, developed on Codeberg | It works but hasn't changed since March 2026 and has open memory leaks. Handy moved to `transcribe-cpp` | Try `whisper-rs` first, `transcribe-cpp` as plan B |
| 15 | The microphone needs only a usage description | Signed builds also need an audio input entitlement, or they record silence | Added to spike (f) |
| 16 | (missing) | Anthropic's docs ask anyone distributing Claude Code to set `DISABLE_UPDATES=1`, so the bundled copy never tries to update itself | Added |
| 17 | Bun, Tauri and Node versions | Programs compiled with Bun 1.4.0 or 1.4.1 are killed at launch on macOS 27 (a signing bug fixed in 1.4.2). Tauri 2.12.1 makes transparency work without a private API flag. Your Node 18 is too old for the React template | Pinned versions in the setup list |

## Questions the research docs had open, now answered

- **Rive's web runtime licence:** MIT, fine for a commercial app with the notice kept. Idle CPU still needs measuring.
- **Bundling git:** GitHub Desktop's git build is GPL-2.0 and 41 to 66 MB. That's a reason to prefer an "environment doctor" at onboarding over bundling.
- **Entitlements for helper programs:** Tauri applies the app's entitlements file to every signed helper, including the runner.
- **The panel library's real API names:** recorded in the details file.
- **Maintained Whisper bindings:** see finding 14.
- **Does Claude Code resize images:** yes, to 2000 px (finding 3). Spike (e) confirms it on a real run.

## New questions the research raised

- Does Claude Code keep received images in a temp folder on disk? (spike e)
- Will clipboard privacy alerts be on by default in macOS 27.2? (spike d, then again after 27.2 ships)
- Do several Companion processes sharing one plan login sign people out? Open bug reports say they sometimes do. (spike c, then dogfooding)
- Does the macOS 27 panel bug reproduce with our recipe? (spike a)
- How does Claude Code report a Console sign in that has no stored key? (spike c)

## What was updated

- `docs/research/technical_research.md`: every confirmed correction, applied in place, with a corrections log at the top. Open questions updated.
- `docs/research/product_research.md`: the Anthropic terms sentences, how to ask Anthropic, the Show me how quote, and Where was I and Explain marked as confirmed by you for the Alpha. A corrections note at the top.
- `docs/decisions/`: every affected record, with a "Settled by desk research" list.
- `docs/architecture.md`, `AGENTS.md`, the M0 plan and the email draft.

**One thing to know about method:** a few findings come from reading the installed Claude Code binary's minified code, or from open bug reports rather than documentation. Each is labelled that way in the details file, and each one that matters is a check in a spike, not a settled fact.
