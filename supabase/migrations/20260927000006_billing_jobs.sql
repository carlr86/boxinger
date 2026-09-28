-- Boxinger · billing settings, platform notifications and daily job helpers (service role only)

create table public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;

-- Emails every Super Admin who has the given admin_notif preference on.
create or replace function public.notify_super_admins(p_pref text, p_template text, p_payload jsonb, p_dedupe text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a public.profiles;
begin
  for a in select * from public.profiles where is_super_admin and status = 'active' and coalesce((admin_notif ->> p_pref)::boolean, true) loop
    insert into public.email_outbox (to_email, user_id, template, payload, dedupe_key)
    values (a.email, a.id, p_template, coalesce(p_payload, '{}'), case when p_dedupe is null then null else p_dedupe || ':' || a.id end)
    on conflict (dedupe_key) do nothing;
  end loop;
end $$;

create or replace function public.trg_account_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_super_admins('clients', 'admin_new_client', jsonb_build_object(
    'account_id', new.id, 'name', (select name from public.profiles where id = new.owner_id),
    'email', (select email from public.profiles where id = new.owner_id), 'team', new.name, 'by_admin', new.created_by_admin));
  return null;
end $$;
create trigger accounts_created after insert on public.accounts for each row execute function public.trg_account_created();

-- Comments of the last day per board, with the Team members that want the digest.
create or replace function public.digest_candidates(p_since timestamptz)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x), '[]') from (
    select jsonb_build_object(
      'board_id', b.id, 'board_name', b.name, 'slug', b.slug,
      'comments', (select jsonb_agg(jsonb_build_object('idea_id', i.id, 'title', i.title, 'author', coalesce(p.name, 'Usuario eliminado'), 'excerpt', left(c.body, 200)) order by c.created_at)
                   from public.comments c join public.ideas i on i.id = c.idea_id left join public.profiles p on p.id = c.author_id
                   where i.board_id = b.id and c.created_at >= p_since and not c.deleted),
      'recipients', (select coalesce(jsonb_agg(distinct u.id), '[]') from public.profiles u
                     where coalesce((u.notif ->> 'digest')::boolean, true) and u.status = 'active'
                       and (public.board_context(b.id, u.id)).role in ('admin', 'member')
                       and (u.id = a.owner_id or exists (select 1 from public.team_members m where m.team_id = b.team_id and m.user_id = u.id)))
    ) as x
    from public.boards b join public.teams t on t.id = b.team_id join public.accounts a on a.id = t.account_id
    where b.status = 'active' and a.status = 'active'
      and exists (select 1 from public.comments c join public.ideas i on i.id = c.idea_id where i.board_id = b.id and c.created_at >= p_since and not c.deleted)
  ) y;
$$;

create or replace function public.weekly_summary()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'accounts', (select count(*) from public.accounts),
    'new_accounts', (select count(*) from public.accounts where created_at >= now() - interval '7 days'),
    'new_boards', (select count(*) from public.boards where created_at >= now() - interval '7 days'),
    'ideas', (select count(*) from public.ideas where created_at >= now() - interval '7 days'),
    'votes', (select count(*) from public.votes where created_at >= now() - interval '7 days'),
    'comments', (select count(*) from public.comments where created_at >= now() - interval '7 days'),
    'pro', (select count(*) from public.accounts a where public.account_is_pro(a.id)),
    'mrr_usd', (select coalesce(sum(public.effective_amount(s)), 0) from public.subscriptions s where s.currency = 'USD' and public.account_is_pro(s.account_id)),
    'mrr_ars', (select coalesce(sum(public.effective_amount(s)), 0) from public.subscriptions s where s.currency = 'ARS' and public.account_is_pro(s.account_id))
  );
$$;

revoke execute on function public.notify_super_admins(text, text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.digest_candidates(timestamptz) from public, anon, authenticated;
revoke execute on function public.weekly_summary() from public, anon, authenticated;
