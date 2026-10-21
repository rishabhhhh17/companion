# Draft: question to Anthropic about bundling Claude usage in Companion's own plans

**Status:** DRAFT. Not sent. You send it by hand.
**Why:** on 22 Oct 2026 you said you want people to use Companion the way HeyClicky works, with no key of their own and the model cost inside a plan you charge for. Decision F10 says that is blocked for the Claude Code engine and "needs Anthropic's written terms". This is the question that asks for them.
**Sent on 22 Oct 2026.** Where it went: the sales chat (could not escalate), sales@anthropic.com (automatic reply: the inbox is no longer monitored), the partner portal (server error, retry), and **support.claude.com, where the assistant handed it to a person who handles commercial terms**. Follow up in that same support chat after a week with no reply.

**Originally: send it the same way as the plan question** (see `anthropic-subscription-question.md`: contact sales, plus a written Console support ticket, plus the Partner Network for a named person). A chatbot reply is not approval. Keep going until a named person answers in writing.

## Before you send

- Updated 22 Oct 2026 after the live check of the terms (`docs/research/2026-10-22-reality-check.md`): question 2 is now a confirmation, and the JetBrains precedent is cited. The organization name and ID are filled in from your Console.
- Keep questions 1 to 4 as they are. They are what the decision depends on. Add a website line if you have one; a plain email works too.
- Send it **together with** the plan question, not instead of it. Each one answers a different way to remove the key.

---

**Subject:** Written agreement request: including Claude usage in a desktop app built on the Agent SDK (like JetBrains)

Hello,

I am building a Mac desktop app, Companion (working name), for people who build software with AI but are not engineers, and get stuck. It finds the problem, fixes it with them, checks the fix really worked, and explains why in plain words, so they learn as they go. My Console organization is Rishabh's Individual Org (organization ID 12c243b5-7fed-4ffe-82f9-c5038e7cee75).

The app runs Claude Code (the unmodified binary, through the Agent SDK). Today each user brings their own Claude API key. For people who are not technical, creating an API key is where most of them give up, so I would like to include the Claude usage in the app's own plans, the way JetBrains includes its Claude Agent, built on the Agent SDK, in the JetBrains AI subscription.

I have read the legal and compliance page for Claude Code, which says products may not "pay for, resell, or intermediate Claude usage on their end users' behalf" unless mutually agreed. I would like to ask for that agreement, or to learn what it takes.

1. **May my organization include Claude Code (Agent SDK) usage in my app's paid plans, paid for by my organization and billed to my customers inside a subscription, under a written agreement like the one JetBrains has?** If yes, what is the process, and is there a minimum size or partner programme I should join first?
2. **To confirm my understanding:** for the app's lighter features (short answers, explanations, checking an answer, pointing at something on the screen), which would call the Messages API directly with my organization's key and not run Claude Code, the Commercial Terms already allow this as a product I make available to my customers. Is that right?
3. **What would you require of the server in between:** each user signs in to my app; my server checks their plan and a daily spending limit, forwards the request to your API under my key, and keeps no prompts or replies, only token counts. Is a server of that kind acceptable, and how should I describe it to customers ("Powered by Claude")?
4. **Rate limits:** my organization is on the Start tier today. What tier and review would this need?

Some detail that may help:
- The app never reads, stores or forwards anyone's Claude login credentials.
- Measured cost today is about 4 to 12 cents per fixed project and under one cent per explanation, so I can price against real costs and set hard limits per user.
- Customers' project files stay on their Mac. Only what each task needs is sent.

I would be glad to join a short call. Thank you.

Rishabh Kapadia, rishabhkapadia2007@gmail.com, [website, if you have one]

---

## What each answer means for the build

| Anthropic says | What it opens | Work for me |
|---|---|---|
| Yes to question 1 | A HeyClicky style plan on the current engine: sign up, pay, no key | A small proxy (accounts, billing, spending limits, privacy rules), about 3 to 5 weeks. Claude Code can be pointed at another address with an environment setting, so the engine itself should barely change (not yet checked) |
| No to 1, yes to 2 | A free or low price tier with no key for the daily features (guide on screen, Explain, Prompt help, voice answers); "do the work" still needs their own Claude | The same proxy, for the light features only, about 2 to 3 weeks |
| No to both | Stay with the user's own key or plan. Make the key step as easy as possible and ask about the plan sign in route | Hand holding key screen, a short video, a "check my key" button |
| A long wait or no named person | Same as "no" for now. Do not build the proxy on a maybe | None |

The one thing to avoid is building the proxy first and hoping. It is weeks of work and would break your own rule 1 and Anthropic's terms if the answer is no.
