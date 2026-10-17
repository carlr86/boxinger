-- Deshace la migración 056 (avisos en Slack). Se borran los canales conectados y la cola de avisos.
drop trigger if exists ideas_slack on public.ideas;
drop function if exists public.ideas_slack_trigger();
drop function if exists public.queue_slack(uuid, text, bigint, jsonb, text);
drop function if exists public.claim_slack(int);
drop function if exists public.queue_slack_weekly();
drop function if exists public.slack_can_connect(uuid);
drop function if exists public.save_slack(uuid, uuid, text, text, text, text);
drop function if exists public.set_slack_events(uuid, jsonb);
drop function if exists public.delete_slack(uuid);
drop function if exists public.slack_notice_data(bigint[]);
drop table if exists public.slack_outbox;
drop table if exists public.board_slack;
-- get_integrations: volver a la versión de la migración 055 (ejecutar ese bloque de nuevo).
