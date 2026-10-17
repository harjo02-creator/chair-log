-- Signed-in users need table privileges before row-level security is even consulted; newer
-- Supabase projects don't grant them by default. RLS (001_init.sql) still limits every row to the
-- members of its book. Anonymous visitors get nothing.

grant usage on schema public to authenticated;

grant select, update on public.books to authenticated;
grant select, insert, delete on public.book_members to authenticated;
grant select, insert, update on public.visits to authenticated;
grant select, insert, update on public.catalog_items to authenticated;
grant select, insert, update on public.month_records to authenticated;
grant select, insert, update on public.goals to authenticated;

revoke all on public.books, public.book_members, public.visits, public.catalog_items,
  public.month_records, public.goals from anon;
revoke execute on function public.create_book(text) from anon, public;
grant execute on function public.create_book(text) to authenticated;
