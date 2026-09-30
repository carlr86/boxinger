-- "Botón de arrepentimiento" (Res. 424/2020, Argentina): withdrawal requests are stored with
-- the contact messages, under their own topic.
alter table public.contact_messages drop constraint contact_messages_topic_check;
alter table public.contact_messages add constraint contact_messages_topic_check
  check (topic in ('general', 'enterprise', 'soporte', 'arrepentimiento'));
