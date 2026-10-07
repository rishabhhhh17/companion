# Draft: question to Anthropic about Claude plans in Companion

**Status:** DRAFT. Not sent. You send it by hand.
**Why:** product doc section 20 rows 1 and 3; technical doc section 3 ("One tension") and section 20 items 1 and 2; decision T03.
**Checked against Anthropic's live pages on 7 Oct 2026** (legal and compliance, Agent SDK overview, authentication, support articles). Details are in `docs/milestones/M0-desk-research-details.md`.

## Where to send it

There is no published email address for this. Anthropic's legal page ends its "Authentication and credential use" section by saying to **contact sales** with questions about permitted authentication methods. So:

1. **Contact sales:** anthropic.com/contact-sales (it redirects to claude.com/contact-sales). For anything that isn't a big enterprise deal, that page sends you to a sales chat assistant. Paste the email there, say the legal page tells you to contact sales about this, and ask for it to be escalated to a named person who can answer in writing.
2. **At the same time, a written support ticket:** sign in to platform.claude.com and use "Get help." Support replies by email, which gives you a paper trail.
3. **Optional, for a named human contact:** apply to the Claude Partner Network (free, claude.com/partners), or Claude for Startups (claude.com/programs/startups; it needs a Console account and a company email address, so it may have to wait until you have a domain).

**A reply from a chatbot is not approval.** Keep going until a named Anthropic employee confirms in writing. Even after a yes, keep the remote switch: the legal page says Anthropic may enforce these rules without notice.

## Before you send

- Create the Console organization and accept the Commercial Terms first (see the M0 setup checklist), then fill in the organization name and ID below.
- Fill in the bracketed parts. If you trim anything, keep questions 1 to 5 word for word. They are what the decision depends on.

---

**Subject:** Written confirmation needed: customer's own Claude plan in a desktop app built on the Agent SDK

Hi,

I'm Rishabh, a student and solo founder. Your legal and compliance page says to contact sales with questions about permitted authentication methods, so I'm writing before we build this part, to get a written answer we can follow exactly.

**What we're building.** Companion (working name) is a Mac app, with Windows later, that helps people who aren't engineers finish software projects. It will run agents in the user's own project folder through the Claude Agent SDK. It will also have smaller features that use Claude:
- rewriting a prompt the user is typing in another app, when they press a hotkey;
- pointing at where to click on one screenshot the user takes with a hotkey;
- a short summary of the user's own Companion tasks, shown automatically when they come back to the computer (they can turn it off), and an optional check question after a task.

Our Console organization is [name, ID], and we accept the Commercial Terms for running Claude Code in our product.

**How Companion is built.**
- We will ship the Claude Code binary from the SDK's npm package unmodified, as a separate executable that keeps Anthropic's signature (we will never re-sign it), on an exact pinned SDK version.
- Every user brings their own Claude. We will never pay for, mark up or resell anyone's usage, and no server of ours will sit between the user and Anthropic or see prompts or responses. We charge only for our own features.
- The default and recommended route is the user's own API key, kept in the macOS Keychain and used only on their Mac: by the Claude Code process, and for some small jobs (such as the prompt rewrite) by direct Messages API calls from our app, always billed to their own key. Commands the agent runs never see the key. Bedrock, Vertex and Foundry credentials work too.
- We identify ourselves with `CLAUDE_AGENT_SDK_CLIENT_APP`, and say "Powered by Claude." We never use "Claude Code" in our name, feature names, labels or logo.

**The option we're asking about.** For users who already pay for a Claude plan, we'd like to let them choose "Use my Claude plan." Companion would open the user's Terminal running the bundled binary's own `claude auth login`, so the user signs in with you, in your browser page. Companion never shows a login form, never sees, stores or sends credentials or tokens, never reads Claude Code's credential files or Keychain items, and never asks anyone to paste a `setup-token` value. While the user signs in, or when they press "Check again," it runs `claude auth status`. Otherwise it reads the SDK's own account info (the plan type) to show which method is active, and starts Agent SDK sessions that use that login.

We've read the relevant text closely and want to be careful, because the pages read differently:
- Your legal page's "Authentication and credential use" section (in text added in late August) says these rules do not prevent "an end user from signing in to the unmodified Claude Code binary with their own Claude subscription."
- The same section says developers building products, including with the Agent SDK, should use API key authentication through Claude Console or a supported cloud provider, and may not "route requests through Free, Pro, or Max plan credentials on behalf of their users."
- The same page says plan sign in is "designed to support ordinary use of Claude Code and other native Anthropic applications," and that Pro and Max limits "assume ordinary, individual usage of Claude Code and the Agent SDK."
- The Agent SDK overview says that, unless previously approved, third party developers may not offer claude.ai login or rate limits.
- Your support article "Use the Claude Agent SDK with your Claude plan" describes third party apps that use a person's plan through the Agent SDK as a category that currently draws from plan limits, while Anthropic reworks its paused Agent SDK credit plan, with notice promised before any change. The "Buy usage bundles" article also mentions third party products that use a person's Claude account.

We read the carve out as possibly covering our flow, but we don't want to assume. Could you confirm in writing:

1. **Is the flow above allowed for a commercial app?** In particular, once the user has signed in through your own flow, does Companion running Agent SDK sessions on that login count as routing requests through plan credentials on the user's behalf?
2. **Does the answer cover features that aren't coding?** On the same login through the SDK: the prompt rewrite (one short Haiku call, no tools), on screen pointing (a vision session whose only tools are our own pointing tools), the automatic return summary and the optional check question. Later, scheduled jobs the user sets up, such as a weekly recap, or drafts of follow up messages the user always sends themselves. Do these, and several Companion processes on one login (an agent, a small text job and a pointing session at the same time), count as "ordinary, individual usage"?
3. **Does offering only the API key route, or switching the plan option off remotely, count as "restricting" a built in authentication method?** We want to keep a remote switch so we can comply immediately if your guidance changes.
4. **On the API key route, may our app also call the Messages API directly with the user's own key for small jobs,** as described above? And is shipping the unmodified, Anthropic signed binary as a separate file inside our own signed app the distribution method you expect?
5. **If any of this needs your approval, how do we get it,** and is there anything we should build in now? For example usage limits, how many Claude Code processes may share one plan login, how we describe the plan option inside the app, or what a returning Agent SDK credit would mean for our users.

Until we hear from you, the plan option stays off and the API key route is the main path. It would help if your answer names the specific features and the sign in flow above, so we can follow it exactly.

**A later question, no rush.** Many of the people we're building for don't have a Claude plan or an API key yet, which makes their first five minutes hard. We understand that products running Claude Code may not pay for usage on a user's behalf, and that reselling needs your express approval under the Commercial Terms. If we ever built our own agent loop on the Messages API and offered credits, what would that path look like, and who should we talk to? We don't need this answered to settle questions 1 to 5.

Thank you. A written reply from a named person we can keep on file would help a lot.

Rishabh
Founder, Companion (working name)
[your email] · [website, when there is one]

---

## Notes for you (not part of the email)

- **Don't say** "Sign in with Claude," "connect your Claude account," "Companion logs in to Claude," "use your Claude rate limits," or anything that sounds like Companion offers or handles the login. Anthropic's own flow does the login; Companion only opens it.
- **Don't call Companion** a Claude Code wrapper, or use "Claude Code" in any name. A plain sentence like "Companion runs Anthropic's Claude Code" is allowed since August; "Companion, Powered by Claude" is fine.
- **Don't cite** the February 2026 wording that banned plan tokens "including the Agent SDK." It was removed in early April 2026 and replaced with softer text.
- **Left out on purpose,** to keep it short: whether the routing clause treats Team and Enterprise logins differently (it names only Free, Pro and Max). Ask in a follow up if the first answer is unclear.
- **Follow ups to send in the same thread later, if they apply:** if you decide to offer the Console sign in (`claude auth login --console`) after spike (c), ask whether a keyless Console profile signed in through Anthropic's flow counts as "API key authentication through Claude Console." If spike (e) finds that Claude Code keeps received screenshots on disk, ask whether there is a supported mode that keeps images off disk.
- **When a reply comes:** save it here as `anthropic-reply-YYYY-MM-DD.md`, then update decision T03, the plan route switch and `AGENTS.md`.
