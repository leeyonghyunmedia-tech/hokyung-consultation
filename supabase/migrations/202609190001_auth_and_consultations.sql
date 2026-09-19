-- Run once in the Supabase SQL Editor. Passwords are owned exclusively by Supabase Auth.
begin;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 name text not null default '' check (char_length(name)<=50),
 phone text not null default '' check (char_length(phone)<=20),
 email text not null,
 consent_at timestamptz,
 created_at timestamptz not null default now()
);
create table public.consultations (
 id uuid primary key default gen_random_uuid(),
 session_hash text not null check (char_length(session_hash)=64),
 campaign text not null check (campaign ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
 user_id uuid references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 attribution jsonb not null default '{}', step integer not null default 0 check(step between 0 and 4),
 answer1 text, answer2 text, name text, phone text, email text,
 started_at timestamptz, consent_at timestamptz, consent_version text,
 completed boolean not null default false, completed_at timestamptz,
 unique(session_hash,campaign)
);
create index consultations_user_id on public.consultations(user_id);
create index consultations_created_at on public.consultations(created_at desc);
alter table public.profiles enable row level security;
alter table public.consultations enable row level security;
revoke all on public.profiles,public.consultations from anon,authenticated;
grant select on public.profiles to authenticated;
grant select(id,campaign,user_id,created_at,updated_at,attribution,step,answer1,answer2,name,phone,email,started_at,consent_at,consent_version,completed,completed_at) on public.consultations to authenticated;
grant all on public.profiles,public.consultations to service_role;
create policy profiles_read_own on public.profiles for select to authenticated using(id=(select auth.uid()));
create policy consultations_read_own on public.consultations for select to authenticated using(user_id=(select auth.uid()));
-- Never use raw_user_meta_data or a client-supplied email to grant administrator permissions.
create or replace function public.sync_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,name,phone,email,consent_at)
 values(new.id,left(coalesce(new.raw_user_meta_data->>'name',''),50),left(coalesce(new.raw_user_meta_data->>'phone',''),20),coalesce(new.email,''),null)
 on conflict(id) do update set email=excluded.email;
 return new;
end;$$;
revoke all on function public.sync_profile() from public,anon,authenticated;
create trigger sync_auth_profile after insert or update of email on auth.users for each row execute function public.sync_profile();
insert into public.profiles(id,name,phone,email) select id,left(coalesce(raw_user_meta_data->>'name',''),50),left(coalesce(raw_user_meta_data->>'phone',''),20),coalesce(email,'') from auth.users on conflict(id) do nothing;

create or replace function public.funnel_action(
 p_session_hash text,p_campaign text,p_action text,p_attribution jsonb default '{}',
 p_question integer default null,p_value text default null,p_actor uuid default null,
 p_name text default null,p_phone text default null,p_email text default null,p_consent boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.consultations; t timestamptz:=clock_timestamp();
begin
 if p_action not in ('init','start','answer','complete') then raise exception 'invalid_action' using errcode='22023'; end if;
 if p_action='init' then
  insert into public.consultations(session_hash,campaign,attribution) values(p_session_hash,p_campaign,p_attribution) on conflict(session_hash,campaign) do nothing;
 end if;
 select * into v from public.consultations where session_hash=p_session_hash and campaign=p_campaign for update;
 if not found then raise exception 'visit_missing' using errcode='P0002'; end if;
 if v.user_id is not null and v.user_id is distinct from p_actor then raise exception 'visit_owner_mismatch' using errcode='42501'; end if;
 if not v.completed then
  if p_action='start' then
   update public.consultations set step=greatest(step,1),started_at=coalesce(started_at,t),updated_at=t where id=v.id;
  elsif p_action='answer' then
   if p_question=0 and v.step>=1 and p_value=any(array['1천만 원 미만','1천만 ~ 3천만 원 미만','3천만 ~ 5천만 원 미만','5천만 ~ 1억 원 미만','1억 원 이상']) then
    update public.consultations set answer1=p_value,step=greatest(step,2),updated_at=t where id=v.id;
   elsif p_question=1 and v.answer1 is not null and p_value=any(array['현재 소득 없음','100만 원 미만','100만 ~ 200만 원 미만','200만 ~ 300만 원 미만','300만 원 이상']) then
    update public.consultations set answer2=p_value,step=greatest(step,3),updated_at=t where id=v.id;
   else raise exception 'invalid_answer_or_step' using errcode='22023'; end if;
  elsif p_action='complete' then
   if p_actor is null or not p_consent or v.answer1 is null or v.answer2 is null or p_name is null or char_length(trim(p_name)) not between 2 and 50 or p_phone is null or p_phone !~ '^01[016789][0-9]{7,8}$' or p_email is null then raise exception 'invalid_completion' using errcode='22023'; end if;
   if not exists(select 1 from auth.users where id=p_actor and email=p_email and email_confirmed_at is not null) then raise exception 'verified_user_required' using errcode='42501'; end if;
   update public.consultations set user_id=p_actor,name=trim(p_name),phone=p_phone,email=p_email,consent_at=t,consent_version='hokyung-v2-email-1year',completed=true,completed_at=t,step=4,updated_at=t where id=v.id;
   update public.profiles set name=trim(p_name),phone=p_phone,consent_at=coalesce(consent_at,t) where id=p_actor;
  end if;
 end if;
 select * into v from public.consultations where id=v.id;
 return jsonb_build_object('step',v.step,'answers',jsonb_build_array(v.answer1,v.answer2),'completed',v.completed,'reference',case when v.completed then upper(left(v.id::text,8)) else null end);
end;$$;
revoke all on function public.funnel_action(text,text,text,jsonb,integer,text,uuid,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.funnel_action(text,text,text,jsonb,integer,text,uuid,text,text,text,boolean) to service_role;
create function public.purge_expired_consultations() returns void language sql set search_path='' as $$delete from public.consultations where created_at < now()-interval '1 year';$$;
revoke all on function public.purge_expired_consultations() from public,anon,authenticated;
grant execute on function public.purge_expired_consultations() to service_role;
commit;
