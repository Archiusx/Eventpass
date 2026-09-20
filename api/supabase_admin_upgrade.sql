-- =====================================================================
-- LAN ARENA 2026 — admin upgrade
-- Supabase → SQL Editor → paste ALL of this → Run (safe to re-run)
--
-- STEP 1 (compulsory): niche line 30 pe CHANGE_THIS_PASSWORD ki jagah
--         apna admin password likho (min 8 characters). Ye password sirf
--         database mein hashed form mein rehta hai — GitHub/Vercel mein nahi.
--         Password badalna ho to naya password daal ke script dobara run karo.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- admin password (stored as a bcrypt hash) ----------------
create table if not exists admin_config (
  id         int primary key default 1 check (id = 1),
  pass_hash  text not null,
  updated_at timestamptz not null default now()
);
alter table admin_config enable row level security;
revoke all on admin_config from anon, authenticated;

do $$
declare
  v_pw text := 'CHANGE_THIS_PASSWORD';   -- <<<<<< APNA PASSWORD YAHAN LIKHO
begin
  if v_pw = 'CHANGE_THIS_PASSWORD' or length(v_pw) < 8 then
    raise exception 'Pehle script mein admin password set karo (minimum 8 characters), fir dobara Run karo.';
  end if;
  perform set_config('search_path', 'public, extensions', true);
  insert into admin_config (id, pass_hash) values (1, crypt(v_pw, gen_salt('bf')))
  on conflict (id) do update set pass_hash = excluded.pass_hash, updated_at = now();
end $$;

-- ---------- LAN event details (defaults for new registrations) ------
alter table registrations alter column event_name set default 'LAN ARENA 2026';
alter table registrations alter column venue      set default 'Bajaj Institute of Technology, Wardha';
alter table registrations alter column event_date set default 'Date & time to be announced';

update registrations
   set event_name = 'LAN ARENA 2026',
       venue      = 'Bajaj Institute of Technology, Wardha',
       event_date = 'Date & time to be announced'
 where event_name = 'TechNova 2025';

-- ---------- ticket ids now look like LAN26-123456 -------------------
create or replace function generate_ticket_id()
returns text language plpgsql as $$
declare
  new_id text;
  taken boolean;
begin
  loop
    new_id := 'LAN26-' || lpad(floor(random()*900000+100000)::text, 6, '0');
    select exists(select 1 from registrations where ticket_id = new_id) into taken;
    exit when not taken;
  end loop;
  return new_id;
end;
$$;

-- ---------- old public verify function: REMOVE (anyone could call it) --
drop function if exists verify_ticket(text);

-- ---------- helper: checks the admin password (slow on failure) -----
create or replace function admin_password_ok(p_password text)
returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_hash text;
  v_ok   boolean := false;
begin
  select pass_hash into v_hash from admin_config where id = 1;
  if v_hash is not null and p_password is not null then
    v_ok := (crypt(p_password, v_hash) = v_hash);
  end if;
  if not v_ok then
    perform pg_sleep(1.2);   -- slows down password guessing
  end if;
  return v_ok;
end;
$$;
revoke all on function admin_password_ok(text) from public, anon, authenticated;

-- ---------- admin: live numbers + recent check-ins ------------------
create or replace function admin_stats(p_password text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_total  int;
  v_in     int;
  v_recent jsonb;
begin
  if not admin_password_ok(p_password) then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select count(*), count(*) filter (where checked_in)
    into v_total, v_in
    from registrations;

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_recent from (
    select ticket_id, full_name, college, checked_in_at
      from registrations
     where checked_in
     order by checked_in_at desc
     limit 8
  ) x;

  return jsonb_build_object('ok', true, 'total', v_total, 'checked_in', v_in, 'recent', v_recent);
end;
$$;

-- ---------- admin: look up / check in / undo one ticket -------------
-- p_action: 'lookup' (read only) | 'checkin' | 'undo'
create or replace function admin_ticket(p_password text, p_ticket_id text, p_action text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  r      registrations%rowtype;
  v_id   text := upper(trim(coalesce(p_ticket_id, '')));
  v_just boolean := false;
begin
  if not admin_password_ok(p_password) then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select * into r from registrations where ticket_id = v_id for update;

  if not found then
    return jsonb_build_object('ok', true, 'valid', false, 'ticket_id', v_id);
  end if;

  if p_action = 'checkin' and not r.checked_in then
    update registrations set checked_in = true, checked_in_at = now()
     where id = r.id returning * into r;
    v_just := true;
  elsif p_action = 'undo' and r.checked_in then
    update registrations set checked_in = false, checked_in_at = null
     where id = r.id returning * into r;
  end if;

  return jsonb_build_object(
    'ok', true, 'valid', true,
    'ticket_id', r.ticket_id, 'full_name', r.full_name,
    'college', r.college, 'course', r.course,
    'checked_in', r.checked_in, 'checked_in_at', r.checked_in_at,
    'just_checked_in', v_just
  );
end;
$$;

revoke all on function admin_stats(text)              from public;
revoke all on function admin_ticket(text, text, text) from public;
grant execute on function admin_stats(text)              to anon;
grant execute on function admin_ticket(text, text, text) to anon;
-- register_attendee stays as it is (anon can still register).
