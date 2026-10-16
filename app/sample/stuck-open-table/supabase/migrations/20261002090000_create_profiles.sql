-- One profile per person, readable only by that person.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text
);

alter table public.profiles enable row level security;

create policy "Each person reads their own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
