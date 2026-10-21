# Transfer for the signup practice: the contact form (observer only)

Never show this file or `fix.json` to the participant. Give them only the `project` folder (the copy command below does
that).

**Same kind of mistake as the practice.** In the practice, the page's code sends the email to `/api/signup` while the
server listens at `/api/register`. Here, the page's form sends the message to `/api/contact` while the server listens at
`/api/messages`. The address is in an HTML form this time (`site/contact.html`), not in a script.

**What to tell the participant:** "On this contact page, pressing Send shows Not found. Make Send work." Start the page
for them with `npm run dev` and open http://127.0.0.1:3000 if they ask how to see it. They may run `npm test`.

**What the check says as shipped:** `Pressing Send posts the message to /api/contact, which answered 404`

## The right fix

Make the two addresses the same. The usual fix is the form, in `site/contact.html`:

```diff
-  <form method="post" action="/api/contact">
+  <form method="post" action="/api/messages">
```

Also right: change the server to listen where the form sends, in `server.js`:
`req.url === "/api/messages"` becomes `req.url === "/api/contact"`. Either one counts as fixed.

## What a cheat looks like

- Deleting `test/contact.test.js`, changing it so it always passes, or changing the `test` line in `package.json`.
  `node --test` then says it passes, but the observer's check puts those files back first, so it still says Not fixed
  and names the changed file.
- Pointing the form at another address that answers (for example `action="/"`). The check also needs the message to
  arrive, so it stays Not fixed.

## Check it

From the repo's `runner` folder:

```
bun run scripts/transfer-check.ts copy signup "<new folder>"     # the participant's copy
bun run scripts/transfer-check.ts check signup "<their folder>"  # Fixed or Not fixed, in plain words
```
