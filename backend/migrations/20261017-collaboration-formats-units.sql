-- Apply after schema.sql (and password-reset migration when installed). Existing content remains unchanged.
begin;
create or replace function public.collaboration_valid_content(c jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare v jsonb;
begin
 if jsonb_typeof(c) is distinct from 'object' then return false; end if;
 if not (c ?& array['question','correct_answer','type','options']) then return false; end if;
 if exists(select 1 from jsonb_object_keys(c) k where k not in ('question','correct_answer','type','options','user_answer')) then return false; end if;
 if jsonb_typeof(c->'question') is distinct from 'string' or jsonb_typeof(c->'correct_answer') is distinct from 'string' then return false; end if;
 if length(btrim(c->>'question')) not between 1 and 10000 or length(btrim(c->>'correct_answer')) not between 1 and 10000 then return false; end if;
 if (c->>'type') not in ('choice','choice_options_missing','fill_blank','short_answer') or jsonb_typeof(c->'type') is distinct from 'string' then return false; end if;
 if jsonb_typeof(c->'options') is distinct from 'array' then return false; end if;
 if jsonb_array_length(c->'options')>12 then return false; end if;
 for v in select * from jsonb_array_elements(c->'options') loop
  if jsonb_typeof(v) is distinct from 'string' or length(btrim(v #>> '{}')) not between 1 and 2000 then return false; end if;
 end loop;
 if c ? 'user_answer' and (jsonb_typeof(c->'user_answer') is distinct from 'string' or length(c->>'user_answer')>10000) then return false; end if;
 if c->>'type'='short_answer' and jsonb_array_length(c->'options')<>0 then return false; end if;
 if c->>'type'='fill_blank' and jsonb_array_length(c->'options')<>0 then return false; end if;
 if c->>'type'='choice' and jsonb_array_length(c->'options')=0 then return false; end if;
 return true;
end $$;

alter table public.collaboration_units add column if not exists created_by uuid references public.collaboration_members(user_id);
alter table public.collaboration_units add column if not exists created_at timestamptz not null default now();
create or replace function public.create_collaboration_unit(p_subject text,p_unit text)
returns public.collaboration_units language plpgsql security definer set search_path='' as $$
declare result public.collaboration_units;
begin
 perform 1 from public.collaboration_members where user_id=auth.uid() and active for update;
 if not found then raise exception 'MEMBERSHIP_REQUIRED' using errcode='42501'; end if;
 if p_subject is null or p_subject not in ('algorithm','os') or p_unit is null or p_unit !~ '^u([2-9]|[1-9][0-9]{1,2})$' then raise exception 'INVALID_UNIT' using errcode='22023'; end if;
 select * into result from public.collaboration_units where subject_id=p_subject and unit_id=p_unit;
 if found then return result; end if;
 if (select count(*) from public.collaboration_units where created_by=auth.uid() and created_at>now()-interval '1 hour')>=10 then raise exception 'UNIT_LIMIT' using errcode='22023'; end if;
 insert into public.collaboration_units(subject_id,unit_id,created_by) values(p_subject,p_unit,auth.uid()) on conflict do nothing returning * into result;
 if not found then
  select * into result from public.collaboration_units where subject_id=p_subject and unit_id=p_unit;
 else
  insert into public.collaboration_audit(actor_id,action,after_data) values(auth.uid(),'create_unit',jsonb_build_object('subject_id',p_subject,'unit_id',p_unit));
 end if;
 return result;
end $$;
revoke all on function public.create_collaboration_unit(text,text) from public,anon,authenticated;
grant execute on function public.create_collaboration_unit(text,text) to authenticated;
alter policy units_read on public.collaboration_units using (
 (subject_id='algorithm' and unit_id in ('u2','u3','u4')) or
 (subject_id='os' and unit_id in ('u3','u4','u5','u6')) or
 public.collaboration_is_member() or exists (
  select 1 from public.published_questions p where p.subject_id=collaboration_units.subject_id and p.unit_id=collaboration_units.unit_id and p.visible
 )
);
-- The policy is evaluated by anonymous readers too; this function returns only a boolean.
grant execute on function public.collaboration_is_member() to anon;
-- Keep creator identity private even for published units.
revoke select on public.collaboration_units from anon,authenticated;
grant select(subject_id,unit_id) on public.collaboration_units to anon,authenticated;
commit;
