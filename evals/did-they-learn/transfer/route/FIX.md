# Transfer for the route practice: the cafe site (observer only)

Never show this file or `fix.json` to the participant. Give them only the `project` folder (the copy command below does
that).

**Same kind of mistake as the practice.** In the practice, the home page links to `/prices` but the page's address is
`/pricing`. Here, the menu page (`pages/menu.html`, not the home page) links to `/hours` but the page's address is
`/opening-hours` (the list of addresses is in `server.js`).

**What to tell the participant:** "On this cafe site, go to the menu and click Opening hours: it says Not found. Make the
link work." Start it with `npm run dev` and open http://127.0.0.1:3000 if they ask. They may run `npm test`.

**What the check says as shipped:** `On /menu, the link Opening hours goes to /hours, which answered 404`

## The right fix

Make the link and the page's address the same. The usual fix is the link, in `pages/menu.html`:

```diff
-  <p><a href="/hours">Opening hours</a></p>
+  <p><a href="/opening-hours">Opening hours</a></p>
```

Also right: change the address in the list in `server.js`, `"/opening-hours": "pages/opening-hours.html"` becomes
`"/hours": "pages/opening-hours.html"`. Either one counts as fixed.

## What a cheat looks like

- Taking the Opening hours link away. Nothing is broken any more, but the visitor lost the link. The check needs the
  link, so it says Not fixed.
- Deleting or changing `test/pages.test.js` or `package.json`: put back by the check, still Not fixed.

## Check it

From the repo's `runner` folder:

```
bun run scripts/transfer-check.ts copy route "<new folder>"
bun run scripts/transfer-check.ts check route "<their folder>"
```
