# Anthropic support replied (23 Oct 2026), and a follow up to send

**Status:** the reply is a support agent's email, not a signed agreement. Treat it as a strong hint of Anthropic's view, and get the points that matter in writing from a named person. The follow up at the bottom is a DRAFT. The founder sends it by hand, in the same email thread or support chat.

## What the email said (summary, 3:13 AM, from "Ricardo from Anthropic", support)
1. **Building on the Agent SDK is the supported path.**
2. **"Redistributing the Claude Code CLI itself inside your app isn't permitted under its licence."** This is the surprising line. See "The conflict" below.
3. **Naming:** customer facing copy should not use the "Claude Code" name. "Powered by Claude" is fine.
4. **Authentication:** the integration must authenticate with an **API key at API pricing, not Claude subscription credentials.**
5. **Including Claude usage in our paid plans needs a written agreement.** There is no self serve route, and support cannot approve it.
6. **Rate limits:** the Start tier has a **$500 a month spend cap**, so plan for a higher tier before launch. Request it at platform.claude.com/settings/limits.

## What it settles, what it does not
| Question | Answer now |
|---|---|
| Can the app run the Agent SDK with the user's own API key? | Yes: the supported path. This is what Squibby does. |
| Can people sign in with a Claude plan inside Squibby? | **No, per support.** Keep the plan route off for good, unless a named person says otherwise in writing. It was never to be on without Anthropic's written yes (AGENTS.md rule 3). |
| Can we include Claude usage in our own plans ("company pays")? | **Not self serve.** Needs a written agreement. Not a no, but not a yes. The wait goes on. |
| Can light features (guide, Explain, Second Look) on the plain Messages API be company paid? | **Not answered.** Our questions 2 and 3 in the original email were skipped. Ask again. |
| Can we say "Powered by Claude"? | Yes. |
| Can the app's words say "Claude Code"? | Avoid. We checked: the app's own screens, engine messages and strings never use that name. It appears only in code comments, internal setting names (`CLAUDE_CODE_*`, which are Anthropic's own) and in docs that describe other tools people use. |
| Is the $500 a month cap a problem? | Not for the beta: our measured cost is $0.04 to $0.12 a fix, so about 4,000 to 12,000 fixes a month. Request a higher tier before launch. |

## The conflict to resolve (the one that matters most)
Squibby ships Anthropic's own binary **inside the app**: the unmodified binary from the Agent SDK's own package (`@anthropic-ai/claude-agent-sdk-darwin-arm64`), copied in as is and never re signed (AGENTS.md rule 4). Without it the app would need the person to install something first.

- **The support email says** redistributing the CLI inside our app is not permitted.
- **Anthropic's published page** ([Legal and compliance, "Can customers offer Claude Code in their products?"](https://code.claude.com/docs/en/legal-and-compliance), read 23 Oct 2026) says the opposite on its face: "preinstalling or running Claude Code in your products or services ... requires agreeing to our Commercial Terms of Service and complying with the conditions below": the binary must not be modified, and customers may not pay for, resell or intermediate Claude usage on their end users' behalf; each end user authenticates with their own API key (or plan credentials). The same page also says you can accurately say, in plain text, that your product runs Claude Code, but not use the name as part of your product or feature name.
- **We meet every condition on that page today:** unmodified binary, the user's own key, nobody's usage paid for or resold, and no use of the name in our product or feature names.
- **The email may mean something narrower** (for example the standalone CLI installer, not the copy that comes in the SDK package), or it may be a support agent's quick summary. We cannot tell. So this needs a written answer before launch, because the installer depends on it.

**If the answer is "no, you cannot bundle it":** the fallback is not to bundle. The app would check for Anthropic's own install at first run, and offer the lesson that walks the person through installing it from Anthropic (a lesson already exists: `lessons/claude-code-install.json`), then run that copy. That reverses rule 20 (we always run the SDK's bundled binary, never one found on PATH), so it is a decision for the founder and a change to the installer, the supervisor and the tests: about a week of work, and a worse first run for non engineers. Do not start it until Anthropic answers in writing.

## Draft follow up (send by hand; edit freely)

**Subject:** Re: Written agreement request: three points to confirm in writing

Hi Ricardo,

Thank you, this is helpful. Three things I would like to confirm in writing, because they decide how I ship.

1. **Bundling the binary.** My app runs the Agent SDK with the user's own API key, using the unmodified binary that comes in the SDK's own package (@anthropic-ai/claude-agent-sdk-darwin-arm64), copied into the app bundle as is, never modified or re signed. Your page "Legal and compliance, Can customers offer Claude Code in their products?" says preinstalling or running Claude Code in a product is allowed under the Commercial Terms if the binary is not modified, nobody's usage is paid for or resold, and each end user authenticates with their own credential. I meet each of those. Your email says redistributing the CLI inside my app is not permitted. Do you mean the standalone CLI installer, or also the binary that comes inside the SDK package? If it is not allowed, what should my app do instead (for example, install Anthropic's own build at first run)?
2. **The plain Messages API.** For small features (short answers, explaining a change, checking an answer) I would call the Messages API directly with my organization's key, not run Claude Code. I believe the Commercial Terms allow a product built on the API to be offered to my customers, including a plan that covers this usage. Is that right, and what would you need from the server in between (my server checks a user's plan and a daily limit, forwards the request under my key, and keeps no prompts or replies, only token counts)?
3. **The written agreement.** Who should I talk to about an agreement for including usage in my paid plans, like the JetBrains arrangement? Is there a partnerships contact I can write to, and is there anything I should prepare (volumes, a draft of the terms I would give customers)?

I will request a higher usage tier at the limits page you linked. I will keep "Claude Code" out of my product's names and screens and use "Powered by Claude".

Thank you,
Rishabh Kapadia (Console organization ID 12c243b5-7fed-4ffe-82f9-c5038e7cee75)

## What to change in the app, if anything, today
Nothing in the code. Keep the plan route off, keep "Claude Code" out of what people see, and keep building. The launch plan's answer to "does it need a paid plan?" is updated to say the app works with the person's own API key and that a plan sign in is not offered.
