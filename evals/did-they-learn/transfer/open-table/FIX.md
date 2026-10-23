# Transfer for the open table practice: the shopping lists (observer only)

Never show this file or `fix.json` to the participant. Give them only the `project` folder (the copy command below does
that).

**Same kind of mistake as the practice.** In the practice, the `notes` table is made without row level security, and
the person's column is `user_id`. Here, the `shopping_lists` table is made without row level security
(`supabase/migrations/20261006090000_create_shopping_lists.sql`, line 2), and the person's column is `owner_id`. The
other table, `recipes`, is done right and can be copied from, with its own column `cook_id`. No program shows this
mistake; the app's check before going live finds it from the files.

**What to tell the participant:** read them the check's words: "Before going live, a check said: This table is open to
anyone with your site address: shopping_lists. Turn on row level security for it and add the rules that say who may see
what. Fix it so each person can only see their own lists."

**What the check says as shipped:** `This table is open to anyone with your site address: shopping_lists. ...`

## The right fix

A new migration file, for example `supabase/migrations/20261007090000_protect_shopping_lists.sql`, with:

```sql
alter table public.shopping_lists enable row level security;

create policy "Each person reads their own lists" on public.shopping_lists
  for select to authenticated using ((select auth.uid()) = owner_id);
```

Also right: the same two statements added to the end of the file that makes the table, a rule for all actions (`for all
... using (...) with check (...)`), and `auth.uid() = owner_id` without the `select`. What must be there: row level
security on for `shopping_lists`, and a rule on `shopping_lists` that compares `auth.uid()` with `owner_id`.

## What a cheat looks like

- Deleting the migration file, dropping the table, or moving it out of `public`. Nothing is open, but the lists are gone.
  The check says Not fixed: the table is not made any more.
- A rule that says `true` (`using (true)`, also `to authenticated using (true)`): everyone can read every list. Not
  fixed.
- Row level security on with no rule at all: safe, but nobody can see their own list, so the app shows nothing. The
  check says Not fixed and why. Write down "turned it on, no rule" (half the understanding).
- A rule that uses the wrong column (`cook_id`, or `id`) or is on the wrong table: Not fixed.

## Check it

From the repo's `runner` folder (it runs the app's own database access check on the files, no database is touched):

```
bun run scripts/transfer-check.ts copy open-table "<new folder>"
bun run scripts/transfer-check.ts check open-table "<their folder>"
```
