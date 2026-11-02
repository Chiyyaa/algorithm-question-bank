-- New protocol runs alongside v1. Existing duel_rooms and duel_api are untouched.
begin;
create table public.duel_v2_rooms (
 code text primary key check(code~'^K[0-9A-F]{7}$'),creator_hash text not null unique,
 subject text not null check(subject in ('algorithm','os')),host integer not null default 0,
 status text not null default 'waiting',round integer not null default 1,
 players jsonb not null,items jsonb not null default '[]',last_result jsonb,
 created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null default clock_timestamp()+interval '5 minutes',
 starts_at timestamptz,deadline timestamptz,finished_at timestamptz,reason text,winner integer,
 revision bigint not null default 1
);
create index duel_v2_created on public.duel_v2_rooms(created_at);
alter table public.duel_v2_rooms enable row level security;
revoke all on public.duel_v2_rooms from public,anon,authenticated;

create function public.classic_tick(c text) returns public.duel_v2_rooms language plpgsql set search_path=public,pg_temp as $$
declare r public.duel_v2_rooms;t timestamptz=clock_timestamp();p jsonb;i integer;n integer=0;done integer=0;changed boolean=false;remaining integer;had_afk boolean=false;
begin
 select * into r from public.duel_v2_rooms where code=c for update;if not found then raise exception 'ROOM_NOT_FOUND';end if;
 if r.status='waiting' and t>=r.expires_at then r.status='expired';r.reason='waiting_timeout';changed=true;
 elsif r.status='playing' then
  for i in 0..jsonb_array_length(r.players)-1 loop
   p=r.players->i;
   if coalesce((p->>'inRound')::boolean,false) and not coalesce((p->>'forfeit')::boolean,false) then
    if t>=r.starts_at and p->>'finished_at' is null and (p->>'last_answer_at')::timestamptz+interval '120 seconds'<=t and (p->>'last_answer_at')::timestamptz+interval '120 seconds'<r.deadline then
     r.players=jsonb_set(jsonb_set(r.players,array[i::text,'forfeit'],'true'),array[i::text,'present'],'false');changed=true;had_afk=true;
    else n=n+1;remaining=i;if p->>'finished_at' is not null then done=done+1;end if;
    end if;
   end if;
  end loop;
  if n=0 then r.status='finished';r.reason='all_abandoned';r.winner=null;changed=true;
  elsif n=1 then r.status='finished';r.reason='last_remaining';r.winner=remaining;changed=true;
  elsif done=n or t>=r.deadline then r.status='finished';r.reason=case when t>=r.deadline then 'time_limit' else 'completed' end;changed=true;
  end if;
 end if;
 if changed then
  update public.duel_v2_rooms set status=r.status,players=r.players,reason=r.reason,winner=r.winner,
   finished_at=case when r.status in ('finished','expired') then coalesce(r.finished_at,t) else r.finished_at end,revision=revision+1
   where code=c returning * into r;
 end if;
 return r;
end $$;

create function public.classic_view(r public.duel_v2_rooms,seat integer,include_previous boolean default true) returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare p jsonb;s jsonb;players jsonb='[]';questions jsonb='[]';solutions jsonb='[]';records jsonb='[]';i integer;j integer;score integer;other_score integer;rank_value integer;done integer;idle numeric;elapsed numeric;finish_value timestamptz;other_finish timestamptz;allowed boolean;winner_value integer;top_count integer=0;previous public.duel_v2_rooms;old_seat integer;h text;
begin
 allowed=r.status='finished' and r.reason<>'all_abandoned' and coalesce((r.players->seat->>'inRound')::boolean,false);winner_value=r.winner;
 for i in 0..jsonb_array_length(r.players)-1 loop
  p=r.players->i;done=jsonb_array_length(p->'answers');
  select count(*) into score from jsonb_array_elements(p->'answers') a where (a->>'correct')::boolean;
  rank_value=null;
  if allowed and coalesce((p->>'inRound')::boolean,false) and not coalesce((p->>'forfeit')::boolean,false) then
   rank_value=1;finish_value=coalesce((p->>'finished_at')::timestamptz,r.deadline);
   if r.reason<>'last_remaining' then
    for j in 0..jsonb_array_length(r.players)-1 loop
     if j<>i and coalesce((r.players->j->>'inRound')::boolean,false) and not coalesce((r.players->j->>'forfeit')::boolean,false) then
      select count(*) into other_score from jsonb_array_elements(r.players->j->'answers') a where (a->>'correct')::boolean;
      other_finish=coalesce((r.players->j->>'finished_at')::timestamptz,r.deadline);
      if other_score>score or other_score=score and other_finish<finish_value then rank_value=rank_value+1;end if;
     end if;
    end loop;
   end if;
  end if;
  if rank_value=1 then top_count=top_count+1;winner_value=i;end if;
  idle=case when r.status='playing' and coalesce((p->>'inRound')::boolean,false) and not coalesce((p->>'forfeit')::boolean,false) and p->>'finished_at' is null then greatest(0,extract(epoch from clock_timestamp()-(p->>'last_answer_at')::timestamptz)) else 0 end;
  s=jsonb_build_object('seat',i,'nickname',p->>'nickname','present',coalesce((p->>'present')::boolean,false),'inRound',coalesce((p->>'inRound')::boolean,false),'ready',coalesce((p->>'ready')::boolean,false),'verified',coalesce((p->>'verified')::boolean,false),'progress',done,'finished',p->>'finished_at' is not null,'forfeit',coalesce((p->>'forfeit')::boolean,false),'idleSeconds',floor(idle));
  if r.status='finished' then
   elapsed=greatest(0,extract(epoch from coalesce((p->>'finished_at')::timestamptz,r.finished_at)-r.starts_at));
   s=s||jsonb_build_object('score',score,'elapsed',elapsed,'rank',rank_value);
  end if;
  players=players||jsonb_build_array(s);
 end loop;
 if top_count<>1 then winner_value=null;end if;
 if r.status in ('playing','finished') then select coalesce(jsonb_agg(x->'prompt' order by n),'[]') into questions from jsonb_array_elements(r.items) with ordinality a(x,n);end if;
 if allowed then
  select coalesce(jsonb_agg(jsonb_build_object('answer',x->'solution'->'answerText','explanation',x->'solution'->'explanation') order by n),'[]') into solutions from jsonb_array_elements(r.items) with ordinality a(x,n);
  for i in 0..jsonb_array_length(r.items)-1 loop
   s='[]';for j in 0..jsonb_array_length(r.players)-1 loop
    if coalesce((r.players->j->>'inRound')::boolean,false) then
     p=r.players->j->'answers'->i;
     s=s||jsonb_build_array(jsonb_build_object('seat',j,'response',p->'response','correct',p->'correct','submitted',p is not null));
    end if;
   end loop;records=records||jsonb_build_array(s);
  end loop;
 end if;
 s=jsonb_build_object('version',2,'code',r.code,'subject',r.subject,'status',r.status,'round',r.round,'host',r.host,'seat',seat,'players',players,'questions',questions,'solutions',solutions,'records',records,'startsAt',r.starts_at,'deadline',r.deadline,'expiresAt',r.expires_at,'reason',r.reason,'winner',winner_value,'revision',r.revision,'serverNow',clock_timestamp());
 if not coalesce((r.players->seat->>'verified')::boolean,false) and r.status='waiting' and coalesce((r.players->seat->>'present')::boolean,false) then select prompt into p from public.duel_checks where id=r.players->seat->>'verification_id';s=s||jsonb_build_object('verification',p);end if;
 if include_previous and r.last_result is not null then
  h=r.players->seat->>'token_hash';old_seat=null;
  for i in 0..jsonb_array_length(r.last_result->'players')-1 loop if r.last_result->'players'->i->>'token_hash'=h and coalesce((r.last_result->'players'->i->>'inRound')::boolean,false) then old_seat=i;exit;end if;end loop;
  if old_seat is not null then previous=jsonb_populate_record(null::public.duel_v2_rooms,r.last_result);s=s||jsonb_build_object('previous',public.classic_view(previous,old_seat,false));end if;
 end if;
 return s;
end $$;

create function public.duel_api_v2(p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.duel_v2_rooms;p jsonb;seat integer;code_value text;token text;h text;nickname text;subject_value text;check_id text;response jsonb;answer_index integer;item jsonb;t timestamptz=clock_timestamp();units text[];u text;selected jsonb='[]';fingerprints text[]='{}';q public.duel_catalog;i integer;n integer;target integer;expected_check integer;old_items jsonb;previous jsonb;
begin
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>50000 then raise exception 'INVALID_REQUEST';end if;
 if p_action in ('create','join') then
  nickname=btrim(p_payload->>'nickname');if nickname is null or length(nickname) not between 1 and 20 or nickname~'[[:cntrl:]]' then raise exception 'INVALID_NICKNAME';end if;
  token=coalesce(p_payload->>'token',gen_random_uuid()::text||gen_random_uuid()::text);if length(token)<>72 or token!~'^[0-9a-f-]+$' then raise exception 'INVALID_REQUEST';end if;
  h=encode(sha256(convert_to(token,'UTF8')),'hex');
 end if;
 if p_action='create' then
  subject_value=p_payload->>'subject';if subject_value is null or subject_value not in ('algorithm','os') then raise exception 'INVALID_SUBJECT';end if;
  select * into r from public.duel_v2_rooms where creator_hash=h for update;
  if found then for i in 0..jsonb_array_length(r.players)-1 loop if r.players->i->>'token_hash'=h then return public.classic_view(public.classic_tick(r.code),i)||jsonb_build_object('token',token);end if;end loop;raise exception 'NOT_A_PLAYER';end if;
  if(select count(*) from public.duel_v2_rooms where created_at>t-interval '1 minute')>=60 then raise exception 'ROOM_RATE_LIMIT';end if;
  if(select count(distinct unit) from public.duel_catalog where subject=subject_value) not between 1 and 10 then raise exception 'BANK_NOT_READY';end if;
  select id into check_id from public.duel_checks order by random() limit 1;if check_id is null then raise exception 'BANK_NOT_READY';end if;
  p=jsonb_build_object('token_hash',h,'nickname',nickname,'present',true,'inRound',false,'verified',false,'ready',false,'verification_id',check_id,'answers','[]'::jsonb,'forfeit',false);
  loop
   code_value='K'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,7));
   begin insert into public.duel_v2_rooms(code,creator_hash,subject,players) values(code_value,h,subject_value,jsonb_build_array(p)) returning * into r;exit;
   exception when unique_violation then select * into r from public.duel_v2_rooms where creator_hash=h for update;if found then for i in 0..jsonb_array_length(r.players)-1 loop if r.players->i->>'token_hash'=h then return public.classic_view(public.classic_tick(r.code),i)||jsonb_build_object('token',token);end if;end loop;raise exception 'NOT_A_PLAYER';end if;end;
  end loop;return public.classic_view(r,0)||jsonb_build_object('token',token);
 end if;
 code_value=upper(btrim(p_payload->>'code'));if code_value is null or code_value!~'^K[0-9A-F]{7}$' then raise exception 'ROOM_NOT_FOUND';end if;
 select * into r from public.duel_v2_rooms where code=code_value for update;if not found then raise exception 'ROOM_NOT_FOUND';end if;
 if p_action='join' then
  for i in 0..jsonb_array_length(r.players)-1 loop if r.players->i->>'token_hash'=h then return public.classic_view(public.classic_tick(r.code),i)||jsonb_build_object('token',token);end if;end loop;
  if r.status<>'waiting' or t>=r.expires_at then raise exception 'ROOM_CLOSED';end if;
  select count(*) into n from jsonb_array_elements(r.players) a where coalesce((a->>'present')::boolean,false);if n>=3 then raise exception 'ROOM_FULL';end if;
  select id into check_id from public.duel_checks order by random() limit 1;
  p=jsonb_build_object('token_hash',h,'nickname',nickname,'present',true,'inRound',false,'verified',false,'ready',false,'verification_id',check_id,'answers','[]'::jsonb,'forfeit',false);
  target=jsonb_array_length(r.players);for i in 0..jsonb_array_length(r.players)-1 loop if not coalesce((r.players->i->>'present')::boolean,false) then target=i;exit;end if;end loop;
  if target=jsonb_array_length(r.players) then r.players=r.players||jsonb_build_array(p);else r.players=jsonb_set(r.players,array[target::text],p);end if;
  update public.duel_v2_rooms set players=r.players,revision=revision+1 where code=code_value returning * into r;
  return public.classic_view(r,target)||jsonb_build_object('token',token);
 end if;
 token=p_payload->>'token';if token is null or length(token)<>72 then raise exception 'NOT_A_PLAYER';end if;h=encode(sha256(convert_to(token,'UTF8')),'hex');seat=null;
 for i in 0..jsonb_array_length(r.players)-1 loop if r.players->i->>'token_hash'=h then seat=i;exit;end if;end loop;if seat is null then raise exception 'NOT_A_PLAYER';end if;
 r=public.classic_tick(code_value);p=r.players->seat;
 if p_action='state' then return public.classic_view(r,seat);end if;
 if p_action in ('ready','start','answer') and ((p_payload->>'round') is null or (p_payload->>'round')!~'^[0-9]+$' or (p_payload->>'round')::integer<>r.round) then raise exception 'ROUND_CHANGED';end if;
 if p_action='rematch' and ((p_payload->>'round') is null or (p_payload->>'round')!~'^[0-9]+$') then raise exception 'ROUND_CHANGED';end if;
 if p_action='rematch' and (p_payload->>'round')::integer<>r.round and r.status<>'waiting' then return public.classic_view(r,seat);end if;
 if p_action='rematch' and (p_payload->>'round')::integer<r.round-1 then return public.classic_view(r,seat);end if;
 if p_action='rematch' and (p_payload->>'round')::integer>r.round then raise exception 'ROUND_CHANGED';end if;
 if p_action='rematch' and r.status='finished' then
  if not coalesce((p->>'verified')::boolean,false) then raise exception 'VERIFICATION_REQUIRED';end if;
  previous=to_jsonb(r)-'last_result';
  for i in 0..jsonb_array_length(r.players)-1 loop
   p=r.players->i;p=(p-'last_answer_at'-'finished_at')||jsonb_build_object('present',coalesce((p->>'present')::boolean,false) and not coalesce((p->>'forfeit')::boolean,false),'inRound',false,'answers','[]'::jsonb,'ready',false,'forfeit',false);
   if i=seat then p=p||jsonb_build_object('present',true,'ready',true);end if;r.players=jsonb_set(r.players,array[i::text],p);
  end loop;
  if not coalesce((r.players->r.host->>'present')::boolean,false) then for i in 0..jsonb_array_length(r.players)-1 loop if(r.players->i->>'present')::boolean then r.host=i;exit;end if;end loop;end if;
  update public.duel_v2_rooms set round=round+1,status='waiting',players=r.players,host=r.host,last_result=previous,items='[]',starts_at=null,deadline=null,finished_at=null,reason=null,winner=null,expires_at=t+interval '5 minutes',revision=revision+1 where code=code_value returning * into r;
  return public.classic_view(r,seat);
 end if;
 if r.status in ('finished','expired') then return public.classic_view(r,seat);end if;
 if p_action in ('verify','ready','start','rematch') and r.status<>'waiting' then return public.classic_view(r,seat);end if;
 if p_action='verify' then
  if not coalesce((p->>'present')::boolean,false) then raise exception 'NOT_A_PLAYER';end if;
  if not coalesce((p->>'verified')::boolean,false) then
   select expected into expected_check from public.duel_checks where id=p->>'verification_id';
   if jsonb_typeof(p_payload->'answer') is distinct from 'number' or (p_payload->>'answer')!~'^[0-9]+$' or (p_payload->>'answer')::integer<>expected_check then
    r.players=jsonb_set(jsonb_set(r.players,array[seat::text,'present'],'false'),array[seat::text,'ready'],'false');
    select min(a.ord-1),count(*) into target,n from jsonb_array_elements(r.players) with ordinality a(x,ord) where coalesce((x->>'present')::boolean,false);
    update public.duel_v2_rooms set players=r.players,host=case when host=seat and n>0 then target else host end,status=case when n=0 then 'expired' else status end,reason=case when n=0 then 'verification_failed' else reason end,revision=revision+1 where code=code_value returning * into r;
    return public.classic_view(r,seat)||jsonb_build_object('verificationFailed',true);
   end if;
   update public.duel_v2_rooms set players=jsonb_set(players,array[seat::text,'verified'],'true'),revision=revision+1 where code=code_value returning * into r;
  end if;
 elsif p_action in ('ready','rematch') then
  if not coalesce((p->>'verified')::boolean,false) then raise exception 'VERIFICATION_REQUIRED';end if;
  r.players=jsonb_set(jsonb_set(r.players,array[seat::text,'present'],'true'),array[seat::text,'ready'],'true');
  update public.duel_v2_rooms set players=r.players,revision=revision+1 where code=code_value returning * into r;
 elsif p_action='start' then
  if seat<>r.host then raise exception 'HOST_ONLY';end if;
  select count(*) into n from jsonb_array_elements(r.players) a where coalesce((a->>'present')::boolean,false);if n<2 then raise exception 'NEED_TWO_PLAYERS';end if;
  if exists(select 1 from jsonb_array_elements(r.players) a where coalesce((a->>'present')::boolean,false) and (not coalesce((a->>'ready')::boolean,false) or not coalesce((a->>'verified')::boolean,false))) then raise exception 'NOT_ALL_READY';end if;
  select array_agg(unit order by random()) into units from(select distinct unit from public.duel_catalog where subject=r.subject) x;
  for i in 1..10 loop
   u=units[1+((i-1)%array_length(units,1))];
   select * into q from public.duel_catalog c where c.subject=r.subject and c.unit=u and not(c.fingerprint=any(fingerprints)) and not exists(select 1 from jsonb_array_elements(coalesce(r.last_result->'items','[]')) old where old->'prompt'->>'unit'=c.unit and (old->'prompt'->>'id')::bigint=c.question_id) order by random() limit 1;
   if not found then select * into q from public.duel_catalog where subject=r.subject and unit=u and not(fingerprint=any(fingerprints)) order by random() limit 1;end if;
   if not found then raise exception 'BANK_NOT_READY';end if;
   selected=selected||jsonb_build_array(jsonb_build_object('prompt',q.prompt,'solution',q.solution));fingerprints=array_append(fingerprints,q.fingerprint);
  end loop;select jsonb_agg(x order by random()) into selected from jsonb_array_elements(selected) x;
  if r.last_result is not null and selected=r.last_result->'items' then selected=(selected-0)||jsonb_build_array(selected->0);end if;
  for i in 0..jsonb_array_length(r.players)-1 loop
   p=r.players->i;p=p||jsonb_build_object('inRound',coalesce((p->>'present')::boolean,false),'last_answer_at',t+interval '3 seconds');r.players=jsonb_set(r.players,array[i::text],p);
  end loop;
  update public.duel_v2_rooms set status='playing',players=r.players,items=selected,starts_at=t+interval '3 seconds',deadline=t+interval '603 seconds',revision=revision+1 where code=code_value returning * into r;
 elsif p_action='answer' then
  if r.status<>'playing' or t<r.starts_at then raise exception 'NOT_STARTED';end if;
  if not coalesce((p->>'inRound')::boolean,false) or coalesce((p->>'forfeit')::boolean,false) then return public.classic_view(r,seat);end if;
  if (p_payload->>'round') is null or (p_payload->>'round')!~'^[0-9]+$' or (p_payload->>'round')::integer<>r.round then raise exception 'ROUND_CHANGED';end if;
  if (p_payload->>'index') is null or (p_payload->>'index')!~'^[0-9]$' then raise exception 'QUESTION_ORDER';end if;answer_index=(p_payload->>'index')::integer;
  if answer_index<jsonb_array_length(p->'answers') then return public.classic_view(r,seat);end if;if answer_index<>jsonb_array_length(p->'answers') then raise exception 'QUESTION_ORDER';end if;
  response=p_payload->'response';if response is null or jsonb_typeof(response)<>'array' or jsonb_array_length(response)>20 then raise exception 'INVALID_RESPONSE';end if;item=r.items->answer_index;
  if item->'prompt'->>'kind'='fill' then
   if jsonb_array_length(response)<>(item->'prompt'->>'blankCount')::integer then raise exception 'INVALID_RESPONSE';end if;
   for i in 0..jsonb_array_length(response)-1 loop if jsonb_typeof(response->i)<>'string' or length(response->>i)>4000 or btrim(response->>i)='' then raise exception 'INVALID_RESPONSE';end if;end loop;
  elsif jsonb_array_length(response)=0 then raise exception 'INVALID_RESPONSE';end if;
  p=jsonb_set(p,'{answers}',(p->'answers')||jsonb_build_array(jsonb_build_object('response',response,'correct',public.duel_grade(item,response),'submitted_at',t)));
  p=jsonb_set(p,'{last_answer_at}',to_jsonb(t));if answer_index=9 then p=jsonb_set(p,'{finished_at}',to_jsonb(t));end if;
  update public.duel_v2_rooms set players=jsonb_set(players,array[seat::text],p),revision=revision+1 where code=code_value returning * into r;r=public.classic_tick(code_value);
 elsif p_action='leave' then
  r.players=jsonb_set(jsonb_set(r.players,array[seat::text,'present'],'false'),array[seat::text,'ready'],'false');
  if r.status='playing' then r.players=jsonb_set(r.players,array[seat::text,'forfeit'],'true');end if;
  select min(a.ord-1),count(*) into target,n from jsonb_array_elements(r.players) with ordinality a(x,ord) where coalesce((x->>'present')::boolean,false);
  update public.duel_v2_rooms set players=r.players,host=case when host=seat and n>0 then target else host end,status=case when status='waiting' and n=0 then 'expired' else status end,reason=case when status='waiting' and n=0 then 'player_left' else reason end,revision=revision+1 where code=code_value returning * into r;r=public.classic_tick(code_value);
 else raise exception 'INVALID_ACTION';end if;
 return public.classic_view(r,seat);
end $$;
revoke all on function public.classic_tick(text),public.classic_view(public.duel_v2_rooms,integer,boolean),public.duel_api_v2(text,jsonb) from public,anon,authenticated;
grant execute on function public.duel_api_v2(text,jsonb) to anon,authenticated;
commit;
