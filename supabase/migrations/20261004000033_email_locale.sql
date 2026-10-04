-- Emails to people without an account yet (invitations): the app writes them in the inviter's language.
create or replace function public.enqueue_email_to(p_email text, p_template text, p_payload jsonb, p_dedupe text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.email_outbox (to_email, template, payload, dedupe_key)
  values (lower(p_email), p_template,
          coalesce(p_payload, '{}') || coalesce((select jsonb_build_object('sender_locale', locale) from public.profiles where id = auth.uid() and locale is not null), '{}'),
          p_dedupe)
  on conflict (dedupe_key) do nothing;
$$;
revoke execute on function public.enqueue_email_to(text, text, jsonb, text) from public, anon, authenticated;

-- The language also goes to the auth user's metadata: Supabase Auth emails (confirm, reset password) read it.
create or replace function public.set_locale(p_locale text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_user();
begin
  if p_locale not in ('es', 'en') then raise exception 'Idioma inválido.'; end if;
  update public.profiles set locale = p_locale where id = uid;
  update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}') || jsonb_build_object('locale', p_locale) where id = uid;
end $$;
revoke execute on function public.set_locale(text) from public, anon;
grant execute on function public.set_locale(text) to authenticated;
