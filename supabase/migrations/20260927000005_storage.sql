-- Boxinger · storage for board logos and avatars (public bucket, 2 MB, PNG/JPG)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 2097152, array['image/png', 'image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_admin_board(p_board text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return (public.board_context(p_board::uuid, auth.uid())).role = 'admin';
exception when invalid_text_representation then
  return false;
end $$;
grant execute on function public.can_admin_board(text) to authenticated;

-- avatars/<user id>/<file>
create policy "avatar upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = 'avatars' and (storage.foldername(name))[2] = auth.uid()::text);
create policy "avatar update" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = 'avatars' and (storage.foldername(name))[2] = auth.uid()::text);
create policy "avatar delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = 'avatars' and (storage.foldername(name))[2] = auth.uid()::text);

-- logos/<board id>/<file>
create policy "logo upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = 'logos' and public.can_admin_board((storage.foldername(name))[2]));
create policy "logo update" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = 'logos' and public.can_admin_board((storage.foldername(name))[2]));
create policy "logo delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = 'logos' and public.can_admin_board((storage.foldername(name))[2]));
