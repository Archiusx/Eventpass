-- =====================================================================
-- Email safety limits (protects your Gmail from spam-blocks / bans)
-- Supabase -> SQL Editor -> paste ALL of this -> Run   (safe to re-run)
--
-- Rules (change the numbers below if you want):
--   * 1 email per ticket, ever            (no repeat mails for the same ticket)
--   * max 2 emails per address per 24h    (same person re-registering)
--   * max 30 emails per IP per hour       (college Wi-Fi shares one IP, so it is generous)
--   * max 400 emails per day in total     (Gmail's free cap is ~500)
-- When a limit is hit the registration still works; only the email is skipped
-- and the user can still download the PDF from the ticket page.
-- =====================================================================

create table if not exists email_log (
  id        bigserial primary key,
  ticket_id text not null unique,
  email     text not null,
  ip        text not null default '',
  sent_at   timestamptz not null default now()
);
create index if not exists email_log_sent_at_idx on email_log (sent_at);
create index if not exists email_log_email_idx   on email_log (email, sent_at);
create index if not exists email_log_ip_idx      on email_log (ip, sent_at);
alter table email_log enable row level security;
revoke all on email_log from anon, authenticated;

create or replace function claim_email_slot(p_ticket_id text, p_email text, p_ip text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_ticket text := upper(trim(coalesce(p_ticket_id, '')));
  v_email  text := lower(trim(coalesce(p_email, '')));
  v_ip     text := left(trim(coalesce(p_ip, '')), 64);
begin
  perform pg_advisory_xact_lock(84210);                      -- one caller at a time, no races

  -- only real, already-registered tickets can get a mail
  if not exists (select 1 from registrations where ticket_id = v_ticket) then return false; end if;
  if exists (select 1 from email_log where ticket_id = v_ticket)          then return false; end if;

  delete from email_log where sent_at < now() - interval '2 days';

  if (select count(*) from email_log where sent_at > now() - interval '24 hours') >= 400 then return false; end if;
  if (select count(*) from email_log where email = v_email and sent_at > now() - interval '24 hours') >= 2 then return false; end if;
  if v_ip <> '' and (select count(*) from email_log where ip = v_ip and sent_at > now() - interval '1 hour') >= 30 then return false; end if;

  insert into email_log (ticket_id, email, ip) values (v_ticket, v_email, v_ip);
  return true;
end;
$$;
revoke all on function claim_email_slot(text, text, text) from public;
grant execute on function claim_email_slot(text, text, text) to anon;
