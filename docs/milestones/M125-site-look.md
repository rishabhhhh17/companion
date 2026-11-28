# M125: the app looks like the website, and stays glass

Status: built 28 Nov 2026 on branch m125/site-look. Tried by the founder on a real Mac in several rounds the same day; the look below is the one he settled on.

## Why

The founder, 28 Nov 2026, during the first real Mac test of the release build: "Please make sure that Squibby the app looks really cool because right now it looks very bad... I wanted to make it according to our website and how it feels exactly."

After seeing a first version (a night sky, cream paper on every card): "we can have our own fonts, but keep everything glassy... pretty normal... our UI UX from the website where it needs, but not always." Then: "everything should be liquid glass... no banner to be black", no border, no fake layer, no shadowy effect, and the ask box must move with the page.

So the app keeps its Liquid Glass structure, and takes only a few touches from the website (getsquibby.com, [[site-keep-brand-language]] in memory).

## What comes from the site

- **Words.** Geist and Geist Mono for words, Supreme for the headline. These are the site's own font files, bundled in `app/src/ui/fonts`, never fetched.
- **The one filled button** is the site's white ticket, with a bite out of each end.
- **A finished check's receipt** is the site's cream paper with a torn foot, in ink, with the small print in Geist Mono. Only that receipt, never every card.
- **The pixel moment.** When a receipt lands, a layer of paper squares goes away in three steps. Opacity only, and off under reduce motion.

## What stays glass

- No sky, no tint on surfaces, no black header band. The notch strip and the tabs sit on the same glass as the rest and scroll away with the page.
- The ask box is a light piece of floating glass that follows the work and scrolls with it, so nothing hides under it. No band, fade or border around it.
- The menu bar popover uses `NSGlassEffectView` when the system has it, and the HUD `NSVisualEffectView` otherwise.
- The empty side list takes no room, so Now has the whole width (a fix, not a look).
- The ask placeholder says what to do: "Ask Squibby to check, fix or explain something".

## Signing in

With the managed route (F29), a signed out user sees a "Sign in to start" card on Home with the Google button. It comes from the `account_state` command (it only checks that the sign in token exists, never reads it) and the `signIn` blocker in `homeHero.ts`.

## How it is built

- `look.material` has three choices: **Squibby** (the usual), Glass and Before. Glass and Before are unchanged, as choices in Settings, Look.
- Squibby is the glass structure plus `data-brand="squibby"`. The root's `data-material` is only ever a structure (`glass` or `classic`), written through `structureOf` (`lookfeel.ts`, `useLook.ts`). Writing "squibby" there once broke every glass layout rule on a real Mac.
- Colours, sizes and times are tokens in `ui/tokens.css` (the `--sq-*` block). The rules are in `ui/squibby.css`.
- **Its own rulebook.** The black look's lints forbid gradients and any face but the system's; the site's paper and fonts need both. So `ui/squibby.test.ts` holds `ui/squibby.css` instead:
  - every rule hangs off `[data-brand="squibby"]`
  - no colour is written in it, and every `--sq-*` token exists
  - fonts are the four local files only
  - gradients only cut the paper's and the ticket's shapes (masks), and the pixel layer
  - the header and ask box are glass, not sticky, with no band; no `backdrop-filter`
  - motion is opacity only, with token times, and reduce motion turns it off
  - contrast is measured on the paper and the ticket (one site colour, the working blue, was darkened to 4.5 to 1)

## To check

- **[verify]** Supreme comes from Fontshare (Indian Type Foundry Free Font License). Its terms for bundling inside an app need a read before release. Geist is under the OFL.

## Not in this milestone

The notch island, the dock character and the first run keep their current look. Flowflow's art is unchanged; art is the founder's call.
