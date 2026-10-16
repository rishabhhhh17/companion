-- The notes people write in the app. Each note belongs to the person who wrote it.
create table public.notes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
