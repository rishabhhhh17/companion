# Message for Anthropic sales (send through https://claude.com/contact-sales)

Written 29 Oct 2026 after support's reply (`anthropic-support-reply-4-2026-10-29.md`). The founder sends it by hand. Every line is filled in; read it once before sending.

---

**Subject:** Claude Code distribution terms for a desktop app built on the Agent SDK

Hi,

I'm Rishabh, founder of Squibby, a Mac app that helps people who build with AI finish their projects. Anthropic support (Ricardo, 29 Oct 2026) pointed me here for a question about Claude Code distribution terms.

**The integration:**
- Squibby is a desktop app built on the Claude Agent SDK, which runs Claude Code on the person's own Mac to read, fix and test their project.
- People bring their own Claude: their own Anthropic API key, kept in the macOS Keychain. We don't pay for, resell or route anyone's usage.
- Following support's guidance, the app no longer ships the Claude Code binary inside its bundle. On first run it installs Anthropic's own build: the exact `@anthropic-ai/claude-agent-sdk-darwin-arm64` version our SDK is pinned to, from the public npm registry. We check its hash against our lockfile and its Anthropic signature before using it, and we never change or re-sign it.

**Expected volumes:** 1,000 to 10,000 people in the first year.

**What I'm asking:**
1. Is installing Anthropic's own build at first run, as described, within the standard terms? If not, what agreement would cover it?
2. If an agreement would allow us to ship the binary inside the app instead, what would it involve?
3. Separately, we've built (but not switched on) an option where we pay for usage for people who don't have an Anthropic account. Support said that needs an agreement too. Who's the right person to talk to about that?

Thanks,
Rishabh
Squibby
