-- Apply to the existing project once. No user, password or question is deleted.
begin;
create or replace function public.request_collaborator_password_reset(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target public.collaboration_members; request_id bigint;
begin
 perform 1 from public.collaboration_members where user_id=auth.uid() and active and role='admin' for share;
 if not found then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 select * into target from public.collaboration_members where user_id=p_user_id for share;
 if not found or target.role<>'contributor' then raise exception 'INVALID_MEMBER' using errcode='22023'; end if;
 insert into public.collaboration_audit(actor_id,action,after_data)
 values(auth.uid(),'password_reset_requested',jsonb_build_object('user_id',target.user_id,'email',target.email)) returning id into request_id;
 return jsonb_build_object('user_id',target.user_id,'email',target.email,'request_id',request_id);
end $$;
create or replace function public.complete_collaborator_password_reset(p_request_id bigint,p_success boolean) returns void
language plpgsql security definer set search_path='' as $$
declare started public.collaboration_audit;
begin
 select * into started from public.collaboration_audit where id=p_request_id and action='password_reset_requested' for update;
 if not found or p_success is null then raise exception 'INVALID_RESET_REQUEST' using errcode='22023'; end if;
 if exists(select 1 from public.collaboration_audit where action in ('password_reset','password_reset_failed')
  and after_data->>'reset_request_id'=p_request_id::text) then return; end if;
 insert into public.collaboration_audit(actor_id,action,after_data)
 values(started.actor_id,case when p_success then 'password_reset' else 'password_reset_failed' end,
  started.after_data||jsonb_build_object('reset_request_id',p_request_id));
end $$;
revoke all on function public.request_collaborator_password_reset(uuid),public.complete_collaborator_password_reset(bigint,boolean) from public,anon,authenticated,service_role;
grant execute on function public.request_collaborator_password_reset(uuid) to authenticated;
grant execute on function public.complete_collaborator_password_reset(bigint,boolean) to service_role;
commit;
