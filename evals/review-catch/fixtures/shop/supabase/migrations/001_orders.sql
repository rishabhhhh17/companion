create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  status text not null default 'unpaid',
  total_cents integer not null,
  created_at timestamptz not null default now()
);

alter table public.orders enable row level security;

create policy "Customers see their own orders"
  on public.orders for select
  to authenticated
  using (auth.uid() = user_id);
