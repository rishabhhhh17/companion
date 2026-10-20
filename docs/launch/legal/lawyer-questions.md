> **DRAFT. Not legal advice. A brief for the founder to hand to a lawyer.**
> Prepared 20 Oct 2026. Facts come from the repo (`AGENTS.md`, `docs/alpha/PRIVACY.md`, `docs/status/2026-10-15-legal-checklist.md`, decisions F10, F11, F13, T12, T16, F19, F20, and the code). Where a fact is not proven, it says so. Order is by how much it can stop a launch.

# Questions a lawyer must answer before launch

## Facts that apply to every question

- **Product.** A Mac app (Windows later) for non-engineers who start projects with AI and get stuck. Working name "Companion" (it will change). Direct download, not the App Store. Alpha build 0.1.0, no public release yet.
- **Company.** Founder is a solo first-time founder. Entity not yet formed or not yet decided **[founder to fill in: where the founder lives, whether a company exists]**.
- **Claude.** The app ships Anthropic's Claude Code binary, unmodified and not re-signed, and drives it through the Claude Agent SDK (pinned). The customer supplies their own Claude API key, saved in their macOS Keychain. We never pay for, resell or route Claude usage. We run no server that receives their content. A subscription (claude.ai) sign-in route exists in code behind a remote switch that is **off**, and stays off until Anthropic confirms in writing.
- **What leaves the Mac.** Requests go from the customer's Mac to Anthropic under their key. They can include a picture of one display (only after a hotkey, with a light on first), text read from the screen by the Mac, text in another app's text box (only after a hotkey), the files of a project the customer chose, memory notes, and typed requests. Detail in `docs/alpha/PRIVACY.md`.
- **What stays on the Mac.** Task history, undo snapshots, receipt pictures, memory, settings, a small activity log, optional local counts. A "Delete everything" button removes them (`app/src-tauri/src/wipe.rs`). A support log is written to Downloads and is never sent by the app (`logexport.rs`).
- **No analytics, no account, no servers of ours** in the current build. A phone approvals relay and a Telegram link are planned for later (F09) and are not built.
- **Third parties contacted by the Mac.** Anthropic (the customer's own account), Hugging Face (speech model, on request), Playwright's CDN (browser, on request), GitHub (planned update host, not yet switched on), and git hosts or package registries when the customer opens a link or installs packages.
- **Price.** Not decided. Research hypothesis: about $8 a month or $72 a year, merchant of record, regional prices. No billing code yet.

## 1. Anthropic's Commercial Terms for a product that drives Claude Code with a customer's own key

**Why it matters.** Anthropic's legal page says running Claude Code in a product requires agreeing to the Commercial Terms. This is row 1 of the legal checklist and is **not done**. It can block the whole launch.

**Facts.** See above. The legal page (https://code.claude.com/docs/en/legal-and-compliance) says, in the reading recorded in `docs/status/2026-10-15-legal-checklist.md`: do not pay for, resell or intermediate end users' Claude usage; each user authenticates with their own key, plan or cloud credential; do not modify the binary or remove authentication methods; do not use the Claude or Anthropic names or logos in the product's name or suggest endorsement; follow the Usage Policy. We believe we meet these. Evidence: checksum compared before and after signing (tested); key kept in the Keychain and scrubbed from agent subprocesses (`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`); the plan route is off.

**Ask.**
1. Do the Commercial Terms apply to us as a company that only distributes the app, when the customer is the one with the Anthropic account? Which entity signs?
2. Do the Commercial Terms allow us to bundle the binary in our installer and redistribute it? Is a separate redistribution or partner agreement needed?
3. Are we allowed to say in the app "your Claude" and "powered by Claude" in plain text? What wording is safe on the website and the store page?
4. Does a customer's use of the app under their own API key bind them to the Commercial Terms or the Consumer Terms? Does our Terms of Use need to flow anything down?
5. The legal page is ambiguous about a customer signing in with their own plan inside Anthropic's own flow. What exact written confirmation should we ask Anthropic for, and who do we ask?
6. Anthropic may enforce its rules without notice. What should our terms say about the app stopping to work?
7. Does the AI output, or the images we send, raise any Anthropic data or usage question for a customer on zero data retention?

## 2. Screen capture, text reading, and data sent to a model provider

**Why it matters.** The app sends pictures of a customer's screen and text from other apps to Anthropic. The screen can show other people's personal data, confidential work, and third party material. Consent and notice need to be right.

**Facts.** Hotkey only, never in the background, never on a timer (AGENTS.md rules 5 and 8). A visible light comes on first. Pictures are held in memory and not written to disk by Companion. Claude Code, which the app runs, writes a copy of images it is sent to its own temp folder. We point that folder at a RAM drive and erase it after each answer (`runner/src/ramdisk.ts`). **Whether this satisfies "never written to disk" is open, not proven on a real Mac in a written test.** Before sending, the Mac's text reader finds card numbers, bank numbers, keys and tokens and the app blacks them out. This is pattern matching and can miss things. Password managers' windows and the app's own windows are left out of pictures. Password boxes, password managers, Keychain Access, Passwords and System Settings are never read for Prompt help. The first time each app is read, the customer chooses Always, Once or Never. macOS asks for Screen Recording and Accessibility permission on first use.

**Ask.**
1. Is our in-app notice (the light, the first-use explanation, the Privacy Policy table) enough consent for sending a picture of the screen to a model provider? Do we need an explicit "I agree" step the first time?
2. Who is the controller or "business" for this data: the customer, Anthropic, or us? We never receive it, but we design what is sent. Does that make us a controller?
3. The customer may have other people's data on screen. What should our Terms say about their duty to have the right to share it? Does the app need a "do not use on confidential material" warning at capture time?
4. Is a RAM drive that is erased after each answer an acceptable basis to say "never written to disk"? If not, what exact wording is safe? (Founder options noted in `docs/research/technical_research.md` around spike (e).)
5. Employer devices: if a customer uses the app on a work Mac, who is liable for what leaves it?
6. Should "off the record" tasks be described in the policy, and how exactly?

## 3. EU and UK GDPR basics

**Why it matters.** Customers in the EU and UK will download it.

**Facts.** We hold almost no personal data: no account, no analytics, no content. We will hold whatever the payment provider shares with us (name, email, country, order), any support email, and the optional log file if a customer chooses to send one. The support log is scrubbed (home folder, user name, computer name, project names, identifiers, key-like text and email addresses removed) but the scrubbing is automatic and **has been tested on made up and one real log, not on many real crash reports**. The app contacts Hugging Face, Playwright's CDN, GitHub (later) and others from the customer's IP address, only on a button press.

**Ask.**
1. Are we a controller, a processor or neither for the data that goes from the customer's Mac to Anthropic?
2. Do we need an EU or UK representative (Article 27) given we have no content and little personal data?
3. What lawful basis and what retention should the Privacy Policy state for billing and support records?
4. Do we need a DPA with the payment provider and with Anthropic? Do we need one to offer to customers?
5. International transfers of the little we hold, and customers' own transfers to Anthropic (US): is anything required of us?
6. Does a "Delete everything" button plus a policy meet access, erasure and portability duties for what we hold?
7. Is a record of processing activities or a DPIA needed given screen capture and microphone use? (We think the voice audio never leaves the Mac, and the code shows the speech model runs on the Mac.)
8. Cookie or ePrivacy rules for the website (not the app). We plan no analytics.

## 4. India and US entity questions

**Why it matters.** The founder is, as far as the repo says, a solo first-time founder. The entity decides who signs Anthropic's terms, who takes the money, who is liable, and which law governs.

**Facts.** **[founder to fill in: country of residence, tax status, any existing company.]** The research mentions pricing in rupees payable by UPI through a merchant of record. YC is not a focus (F12). Apple Developer ID signing and notarization are waiting on Apple for an account (the account owner's legal name appears to users).

**Ask.**
1. Which entity should sign Anthropic's Commercial Terms, the Apple Developer account, and the payment provider agreement? Sole proprietor, an Indian private limited company, a US LLC or a Delaware C corp?
2. Selling digital software from India to the world: GST and export rules, foreign exchange receipts, and RBI rules for a merchant of record payout.
3. Selling to US customers from a non-US entity: US sales tax or nexus exposure if the merchant of record does not cover it.
4. Which governing law and forum should the Terms choose? Consequences for consumers in the EU, UK and US.
5. Liability shield and insurance for a product whose agent can change customers' files.
6. Does the Indian DPDP Act apply to us, and what does it ask for with so little data held?
7. Does an Indian founder using a US company (or the reverse) change the answers above?

## 5. Microphone and recording laws

**Why it matters.** Hold-to-talk listens through the Mac's microphone. Other people's voices could be captured.

**Facts.** The microphone is used only while the customer holds the talk keys, with a visible indicator, and macOS asks for permission on first use. Audio is turned into words on the Mac by a local speech model (whisper). The audio is never saved and never sent. The words go into the box and are sent to Claude only if the customer sends them. A list of project names (package names, file and folder names, never file contents, values or keys) is given to the speech model on the Mac to improve recognition. A "presentation mode" can check whether a call app is in front and whether the camera or microphone is in use, never the content, and can be turned off. The app does not record calls.

**Ask.**
1. Do any all-party-consent wiretap laws (some US states, some countries) apply to a hold-to-talk dictation tool that does not store audio? What notice should we show?
2. What should the Terms say about speaking near other people, or on a call?
3. Is Apple's required microphone usage text sufficient, or do we need more?
4. Does on-device recognition with no storage change any biometric or voiceprint law question (for example Illinois BIPA, GDPR special category data)? We do not create a voiceprint on purpose.

## 6. Children

**Why it matters.** The audience is "non engineers who start projects with AI". It could attract teenagers.

**Facts.** The app needs an Anthropic API key and a payment method on an Anthropic Console account. Anthropic has its own minimum age. We collect no age and have no account. There is no children's feature. **[founder: confirm there is no age question in the first run.]**

**Ask.**
1. What minimum age should the Terms and Privacy Policy state (13, 16, 18)?
2. Do COPPA, the UK Age Appropriate Design Code or similar apply to a tool that does not collect data and requires an adult's API account?
3. Does the screen capture of a minor's screen raise anything for us if a parent shares a device?

## 7. Licence for any copied MIT code

**Why it matters.** MIT asks for the notice to travel with copied code.

**Facts.** `THIRD_PARTY_NOTICES.md` says no third party source file is copied into the repo. One MIT project (Clicky by Farza) prompted two ideas (asking Computer Use for click positions and checking other displays), and its licence text is included. The code (`runner/src/aim.ts`) is described as new. This was **not independently checked** by a diff or a code similarity scan. The app ships 353 libraries listed with their licences in `app/ACKNOWLEDGEMENTS.txt`. Five Rust crates are MPL-2.0. The Claude binary is Anthropic's and unmodified. The speech model (MIT) is downloaded, not shipped. Playwright's installer adds a small ffmpeg build the app does not use.

**Ask.**
1. Is an idea taken from an MIT project, with no copied code, enough with only a credit? Should we run a code similarity check first?
2. Is the way we keep notices (an in-app Acknowledgements page and a repo file) enough for MIT, Apache-2.0, BSD and MPL-2.0 for a binary only release?
3. MPL-2.0: any duty beyond not editing those crates, or giving out source for MPL files if we ever edit them?
4. Is the Playwright ffmpeg that gets downloaded (LGPL or GPL, depending on the build) a problem when we do not run it?
5. Is the Agent SDK licence ("All rights reserved. Use is subject to the Legal Agreements") compatible with bundling it in a paid app, given the Commercial Terms?
6. Does a future licence for ffmpeg (F19 wants wider video formats) need advice before it is added?

## 8. The product name

**Why it matters.** "Companion" is a placeholder. Every name will change (AGENTS.md). A name clash or an Anthropic trademark problem would force a rename after launch.

**Facts.** Names live in one strings file. The research (`docs/rename.md`) exists on a rename. The Anthropic legal page forbids using Claude or Anthropic in the product's own name or logo. The bundle identifier is `dev.companion.app`. The word "Companion" is common and used by many software products. Competitors named in the research include HeyClicky and others.

**Ask.**
1. Which shortlisted names are clear in the US, EU, UK and India (software class 9 and 42), and at the app level, domain and social handles?
2. What search and filing should happen before the public launch? Filing in India first, the US first, or the Madrid system?
3. Does "[name] for Claude" or "works with Claude" wording in marketing need Anthropic's written permission?
4. The `dev.companion.app` identifier and the Keychain item name show up on customers' Macs. Is a rename after release a problem for keeping the key and data?

## 9. Other items worth a lawyer's time

- **Agent liability.** The app's agent can change files. The Terms say Undo is not a guarantee. Is the wording and the limit of liability enforceable where the customers are?
- **AI output.** Should there be a warning that AI results can be wrong or insecure, and who owns the output?
- **Auto update.** Updates are built but not switched on. When on, a daily request goes to the release host. Any notice needed?
- **Apple.** Notarization and the Developer ID account are pending. Developer Program License Agreement duties for direct distribution.
- **Export controls and sanctions** for a download that includes crypto (Keychain use, TLS) and a customer base worldwide.
- **Accessibility law** (for example the European Accessibility Act) for the app and the website. Some accessibility work is done; it has not been audited.
- **Website.** Cookie banner, terms of sale, and the "building in public" content and changelog.
- **Beta and alpha friends.** Whether the friends alpha needs a short agreement or a clear "as is" message before the public terms exist.
