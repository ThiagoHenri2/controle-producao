-- =====================================================================
-- supabase/tests/rls_check.sql
-- Verificação de RLS e do snapshot de preço (spec 002).
--
-- Como rodar: cole o arquivo inteiro no SQL Editor do Supabase e execute.
-- Tudo roda dentro de uma transação e termina em ROLLBACK: nada fica gravado.
--
-- Resultado esperado: a última consulta mostra "RLS OK" (e um NOTICE "RLS OK").
-- Qualquer vazamento ou regra quebrada interrompe o script com erro
-- (ASSERT / VAZAMENTO) explicando o que falhou.
--
-- Usuários fake (ids fixos):
--   A = 00000000-0000-4000-a000-00000000000a
--   B = 00000000-0000-4000-a000-00000000000b
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Setup (como postgres)
-- ---------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-00000000000a',
   'authenticated', 'authenticated', 'rls_teste_a@entregas.local', '',
   now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-00000000000b',
   'authenticated', 'authenticated', 'rls_teste_b@entregas.local', '',
   now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (id, username, nome, role, ativo) values
  ('00000000-0000-4000-a000-00000000000a', 'rls_teste_a', 'Teste A', 'user', true),
  ('00000000-0000-4000-a000-00000000000b', 'rls_teste_b', 'Teste B', 'user', true);

-- ---------------------------------------------------------------------
-- 1) Usuário A: cria dados e testa o snapshot de preço
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-00000000000a', 'role', 'authenticated')::text, true);

do $$
declare
  v_lanc record;
  v_falhou boolean;
begin
  assert auth.uid() = '00000000-0000-4000-a000-00000000000a', 'setup: auth.uid() deveria ser A';

  -- categoria ativa (user_id vem do default auth.uid())
  insert into public.categorias (id, nome, valor_unitario)
  values ('00000000-0000-4000-c000-0000000000a1', 'Sanduíche', 2.50);

  -- categoria inativa
  insert into public.categorias (id, nome, valor_unitario, ativa)
  values ('00000000-0000-4000-c000-0000000000a2', 'Antiga', 9.99, false);

  -- lançamento SEM valor_unitario: deve copiar 2.50 da categoria
  insert into public.lancamentos (id, categoria_id, data, quantidade)
  values ('00000000-0000-4000-d000-0000000000a1', '00000000-0000-4000-c000-0000000000a1', '2026-11-20', 4);

  select * into v_lanc from public.lancamentos where id = '00000000-0000-4000-d000-0000000000a1';
  assert v_lanc.user_id = '00000000-0000-4000-a000-00000000000a', 'snapshot: user_id deveria ser A';
  assert v_lanc.valor_unitario = 2.50, 'snapshot: valor_unitario deveria ser copiado da categoria (2.50)';
  assert v_lanc.valor_total = 10.00, 'snapshot: valor_total deveria ser 4 * 2.50 = 10.00';

  -- lançamento COM valor_unitario explícito: mantém o informado
  insert into public.lancamentos (id, categoria_id, data, quantidade, valor_unitario)
  values ('00000000-0000-4000-d000-0000000000a2', '00000000-0000-4000-c000-0000000000a1', '2026-11-20', 2, 3.00);
  assert (select valor_unitario from public.lancamentos where id = '00000000-0000-4000-d000-0000000000a2') = 3.00,
    'snapshot: valor_unitario informado não deveria ser sobrescrito';

  -- reajuste da categoria NÃO altera o histórico
  update public.categorias set valor_unitario = 5.00 where id = '00000000-0000-4000-c000-0000000000a1';
  assert (select valor_unitario from public.lancamentos where id = '00000000-0000-4000-d000-0000000000a1') = 2.50,
    'snapshot: reajuste da categoria alterou o histórico';

  -- updated_at é atualizado no update da categoria
  assert (select updated_at >= created_at from public.categorias where id = '00000000-0000-4000-c000-0000000000a1'),
    'set_updated_at: updated_at inválido';

  -- lançar em categoria inativa deve falhar
  v_falhou := false;
  begin
    insert into public.lancamentos (categoria_id, data, quantidade)
    values ('00000000-0000-4000-c000-0000000000a2', '2026-11-20', 1);
  exception when others then
    v_falhou := true;
  end;
  assert v_falhou, 'VAZAMENTO: lançamento em categoria inativa foi aceito';

  assert (select count(*) from public.categorias) = 2, 'A deveria ver 2 categorias';
  assert (select count(*) from public.lancamentos) = 2, 'A deveria ver 2 lançamentos';
  assert (select count(*) from public.profiles) = 1, 'A (user) deveria ver só o próprio perfil';
end $$;

-- ---------------------------------------------------------------------
-- 2) Usuário B: não vê, não altera e não usa os dados de A
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-00000000000b', 'role', 'authenticated')::text, true);

do $$
declare
  v_linhas integer;
  v_falhou boolean;
begin
  assert auth.uid() = '00000000-0000-4000-a000-00000000000b', 'setup: auth.uid() deveria ser B';

  -- não vê
  assert (select count(*) from public.categorias) = 0, 'VAZAMENTO: B vê categorias de A';
  assert (select count(*) from public.lancamentos) = 0, 'VAZAMENTO: B vê lançamentos de A';
  assert (select count(*) from public.profiles) = 1, 'VAZAMENTO: B vê perfis de outros usuários';

  -- não altera / não apaga
  update public.categorias set nome = 'hackeada' where id = '00000000-0000-4000-c000-0000000000a1';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 0, 'VAZAMENTO: B alterou categoria de A';

  delete from public.categorias where id = '00000000-0000-4000-c000-0000000000a2';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 0, 'VAZAMENTO: B apagou categoria de A';

  update public.lancamentos set quantidade = 999 where id = '00000000-0000-4000-d000-0000000000a1';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 0, 'VAZAMENTO: B alterou lançamento de A';

  delete from public.lancamentos where id = '00000000-0000-4000-d000-0000000000a2';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 0, 'VAZAMENTO: B apagou lançamento de A';

  -- não lança na categoria de A
  v_falhou := false;
  begin
    insert into public.lancamentos (categoria_id, data, quantidade)
    values ('00000000-0000-4000-c000-0000000000a1', '2026-11-20', 1);
  exception when others then
    v_falhou := true;
  end;
  assert v_falhou, 'VAZAMENTO: B lançou na categoria de A';

  -- nem com preço explícito
  v_falhou := false;
  begin
    insert into public.lancamentos (categoria_id, data, quantidade, valor_unitario)
    values ('00000000-0000-4000-c000-0000000000a1', '2026-11-20', 1, 1.00);
  exception when others then
    v_falhou := true;
  end;
  assert v_falhou, 'VAZAMENTO: B lançou (com preço) na categoria de A';

  -- não grava dados em nome de A
  v_falhou := false;
  begin
    insert into public.categorias (user_id, nome, valor_unitario)
    values ('00000000-0000-4000-a000-00000000000a', 'Intrusa', 1.00);
  exception when others then
    v_falhou := true;
  end;
  assert v_falhou, 'VAZAMENTO: B criou categoria com user_id de A';

  -- não escreve em profiles (só Edge Function)
  v_falhou := false;
  begin
    update public.profiles set role = 'admin' where id = '00000000-0000-4000-a000-00000000000b';
  exception when others then
    v_falhou := true;
  end;
  assert v_falhou, 'VAZAMENTO: B conseguiu alterar o próprio perfil (role)';

  -- B cria os próprios dados normalmente
  insert into public.categorias (id, nome, valor_unitario)
  values ('00000000-0000-4000-c000-0000000000b1', 'Sanduíche', 3.00);  -- mesmo nome de A: ok (unique por usuário)
  insert into public.lancamentos (id, categoria_id, data, quantidade)
  values ('00000000-0000-4000-d000-0000000000b1', '00000000-0000-4000-c000-0000000000b1', '2026-11-20', 1);

  -- B não consegue repontar o próprio lançamento para a categoria de A
  v_falhou := false;
  begin
    update public.lancamentos set categoria_id = '00000000-0000-4000-c000-0000000000a1'
     where id = '00000000-0000-4000-d000-0000000000b1';
  exception when others then
    v_falhou := true;
  end;
  assert v_falhou, 'VAZAMENTO: B apontou o próprio lançamento para a categoria de A';

  assert (select count(*) from public.categorias) = 1, 'B deveria ver só a própria categoria';
  assert (select count(*) from public.lancamentos) = 1, 'B deveria ver só o próprio lançamento';
end $$;

-- ---------------------------------------------------------------------
-- 3) Dados de A continuam intactos
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-00000000000a', 'role', 'authenticated')::text, true);

do $$
begin
  assert (select nome from public.categorias where id = '00000000-0000-4000-c000-0000000000a1') = 'Sanduíche',
    'VAZAMENTO: nome da categoria de A foi alterado';
  assert (select count(*) from public.categorias) = 2, 'A deveria continuar com 2 categorias';
  assert (select quantidade from public.lancamentos where id = '00000000-0000-4000-d000-0000000000a1') = 4,
    'VAZAMENTO: quantidade do lançamento de A foi alterada';
  assert (select count(*) from public.lancamentos) = 2, 'A deveria continuar com 2 lançamentos';
end $$;

-- ---------------------------------------------------------------------
-- 4) Admin: vê todos os perfis, mas NÃO vê categorias/lançamentos alheios
-- ---------------------------------------------------------------------
reset role;
update public.profiles set role = 'admin' where id = '00000000-0000-4000-a000-00000000000b';

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-00000000000b', 'role', 'authenticated')::text, true);

do $$
begin
  assert public.is_admin(), 'is_admin() deveria ser true para B promovido';
  assert (select count(*) from public.profiles where id in (
            '00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000b')) = 2,
    'admin deveria ver todos os perfis';
  assert (select count(*) from public.categorias where user_id = '00000000-0000-4000-a000-00000000000a') = 0,
    'VAZAMENTO: admin vê categorias de A';
  assert (select count(*) from public.lancamentos where user_id = '00000000-0000-4000-a000-00000000000a') = 0,
    'VAZAMENTO: admin vê lançamentos de A';
end $$;

-- ---------------------------------------------------------------------
-- 5) Usuário inativo não vê nem altera os próprios dados
-- ---------------------------------------------------------------------
reset role;
update public.profiles set ativo = false where id = '00000000-0000-4000-a000-00000000000a';

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-00000000000a', 'role', 'authenticated')::text, true);

do $$
declare
  v_linhas integer;
  v_falhou boolean;
begin
  assert not public.is_ativo(), 'is_ativo() deveria ser false para A desativado';
  assert (select count(*) from public.categorias) = 0, 'VAZAMENTO: usuário inativo vê categorias';
  assert (select count(*) from public.lancamentos) = 0, 'VAZAMENTO: usuário inativo vê lançamentos';

  update public.lancamentos set quantidade = 1 where id = '00000000-0000-4000-d000-0000000000a1';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 0, 'VAZAMENTO: usuário inativo alterou lançamento';

  v_falhou := false;
  begin
    insert into public.categorias (nome, valor_unitario) values ('Nova', 1.00);
  exception when others then
    v_falhou := true;
  end;
  assert v_falhou, 'VAZAMENTO: usuário inativo criou categoria';
end $$;

-- ---------------------------------------------------------------------
-- 6) anon não acessa nada
-- ---------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare
  v_falhou boolean;
begin
  v_falhou := false;
  begin
    perform 1 from public.categorias limit 1;
  exception when others then
    v_falhou := true;
  end;
  assert v_falhou, 'VAZAMENTO: anon tem acesso a categorias';

  v_falhou := false;
  begin
    perform 1 from public.profiles limit 1;
  exception when others then
    v_falhou := true;
  end;
  assert v_falhou, 'VAZAMENTO: anon tem acesso a profiles';
end $$;

reset role;
do $$ begin raise notice 'RLS OK'; end $$;

rollback;

-- Só chega aqui se todas as verificações acima passaram.
select 'RLS OK' as resultado;
