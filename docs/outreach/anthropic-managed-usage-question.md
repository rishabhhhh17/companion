# Draft: question to Anthropic about bundling Claude usage in Companion's own plans

**Status:** DRAFT. Not sent. You send it by hand.
**Why:** on 22 Oct 2026 you said you want people to use Companion the way HeyClicky works, with no key of their own and the model cost inside a plan you charge for. Decision F10 says that is blocked for the Claude Code engine and "needs Anthropic's written terms". This is the question that asks for them.
**Send it the same way as the plan question** (see `anthropic-subscription-question.md`: contact sales, plus a written Console support ticket, plus the Partner Network for a named person). A chatbot reply is not approval. Keep going until a named person answers in writing.

## Before you send

- Do this after the Console organization exists and the Commercial Terms are accepted. Fill in the brackets.
- Keep questions 1 to 4 word for word. They are what the decision depends on.
- Send it **together with** the plan question, not instead of it. Each one answers a different way to remove the key.

---

**Subject:** Written confirmation needed: may a desktop app built on the Agent SDK include Claude usage in its own paid plans?

Hello,

I am building a Mac desktop app called [product name] for people who build projects with AI and get stuck. It finds the problem, fixes it with them, checks the fix worked, and explains why in plain words. My Console organization is [name] ([organization ID]) and I have accepted the Commercial Terms.

Today the app runs Claude Code (the unmodified binary, through the Agent SDK) on the user's own API key, and that is a barrier for people who are not technical. I would like to offer plans where the Claude usage is included, so a user signs up, pays me a monthly price, and never makes a key. I understand your legal page says products built on the Agent SDK may not "pay for, resell, or intermediate" Claude usage on their end users' behalf, so I am asking before I build anything.

1. **May an app built on the Agent SDK, running the unmodified Claude Code binary, include Claude usage in the app's own paid plans, paid for by my organization's API key and billed to my customers inside a subscription?** If not as written, is there an agreement, a partner programme or a different product (such as a managed or reseller arrangement) that allows it?
2. **If a different route is needed, may I do this only for the app's lighter features** (short answers, explanations, pointing at the screen) **through the Messages API with my own organization's key, while the heavier "do the work" sessions still use the customer's own key or plan?** Would that split still fall under the "intermediate" restriction?
3. **What would be required to do it properly:** a proxy that authenticates each of my users and forwards requests to your API under my key, with per-user spending limits and no logging of prompts. Is a proxy of that kind allowed? Are there limits on how I describe it to customers ("Powered by Claude")?
4. **What rate limit tier and review would that need?** My organization is on the Start tier today.

Some detail that may help you answer:
- The app never reads, stores or forwards Claude login credentials.
- Today it spends about 4 to 12 cents per fixed project and under one cent per explanation, so I can price against real costs.
- I would add a hard daily limit per user and a clear message when it is reached.
- Customers' project files stay on their Mac. Only what the task needs is sent to Claude.

I would be glad to join a short call if that is easier. Thank you.

[your name], [email], [website]

---

## What each answer means for the build

| Anthropic says | What it opens | Work for me |
|---|---|---|
| Yes to question 1 | A HeyClicky style plan on the current engine: sign up, pay, no key | A small proxy (accounts, billing, spending limits, privacy rules), about 3 to 5 weeks. Claude Code can be pointed at another address with an environment setting, so the engine itself should barely change (not yet checked) |
| No to 1, yes to 2 | A free or low price tier with no key for the daily features (guide on screen, Explain, Prompt help, voice answers); "do the work" still needs their own Claude | The same proxy, for the light features only, about 2 to 3 weeks |
| No to both | Stay with the user's own key or plan. Make the key step as easy as possible and ask about the plan sign in route | Hand holding key screen, a short video, a "check my key" button |
| A long wait or no named person | Same as "no" for now. Do not build the proxy on a maybe | None |

The one thing to avoid is building the proxy first and hoping. It is weeks of work and would break your own rule 1 and Anthropic's terms if the answer is no.
