-- Chair Log shared log. Run once in the Supabase SQL editor (or `supabase db push`).
--
-- One "book" is one shared log. Everyone listed in book_members (by Google email) can read and
-- write all of it. Every synced record is stored whole in `data` (the app's own JSON shape), with
-- the client's `updatedAt` deciding which edit wins and a server `updated_at` used as the pull cursor.

create table public.books (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Chair Log',
  created_at timestamptz not null default now()
);

create table public.book_members (
  book_id uuid not null references public.books on delete cascade,
  email text not null check (email = lower(email)),
  added_by text,
  created_at timestamptz not null default now(),
  primary key (book_id, email)
);

-- True when the signed-in user's email is a member of the book. SECURITY DEFINER so the policies
-- below can call it without recursing into book_members' own policy.
create function public.is_member(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.book_members
    where book_id = b and email = lower(auth.jwt() ->> 'email')
  );
$$;

-- Creates a book with the caller as its first member and returns its id.
create function public.create_book(book_name text default 'Chair Log') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me text := lower(auth.jwt() ->> 'email');
  new_id uuid;
begin
  if me is null then
    raise exception 'Sign in first';
  end if;
  insert into public.books (name) values (book_name) returning id into new_id;
  insert into public.book_members (book_id, email, added_by) values (new_id, me, me);
  return new_id;
end;
$$;

-- Last write wins by the client's updatedAt; identical rewrites are no-ops so devices don't
-- ping-pong the same row. The server stamps updated_at, which is what pulls page through.
create function public.sync_guard() returns trigger
language plpgsql as $$
begin
  new.deleted_at := (new.data ->> 'deletedAt')::timestamptz;
  if tg_op = 'UPDATE' then
    if coalesce(new.data ->> 'updatedAt', '') < coalesce(old.data ->> 'updatedAt', '')
       or new.data = old.data then
      return old;
    end if;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create table public.visits (
  book_id uuid not null references public.books on delete cascade,
  uid text not null,
  data jsonb not null,
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  primary key (book_id, uid)
);

create table public.catalog_items (
  book_id uuid not null references public.books on delete cascade,
  kind text not null check (kind in ('product', 'area', 'retail')),
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  primary key (book_id, kind, id)
);

create table public.month_records (
  book_id uuid not null references public.books on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  data jsonb not null,
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  primary key (book_id, month)
);

create table public.goals (
  book_id uuid not null references public.books on delete cascade,
  metric text not null,
  data jsonb not null,
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  primary key (book_id, metric)
);

create index visits_pull on public.visits (book_id, updated_at);
create index catalog_items_pull on public.catalog_items (book_id, updated_at);
create index month_records_pull on public.month_records (book_id, updated_at);
create index goals_pull on public.goals (book_id, updated_at);

create trigger visits_sync before insert or update on public.visits
  for each row execute function public.sync_guard();
create trigger catalog_items_sync before insert or update on public.catalog_items
  for each row execute function public.sync_guard();
create trigger month_records_sync before insert or update on public.month_records
  for each row execute function public.sync_guard();
create trigger goals_sync before insert or update on public.goals
  for each row execute function public.sync_guard();

-- Row-level security: nothing is visible without membership.
alter table public.books enable row level security;
alter table public.book_members enable row level security;
alter table public.visits enable row level security;
alter table public.catalog_items enable row level security;
alter table public.month_records enable row level security;
alter table public.goals enable row level security;

create policy "members read their books" on public.books
  for select using (public.is_member(id));
create policy "members rename their books" on public.books
  for update using (public.is_member(id));

-- You can see your own memberships (to find your book) and everyone in books you belong to.
create policy "see memberships" on public.book_members
  for select using (email = lower(auth.jwt() ->> 'email') or public.is_member(book_id));
create policy "members add people" on public.book_members
  for insert with check (public.is_member(book_id) and email = lower(email));
create policy "members remove people" on public.book_members
  for delete using (public.is_member(book_id));

create policy "members use visits" on public.visits
  for all using (public.is_member(book_id)) with check (public.is_member(book_id));
create policy "members use catalog" on public.catalog_items
  for all using (public.is_member(book_id)) with check (public.is_member(book_id));
create policy "members use month records" on public.month_records
  for all using (public.is_member(book_id)) with check (public.is_member(book_id));
create policy "members use goals" on public.goals
  for all using (public.is_member(book_id)) with check (public.is_member(book_id));

grant execute on function public.create_book(text) to authenticated;
grant execute on function public.is_member(uuid) to authenticated;
