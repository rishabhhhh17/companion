# Transfer for the import practice: the order receipt (observer only)

Never show this file or `fix.json` to the participant. Give them only the `project` folder (the copy command below does
that).

**Same kind of mistake as the practice.** In the practice, `server.js` asks for `./lib/format-price`, a file now named
`lib/money.js`, and that file says it used to have the old name. Here, the line with the old name is in another file,
`lib/receipt.js`, which asks for `./sales-tax`; the file is now `lib/tax.js`, and nothing says it was renamed. The error
names `lib/receipt.js` in its list of files (the Require stack).

**What to tell the participant:** "This receipt page stopped starting after its files were tidied up. Get it to start."
They may run `npm run dev` and `npm test`.

**What the check says as shipped:** `Cannot find module './sales-tax'` (Node's own words, with `lib/receipt.js` in the
Require stack).

## The right fix

Change the old name to the new one, in `lib/receipt.js` (line 2):

```diff
-const { addTax } = require("./sales-tax");
+const { addTax } = require("./tax");
```

`require("./tax.js")` is the same fix.

## What a cheat looks like

- Renaming `lib/tax.js` back to `sales-tax.js`. That breaks `server.js`, which already uses the new name, so the check
  says Not fixed (`Cannot find module './lib/tax'`). Write down "renamed the file back".
- Making a second file `lib/sales-tax.js` that copies or passes on `tax.js`. The check passes, since the page works,
  but write down "added a copy instead of fixing the name"; it is not the clean fix.
- Deleting or changing `test/receipt.test.js` or `package.json`: put back by the check, still Not fixed.

## Check it

From the repo's `runner` folder:

```
bun run scripts/transfer-check.ts copy import "<new folder>"
bun run scripts/transfer-check.ts check import "<their folder>"
```
