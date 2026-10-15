# What the terms require before launch (read 15 Oct 2026)

Source: Anthropic's "Legal and compliance" page for Claude Code (https://code.claude.com/docs/en/legal-and-compliance), the SDK's LICENSE.md ("All rights reserved. Use is subject to the Legal Agreements"), and the licences of everything Companion is built from. Not legal advice; the founder should have a lawyer read the first two rows.

| # | Requirement | Where it comes from | Status |
|---|---|---|---|
| 1 | **Agree to Anthropic's Commercial Terms of Service** before shipping a product that runs Claude Code ("preinstalling or running Claude Code in your products ... requires agreeing to our Commercial Terms of Service") | Legal page, "Can customers offer Claude Code in their products?" | **Founder: not done.** A company account and the terms must be accepted before the first public build |
| 2 | The Claude Code binary must not be modified, and authentication methods must not be removed or restricted | same | Done: the build compares the binary's checksum before and after signing; tests cover it |
| 3 | Do not pay for, resell or intermediate end users' Claude usage; each user authenticates with their own key, plan or cloud credential | same | Done by design (rule 1): the person's key stays in their Keychain |
| 4 | Do not use the Claude Code or Anthropic names or logos in the product's own name, logo or in a way that suggests Anthropic built, endorses or partners with it. Saying in plain text that the product runs Claude Code is allowed | same | Done so far: the words in the app say "your Claude" factually; no logos. Keep it that way on the website. The product name (still to be chosen) must not contain Claude or Anthropic |
| 5 | Developers building products should use API key authentication; Anthropic does not permit offering Claude.ai login in your own app, routing through plan credentials, or collecting or storing Claude.ai credentials. An end user signing in to the unmodified binary with their own plan is described as not restricted when a platform hosts Claude Code | "Authentication and credential use" | Done: API key is the default; the plan route is off behind a switch (rule 3). The page reads as if a plan sign in inside Anthropic's own flow may be fine, but it is ambiguous: **ask Anthropic in writing** before turning it on |
| 6 | Follow Anthropic's Usage Policy | same | The product's own terms of use for friends should say so |
| 7 | **Notices for open source software** (MIT, Apache, BSD ask that the notice travels with the program) | each library's licence | Done: `app/ACKNOWLEDGEMENTS.txt` (353 libraries) ships inside the app and opens from Settings; a check in the suite fails if it goes stale |
| 8 | Weak copyleft: 5 Rust crates are MPL-2.0 (a file level licence: their own files stay open, ours do not) | Cargo metadata | No action beyond the notices; do not edit those crates |
| 9 | Whisper speech model (MIT) is downloaded by the person's Mac, not bundled | `voice_mac.rs` | Notice included |
| 10 | Clicky (MIT) prompted two ideas; no code was copied | `THIRD_PARTY_NOTICES.md` | Credited |
| 11 | A privacy policy and terms of service on the website; refund and billing terms if charging | the founder's own list | **Founder: not done** |
| 12 | Apple Developer ID signing and notarization | Apple | **Founder: waiting on Apple** |
