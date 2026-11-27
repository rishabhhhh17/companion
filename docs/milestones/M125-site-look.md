# M125: the app looks like the website

Status: built 28 Nov 2026 on branch m125/site-look. Not yet tried by the founder on a real Mac.

## Why

The founder, 28 Nov 2026, during the first real Mac test of the release build: "Please make sure that Squibby the app looks really cool because right now it looks very bad... I wanted to make it according to our website and how it feels exactly."

The website (getsquibby.com) is the brand ([[site-keep-brand-language]] in memory). So this is no new look and no lab of options. It carries the site's own look into the app.

## What comes from the site

- **The night sky.** True black, a few stars, the site's faint graph paper behind Home and the menu bar popover.
- **Words.** Geist and Geist Mono for words, Supreme for headlines. These are the site's own font files, bundled in `app/public/fonts`, never fetched.
- **Receipts.** Every card on Now is a slip of cream paper with a torn foot, in ink, with the small print in Geist Mono. A card that needs you gets an amber stamp along its top.
- **Tickets.** The one filled button and the open tab are white tickets with a bite out of each end, like the site's buttons. Other buttons are hairline outlines.
- **The ask box.** The site's cream field, with a dark ticket to send.
- **Colour means something.** White is the action; blue is only focus and work in progress; green proven, red caught, amber review. Every pair is measured in `ui/squibby.test.ts`. One site colour, the working blue, was darkened on paper because it measured 4.2 to 1.
- **The pixel moment.** When a result lands, a layer of paper squares goes away in three steps. Opacity only, and off under reduce motion.

## How it is built

- `look.material` gets a third choice, **Squibby**, which is now the usual. Glass and Before stay exactly as they were, as choices in Settings, Look.
- Squibby is built on the glass structure (tabs, the black strip): `data-material="glass"` plus `data-brand="squibby"` (`lookfeel.ts`).
- Colours, sizes and times are tokens in `ui/tokens.css` (the `--sq-*` block). The rules are in `ui/squibby.css`.
- **Its own rulebook.** The black look's lints forbid gradients and any face but the system's, and the site's sky, paper and fonts need both. So `ui/squibby.css` is held by `ui/squibby.test.ts` instead:
  - every rule hangs off `[data-brand="squibby"]`
  - no colour is written in it
  - fonts are local files only
  - gradients only draw the sky and cut the paper shapes
  - motion is opacity only, with token times
  - contrast is measured

## To check

- On the real Mac: Home in every state (rest, working, result, needs you, error), Settings, the menu bar popover, Increase contrast, Reduce motion.
- **[verify]** Supreme comes from Fontshare (Indian Type Foundry Free Font License). Its terms for bundling inside an app need a read before release. Geist is under the OFL.

## Not in this milestone

The notch island, the dock character and the first run keep their current look. Flowflow's art is unchanged; art is the founder's call.
