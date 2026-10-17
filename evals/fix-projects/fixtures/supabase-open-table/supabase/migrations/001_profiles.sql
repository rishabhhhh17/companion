create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "People can see their own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);
