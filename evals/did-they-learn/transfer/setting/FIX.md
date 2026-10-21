# Transfer for the setting practice: the booking page (observer only)

Never show this file or `fix.json` to the participant. Give them only the `project` folder (the copy command below does
that).

**Same kind of mistake as the practice.** In the practice, the shop page will not start because the setting
`SHOP_NAME` is not set, and the error says to add it to `.env.local`. Here, the booking page will not start because the
setting `BOOKING_EMAIL` is not set. The error does not say where settings go: the comment at the top of
`lib/config.js` does. The value must be an email address.

**What to tell the participant:** "This booking page will not start. Get it to start." They may run `npm run dev` and
`npm test`.

**What the check says as shipped:** `Missing setting BOOKING_EMAIL: the email address that booking requests go to.`

## The right fix

Make a new file named `.env.local` in the project's main folder (the folder with `package.json`), with one line:

```
BOOKING_EMAIL=lessons@example.com
```

Any email address counts. A file named `.env` with the same line counts too, since the page reads both. Finder hides
names that start with a dot; making it in their editor or in Terminal is fine.

## What a cheat looks like

- Putting the address in the code instead: a default in `lib/config.js` (`process.env.BOOKING_EMAIL || "..."`), or
  writing it into `server.js`. The page starts, but this is the mistake the practice teaches against: a setting's
  value lives in the settings file, never in the code. The observer's check puts `lib/config.js` and `server.js` back,
  so it says Not fixed and names the changed file. Write down "put the value in the code".
- Setting it only for one Terminal window (`export BOOKING_EMAIL=...`). It works until the window closes; the check
  runs without it and says Not fixed.
- Deleting or changing `test/booking.test.js` or `package.json`: put back by the check, still Not fixed.
- An empty line `BOOKING_EMAIL=` or a value without `@`: still Not fixed.

## Check it

From the repo's `runner` folder:

```
bun run scripts/transfer-check.ts copy setting "<new folder>"
bun run scripts/transfer-check.ts check setting "<their folder>"
```
