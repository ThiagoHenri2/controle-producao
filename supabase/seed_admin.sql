-- =====================================================================
-- seed_admin.sql
-- Promove o usuário de Auth 'admin@entregas.local' a administrador.
--
-- Pré-requisito: criar o usuário em Authentication > Users > Add user
-- (e-mail admin@entregas.local, senha, "Auto Confirm User" marcado).
-- Pode ser executado mais de uma vez (idempotente).
-- =====================================================================

insert into public.profiles (id, username, nome, role, ativo)
select id, 'admin', 'Administrador', 'admin', true
  from auth.users
 where email = 'admin@entregas.local'
on conflict (id) do update
   set username = excluded.username,
       nome     = excluded.nome,
       role     = 'admin',
       ativo    = true;

-- Conferência: deve retornar 1 linha com role = 'admin' e ativo = true.
-- Se não retornar nada, o usuário ainda não foi criado em Authentication > Users.
select p.id, p.username, p.nome, p.role, p.ativo
  from public.profiles p
  join auth.users u on u.id = p.id
 where u.email = 'admin@entregas.local';
