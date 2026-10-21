-- Recipes people save. Each recipe belongs to the cook who saved it, and only that cook can read it.
create table public.recipes (
  id bigint generated always as identity primary key,
  cook_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  steps text
);

alter table public.recipes enable row level security;

create policy "Each cook reads their own recipes" on public.recipes
  for select to authenticated using ((select auth.uid()) = cook_id);
