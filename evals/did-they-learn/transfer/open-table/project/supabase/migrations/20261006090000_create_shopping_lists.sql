-- Shopping lists. Each list belongs to the person who made it.
create table public.shopping_lists (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  items text not null default '',
  updated_at timestamptz not null default now()
);
