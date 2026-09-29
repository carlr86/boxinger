-- Boxinger · storage: owners can read their own objects (needed by upsert and remove)

create policy "avatar select" on storage.objects for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = 'avatars' and (storage.foldername(name))[2] = auth.uid()::text);

create policy "logo select" on storage.objects for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = 'logos' and public.can_admin_board((storage.foldername(name))[2]));
