# M0: Spikes

**Update 8 Oct 2026:** spike (a) is finished (T01 changed) and spike (d) was shortened and passed (`spikes/d-paste/RESULTS.md`). The founder chose to stop running separate hands on spikes: (b), (c), (e), (f) and (g) become checks inside the milestones that need them (M1 to M6), with a hands on test only if one fails. (b) still needs the Apple Developer account for its signed part.

**Status:** approved by the founder on 7 Oct 2026: the trimmed M0, with the Console sign in step in spike (c). Spike (a) runs first, then the founder reviews its result before the rest continue. **Written:** 7 Oct 2026. **Source:** technical doc section 18 (M0 row), product doc section 18 (phase 0). **Desk research behind it:** `docs/milestones/M0-desk-research.md`.

## What M0 is for

Before writing any real code, we run seven small throwaway experiments ("spikes") on your Mac. Each one tries the scariest technical thing in one part of the product and answers a yes or no question. If a spike fails, we find out now, when changing course is cheap, instead of after building on top of it.

Spike code is throwaway. It lives in `spikes/<letter>-<name>/`, never in `app/` or `runner/`. What we keep is the **answer**: each spike ends with a `RESULTS.md` (what passed, the numbers, links to screen recordings kept outside the repo), and the docs are corrected the same day (see "How results are recorded").

> **Words used here**
> - **Notarization:** Apple's automatic malware check. A notarized app opens on other Macs without a scary warning.
> - **Ad hoc signing:** a temporary signature made on your own Mac, with no Apple account. Fine for testing, not for downloads.
> - **Hardened runtime:** Apple's stricter safety mode for an app. Notarization requires it.
> - **Entitlement:** a permission an app declares when it's signed, such as "may use the microphone". Under hardened runtime, anything not declared is blocked.
> - **Gatekeeper:** the macOS check that runs when you open a downloaded app.
> - **DMG:** the disk image file people download to install a Mac app.
> - **Sidecar:** a helper program shipped inside our app, which the app starts. Our runner is one.
> - **SDK:** a code library. Here it's Anthropic's Agent SDK, which runs Claude Code for us.
> - **Electron and Chromium:** Chromium is the open source engine behind Chrome; Electron builds desktop apps on top of it. Claude desktop, Cursor and now ChatGPT use them.
> - **Accessibility tree:** the description of buttons and text boxes that apps give macOS for screen readers. We read other apps' text through it.
> - **Metal:** Apple's way for apps to use the Mac's graphics chip. It makes Whisper fast.
> - **Keychain:** the encrypted password store built into macOS.
> - **Bundle id:** an app's unique name on macOS, like `com.apple.Terminal`. Permission resets use it.

## The seven spikes at a glance

| Spike | The question it answers | Days | Needs paid Apple Developer Program | Needs an external monitor |
|---|---|---|---|---|
| (a) Panel | Can the character float over full screen apps, on every Space, without ever stealing your typing? | 3.5 | No | Yes, for one check |
| (b) Sidecar | Can we ship Anthropic's Claude binary inside our signed, notarized app without changing its signature? | 3 | Yes, for the last day | No |
| (c) Login detection | Can we tell whether you're using an API key, your Claude plan, a cloud account or nothing, without touching any token? | 2 | No | No |
| (d) Text in other apps | Can we read the prompt you're typing in Claude, ChatGPT, Cursor or Lovable and paste a better one back? | 4 | No | No |
| (e) Pointer | Can one screenshot plus Claude plus snapping land a ring on the right button 8 times out of 10? | 4 | No | Yes, for one check |
| (f) Voice | Can holding a key turn speech into text on your Mac about one second after you let go? | 2.5 | No | No |
| (g) Fast lane | Does a small Claude job start showing words within about a second, on both the API key and the plan route? | 2 | No | No |

## Before we start: your setup checklist

Things only you can do: they need your password, your identity, your money or your accounts. Claude Code drives everything else.

### Start today (they take days to come back)

1. **Apple Developer Program.** Enrol as an individual at developer.apple.com/programs ($99 a year). Use an Apple Account with two factor authentication and your legal name as on your ID. Approval can take from a day to a couple of weeks, and brand new teams have sometimes waited another 1 to 2 weeks before notarization works (error 7000, reported in 2026 forum threads). Only spike (b)'s last day needs it, so everything else carries on while you wait.
2. **Anthropic Console account and Commercial Terms.** Create an organization at platform.claude.com. Anthropic's legal page says that a product which runs Claude Code requires agreeing to Anthropic's Commercial Terms, and the Console organization is where that happens. Add about $5 to $10 of prepaid credit and set a low monthly spend limit.
3. **API key for the spikes.** In the Console, create a key called `companion-spike`. Store it in your Mac's Keychain yourself by running `security add-generic-password -s companion-spike -a anthropic -w` in Terminal; it asks for the key without showing it. Spikes read it from there. If Spotlight clipboard history is on, turn it off before you copy the key. Never paste it into this chat or into any file in the repo. Delete it when M0 ends. (If the Console won't take your card, international US dollar payments may need enabling with your bank. Spikes (c) and (g) can test their error paths with a fake key until it works.)
4. **Your Claude plan.** Confirm you have an active Claude Pro or Max plan, for testing the plan route in spikes (c) and (g). Also open `~/.zshrc` and check whether it exports `ANTHROPIC_API_KEY`, `CLAUDE_CONFIG_DIR` or `CLAUDE_CODE_OAUTH_TOKEN`. Just note yes or no; don't paste values anywhere.
5. **Send the question to Anthropic.** The draft is in `docs/outreach/anthropic-subscription-question.md`, with where to send it.
6. **Don't update to macOS 27.2** until spike (d) is done. Its clipboard privacy test relies on a switch Apple removed in the 27.2 betas.

### Installs (Day 1, about an hour, mostly waiting)

| What | How | Why |
|---|---|---|
| Point developer tools at Xcode | `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`, then open Xcode once to accept the licence | Spike (e)'s screen capture library needs the full Xcode SDK. Needs your Mac password |
| Rust | The official rustup command from rustup.rs | Every Tauri spike |
| Bun 1.4.2 or newer | `brew install oven-sh/bun/bun` | The runner. Programs compiled with Bun 1.4.0 or 1.4.1 are killed at launch on macOS 27 (a signing bug fixed in 1.4.2) |
| cmake | `brew install cmake` | Building the Whisper library in spike (f) |
| Node 22 LTS | `brew install node@22` or nvm | Your Node 18 is too old for the React template (Vite 8 needs Node 20.19 or newer) |
| Tauri CLI 2.12.1 | `cargo install tauri-cli --version "=2.12.1" --locked` | Pin 2.12.1, not 2.12.0: it makes transparent windows work without a private API flag |
| Free Apple Development certificate (recommended, Day 1) | Xcode, Settings, Accounts: add your Apple ID, then Manage Certificates, +, Apple Development. Free, about 10 minutes. Not the paid Developer Program | Without it, macOS forgets Accessibility and Screen Recording grants after every rebuild of a spike, which looks like broken code |

### Accounts and apps for the test screens

- Free **Vercel** and **Supabase** accounts with one sample project each, signed in, in Safari and Chrome (spike e).
- A free **Lovable** account, plus **claude.ai** and **chatgpt.com** signed in, in Chrome and Safari (spike d).
- Already installed and fine: Claude desktop, ChatGPT desktop, Cursor, Chrome, Safari, Wispr Flow, Zoom.
- No password manager to install: the Apple Passwords app stands in for one.

### Hardware

- **An external monitor for one afternoon,** with an HDMI cable (your MacBook Pro has an HDMI port). A 1080p one is best, since it runs at 1x scale. An HDMI dummy plug (a few hundred rupees) covers the unplug test but not the pointer test. Without one, those two checks are marked "not run", never "passed".

### Rules while spikes run

- Grant permissions only when a spike asks for them, and note which. We remove them all at the end of M0 with the commands below.
- If an unexpected permission prompt appears (Accessibility, Input Monitoring, Screen Recording, Automation, Keychain), click **Don't Allow** and tell Claude Code. It may be a failure we need to record.
- Never run `tccutil reset` without a bundle id after it. Without one, every app on your Mac loses that permission.
- Copy a key or a password only while Spotlight clipboard history is off. Spike (d) turns it on for one test, then off again.
- Screen recordings, and any other spike evidence that could show a key (the Supabase and Vercel test screens include key pages), stay outside the repo, for example in a folder in your Documents. `RESULTS.md` links to them.

### Spike bundle ids and the end of M0 cleanup

| Spike app | Bundle id | Permissions it may get |
|---|---|---|
| (a) Panel spike | `dev.companion.spike.panel` | None (getting one is a failure) |
| (b) Sidecar spike | `dev.companion.spike.sidecar` | None expected |
| (d) Paste Spike | `dev.companion.spike.paste` | Accessibility |
| (e) Pointer spike, day 2 | `dev.companion.spike.pointer` | Screen Recording, Accessibility |
| (f) Voice Spike | `dev.companion.spike.voice` | Microphone |

Spikes (c) and (g) are scripts and ask for no permission. Spike (e) day 1 runs from Terminal (`com.apple.Terminal`), and Terminal's grants come off right after day 1 (see spike e).

At the end of M0, run these in Terminal, exactly as written (or switch the same apps off in System Settings, Privacy & Security):

```
tccutil reset Accessibility dev.companion.spike.paste
tccutil reset ScreenCapture dev.companion.spike.pointer
tccutil reset Accessibility dev.companion.spike.pointer
tccutil reset Microphone dev.companion.spike.voice
```

Then check System Settings, Privacy & Security: no spike app is listed under Accessibility, Input Monitoring, Screen Recording or Microphone. Delete the spike API keys in the Console too, and the Keychain item with `security delete-generic-password -s companion-spike -a anthropic`.

## Order and schedule

The seven estimates add up to 21 working days. Two things come off that:

- Each of (a), (b), (d) and (f) counts about half a day of first time Rust and Tauri project setup (creating the project, the first slow compile, fixing build errors). That happens once, so about 1.5 days come off. The installs themselves take only about an hour.
- Running (c) and (g) together saves half a day (spike c's own estimate).

So the full plan is **about 19 working days, roughly 4 weeks full time**. That's well over the 2 weeks the technical doc assumed: the desk research found more to check than the doc expected. Two shorter versions:

- **Trimmed: about 17 working days, roughly 3.5 weeks.** It moves three extras, about 2 days in all, to the milestones that need them anyway: the power numbers (spike a) to M2, the pasted versus typed Claude Code study (spike d) to M5, and Hindi voice quality (spike f) to M2.
- **Lean: about 15 working days, roughly 3 weeks.** Trimmed, plus moving spike (f) voice into M2, since Handy, our reference app, already shows the voice stack works.

My recommendation is trimmed. It's the first item in "Decisions for you" at the end. Technical doc section 18 still shows M0 as weeks 1 to 2, so the week numbers for M0 and every later milestone move by about 2 weeks, depending on your choice.

The founder chose **trimmed** on 7 Oct 2026, and asked to run spike (a) first and review its result before the others. The table below is the full plan's order; the trimmed changes are noted under it.

| When | Spike | Why in this order |
|---|---|---|
| Week 1 | Setup, then (g) fast lane and (c) login detection together, then start (a) panel | (g) and (c) are cheapest, with no permissions and no Tauri. They build the small runner the others reuse, and their plan route results go straight into the Anthropic conversation. (a) is the biggest "does the product even work" risk, so it starts next |
| Week 2 | Finish (a) panel, then (b) sidecar, unsigned part | (a) must finish before (e), which reuses its panel recipe. Everything in (b) except notarization works with ad hoc signing while Apple reviews your enrolment |
| Week 3 | (d) text in other apps, then start (e) pointer | (d) has no hard dependency on (a): it accepts with a hotkey, not a click on a card, so it can also run alongside (a) |
| Week 4 | Finish (e) pointer, then (f) voice | (e) reuses (a)'s overlay. (f) is the most self contained, so it goes last |
| Whenever Apple approves | (b) sidecar, signed and notarized part | One day of signing rounds, plus re-running (a) and (f) checks inside the signed app |

**Under trimmed,** no row drops: the three extras leave (a), (d) and (f), so week 4 ends about 2 days early. **Under lean,** the (f) voice row also moves to M2, so week 4 holds only the rest of (e), and the signed (b) part re-runs only (a)'s checks.

---

## Spike (a): a panel that never steals your typing

**The risk.** The character must sit on the screen edge, show over full screen apps and on every Space, and never take keyboard focus from the app you're typing in. If macOS won't allow that from a Tauri window, the whole presence design changes.

**What we'll build.**
- A tiny Tauri 2.12.1 app with one 56 by 56 point window, turned into a non activating panel with `tauri-nspanel` 2.1.0. Plain HTML, no React.
- **Result (7 Oct 2026):** tauri-nspanel's panels take the front on click on macOS 27; M2 uses panels we create natively instead (spikes a2 and a3, see T01 and `spikes/a-panel/RESULTS.md`).
- The app runs as an "accessory" app: no Dock icon, never the active app. It must not activate at launch (Tauri's default is to activate, so we turn that off explicitly).
- A debug readout inside the panel: a click counter, "panel has keyboard: yes or no", the app in front, the current display.
- A small text box that takes typing only when clicked, then hands typing straight back.
- A switch that cycles window levels (floating, status, screen saver) and Space behaviours, so we find the lowest level that works over full screen apps on macOS 27.
- Docking on the right edge inside the screen's work area (never under the menu bar or Dock), remembered per display, redocked when a display is unplugged.
- (Moved to M2 by the trimmed M0: the power test, transparent against opaque, animating against still, measured with `powermetrics`.)
- The same checks repeated in a release build opened from Finder.

**How we'll know it passed.**
- While you type a sentence in Terminal, opening the app from Finder doesn't interrupt you: Terminal stays named in the menu bar, no Dock icon appears, no letters are lost.
- You type continuously in Terminal and click the character 10 times mid sentence. Every letter lands in Terminal, and the click counter goes up by exactly 10.
- Clicking the panel's text box lets you type there while the menu bar still says Terminal. Pressing Esc sends your next keystrokes back to Terminal without clicking it.
- With Safari full screen, the character is visible on top, and clicking it doesn't throw Safari out of full screen. The same with Terminal full screen.
- On three desktops plus a full screen app, the character stays in the same place on every Space, doesn't show up in Cmd+Tab, and survives leaving full screen 5 times.
- Unplugging the external monitor brings the character back to the built in screen within 2 seconds, on the same edge.
- With Stage Manager on, the character stays visible and isn't pulled into the stage strip.
- No permission prompt at any point, and the app is listed under none of Accessibility, Input Monitoring or Screen Recording afterwards.

**What could go wrong, and plan B.**
- *An open bug report says that on macOS 27, clicking a panel that can take typing makes the app active.* That would break "never steal focus." Plan B: the docked character can never take typing, and typing happens in a separate small card window opened only when you click or press the ask hotkey.
- *The "floating" level sits below full screen apps on macOS 27* (an Apple engineer said so in May 2026; other apps show the opposite). Plan B: step up to status, then screen saver level, and test which is lowest.
- *The panel disappears after a full screen app exits* (a 2025 report). Plan B: a different Space behaviour, or re-apply the settings when the Space changes.
- *Release builds behave differently from dev builds* (an old Tauri report). Plan B: mark the app as an accessory app in `Info.plist` and test the signed build again in spike (b).
- *A transparent panel costs noticeable power on your 120 Hz screen.* Plan B: make the docked tab opaque and keep transparency only for the brief card animation.

**What you do by hand.** Create three desktops (Mission Control, click + twice). Have Safari and Terminal ready to go full screen. Turn Stage Manager on and off when asked. Borrow the external monitor for the unplug test. Record the key tests with Cmd+Shift+5 and save the recordings outside the repo. Optional: ask a friend on macOS 15 or 26 to run the release build for 15 minutes, since we can only test macOS 27 here.

**Estimate.** 3.5 working days.

---

## Spike (b): ship Anthropic's binary without touching its signature

**The risk.** Anthropic's terms say Claude Code must ship unmodified. Re-signing it with our certificate replaces Anthropic's signature, which is the most literal kind of "modified." We also need Apple to notarize an app that contains a binary signed by another company.

**What the desk research already found (high impact).** Tauri re-signs every bundled helper program ("externalBin") with `--force`, and there's no setting to skip one. Following the research as first written would have replaced Anthropic's signature (fixed 7 Oct). The fix: ship the runner as an externalBin, but copy Anthropic's binary into the app through `bundle.macOS.files`, which Tauri copies without signing. The spike proves this.

**What we'll build.**
- A script that copies the Claude binary byte for byte from the pinned SDK package (`@anthropic-ai/claude-agent-sdk` 0.3.291, which bundles Claude Code 2.1.291) into `spikes/b-sidecar/vendor/claude`, records its SHA-256 fingerprint, and refuses to continue unless the signature is still Anthropic's (team `Q6L2SF6YDW`). The `vendor/` folder is never committed: the binary is 233 MB, more than GitHub accepts, and our repo must not hand out Anthropic's binary. Tauri's `binaries/` folder holds only our runner. (The product will stage it the same way, in `app/vendor/`.)
- A 60 line runner compiled with Bun that finds `claude` next to itself and runs one tiny query ("Reply with exactly PONG", a few cents at most). Its environment includes `DISABLE_UPDATES=1` and `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` (Claude Code then strips keys from any command it starts, while keeping them for its own calls).
- A bare Tauri app with a Run button and a log. Rust reads the key from the `companion-spike` Keychain item with the same `security find-generic-password` command the other spikes use, keeps it in memory and passes it only to the runner. There's no key field, and the webview never sees the key or gets permission to spawn anything.
- A **negative control:** build once the research's original way (Claude as an externalBin) and show the Anthropic signature disappears. Then build the fixed way and show it survives.
- Ad hoc signing first, while Apple reviews your enrolment. Then real signing and notarization once your certificate exists.
- A fallback signing script in case Tauri's signing or Apple's notarization trips over the nested binary.
- A fresh download test: upload the DMG privately, download it in Safari, install, and run it from a brand new macOS user account with no developer tools on its `PATH`. That account has its own Keychain, so it gets its own short lived key (see what you do by hand).

**How we'll know it passed.**
- The downloaded DMG opens with only macOS's normal "downloaded from the Internet, Apple checked it" dialog. No "damaged" or "unidentified developer."
- Clicking Run shows: the runner started, Claude Code reports version 2.1.291, the reply PONG, and a cost estimate under $0.05.
- The running chain is our app, then our runner, then `claude` from inside our app bundle, not a copy elsewhere.
- `codesign` on the bundled `claude` still shows "Developer ID Application: Anthropic PBC (Q6L2SF6YDW)," and its SHA-256 matches the npm package exactly.
- Our own runner and app show your Developer ID with hardened runtime and a timestamp.
- Apple's notary log says "Accepted" for both the app and the DMG, and Gatekeeper reports "Notarized Developer ID."
- After quitting and reopening, it still works and the fingerprint is unchanged, so the binary didn't update itself. We set `DISABLE_UPDATES=1`, which Anthropic's setup docs ask for when you distribute Claude Code yourself.

**What could go wrong, and plan B.**
- *Apple refuses to notarize an app containing another team's signed binary.* No Apple page says this directly either way. Plan B: don't put the binary in the app at all. Copy it from the SDK package into Application Support on first run, still Anthropic signed. Last resort: you install Claude Code with Anthropic's own installer and we point at it.
- *Your enrolment or notarization access takes weeks.* Plan B: everything except notarization runs with ad hoc signing. Open an Apple Developer Support case if error 7000 appears.
- *The runner crashes under hardened runtime for lack of an entitlement.* Plan B: add Bun's other recommended entitlements one at a time and read the crash report.
- *macOS shows folder access prompts in our app's name when Claude reads a project in Desktop or Documents.* We note any prompt we see: they shape onboarding copy.
- *The app is large* (the Claude binary alone is 233 MB). Plan B: Apple Silicon only for the alpha. We measure the real DMG size here.

**What you do by hand.** Enrol in the Apple Developer Program (today). When approved: create a **Developer ID Application** certificate (Xcode, Settings, Accounts, Manage Certificates, +), export a `.p12` backup with a strong password and keep it offline, never in the repo. Set up notarization login with an app specific password and `xcrun notarytool store-credentials`. Approve the macOS prompt that lets `codesign` use your key. Create a second, empty macOS user account for the fresh install test. In that account, create a second, short lived key in the Console, store it with the same `security add-generic-password -s companion-spike -a anthropic -w` command in that account's Terminal, and delete that key in the Console when the test is done. Never move a key through a file, a note or chat.

**Estimate.** 3 working days, plus waiting for Apple.

---

## Spike (c): detect your Claude login without touching it

**The risk.** First run must say honestly how you're connected ("Using your Claude Pro plan", "Using your API key", "Not connected") and make sure that's what agents really use, so a stray key in your shell can never silently bill the wrong account. All without Companion ever reading a token or credential file.

**What the desk research already found.**
- **High impact.** An open Claude Code bug (#95822, with a reproduction) shows that running `claude auth status` when the login token is near expiry can start a token refresh, quit before saving it, and log you out later. So Companion runs `auth status` only while it waits for the Terminal sign in (every 3 seconds, stopping at the first signed in result or after 5 minutes), when you press "Check again", and in diagnostics. Never at first run or launch, and never on a background timer. First run and routine detection instead use a dedicated, long lived SDK session that hasn't been sent a prompt yet. It reads the account info and Claude Code's start up message, which spends no tokens, and because the process stays alive, any token refresh finishes properly. This is not the fast lane's prepared warm process, which can only take a job or close and can't report account info. Whether this check works with no login at all is one of this spike's questions.
- The research originally had three states (API key, plan, none) and missed cloud accounts (fixed 7 Oct). We need four: **Plan**, **API key**, **Cloud**, **Not connected** (plus "Unknown" with details for anything new).
- The list of environment variables to remove before using your plan was longer than the research first said (fixed 7 Oct). Ten more variables, plus the `apiKeyHelper` setting, can silently override a plan login, including `CLAUDE_CODE_OAUTH_TOKEN` and `ANTHROPIC_PROFILE`. One user report describes $447 billed to the API instead of a Max plan, which is why the list matters.
- Setting `CLAUDE_CONFIG_DIR` to its own default path (`~/.claude`) makes Claude Code look in a different Keychain slot (open bug #92252). So Companion never sets it to the default path: it leaves it unset, or adopts the value your shell already exports. A folder at a different path is fine, and that's how this spike tests without touching your real login.
- On the plan route, your claude.ai connectors (mail, drive and so on) load into every session unless we turn them off with `strictMcpConfig`.
- **A fourth way in, approved for testing (decision 2):** `claude auth login --console` lets someone pay by API usage by signing in to their Anthropic Console account in the browser. Companion never sees a key at all.

**What we'll build.**
- A small script using the SDK's own bundled Claude binary (2.1.291, checked to be Anthropic signed), never the `claude` on your `PATH` (2.1.288).
- A throwaway test config folder, `spikes/c-auth/claude-config/` (not the default path, ignored by git). Every check uses it through `CLAUDE_CONFIG_DIR`, except the one "existing login" check. The spike never signs out of your real Claude Code login.
- A function that builds the child environment for each route. It removes every variable that could override your choice, and adds `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`, so commands Claude Code starts itself (Bash, hooks, tool servers) never see a key; Claude Code keeps it for its own calls. Logs show variable names, never values.
- Two detectors. The **SDK check**, used at first run and for routine detection: a long lived streaming session whose prompt hasn't sent anything yet reads `accountInfo()` or `initializationResult()` and the `system/init` message, spending no tokens. And **`auth status`**, used only while waiting for the sign in and when you press "Check again" (which also fills the details panel).
- A "Use my Claude plan" button that opens Terminal running Anthropic's own `claude auth login` against the test folder, then checks `auth status` every 3 seconds for at most 5 minutes, stopping the moment you're signed in. It opens Terminal through a small `.command` file, which needs no extra macOS permission.
- A local page with a big coloured badge (grey Not connected, green Plan, blue API key, purple Cloud, orange Unknown), the buttons (including "Check again"), a details panel, and a "Run a one line test" button that sends one tiny prompt and shows which account answered. Every Claude error code is turned into one plain sentence.
- Approved (decision 2): a "Use my Console account" button that opens Terminal running `claude auth login --console` against the test folder. We record what both detectors report, since nobody knows yet which state a keyless Console sign in shows. Such a sign in may store a profile in `~/.config/anthropic`, outside the test folder, so afterwards we sign it out and check that your normal Claude Code still works on your plan.

**How we'll know it passed.**
- **Not connected:** with the empty test folder, the SDK check turns the badge grey within 3 seconds. Pressing "Check again" runs `auth status`, and it agrees. If the SDK check can't report this state at all, that's recorded (see plan B).
- "Use my Claude plan" opens Terminal by itself, Anthropic's sign in page opens in your browser, and after you approve (signing in to the test folder), the badge turns green within 5 seconds and shows your plan type, without you touching anything else. `auth status` stops running the moment you're signed in.
- The one line test answers on your plan: it reports no API key in use, and your plan type.
- **A stray key is harmless:** starting with a fake `ANTHROPIC_API_KEY` and a fake `CLAUDE_CODE_OAUTH_TOKEN` in the environment, the plan route still shows Plan and still works. With stripping deliberately switched off, it fails with a plain sentence instead of crashing.
- With a real key stored in your Keychain, "Use an API key" turns the badge blue and the test costs under a cent. A wrong key gives the plain "not accepted" sentence.
- A dummy cloud setting shows the purple Cloud badge (no AWS account needed).
- **Sign out:** signing the test folder out (`claude auth logout` with the test folder) and pressing "Check again" brings the badge back to grey. Your real login is never signed out.
- **Existing login:** with `CLAUDE_CONFIG_DIR` unset, one single SDK check sees your existing Claude Code login and shows the right badge, with no Keychain prompt. This is the only check that touches your real login, and it runs once.
- **Next morning** (login token expired), opening the page once still shows Plan through the SDK check (never `auth status` at launch), the test works, and an hour later you're still signed in.
- The Console sign in (decision 2) shows a badge, and what both detectors reported is written down.
- A search of every log finds no key or token, only variable names and states.

**What could go wrong, and plan B.**
- *The SDK check can't tell "not connected" from other failures.* Plan B: when it fails, show Not connected with the sign in buttons and "Check again". `auth status` still never runs by itself at launch.
- *Several Companion processes on one plan login race each other and log you out every few days* (open bug #88583). Two days can't prove it's safe. Plan B: a calm "Sign in again" card that reopens Anthropic's login, the API key route as the polished default, and counting how often it happens while we dogfood.
- *Anthropic says the plan route isn't allowed.* It stays behind the remote switch, off by default. The API key and cloud routes (and the Console sign in, if you approve it) still work.
- *macOS keeps asking for your password for "Claude Code-credentials"* (a known bug). We note it. Companion must never touch that Keychain item itself.
- *You can't easily buy Console credits from India* (international card in US dollars). Plan B: test the error paths with a fake key (free) and finish the real key check when credits arrive.

**What you do by hand.** Check which Claude plan you're on (claude.ai settings). Store the spike API key in your Keychain yourself with `security add-generic-password -s companion-spike -a anthropic -w`, which asks for the key without showing it. Open your `~/.zshrc` and note whether it exports `ANTHROPIC_API_KEY`, `CLAUDE_CONFIG_DIR` or `CLAUDE_CODE_OAUTH_TOKEN`, without pasting any values anywhere. Approve the sign in in your browser (it goes to the test folder). Never sign out of your real Claude Code login during this spike. Open the page again the next morning, and an hour after that. Also approve the Console sign in in your browser (decision 2).

**Estimate.** 2 working days (1.5 if run together with spike g).

---

## Spike (d): read and paste text in other apps

**The risk.** Prompt help must read the prompt you're typing in another app, and paste the improved one back into the same box, without stealing focus, without breaking the app's editor, without losing what was on your clipboard, and never from a password field.

**What the desk research already found.**
- **ChatGPT for Mac is no longer a native app.** Since 9 July 2026 it's a Chromium based app (bundle id `com.openai.codex`) that ignores the switch the research first used to wake up Electron apps' accessibility (fixed 7 Oct). It needs a different trigger.
- Electron apps (Claude desktop, Cursor) build their accessibility tree lazily, and switch it fully on only about 2 seconds after being asked. Simply reading the app's role wakes up the basic tree at once. So the first read in an app may need a short retry, and the switch should stay on for that app's session instead of being toggled per hotkey.
- The text reading crate the research first named (`get-selected-text`) only reads selections and falls back to an AppleScript that triggers an extra "wants to control System Events" prompt. It and one other crate the research named are dormant, and `enigo`'s released version crashes when called off the main thread in a Tauri app. We build on Apple's APIs directly through the `objc2` crates instead (the research was fixed 7 Oct).
- **Clipboard privacy may be about to switch on.** macOS 15.4 introduced alerts when an app reads the clipboard programmatically, as an opt in preview. Apple removed the preview switch in the macOS 27.2 betas without saying why. Companion's "save and restore your clipboard" step would trigger such an alert. So save and restore must become optional, checked before use. **Please don't update to macOS 27.2 until this spike is done.**
- The research originally described how a direct value write breaks rich editors using Chrome's engine, not Safari's (fixed 7 Oct). The conclusion, always paste, stays the same.

**What we'll build.**
- A throwaway Tauri app, "Paste Spike," always built as a real app and opened from Finder (otherwise macOS judges Terminal's permissions, not ours).
- A hotkey to read the focused text box, the same hotkey again to accept, and Esc to cancel. Esc is registered only while a result is waiting.
- A reader that records the app in front, refuses password fields, and climbs a ladder only as far as needed: plain read; read the app's role and retry; Electron's accessibility switch; Chrome's accessibility switch; and finally pressing the app's own Edit > Copy menu item. Every step is timed and logged per app.
- A canned "improved prompt" (no AI call): the original plus a URL, a code span, an emoji and a Hindi word. Plus a long one for the Claude Code test.
- Clipboard handling: save every item, write ours marked "temporary, don't record," paste, check the field really holds the new text, then restore your clipboard only if nothing else touched it.
- Before pasting, check you're still in the same app and the same text box. If not, the text goes on the clipboard and the spike says "copied instead."
- Terminal mode: read only your selection, never send any key, copy the result, and say "Copied, press Cmd+V."
- A small test of whether Claude Code follows a pasted prompt as well as a typed one, since it marks pasted text as possibly untrusted. (Moved to M5 by the trimmed M0.)

**How we'll know it passed.**
- Paste Spike asks for Accessibility once, under its own name, and no other permission prompt ever appears.
- In all six targets (Claude desktop, ChatGPT, claude.ai in Chrome, claude.ai in Safari, Cursor chat, Lovable in Chrome), the text read is exactly what you typed. A warm read takes about half a second or less; the first read in an app may take up to about 2.5 seconds, and is recorded.
- Selecting one word reads only that word.
- Accepting puts the new text in the field, your app stays in front with the cursor still in the box, and nothing lands anywhere else.
- The app's Send button works with the new text, and Enter sends the new text, not the old one.
- Cmd+Z in the app brings the original back within two presses.
- An image you copied before the test is still on your clipboard afterwards, and the temporary text doesn't show up in Spotlight's clipboard history.
- Switching apps between read and accept pastes nothing and says "copied instead."
- On a password field in Safari and in Chrome, the spike refuses and logs no text.
- In Terminal with Claude Code mid task, the spike copies only. Claude Code isn't interrupted and no rewind menu opens.
- The results table records, for each app, what was needed to read it.
- The clipboard privacy test (using Apple's preview switch, which still exists on 27.0.x) records whether an alert appears and its exact words.

**What could go wrong, and plan B.**
- *An app returns nothing on the first hotkey.* Plan B: the retry ladder, then the Edit > Copy menu fallback.
- *A rich editor mishandles select all then paste* (doubled or partial text, a stale Send button). Plan B: compare two ways of selecting, read back after pasting, and if wrong, undo and fall back to "copied, press Cmd+V" for that app.
- *macOS shows a clipboard alert when we save your clipboard.* Plan B: skip save and restore, paste, and tell you plainly that your clipboard now holds the improved prompt.
- *The paste merges with modifier keys you're still holding.* Plan B: wait until you've let go before pasting.
- *macOS forgets the Accessibility grant after every rebuild.* Plan B: sign each build with a free Apple Development certificate so the identity stays the same.

**What you do by hand.** Recommended, done on Day 1 (setup list), about 10 minutes: sign in to Xcode with your Apple ID (Settings, Accounts) and create a free "Apple Development" certificate, so macOS remembers permissions across rebuilds. Allow Paste Spike under Accessibility when asked (don't give Terminal Accessibility). Sign in to claude.ai in Chrome and Safari, the ChatGPT app, Cursor with its chat open, and a free Lovable project. Copy an image in Preview before the clipboard test. Turn on Spotlight clipboard history for the test if it's off. When spike (d) ends, turn it off again and clear it; copy keys or passwords only while it's off. Don't dictate with Wispr Flow during test runs (it also uses the clipboard). Stay on macOS 27.0.x until the clipboard test is done.

**Estimate.** 4 working days.

---

## Spike (e): one screenshot, a pointer on the right button

**The risk.** Show me how is only useful if the ring lands on the right button. Model coordinates drift, images get resized behind our back, and Mac apps expose very different amounts of accessibility information.

**What we'll build.**
- A small Rust program that, on a hotkey, lights a "seeing your screen" indicator first, then takes **one** ScreenCaptureKit capture of the display under the mouse. It leaves out the spike's own windows, Terminal and the Apple Passwords app. The capture stays in memory only and is shown in a preview window so you can check what was captured. It's never saved.
- On device text recognition (Apple Vision) on the captured frame.
- A resize to a size Claude won't resize again: at most 2000 px on the long edge (default about 1280 px), saved as a compact JPEG (see below).
- A small script that sends the image through Anthropic's unmodified Claude binary with only our own tools (`point_at` and `finish`, plus `zoom` if the zoom pass is tried) and `strictMcpConfig: true`, so nothing else loads. Claude also repeats back the image size it saw, so we catch any hidden resize.
- The script runs with `persistSession: false` and with throwaway `CLAUDE_CONFIG_DIR` and `CLAUDE_CODE_TMPDIR` folders, `spikes/e-pointer/claude-config/` and `spikes/e-pointer/claude-tmp/`, never your real `~/.claude`. Git ignores them, and they are deleted at the end of the spike.
- Snapping: use the text box Claude named; otherwise an accessibility hit test, walking up to the nearest button or link; otherwise a fuzzy text match; otherwise a bigger "around here" ring. The log records which signal won.
- A ring and caption drawn in a click through, non activating overlay on the right display, using spike (a)'s recipe.
- Ten fixed questions across System Settings, Supabase and Vercel, plus one trick question whose right answer is "not on this screen."

**What the desk research already found.**
- **High impact, needs this spike to confirm.** Reading the installed Claude Code binary suggests it saves images it receives to a temporary folder (`/tmp/claude-<your user id>/.../images/`). That would break our promise that captures of your screen are never written to disk. The spike watches that folder and its own throwaway folders during real runs.
- Reading the Claude Code 2.1.288 binary also suggests it shrinks images over 2000 x 2000 px (for Sonnet 5.5 and Opus 5.5) and recompresses very large files (above about 3.75 MB). This is still open: the spike confirms it on 2.1.291 by watching for Claude Code's resize note. Either way we resize first, to at most 2000 px on the long edge (about 1280 px by default), and keep the files far smaller, for speed.
- The vision session must also set `persistSession: false`, or the screenshot lands in a transcript on disk.
- The "zoom" step must crop the frame already in memory. A second capture of a screen region would ignore the exclusion list and could include password manager pixels.

**How we'll know it passed.**
- The indicator lights before the capture starts (checked in the log).
- The preview shows only the display under the mouse, with our windows and the Passwords app missing.
- Claude's repeated image size matches what we sent, with no resize note. A deliberately oversized test image does trigger the note, which proves the check works.
- Claude Code's start up message lists only `point_at` and `finish` (and `zoom` if tried), nothing else.
- On the built in Retina screen, at least 8 of 10 questions end with the ring around the correct control, judged by you. The trick question gets "not on this screen."
- The same on an external 1x monitor (marked pending until one is borrowed).
- With Safari full screen on Supabase, the ring appears on top, in the right place.
- Clicking inside the ring presses the real button, and typing continues in the target app.
- After every run, no image or transcript file appears in the two throwaway folders or in `/tmp/claude-<uid>`. Any file found is recorded by path and size only (never opened or copied), then deleted at once. If one appears, that's not a spike failure but a **blocker that needs your decision before M6** (decision 5).
- Timings for every question, against the M6 target of about 2.5 seconds from hotkey to ring.
- Recorded: whether macOS's purple recording indicator shows for one capture and for how long, and the exact wording of every permission alert on macOS 27.

**What could go wrong, and plan B.**
- *Claude Code writes the screenshot to disk.* Then you decide before M6 (decision 5). Only two options keep the promise that captures of your screen are never written to disk: send API key users' Show me how requests straight to Anthropic's Messages API, so images never pass through Claude Code (their key, billed to them); or a supported "no disk" mode from Anthropic. Pointing Claude Code's temp folder at a Companion owned folder and wiping it after each answer still puts your screen on disk for a few seconds, so it changes the promise, exactly as rewording it would. For plan users, unless Anthropic adds a switch, the choice is: Show me how works only with an API key, or the promise changes.
- *The hit test returns nothing useful on web dashboards* (Chrome builds its accessibility tree only when asked), or returns our own window. Plan B: text recognition goes first, and we hit test the target app instead of the whole screen.
- *Claude picks the wrong control too often.* Plan B: a 2000 px image, more text candidates, one try with Opus 5.5, and the zoom pass.
- *Permissions get credited to Terminal during development.* Plan B: day 1 runs from Terminal on purpose; day 2 uses a bundled app signed with a free Apple Development certificate so grants stick. Terminal's grants come off right after day 1.

**What you do by hand.** Switch developer tools to Xcode (setup list). Before day 1, note whether Terminal is already listed under Screen Recording or Accessibility. Day 1 runs from Terminal, so grant Terminal both when asked. While it has them, anything run in Terminal can see your screen and control apps, so if Terminal didn't have them before, remove them right after day 1 with `tccutil reset ScreenCapture com.apple.Terminal` and `tccutil reset Accessibility com.apple.Terminal`. On day 2, grant both to the spike app instead (removed at the end of M0). Sign in to Vercel and Supabase. Open the Passwords app during captures. Borrow the external monitor. Film the menu bar in slow motion with your iPhone during one capture. Mark each ring hit or miss in `RESULTS.md`. The free Apple Development certificate (recommended, Day 1 in the setup list) lets the day 2 app keep its grants across rebuilds.

**Estimate.** 4 working days (range 3 to 6).

---

## Spike (f): hold to talk, transcribed on your Mac

**The risk.** Voice must feel instant, run with no internet, open the microphone only while the key is held, and need no Accessibility or Input Monitoring permission.

**What we'll build.**
- A throwaway Tauri app, "Voice Spike," with a hold to talk hotkey (a normal key plus modifiers, like Control+Option+Space, checked against Claude desktop, ChatGPT and Wispr Flow shortcuts first).
- Key down opens the microphone. Key up closes it at once and runs Whisper's `base` model on the device with Metal acceleration. The model is loaded and warmed when the app starts.
- A window with a status line, a level bar, the transcript, and "release to text: N ms."
- The macOS microphone permission done properly: the usage text in `Info.plist`, plus the audio input entitlement that hardened runtime needs (the research originally missed this; fixed 7 Oct). Without it, signed builds record silence.
- An honest "microphone is off" message when access is denied, never an empty transcript pretending to work.

**What the desk research already found.** The main Rust library for Whisper (`whisper-rs` 0.16.0) still works but hasn't had a commit since March 2026 and has known memory leaks. Handy, our reference app, moved to a newer library, `transcribe-cpp`. We try `whisper-rs` first, since it uses the model files the technical doc names, and switch to `transcribe-cpp` if it fails to build or is slow. Also, Handy's hotkey is not the permission free kind, so we deliberately don't copy that part.

**How we'll know it passed.**
- No microphone prompt and no orange dot at launch.
- First hold: macOS asks for the microphone naming Voice Spike, not Terminal, with our one line reason.
- While held, the orange dot shows and the level bar moves. Released, the dot goes away within about 2 seconds.
- 10 short English sentences: "release to text" has a median of 1.0 second or less, with none over 1.5 seconds (the very first run after launch is recorded separately).
- At least 8 of 10 transcripts are right or have one small word wrong, and the first word isn't clipped.
- Holding the key in silence produces no made up text (Whisper sometimes invents "Thank you").
- The hotkey works with Safari, Terminal and Cursor in front, and once with Terminal's Secure Keyboard Entry on.
- Not listed under Accessibility or Input Monitoring, and no prompt for either.
- Idle for 5 minutes: no orange dot, near 0% CPU.
- **Denied path:** after `tccutil reset Microphone dev.companion.spike.voice`, relaunching and clicking Don't Allow, holding the key shows "Microphone is off" with a working Settings button, not an empty transcript. Turning access back on in Settings and relaunching makes it work again.
- Recorded for information: memory use and cold first run time. (Hindi and Hinglish quality moved to M2 by the trimmed M0.)

**What could go wrong, and plan B.**
- *The library doesn't build on macOS 27.* Plan B: `transcribe-cpp`.
- *The first transcription is slow* (model load, GPU warm up). Plan B: load and warm when voice is switched on; try a smaller model.
- *The first word gets cut off* because opening the microphone takes time. Plan B: show "Listening" only once audio flows.
- *Hindi quality on `base` is poor.* Plan B: let users pick a bigger model and set the language, and describe Hindi support honestly.
- *Users expect to hold just `fn` like Wispr Flow.* The permission free hotkey can't do a modifier alone. We accept a key plus modifiers for v1.

**What you do by hand.** Install cmake and Node 22 (setup list). Download three model files in your browser from Hugging Face (about 380 MB in total; Claude Code gives you the links). Make sure macOS Voice Control is off, since it shows its own orange icon. Click Allow for the microphone. For the denied test, run `tccutil reset Microphone dev.companion.spike.voice` in Terminal (with the bundle id, never without; macOS doesn't ask again until you reset), relaunch Voice Spike and click Don't Allow once, then turn access back on in System Settings, Privacy & Security, Microphone. Read the test sentences aloud in a quiet room.

**Estimate.** 2.5 working days.

---

## Spike (g): the fast lane on both login routes

**The risk.** Prompt help, Where was I and other small jobs must start answering within about a second of the hotkey. Claude Code runs as a separate process, which adds start up time, and nobody publishes numbers for it.

**What we'll build.**
- One benchmark script with a route switch: your API key, or your Claude plan login.
- Fast lane settings: Haiku, no tools at all, and `strictMcpConfig: true`, so your claude.ai connectors (which the plan route otherwise loads automatically) stay off too; thinking off, nothing saved to disk.
- The child environment comes from spike (c)'s function: it strips keys on the plan route and adds `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`.
- Timed runs per route: 20 cold and 20 warm. Each long idle mode (warm after 1, 10 and 30 minutes idle) gets only 3 to 5 runs, and one is enough for 30 minutes. They run one after another with a single parked process, never as several warm processes at once on your plan login. Then one long lived session reused between jobs, and (API key only) a direct Messages API call as the baseline, 20 runs each.
- Measured each time: time to first word, total time, tokens, memory of each Claude process.
- A prompt that starts with `/compact`, to prove it gets rewritten, not run as a command.
- Dismissing a card mid answer, to check it stops cleanly.
- A 30 minute soak on your plan login with Claude desktop open, watching for sign outs.
- A network check from your Wi-Fi to Anthropic, to know the floor from India.

**What the desk research already found.**
- The warm process can be prepared in advance, but its settings, system prompt included, are fixed when it's created. So each job's instructions go in the message, and one generic warm process serves every job.
- Text that starts with `/` would run as a Claude Code command. Prompt help must always wrap your text so it never starts with `/`.
- Haiku 4.5 ignores the "effort" setting; thinking must be turned off explicitly.
- Open reports describe several Claude processes sharing one plan login occasionally signing people out (secondhand). The soak test checks this.

**How we'll know it passed.**
- Both routes produce a results table, and every run's start up message (`system/init`) lists zero tools and the Haiku model.
- Warm, API key route: first words in a median of 1.0 second or less, 18 of 20 within 1.5 seconds. The same for the plan route.
- The warm route is no more than 0.3 seconds slower than the direct Messages API. If the network from India makes even the direct call slower than a second, the target is rewritten around that measured floor.
- A short job uses under about 1,000 input tokens, which proves none of Claude Code's big system prompt is being sent.
- One warm process uses 300 MB or less and almost no CPU when idle, and no stray processes are left after exit.
- The `/compact` prompt comes back rewritten. A dismissed card stops within half a second.
- The 30 minute soak causes no sign outs.

**What could go wrong, and plan B.**
- *Even direct calls from India take over a second.* Plan B: judge against the measured floor, show a local "thinking" animation instantly, and keep fast lane answers short.
- *Claude Code adds a noticeable delay even when warm.* Plan B: API key users go straight to the Messages API (it appears allowed, since it's their key and billed to them; the email asks Anthropic to confirm). Plan users get the long lived session.
- *Many processes on one plan login sign you out.* Plan B: one long lived fast lane session instead of a process per job, never more than one spare.
- *A warm process goes stale after sleep or a long idle.* Plan B: recycle it on a timer and on wake.

**What you do by hand.** Install Bun. Create the Console API key (setup list). Run `claude auth login` yourself and finish in the browser; then `claude auth status` yourself, and tell Claude Code only whether you're signed in. Make sure `~/.zshrc` doesn't export `ANTHROPIC_API_KEY`. Plug in the charger and close heavy apps during timing runs. Keep Claude desktop open during the soak.

**Estimate.** 2 working days. API usage well under $1.

---

## How results are recorded

1. Each spike writes `spikes/<letter>-<name>/RESULTS.md`: every pass check marked passed, failed or not run (never quietly skipped), the numbers, and links to screen recordings. The recordings, and any other evidence that could show a key, stay outside the repo.
2. The same day, every **[verify]** item the spike settled is marked resolved: we update the technical doc and the matching decision record, and `AGENTS.md` too if a rule, a command or the repo map changes.
3. `CHANGELOG.md` gets a plain words line per spike, for building in public.
4. At the end, `docs/milestones/M0-results.md` summarises all seven, plus the M1 plan for your approval.

## What "M0 done" means

Every spike has either passed, or failed with a plan B that you've chosen, and the end of M0 cleanup is done (permissions reset, spike keys deleted). Then we write the M1 plan (the runner core) for your approval. No product code before that.

## Decisions for you

**Decided on 7 Oct 2026:**

1. **M0 length: trimmed** (about 17 working days). Spike (a) runs first, and you review its result before the rest continue.
2. **The Console sign in: test it** in spike (c). Whether to offer it to users is decided in M1.
3. **Undo never writes your git** (F13). The undo helper and per agent worktrees are dropped. When an agent made a commit, Companion shows you the exact git command to undo it, or asks through an approval card. Rule 10 stays exactly as written.
4. **Every user gets the browser check** (F14): proof rungs 1 to 5 for Free and Plus; Plus adds screenshot evidence and the second model review.

**After the spikes, depending on results:**

5. **If spike (e) shows Claude Code keeps your screenshots on disk.** Only two options keep your promise that captures of the user's screen are never written to disk: API key users' Show me how requests go straight to Anthropic's Messages API, so images never pass through Claude Code; or Anthropic adds a supported "no disk" mode. Wiping a Companion owned temp folder after every answer still puts the screen on disk for a few seconds, so it changes the promise, exactly as rewording it would. For plan users, unless Anthropic adds a switch, the choice is: Show me how works only with an API key, or the promise changes. Needed before M6.
6. **If macOS starts showing clipboard alerts** (spike d), Prompt help pastes without restoring your clipboard, and says so. Needed before M5.
7. **Which Whisper library** (spike f): `whisper-rs` if it works well, `transcribe-cpp` otherwise. Low stakes; we'll recommend one from the numbers.
