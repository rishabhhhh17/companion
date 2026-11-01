# Message for Anthropic sales, second draft (send through https://claude.com/contact-sales)

**Sent, 1 Nov 2026.** The claude.com sales form refused a gmail.com address, so the founder sent it through the Fin AI Agent in the Claude Console and asked for the sales team. Fin handed it to Anthropic's human support queue. Conversation ID: 215476650386482. The reply comes by email to the founder's account address; Fin said not to resend.

Written 1 Nov 2026. It replaces `anthropic-contact-sales-2026-10-29.md` if that one has not been sent yet. The founder sends it by hand. Every line is filled in; read it once before sending, because the 28 Oct email to support went out with a bracketed placeholder where a question should have been.

Why it changed: the founder decided on 1 Nov that people should not bring their own key. Squibby will pay Anthropic and charge people a monthly price. Support said the plain API route for the light features is a standard setup, and that Claude Code usage paid by us needs an agreement. So the agreement is now the main question, not a side question.

---

**Subject:** Agreement for a paid desktop app built on the Claude Agent SDK, where we pay for Claude usage

Hi,

I'm Rishabh, founder of Squibby, a Mac app that helps people who build with AI finish their projects. Anthropic support (Ricardo, 29 Oct 2026) pointed me here, because the answer is contractual.

**The product:**
- Squibby is a desktop app built on the Claude Agent SDK, which runs Claude Code on the person's own Mac to read, fix and test their project inside a safety box, with undo and a receipt for every change.
- It is for people who are not engineers, so asking them to create an Anthropic account and an API key is the biggest thing stopping them. We want them to sign up, pick a monthly plan and start.
- Squibby would pay Anthropic for the usage and charge the person a monthly price, with a hard daily limit per person. Our server forwards each request under our organization's key, checks the plan and the limit, and records only counts, never prompts or replies. We have a tool to find and suspend one account, and our acceptable use terms for users are drafted and will be published before launch.
- The app does not ship the Claude Code binary. On first run it installs Anthropic's own build (the exact `@anthropic-ai/claude-agent-sdk` platform package our SDK is pinned to, from the public npm registry), checks its hash and its Anthropic signature, and never changes or re-signs it.

**How people use it:** people never sign in to Claude or to any AI provider, and never make an API key. They sign up with Squibby and pay Squibby, and every request runs on our organization's key. Claude Code itself stays exactly as you publish it, but our app would not offer its own sign-in options to our customers. We understand the terms say a product may not restrict those sign-in methods, or pay for its users' Claude Code usage, unless Anthropic has agreed otherwise, so we are asking for both to be covered by an agreement. Nothing runs this way until we have it in writing.

**The lighter features:** still in the plan. Explaining an error, rewriting a prompt and pointing at things on screen call the Messages API directly under our organization's key (support said on 23 Oct 2026 that this is a standard setup). We would like the agreement to cover both parts.

**Our Console organization:** Rishabh's Individual Org (organization ID: 12c243b5-7fed-4ffe-82f9-c5038e7cee75)

**Expected volumes:** 1,000 to 10,000 people in the first year. A typical fixed project has cost us a few cents in real tests.

**What I'm asking:**
1. What agreement allows a product built on the Agent SDK to pay for, and charge for, the Claude Code usage of its own customers? What does it involve (terms, minimum commitment, review of our design)?
2. Is installing Anthropic's own build at first run, as described, within the terms, or does that part also belong in the agreement?
3. Who is the right person to talk to, and what is the usual time to an answer? We are ready to launch in a few weeks and will not switch anything on until we have it in writing.

Thanks,
Rishabh
Squibby
