-- Run once in a NEW Supabase project. Passwords are managed by Supabase Auth.
begin;
create table public.collaboration_members (
 user_id uuid primary key references auth.users(id),
 display_name text not null check(length(display_name) between 1 and 80),
 email text not null unique,
 role text not null check(role in ('admin','contributor')),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.collaboration_units (
 subject_id text not null, unit_id text not null,
 primary key(subject_id,unit_id)
);
insert into public.collaboration_units values
 ('algorithm','u2'),('algorithm','u3'),('algorithm','u4'),
 ('os','u3'),('os','u4'),('os','u5'),('os','u6');
create table public.question_submissions (
 id uuid primary key default gen_random_uuid(),
 author_id uuid not null references public.collaboration_members(user_id),
 subject_id text not null, unit_id text not null,
 content jsonb not null,
 status text not null default 'draft' check(status in ('draft','pending','returned','published')),
 revision integer not null default 1,
 review_note text not null default '',
 reviewer_id uuid references public.collaboration_members(user_id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(subject_id,unit_id) references public.collaboration_units
);
create index submissions_author_created on public.question_submissions(author_id,created_at);
create index submissions_status_updated on public.question_submissions(status,updated_at desc);
create table public.published_questions (
 id bigint generated always as identity (start with 1000000000) primary key,
 submission_id uuid not null unique references public.question_submissions(id),
 subject_id text not null, unit_id text not null,
 content jsonb not null,
 visible boolean not null default true,
 published_at timestamptz not null default now(),
 foreign key(subject_id,unit_id) references public.collaboration_units
);
create index published_unit on public.published_questions(subject_id,unit_id,id) where visible;
create table public.collaboration_audit (
 id bigint generated always as identity primary key,
 actor_id uuid not null references public.collaboration_members(user_id),
 submission_id uuid references public.question_submissions(id),
 action text not null,
 before_data jsonb, after_data jsonb,
 created_at timestamptz not null default now()
);

create function public.collaboration_is_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.collaboration_members where user_id=auth.uid() and active and role='admin');
$$;
create function public.collaboration_is_member() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.collaboration_members where user_id=auth.uid() and active);
$$;
create function public.collaboration_valid_content(c jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare v jsonb;
begin
 if jsonb_typeof(c) is distinct from 'object' then return false; end if;
 if not (c ?& array['question','correct_answer','type','options']) then return false; end if;
 if exists(select 1 from jsonb_object_keys(c) k where k not in ('question','correct_answer','type','options')) then return false; end if;
 if jsonb_typeof(c->'question') is distinct from 'string' or jsonb_typeof(c->'correct_answer') is distinct from 'string' then return false; end if;
 if length(btrim(c->>'question')) not between 1 and 10000 or length(btrim(c->>'correct_answer')) not between 1 and 10000 then return false; end if;
 if (c->>'type') not in ('choice','choice_options_missing','fill_blank') or jsonb_typeof(c->'type') is distinct from 'string' then return false; end if;
 if jsonb_typeof(c->'options') is distinct from 'array' then return false; end if;
 if jsonb_array_length(c->'options')>12 then return false; end if;
 for v in select * from jsonb_array_elements(c->'options') loop
  if jsonb_typeof(v) is distinct from 'string' or length(btrim(v #>> '{}')) not between 1 and 2000 then return false; end if;
 end loop;
 if c->>'type'='fill_blank' and jsonb_array_length(c->'options')<>0 then return false; end if;
 if c->>'type'='choice' and jsonb_array_length(c->'options')=0 then return false; end if;
 return true;
end $$;
alter table public.question_submissions add constraint submission_content_valid check(public.collaboration_valid_content(content));
alter table public.published_questions add constraint published_content_valid check(public.collaboration_valid_content(content));

create function public.save_question_submission(
 p_id uuid, p_subject text, p_unit text, p_content jsonb, p_submit boolean, p_revision integer
) returns public.question_submissions
language plpgsql security definer set search_path='' as $$
declare old public.question_submissions; result public.question_submissions;
begin
 -- Lock membership so disabling an account waits for any in-flight mutation.
 perform 1 from public.collaboration_members where user_id=auth.uid() and active for update;
 if not found then raise exception 'MEMBERSHIP_REQUIRED' using errcode='42501'; end if;
 if p_submit is null or not public.collaboration_valid_content(p_content) then raise exception 'INVALID_CONTENT' using errcode='22023'; end if;
 if p_id is null then
  if (select count(*) from public.question_submissions where author_id=auth.uid() and created_at>now()-interval '1 hour')>=300 then raise exception 'SUBMISSION_LIMIT' using errcode='22023'; end if;
  insert into public.question_submissions(author_id,subject_id,unit_id,content,status)
   values(auth.uid(),p_subject,p_unit,p_content,case when p_submit then 'pending' else 'draft' end) returning * into result;
 else
  select * into old from public.question_submissions where id=p_id for update;
  if not found or old.author_id<>auth.uid() then raise exception 'NOT_YOUR_SUBMISSION' using errcode='42501'; end if;
  if old.status not in ('draft','returned') then raise exception 'SUBMISSION_LOCKED' using errcode='22023'; end if;
  if p_revision is distinct from old.revision then raise exception 'REVISION_CONFLICT' using errcode='40001'; end if;
  update public.question_submissions set subject_id=p_subject,unit_id=p_unit,content=p_content,
   status=case when p_submit then 'pending' else 'draft' end,
   revision=revision+1,reviewer_id=null,review_note='',updated_at=now()
   where id=p_id returning * into result;
 end if;
 insert into public.collaboration_audit(actor_id,submission_id,action,before_data,after_data)
 values(auth.uid(),result.id,case when p_submit then 'submit' else 'save_draft' end,
  case when old.id is null then null else to_jsonb(old) end,to_jsonb(result));
 return result;
end $$;

create function public.review_question_submission(
 p_id uuid, p_revision integer, p_action text, p_content jsonb default null, p_note text default ''
) returns public.question_submissions
language plpgsql security definer set search_path='' as $$
declare old public.question_submissions; result public.question_submissions;
begin
 perform 1 from public.collaboration_members where user_id=auth.uid() and active and role='admin' for share;
 if not found then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_action is null or p_action not in ('approve','return','withdraw','restore') or p_note is null or length(p_note)>2000 then raise exception 'INVALID_ACTION' using errcode='22023'; end if;
 select * into old from public.question_submissions where id=p_id for update;
 if not found then raise exception 'NOT_FOUND' using errcode='22023'; end if;
 if p_revision is distinct from old.revision then raise exception 'REVISION_CONFLICT' using errcode='40001'; end if;
 if p_action in ('approve','return') and old.status<>'pending' then raise exception 'NOT_PENDING' using errcode='22023'; end if;
 if p_action in ('withdraw','restore') and old.status<>'published' then raise exception 'NOT_PUBLISHED' using errcode='22023'; end if;
 if p_action='return' and length(btrim(p_note))=0 then raise exception 'RETURN_NOTE_REQUIRED' using errcode='22023'; end if;
 if p_content is not null and (p_action<>'approve' or not public.collaboration_valid_content(p_content)) then raise exception 'INVALID_CONTENT' using errcode='22023'; end if;
 if p_action='approve' then
  insert into public.published_questions(submission_id,subject_id,unit_id,content)
   values(old.id,old.subject_id,old.unit_id,coalesce(p_content,old.content));
 elsif p_action in ('withdraw','restore') then
  update public.published_questions set visible=p_action='restore' where submission_id=old.id;
 end if;
 update public.question_submissions set status=case when p_action='approve' then 'published' when p_action='return' then 'returned' else status end,
  content=case when p_action='approve' then coalesce(p_content,content) else content end,
  review_note=p_note,reviewer_id=auth.uid(),revision=revision+1,updated_at=now()
  where id=p_id returning * into result;
 insert into public.collaboration_audit(actor_id,submission_id,action,before_data,after_data)
  values(auth.uid(),p_id,p_action,to_jsonb(old),to_jsonb(result));
 return result;
end $$;

-- Auth users are created by the protected Edge Function or the project owner.
create function public.grant_question_collaborator(p_email text,p_name text) returns public.collaboration_members
language plpgsql security definer set search_path='' as $$
declare target uuid; result public.collaboration_members;
begin
 if not public.collaboration_is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_email is null or p_name is null or length(btrim(p_name)) not between 1 and 80 then raise exception 'INVALID_MEMBER' using errcode='22023'; end if;
 select id into target from auth.users where lower(email)=lower(btrim(p_email)) and email_confirmed_at is not null;
 if target is null then raise exception 'ACCOUNT_NOT_FOUND' using errcode='22023'; end if;
 if exists(select 1 from public.collaboration_members where user_id=target) then raise exception 'MEMBER_EXISTS' using errcode='22023'; end if;
 insert into public.collaboration_members(user_id,email,display_name,role)
  values(target,lower(btrim(p_email)),btrim(p_name),'contributor') returning * into result;
 insert into public.collaboration_audit(actor_id,action,after_data) values(auth.uid(),'grant_member',to_jsonb(result));
 return result;
end $$;
create function public.set_question_collaborator_active(p_user_id uuid,p_active boolean) returns public.collaboration_members
language plpgsql security definer set search_path='' as $$
declare old public.collaboration_members; result public.collaboration_members;
begin
 if not public.collaboration_is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 select * into old from public.collaboration_members where user_id=p_user_id for update;
 if not found or old.role<>'contributor' or p_active is null then raise exception 'INVALID_MEMBER' using errcode='22023'; end if;
 update public.collaboration_members set active=p_active where user_id=p_user_id returning * into result;
 insert into public.collaboration_audit(actor_id,action,before_data,after_data)
  values(auth.uid(),case when p_active then 'activate_member' else 'disable_member' end,to_jsonb(old),to_jsonb(result));
 return result;
end $$;

alter table public.collaboration_members enable row level security;
alter table public.collaboration_units enable row level security;
alter table public.question_submissions enable row level security;
alter table public.published_questions enable row level security;
alter table public.collaboration_audit enable row level security;
create policy members_read on public.collaboration_members for select to authenticated
 using(user_id=auth.uid() or public.collaboration_is_admin());
create policy units_read on public.collaboration_units for select to anon,authenticated using(true);
create policy submissions_read on public.question_submissions for select to authenticated
 using(public.collaboration_is_member() and (author_id=auth.uid() or public.collaboration_is_admin()));
create policy published_read on public.published_questions for select to anon,authenticated
 using(visible or public.collaboration_is_admin());
create policy audit_read on public.collaboration_audit for select to authenticated
 using(public.collaboration_is_admin() or (public.collaboration_is_member() and exists(
  select 1 from public.question_submissions s where s.id=submission_id and s.author_id=auth.uid())));

-- Never grant direct writes. Status/role checks MUST run inside the RPCs.
revoke all on public.collaboration_members,public.collaboration_units,public.question_submissions,public.published_questions,public.collaboration_audit from public,anon,authenticated;
grant select on public.collaboration_units,public.published_questions to anon,authenticated;
grant select on public.collaboration_members,public.question_submissions,public.collaboration_audit to authenticated;
revoke all on function public.collaboration_is_admin(),public.collaboration_is_member(),public.collaboration_valid_content(jsonb),public.save_question_submission(uuid,text,text,jsonb,boolean,integer),public.review_question_submission(uuid,integer,text,jsonb,text),public.grant_question_collaborator(text,text),public.set_question_collaborator_active(uuid,boolean) from public,anon,authenticated;
grant execute on function public.collaboration_is_admin(),public.collaboration_is_member(),public.collaboration_valid_content(jsonb) to authenticated;
grant execute on function public.collaboration_is_admin() to anon;
grant execute on function public.save_question_submission(uuid,text,text,jsonb,boolean,integer),public.review_question_submission(uuid,integer,text,jsonb,text),public.grant_question_collaborator(text,text),public.set_question_collaborator_active(uuid,boolean) to authenticated;
-- Service role is for the Edge Function only, never the browser.
grant select on public.collaboration_members to service_role;
create function public.published_question_counts() returns table(subject_id text,unit_id text,question_count bigint)
language sql stable security invoker set search_path='' as $$
 select subject_id,unit_id,count(*) from public.published_questions where visible group by subject_id,unit_id;
$$;
revoke all on function public.published_question_counts() from public,anon,authenticated;
grant execute on function public.published_question_counts() to anon,authenticated;
commit;
