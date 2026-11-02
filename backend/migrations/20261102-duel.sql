-- Friend duels are isolated from collaboration accounts and question maintenance.
begin;
create table public.duel_catalog (
 subject text not null check(subject in ('algorithm','os')), unit text not null,
 question_id bigint not null, prompt jsonb not null, solution jsonb not null,
 fingerprint text not null, primary key(subject,unit,question_id)
);
create table public.duel_checks (id text primary key, prompt jsonb not null, expected integer not null);
create table public.duel_rooms (
 code text primary key, creator_hash text not null unique, subject text not null check(subject in ('algorithm','os')),
 status text not null default 'waiting', players jsonb not null,
 items jsonb not null default '[]', created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '5 minutes',
 starts_at timestamptz, deadline timestamptz, finished_at timestamptz,
 reason text, winner integer, revision bigint not null default 1
);
create index duel_rooms_created on public.duel_rooms(created_at);
alter table public.duel_catalog enable row level security;
alter table public.duel_checks enable row level security;
alter table public.duel_rooms enable row level security;
revoke all on public.duel_catalog,public.duel_checks,public.duel_rooms from public,anon,authenticated;

create function public.duel_normalize(v text) returns text language plpgsql immutable set search_path=public,pg_temp as $$
declare t text; n text;
begin
 t=normalize(replace(replace(coalesce(v,''),'²','^2'),'³','^3'),NFKC);
 t=replace(replace(replace(replace(t,'，',','),'、',','),'−','-'),'–','-');
 t=regexp_replace(t,'big[\s_-]*omega','@bigomega','gi');t=replace(t,'Ω','@bigomega');
 t=regexp_replace(t,'ω|\momega\M','@smallomega','g');
 t=regexp_replace(t,'big[\s_-]*theta|Θ|θ|\mtheta\M','@theta','gi');
 t=regexp_replace(t,'\mbig[\s_-]*o(?=\s*\()','@bigo','gi');
 t=regexp_replace(t,'(^|[^a-zA-Z])O(?=\s*\()','\1@bigo','g');
 t=regexp_replace(t,'(^|[^a-zA-Z])o(?=\s*\()','\1@smallo','g');
 t=regexp_replace(lower(t),'\s+','','g');
 if t~'^-?[0-9]+(\.[0-9]+)?(,-?[0-9]+(\.[0-9]+)?)*$' then
  select string_agg(trim_scale(x::numeric)::text,',' order by i) into n from unnest(string_to_array(t,',')) with ordinality a(x,i);t=n;
 end if;
 return t;
end $$;

create function public.duel_grade(item jsonb,response jsonb) returns boolean language plpgsql immutable set search_path=public,pg_temp as $$
declare s jsonb=item->'solution'; i integer; value jsonb; selected jsonb;
begin
 if jsonb_typeof(response)<>'array' or jsonb_array_length(response)>20 then return false;end if;
 if item->'prompt'->>'kind'='fill' then
  if jsonb_array_length(response)<>jsonb_array_length(s->'answerKeys') then return false;end if;
  for i in 0..jsonb_array_length(response)-1 loop
   if jsonb_typeof(response->i)<>'string' or length(response->>i)>4000 or btrim(response->>i)='' or public.duel_normalize(response->>i)<>s->'answerKeys'->>i then return false;end if;
  end loop;return true;
 end if;
 if jsonb_array_length(response)=0 then return false;end if;
 for value in select * from jsonb_array_elements(response) loop
  if jsonb_typeof(value)<>'number' or (value#>>'{}')!~'^[0-9]+$' or (value#>>'{}')::integer>=jsonb_array_length(item->'prompt'->'options') then return false;end if;
 end loop;
 select jsonb_agg(v order by (v#>>'{}')::integer) into selected from(select distinct v from jsonb_array_elements(response) a(v)) x;
 return selected=s->'expected';
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end $$;

create function public.duel_tick(c text) returns public.duel_rooms language plpgsql set search_path=public,pg_temp as $$
declare r public.duel_rooms; t timestamptz=clock_timestamp(); p0 jsonb;p1 jsonb;idle0 boolean;idle1 boolean;n0 integer;n1 integer;f0 timestamptz;f1 timestamptz;
begin
 select * into r from public.duel_rooms where code=c for update;
 if not found then raise exception 'ROOM_NOT_FOUND';end if;
 if r.status='waiting' and t>=r.expires_at then r.status='expired';r.reason='waiting_timeout';
 elsif r.status='playing' and t>=r.starts_at then
  p0=r.players->0;p1=r.players->1;
  idle0=(p0->>'finished_at') is null and (p0->>'last_answer_at')::timestamptz+interval '120 seconds'<=t and (p0->>'last_answer_at')::timestamptz+interval '120 seconds'<r.deadline;
  idle1=(p1->>'finished_at') is null and (p1->>'last_answer_at')::timestamptz+interval '120 seconds'<=t and (p1->>'last_answer_at')::timestamptz+interval '120 seconds'<r.deadline;
  if idle0 or idle1 then
   r.status='finished';r.reason=case when idle0 and idle1 then 'both_afk' else 'afk_forfeit' end;
   r.winner=case when idle0 and idle1 then null when idle0 then 1 else 0 end;
   if idle0 then r.players=jsonb_set(r.players,'{0,forfeit}','true');end if;
   if idle1 then r.players=jsonb_set(r.players,'{1,forfeit}','true');end if;
  elsif t>=r.deadline or ((p0->>'finished_at') is not null and (p1->>'finished_at') is not null) then
   r.status='finished';r.reason=case when t>=r.deadline then 'time_limit' else 'completed' end;
   select count(*) into n0 from jsonb_array_elements(p0->'answers') a where (a->>'correct')::boolean;
   select count(*) into n1 from jsonb_array_elements(p1->'answers') a where (a->>'correct')::boolean;
   f0=coalesce((p0->>'finished_at')::timestamptz,r.deadline);f1=coalesce((p1->>'finished_at')::timestamptz,r.deadline);
   r.winner=case when n0>n1 then 0 when n1>n0 then 1 when f0<f1 then 0 when f1<f0 then 1 else null end;
  end if;
 end if;
 if r.status in ('finished','expired') and r.finished_at is null then
  update public.duel_rooms set status=r.status,reason=r.reason,winner=r.winner,players=r.players,finished_at=t,revision=revision+1 where code=c returning * into r;
 end if;
 return r;
end $$;

create function public.duel_view(r public.duel_rooms,seat integer) returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare p jsonb; s jsonb; players jsonb='[]'; questions jsonb='[]'; solutions jsonb='[]'; i integer;score integer;done integer;idle numeric;allowed boolean;
begin
 allowed=r.status='finished' and r.reason<>'both_afk';
 for i in 0..jsonb_array_length(r.players)-1 loop
  p=r.players->i;done=jsonb_array_length(p->'answers');
  select count(*) into score from jsonb_array_elements(p->'answers') a where (a->>'correct')::boolean;
  idle=case when r.status='playing' and (p->>'finished_at') is null then greatest(0,extract(epoch from clock_timestamp()-(p->>'last_answer_at')::timestamptz)) else 0 end;
  s=jsonb_build_object('nickname',p->>'nickname','ready',coalesce((p->>'ready')::boolean,false),'verified',coalesce((p->>'verified')::boolean,false),'progress',done,'finished',p->>'finished_at' is not null,'forfeit',coalesce((p->>'forfeit')::boolean,false),'idleSeconds',floor(idle));
  if r.status='finished' then s=s||jsonb_build_object('score',score,'elapsed',extract(epoch from coalesce((p->>'finished_at')::timestamptz,r.finished_at)-r.starts_at));end if;
  players=players||jsonb_build_array(s);
 end loop;
 if r.status in ('playing','finished') then
  select coalesce(jsonb_agg(x->'prompt' order by n),'[]') into questions from jsonb_array_elements(r.items) with ordinality a(x,n);
 end if;
 if allowed then select coalesce(jsonb_agg(jsonb_build_object('answer',x->'solution'->'answerText','explanation',x->'solution'->'explanation') order by n),'[]') into solutions from jsonb_array_elements(r.items) with ordinality a(x,n);end if;
 s=jsonb_build_object('code',r.code,'subject',r.subject,'status',r.status,'seat',seat,'players',players,'questions',questions,'solutions',solutions,'startsAt',r.starts_at,'deadline',r.deadline,'expiresAt',r.expires_at,'reason',r.reason,'winner',r.winner,'revision',r.revision,'serverNow',clock_timestamp());
 if not coalesce((r.players->seat->>'verified')::boolean,false) and r.status='waiting' then
  select prompt into p from public.duel_checks where id=r.players->seat->>'verification_id';s=s||jsonb_build_object('verification',p);
 end if;
 if allowed then
  select coalesce(jsonb_agg(jsonb_build_object('response',a->'response','correct',a->'correct') order by n),'[]') into p from jsonb_array_elements(r.players->seat->'answers') with ordinality x(a,n);
  s=s||jsonb_build_object('responses',p);
 end if;
 return s;
end $$;

create function public.duel_api(p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.duel_rooms; p jsonb; seat integer; code_value text; token text; token_hash text; nickname text; subject_value text;check_id text; response jsonb;answer_index integer;item jsonb;is_correct boolean;t timestamptz=clock_timestamp();units text[];unit_value text;selected jsonb='[]';fingerprints text[]='{}';q public.duel_catalog;i integer;expected_check integer;result jsonb;
begin
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>50000 then raise exception 'INVALID_REQUEST';end if;
 if p_action in ('create','join') then
  nickname=btrim(p_payload->>'nickname');if nickname is null or length(nickname) not between 1 and 20 or nickname~'[[:cntrl:]]' then raise exception 'INVALID_NICKNAME';end if;
 end if;
 if p_action='create' then
  subject_value=p_payload->>'subject';if subject_value not in ('algorithm','os') or subject_value is null then raise exception 'INVALID_SUBJECT';end if;
  token=coalesce(p_payload->>'token',gen_random_uuid()::text||gen_random_uuid()::text);
  if length(token)<>72 or token!~'^[0-9a-f-]+$' then raise exception 'INVALID_REQUEST';end if;
  token_hash=encode(sha256(convert_to(token,'UTF8')),'hex');
  -- A retry after a lost create response recovers the same seat, never a second room.
  select * into r from public.duel_rooms where created_at>t-interval '1 day' and players @> jsonb_build_array(jsonb_build_object('token_hash',token_hash)) for update;
  if found then
   for i in 0..jsonb_array_length(r.players)-1 loop if r.players->i->>'token_hash'=token_hash then return public.duel_view(public.duel_tick(r.code),i)||jsonb_build_object('token',token);end if;end loop;
  end if;
  if(select count(*) from public.duel_rooms where created_at>t-interval '1 minute')>=60 then raise exception 'ROOM_RATE_LIMIT';end if;
  if(select count(distinct unit) from public.duel_catalog where subject=subject_value)<6 then raise exception 'BANK_NOT_READY';end if;
  select id into check_id from public.duel_checks order by random() limit 1;if check_id is null then raise exception 'BANK_NOT_READY';end if;
  p=jsonb_build_object('token_hash',token_hash,'nickname',nickname,'verified',false,'ready',false,'verification_id',check_id,'answers','[]'::jsonb);
  loop
   code_value=upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
   begin
    insert into public.duel_rooms(code,creator_hash,subject,players) values(code_value,token_hash,subject_value,jsonb_build_array(p)) returning * into r;exit;
   exception when unique_violation then
    select * into r from public.duel_rooms where creator_hash=token_hash for update;
    if found then return public.duel_view(public.duel_tick(r.code),0)||jsonb_build_object('token',token);end if;
   end;
  end loop;
  return public.duel_view(r,0)||jsonb_build_object('token',token);
 end if;
 code_value=upper(btrim(p_payload->>'code'));if code_value is null or code_value!~'^[0-9A-F]{8}$' then raise exception 'ROOM_NOT_FOUND';end if;
 select * into r from public.duel_rooms where code=code_value for update;if not found then raise exception 'ROOM_NOT_FOUND';end if;
 if p_action='join' then
  token=coalesce(p_payload->>'token',gen_random_uuid()::text||gen_random_uuid()::text);
  if length(token)<>72 or token!~'^[0-9a-f-]+$' then raise exception 'INVALID_REQUEST';end if;
  token_hash=encode(sha256(convert_to(token,'UTF8')),'hex');
  for i in 0..jsonb_array_length(r.players)-1 loop if r.players->i->>'token_hash'=token_hash then return public.duel_view(public.duel_tick(r.code),i)||jsonb_build_object('token',token);end if;end loop;
  if r.status<>'waiting' or t>=r.expires_at then raise exception 'ROOM_CLOSED';end if;
  if jsonb_array_length(r.players)>=2 then raise exception 'ROOM_FULL';end if;
  select id into check_id from public.duel_checks order by random() limit 1;
  p=jsonb_build_object('token_hash',token_hash,'nickname',nickname,'verified',false,'ready',false,'verification_id',check_id,'answers','[]'::jsonb);
  update public.duel_rooms set players=players||jsonb_build_array(p),revision=revision+1 where code=code_value returning * into r;
  return public.duel_view(r,1)||jsonb_build_object('token',token);
 end if;
 token=p_payload->>'token';if token is null or length(token)<>72 then raise exception 'NOT_A_PLAYER';end if;
 token_hash=encode(sha256(convert_to(token,'UTF8')),'hex');seat=null;
 for i in 0..jsonb_array_length(r.players)-1 loop if r.players->i->>'token_hash'=token_hash then seat=i;exit;end if;end loop;
 if seat is null then raise exception 'NOT_A_PLAYER';end if;
 r=public.duel_tick(code_value);
 if p_action='state' or r.status in ('finished','expired') then return public.duel_view(r,seat);end if;
 p=r.players->seat;
 if p_action='verify' then
  if r.status<>'waiting' then raise exception 'ROOM_ALREADY_STARTED';end if;
  if not coalesce((p->>'verified')::boolean,false) then
   select expected into expected_check from public.duel_checks where id=p->>'verification_id';
   if jsonb_typeof(p_payload->'answer') is distinct from 'number' or (p_payload->>'answer')!~'^[0-9]+$' or (p_payload->>'answer')::integer<>expected_check then
    update public.duel_rooms set status='expired',reason='verification_failed',finished_at=t,revision=revision+1 where code=code_value returning * into r;
    return public.duel_view(r,seat)||jsonb_build_object('verificationFailed',true);
   end if;
   update public.duel_rooms set players=jsonb_set(players,array[seat::text,'verified'],'true'),revision=revision+1 where code=code_value returning * into r;
  end if;
 elsif p_action='ready' then
  if r.status<>'waiting' then return public.duel_view(r,seat);end if;
  if not coalesce((p->>'verified')::boolean,false) then raise exception 'VERIFICATION_REQUIRED';end if;
  update public.duel_rooms set players=jsonb_set(players,array[seat::text,'ready'],'true'),revision=revision+1 where code=code_value returning * into r;
  if jsonb_array_length(r.players)=2 and (r.players->0->>'ready')::boolean and (r.players->1->>'ready')::boolean then
   select array_agg(unit order by random()) into units from(select distinct unit from public.duel_catalog where subject=r.subject) x;
   for i in 1..10 loop
    unit_value=units[1+((i-1)%array_length(units,1))];
    select * into q from public.duel_catalog where subject=r.subject and unit=unit_value and not(fingerprint=any(fingerprints)) order by random() limit 1;
    if not found then raise exception 'BANK_NOT_READY';end if;
    selected=selected||jsonb_build_array(jsonb_build_object('prompt',q.prompt,'solution',q.solution));fingerprints=array_append(fingerprints,q.fingerprint);
   end loop;
   select jsonb_agg(x order by random()) into selected from jsonb_array_elements(selected) x;
   p=jsonb_set(jsonb_set(r.players,'{0,last_answer_at}',to_jsonb(t+interval '3 seconds')),'{1,last_answer_at}',to_jsonb(t+interval '3 seconds'));
   update public.duel_rooms set status='playing',items=selected,players=p,starts_at=t+interval '3 seconds',deadline=t+interval '603 seconds',revision=revision+1 where code=code_value returning * into r;
  end if;
 elsif p_action='answer' then
  if r.status<>'playing' or t<r.starts_at then raise exception 'NOT_STARTED';end if;
  if (p_payload->>'index') is null or (p_payload->>'index')!~'^[0-9]$' then raise exception 'QUESTION_ORDER';end if;
  answer_index=(p_payload->>'index')::integer;
  if answer_index<jsonb_array_length(p->'answers') then return public.duel_view(r,seat);end if;
  if answer_index<>jsonb_array_length(p->'answers') then raise exception 'QUESTION_ORDER';end if;
  response=p_payload->'response';if response is null or jsonb_typeof(response)<>'array' or jsonb_array_length(response)>20 then raise exception 'INVALID_RESPONSE';end if;
  item=r.items->answer_index;
  if item->'prompt'->>'kind'='fill' then
   if jsonb_array_length(response)<>(item->'prompt'->>'blankCount')::integer then raise exception 'INVALID_RESPONSE';end if;
   for i in 0..jsonb_array_length(response)-1 loop if jsonb_typeof(response->i)<>'string' or length(response->>i)>4000 or btrim(response->>i)='' then raise exception 'INVALID_RESPONSE';end if;end loop;
  elsif jsonb_array_length(response)=0 then raise exception 'INVALID_RESPONSE';end if;
  is_correct=public.duel_grade(item,response);
  p=jsonb_set(p,'{answers}',(p->'answers')||jsonb_build_array(jsonb_build_object('response',response,'correct',is_correct,'submitted_at',t)));
  p=jsonb_set(p,'{last_answer_at}',to_jsonb(t));if answer_index=9 then p=jsonb_set(p,'{finished_at}',to_jsonb(t));end if;
  update public.duel_rooms set players=jsonb_set(players,array[seat::text],p),revision=revision+1 where code=code_value returning * into r;
  r=public.duel_tick(code_value);
 elsif p_action='leave' then
  if r.status='waiting' then update public.duel_rooms set status='expired',reason='player_left',finished_at=t,revision=revision+1 where code=code_value returning * into r;
  else update public.duel_rooms set status='finished',reason='player_left',winner=1-seat,players=jsonb_set(players,array[seat::text,'forfeit'],'true'),finished_at=t,revision=revision+1 where code=code_value returning * into r;end if;
 else raise exception 'INVALID_ACTION';
 end if;
 return public.duel_view(r,seat);
end $$;
revoke all on function public.duel_normalize(text),public.duel_grade(jsonb,jsonb),public.duel_tick(text),public.duel_view(public.duel_rooms,integer),public.duel_api(text,jsonb) from public,anon,authenticated;
grant execute on function public.duel_api(text,jsonb) to anon,authenticated;
commit;
