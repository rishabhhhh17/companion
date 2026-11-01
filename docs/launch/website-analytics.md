# Website analytics: Mixpanel and DataFast (founder, 1 Nov 2026)

The founder: "When we make the website, please add Mixpanel." Then: "And DataFast too. Put this in the source file so you don't forget it."

Website work is paused until the founder asks for it. When the website is built, it gets both:

- **Mixpanel** (mixpanel.com): product analytics for the site. Visits, where people came from, the steps to download and sign up, and funnels.
- **DataFast** (datafa.st): revenue first web analytics. Which sources and pages bring paying customers, tied to payments.

Rules for both:
- **The website only.** The Mac app counts on the device and sends nothing (AGENTS.md rules 5, 15 and 16). Analytics inside the app would be a separate founder decision.
- **Consent and privacy.** A cookie or consent notice where the law requires it. The privacy policy (`docs/launch/legal/`) names both services and what they collect before the site goes live.
- **Keys and tokens.** The Mixpanel project token and the DataFast site id come from the founder's own accounts. They are set in the site's configuration, never pasted into a chat and never committed if they are secret.
- **Revenue.** DataFast's revenue view needs the payment provider connected (Dodo, see F25 and T17). Check in DataFast's docs that Dodo is supported before relying on it, and say so if it is not.
