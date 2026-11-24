# M121: Notch overhaul

Status: plan written (2026-11-24). Founder approved to start the next build.

The notch is the app's presence surface for "notice for you". After M96 made it the HeyClicky one row, the founder said it still feels plain, so the overhaul makes it feel like the product: the attention block names the work, the flow from the row to Home is one press, and the look grows with the Dynamic Island.

## What it does

1. **The attention block names the work.** When something needs the person, the notch says the headline and the top session's own words, so the notch is useful without opening Home.
2. **The flow from the row to Home is one press.** The row's press goes where it should (chat for a plain hello, Home for news or an ask), and every state keeps its words.
3. **Customization.** The row's greet, hint, pill words and action come from the person's choices, not from one fixed phrase. Done in M121 slice 3: the greeting, the quiet hint line and the one action's words are settings (notch.greet, notch.hint, notch.pill), with the usual words kept until a person chooses their own. Corrected 24 Nov 2026: the chosen pill words relabel only the idle Check my project, never Stop, Answer, See why, Review or another moment, and the chosen hint takes the place of the key line only, never the moment's own line. The attention block's Open in Home opens Home (`island_go`).
4. **Dynamic Island.** The same notch on new MacBooks with the Dynamic Island, same black, same shape rules.

## Out of scope

- The autonomous fix loop. That is M122 territory, not here.

## Tests

- Notch pure logic: attention block, press flow, row content, chosen words.
- Notch draw: the block names the work, the press flow holds, the chosen words show.

## Founder approval

- Plan approved to start (2026-11-24). Feature code follows.
