-- AFTER schema.sql: create YOUR user in Authentication > Users > Add user.
-- Replace the address below with that account's email. Run from SQL Editor only.
-- This script refuses to create a second administrator.
do $$
declare admin_id uuid; admin_email text := 'REPLACE_WITH_YOUR_EMAIL';
begin
 if admin_email='REPLACE_WITH_YOUR_EMAIL' then raise exception '請先填入你的管理員 Email'; end if;
 if exists(select 1 from public.collaboration_members where role='admin') then raise exception '管理員已存在，請勿重複初始化'; end if;
 select id into admin_id from auth.users where lower(email)=lower(admin_email) and email_confirmed_at is not null;
 if admin_id is null then raise exception '請先建立並確認管理員帳號'; end if;
 insert into public.collaboration_members(user_id,email,display_name,role)
 values(admin_id,lower(admin_email),'題庫管理員','admin');
end $$;
