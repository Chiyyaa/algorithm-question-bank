-- Additive migration. Existing questions and pending submissions are not changed.
begin;
create table if not exists public.builtin_question_targets (
 subject_id text not null, unit_id text not null, target_id bigint not null check(target_id>0),
 content jsonb not null, primary key(subject_id,unit_id,target_id)
);
create table if not exists public.question_replacements (
 subject_id text not null, unit_id text not null, target_id bigint not null,
 content jsonb not null check(public.collaboration_valid_content(content)), base_content jsonb not null,
 target_kind text not null check(target_kind in ('builtin','shared')),
 revision integer not null default 1, visible boolean not null default true,
 submission_id uuid not null unique references public.question_submissions(id),
 updated_at timestamptz not null default now(), primary key(subject_id,unit_id,target_id),
 foreign key(subject_id,unit_id) references public.collaboration_units
);
create table if not exists public.question_replacement_publications (
 submission_id uuid primary key references public.question_submissions(id),
 subject_id text not null, unit_id text not null, target_id bigint not null,
 is_current boolean not null default true
);
alter table public.builtin_question_targets enable row level security;
alter table public.question_replacements enable row level security;
alter table public.question_replacement_publications enable row level security;
revoke all on public.builtin_question_targets,public.question_replacements,public.question_replacement_publications from public,anon,authenticated;
grant select on public.question_replacements to anon,authenticated;
grant select on public.question_replacement_publications to authenticated;
create policy replacement_public_read on public.question_replacements for select to anon,authenticated
 using(visible or public.collaboration_is_admin());
create policy replacement_publication_read on public.question_replacement_publications for select to authenticated
 using(public.collaboration_is_admin() or exists(select 1 from public.question_submissions q where q.id=submission_id and q.author_id=auth.uid()));

create or replace function public.question_review_content(c jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('question',c->'question','options',c->'options','correct_answer',c->'correct_answer','type',c->'type') ||
 case when c ? 'user_answer' then jsonb_build_object('user_answer',c->'user_answer') else '{}'::jsonb end;
$$;

create or replace function public.get_question_review_target(p_subject text,p_unit text,p_target_id bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare base jsonb; kind text; overlay public.question_replacements;
begin
 if not public.collaboration_is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 select content into base from public.builtin_question_targets where subject_id=p_subject and unit_id=p_unit and target_id=p_target_id;
 kind='builtin';
 if base is null then
  kind='shared';
  select public.question_review_content(content) into base from public.published_questions
   where id=p_target_id and subject_id=p_subject and unit_id=p_unit and visible;
 end if;
 if base is null then raise exception 'REPLACEMENT_TARGET_MISSING' using errcode='22023'; end if;
 select * into overlay from public.question_replacements where subject_id=p_subject and unit_id=p_unit and target_id=p_target_id;
 if overlay.target_id is not null and overlay.base_content is distinct from base then raise exception 'REPLACEMENT_BASE_CHANGED' using errcode='40001'; end if;
 return jsonb_build_object('subject',p_subject,'unit',p_unit,'id',p_target_id,'revision',coalesce(overlay.revision,0),'target_kind',kind,
  'content',case when overlay.visible then overlay.content else base end);
end $$;

create or replace function public.replace_question_submission(p_id uuid,p_revision integer,p_content jsonb,p_note text,
 p_target_unit text,p_target_id bigint,p_target_revision integer,p_target_content jsonb) returns public.question_submissions
language plpgsql security definer set search_path='' as $$
declare old public.question_submissions; result public.question_submissions; target jsonb;
 previous public.question_replacements; base jsonb;
begin
 perform 1 from public.collaboration_members where user_id=auth.uid() and active and role='admin' for share;
 if not found then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_content is null or not public.collaboration_valid_content(p_content) or p_note is null or length(p_note)>2000 then raise exception 'INVALID_CONTENT' using errcode='22023'; end if;
 select * into old from public.question_submissions where id=p_id for update;
 if old.id is null or old.status<>'pending' then raise exception 'NOT_PENDING' using errcode='22023'; end if;
 if old.revision is distinct from p_revision then raise exception 'REVISION_CONFLICT' using errcode='40001'; end if;
 -- Serialize both the first replacement and future replacements of the same target.
 perform pg_advisory_xact_lock(hashtextextended(old.subject_id||':'||p_target_unit||':'||p_target_id::text,0));
 if not exists(select 1 from public.builtin_question_targets where subject_id=old.subject_id and unit_id=p_target_unit and target_id=p_target_id) then
  perform 1 from public.published_questions where id=p_target_id and subject_id=old.subject_id and unit_id=p_target_unit and visible for update;
  if not found then raise exception 'REPLACEMENT_TARGET_MISSING' using errcode='22023'; end if;
 end if;
 target=public.get_question_review_target(old.subject_id,p_target_unit,p_target_id);
 if (target->>'revision')::integer is distinct from p_target_revision or target->'content' is distinct from p_target_content then
  raise exception 'REPLACEMENT_TARGET_CHANGED' using errcode='40001';
 end if;
 select * into previous from public.question_replacements where subject_id=old.subject_id and unit_id=p_target_unit and target_id=p_target_id for update;
 base=coalesce(previous.base_content,target->'content');
 update public.question_replacement_publications set is_current=false where subject_id=old.subject_id and unit_id=p_target_unit and target_id=p_target_id;
 insert into public.question_replacements(subject_id,unit_id,target_id,content,base_content,target_kind,revision,visible,submission_id)
 values(old.subject_id,p_target_unit,p_target_id,p_content,base,target->>'target_kind',p_target_revision+1,true,p_id)
 on conflict(subject_id,unit_id,target_id) do update set content=excluded.content,revision=excluded.revision,visible=true,submission_id=excluded.submission_id,updated_at=now();
 insert into public.question_replacement_publications values(p_id,old.subject_id,p_target_unit,p_target_id,true);
 update public.question_submissions set status='published',content=p_content,unit_id=p_target_unit,revision=revision+1,
  review_note=p_note,reviewer_id=auth.uid(),updated_at=now() where id=p_id returning * into result;
 insert into public.collaboration_audit(actor_id,submission_id,action,before_data,after_data)
 values(auth.uid(),p_id,'replace',jsonb_build_object('submission',to_jsonb(old),'target',target),
  jsonb_build_object('submission',to_jsonb(result),'target',jsonb_build_object('subject',old.subject_id,'unit',p_target_unit,'id',p_target_id,'content',p_content,'revision',p_target_revision+1)));
 return result;
end $$;

alter function public.review_question_submission(uuid,integer,text,jsonb,text) rename to review_question_submission_legacy;
revoke all on function public.review_question_submission_legacy(uuid,integer,text,jsonb,text) from public,anon,authenticated;
create function public.review_question_submission(p_id uuid,p_revision integer,p_action text,p_content jsonb default null,p_note text default '')
returns public.question_submissions language plpgsql security definer set search_path='' as $$
declare link public.question_replacement_publications; old public.question_submissions; result public.question_submissions; before_overlay public.question_replacements;
begin
 if not public.collaboration_is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 select * into link from public.question_replacement_publications where submission_id=p_id;
 if link.submission_id is null then
  if p_action in ('withdraw','restore') and exists(select 1 from public.published_questions p join public.question_replacements r on r.target_kind='shared' and r.subject_id=p.subject_id and r.unit_id=p.unit_id and r.target_id=p.id where p.submission_id=p_id) then raise exception 'REPLACEMENT_SOURCE_IN_USE' using errcode='40001'; end if;
  return public.review_question_submission_legacy(p_id,p_revision,p_action,p_content,p_note);
 end if;
 if p_action is null or p_action not in ('withdraw','restore') or p_content is not null or p_note is null or length(p_note)>2000 then raise exception 'INVALID_ACTION' using errcode='22023'; end if;
 select * into old from public.question_submissions where id=p_id for update;
 if old.status<>'published' then raise exception 'NOT_PUBLISHED' using errcode='22023'; end if;
 if old.revision is distinct from p_revision then raise exception 'REVISION_CONFLICT' using errcode='40001'; end if;
 perform pg_advisory_xact_lock(hashtextextended(link.subject_id||':'||link.unit_id||':'||link.target_id::text,0));
 select * into before_overlay from public.question_replacements where subject_id=link.subject_id and unit_id=link.unit_id and target_id=link.target_id for update;
 if before_overlay.submission_id is distinct from p_id then raise exception 'REPLACEMENT_SUPERSEDED' using errcode='40001'; end if;
 update public.question_replacements set visible=(p_action='restore'),revision=revision+1,updated_at=now() where subject_id=link.subject_id and unit_id=link.unit_id and target_id=link.target_id;
 update public.question_submissions set revision=revision+1,reviewer_id=auth.uid(),review_note=p_note,updated_at=now() where id=p_id returning * into result;
 insert into public.collaboration_audit(actor_id,submission_id,action,before_data,after_data)
 values(auth.uid(),p_id,p_action,jsonb_build_object('submission',to_jsonb(old),'target',to_jsonb(before_overlay)),jsonb_build_object('submission',to_jsonb(result),'visible',p_action='restore'));
 return result;
end $$;
revoke all on function public.question_review_content(jsonb),public.get_question_review_target(text,text,bigint),public.replace_question_submission(uuid,integer,jsonb,text,text,bigint,integer,jsonb),public.review_question_submission(uuid,integer,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.get_question_review_target(text,text,bigint),public.replace_question_submission(uuid,integer,jsonb,text,text,bigint,integer,jsonb),public.review_question_submission(uuid,integer,text,jsonb,text) to authenticated;
-- Catalog INSERT is generated from the reviewed built-in JSON files before deployment.
commit;
