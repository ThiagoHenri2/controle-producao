-- =====================================================================
-- supabase/tests/rls_check.sql
-- Verificação de RLS e do snapshot de preço (spec 002), data futura
-- (0002, spec 004), RPCs de resumo (0003, spec 005) e nome de categoria
-- único sem diferenciar maiúsculas (0004).
--
-- Requer as migrations 0001..0004 aplicadas.
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
-- 3b) Usuário A: data futura, RPCs de resumo e nome único (case-insensitive)
--     Período isolado em 2025-01 para não misturar com os dados acima.
-- ---------------------------------------------------------------------
do $$
declare
  v_falhou boolean;
  v_estado text;
  v_n      integer;
  r        record;
begin
  assert auth.uid() = '00000000-0000-4000-a000-00000000000a', 'setup: auth.uid() deveria ser A';

  -- data futura (+2 dias) é rejeitada pela constraint lancamentos_data_nao_futura
  v_estado := null;
  begin
    insert into public.lancamentos (categoria_id, data, quantidade)
    values ('00000000-0000-4000-c000-0000000000a1', current_date + 2, 1);
  exception when others then
    v_estado := sqlstate;
  end;
  assert v_estado = '23514', format('data futura (+2 dias) deveria falhar com 23514 (veio %s)', v_estado);

  -- +1 dia (margem de fuso) é aceito; desfeito com uma exceção proposital
  v_falhou := false;
  begin
    insert into public.lancamentos (categoria_id, data, quantidade)
    values ('00000000-0000-4000-c000-0000000000a1', current_date + 1, 1);
    raise exception 'desfazer' using errcode = 'P0001';
  exception
    when sqlstate 'P0001' then null;
    when others then v_falhou := true;
  end;
  assert not v_falhou, 'data de amanhã (+1, margem de fuso) deveria ser aceita';

  -- dados de exemplo da spec: 50 × 2,50 + 20 × 5,00 = 225,00
  insert into public.categorias (id, nome, valor_unitario) values
    ('00000000-0000-4000-c000-0000000000a3', 'Lanche', 2.50),
    ('00000000-0000-4000-c000-0000000000a4', 'Pizza',  5.00);
  insert into public.lancamentos (categoria_id, data, quantidade) values
    ('00000000-0000-4000-c000-0000000000a3', '2025-01-15', 50),
    ('00000000-0000-4000-c000-0000000000a4', '2025-01-15', 20),
    ('00000000-0000-4000-c000-0000000000a4', '2025-01-16', 1);   -- 2º dia, p/ resumo_por_dia

  -- resumo_por_categoria em um único dia
  select count(*) into v_n from public.resumo_por_categoria('2025-01-15', '2025-01-15');
  assert v_n = 2, 'resumo_por_categoria: A deveria ter 2 categorias em 2025-01-15';

  select * into r from public.resumo_por_categoria('2025-01-15', '2025-01-15') limit 1;
  assert r.nome = 'Lanche' and r.quantidade = 50 and r.valor = 125.00 and r.total_geral = 225.00 and r.ativa,
    format('resumo_por_categoria: 1ª linha deveria ser Lanche 50 / 125,00 / total 225,00 (veio %s)', r);

  select * into r from public.resumo_por_categoria('2025-01-15', '2025-01-15') offset 1 limit 1;
  assert r.nome = 'Pizza' and r.quantidade = 20 and r.valor = 100.00 and r.total_geral = 225.00,
    format('resumo_por_categoria: 2ª linha deveria ser Pizza 20 / 100,00 / total 225,00 (veio %s)', r);

  -- reajuste + inativação não mudam o passado; a inativa continua aparecendo
  update public.categorias set valor_unitario = 6.00, ativa = false
   where id = '00000000-0000-4000-c000-0000000000a4';
  assert (select total_geral from public.resumo_por_categoria('2025-01-15', '2025-01-15') limit 1) = 225.00,
    'resumo: reajuste de preço alterou o total de período passado';
  assert exists (select 1 from public.resumo_por_categoria('2025-01-15', '2025-01-15')
                  where nome = 'Pizza' and not ativa and valor = 100.00),
    'resumo: categoria inativa com lançamentos deveria aparecer com ativa = false';
  update public.categorias set ativa = true where id = '00000000-0000-4000-c000-0000000000a4';

  -- resumo_por_dia (ordem: data desc)
  select count(*) into v_n from public.resumo_por_dia('2025-01-01', '2025-01-31');
  assert v_n = 2, 'resumo_por_dia: A deveria ter 2 dias em 2025-01';

  select * into r from public.resumo_por_dia('2025-01-01', '2025-01-31') limit 1;
  assert r.data = '2025-01-16' and r.quantidade = 1 and r.valor = 5.00,
    format('resumo_por_dia: 1ª linha deveria ser 2025-01-16 / 1 / 5,00 (veio %s)', r);

  select * into r from public.resumo_por_dia('2025-01-01', '2025-01-31') offset 1 limit 1;
  assert r.data = '2025-01-15' and r.quantidade = 70 and r.valor = 225.00,
    format('resumo_por_dia: 2ª linha deveria ser 2025-01-15 / 70 / 225,00 (veio %s)', r);

  -- período sem dados: nenhuma linha
  assert not exists (select 1 from public.resumo_por_categoria('2024-01-01', '2024-01-31')),
    'resumo_por_categoria: período sem dados deveria retornar vazio';

  -- período inválido: início > fim
  v_estado := null;
  begin
    perform * from public.resumo_por_categoria('2025-01-31', '2025-01-01');
  exception when others then
    v_estado := sqlstate;
  end;
  assert v_estado = '22023', format('resumo_por_categoria: início > fim deveria falhar com 22023 (veio %s)', v_estado);

  v_estado := null;
  begin
    perform * from public.resumo_por_dia('2025-01-31', '2025-01-01');
  exception when others then
    v_estado := sqlstate;
  end;
  assert v_estado = '22023', format('resumo_por_dia: início > fim deveria falhar com 22023 (veio %s)', v_estado);

  -- período inválido: intervalo > 366 dias
  v_estado := null;
  begin
    perform * from public.resumo_por_categoria('2024-01-01', '2025-01-02');
  exception when others then
    v_estado := sqlstate;
  end;
  assert v_estado = '22023', format('resumo_por_categoria: intervalo > 366 dias deveria falhar com 22023 (veio %s)', v_estado);

  v_estado := null;
  begin
    perform * from public.resumo_por_dia('2024-01-01', '2025-01-02');
  exception when others then
    v_estado := sqlstate;
  end;
  assert v_estado = '22023', format('resumo_por_dia: intervalo > 366 dias deveria falhar com 22023 (veio %s)', v_estado);

  -- limite: diferença de exatamente 366 dias é aceita
  perform * from public.resumo_por_categoria('2024-01-01', '2025-01-01');

  -- nome de categoria único sem diferenciar maiúsculas/espaços
  v_estado := null;
  begin
    insert into public.categorias (nome, valor_unitario) values (' pizza ', 1.00);
  exception when others then
    v_estado := sqlstate;
  end;
  assert v_estado = '23505', format('categoria " pizza " duplicada deveria falhar com 23505 (veio %s)', v_estado);

  v_estado := null;
  begin
    insert into public.categorias (nome, valor_unitario) values ('PIZZA', 1.00);
  exception when others then
    v_estado := sqlstate;
  end;
  assert v_estado = '23505', format('categoria "PIZZA" duplicada deveria falhar com 23505 (veio %s)', v_estado);

  v_estado := null;
  begin
    update public.categorias set nome = 'pizza' where id = '00000000-0000-4000-c000-0000000000a3';
  exception when others then
    v_estado := sqlstate;
  end;
  assert v_estado = '23505', format('renomear outra categoria para "pizza" deveria falhar com 23505 (veio %s)', v_estado);

  -- trocar só a caixa do próprio nome é permitido
  update public.categorias set nome = 'PIZZA' where id = '00000000-0000-4000-c000-0000000000a4';
  update public.categorias set nome = 'Pizza' where id = '00000000-0000-4000-c000-0000000000a4';
end $$;

-- ---------------------------------------------------------------------
-- 3c) Usuário B: RPCs não somam nada de A; "pizza" é permitida para B
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-00000000000b', 'role', 'authenticated')::text, true);

do $$
declare
  r record;
begin
  assert auth.uid() = '00000000-0000-4000-a000-00000000000b', 'setup: auth.uid() deveria ser B';

  assert not exists (select 1 from public.resumo_por_categoria('2025-01-01', '2025-01-31')),
    'VAZAMENTO: resumo_por_categoria de B retorna dados de A';
  assert not exists (select 1 from public.resumo_por_dia('2025-01-01', '2025-01-31')),
    'VAZAMENTO: resumo_por_dia de B retorna dados de A';

  -- no dia em que A e B lançaram, B vê só o próprio total (1 × 3,00)
  assert (select count(*) from public.resumo_por_categoria('2026-11-20', '2026-11-20')) = 1,
    'VAZAMENTO: resumo_por_categoria de B em 2026-11-20 deveria ter 1 linha';
  select * into r from public.resumo_por_categoria('2026-11-20', '2026-11-20');
  assert r.categoria_id = '00000000-0000-4000-c000-0000000000b1'
     and r.quantidade = 1 and r.valor = 3.00 and r.total_geral = 3.00,
    format('VAZAMENTO: resumo_por_categoria de B em 2026-11-20 deveria ser 1 / 3,00 (veio %s)', r);

  assert (select count(*) from public.resumo_por_dia('2026-11-20', '2026-11-20')) = 1,
    'VAZAMENTO: resumo_por_dia de B em 2026-11-20 deveria ter 1 linha';
  select * into r from public.resumo_por_dia('2026-11-20', '2026-11-20');
  assert r.quantidade = 1 and r.valor = 3.00,
    format('VAZAMENTO: resumo_por_dia de B em 2026-11-20 deveria ser 1 / 3,00 (veio %s)', r);

  -- "Pizza" já existe para A, mas "pizza" é permitida para B
  insert into public.categorias (id, nome, valor_unitario)
  values ('00000000-0000-4000-c000-0000000000b2', 'pizza', 4.00);
  assert (select count(*) from public.categorias) = 2, 'B deveria ver 2 categorias (Sanduíche e pizza)';
end $$;

-- De volta a A: os totais de A seguem corretos e sem dados de B
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-00000000000a', 'role', 'authenticated')::text, true);

do $$
begin
  assert (select total_geral from public.resumo_por_categoria('2025-01-15', '2025-01-15') limit 1) = 225.00,
    'resumo de A mudou após ações de B';
  -- em 2026-11-20 A tem 4 × 2,50 + 2 × 3,00 = 16,00 (sem o 1 × 3,00 de B)
  assert (select total_geral from public.resumo_por_categoria('2026-11-20', '2026-11-20') limit 1) = 16.00,
    'VAZAMENTO: resumo de A em 2026-11-20 deveria ser 16,00';
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
  assert not exists (select 1 from public.resumo_por_dia('2025-01-01', '2025-01-31')),
    'VAZAMENTO: resumo_por_dia do admin retorna dados de A';
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
  assert not exists (select 1 from public.resumo_por_categoria('2025-01-01', '2025-01-31')),
    'VAZAMENTO: usuário inativo vê o próprio resumo';

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

  v_falhou := false;
  begin
    perform * from public.resumo_por_categoria('2025-01-01', '2025-01-31');
  exception when others then
    v_falhou := true;
  end;
  assert v_falhou, 'VAZAMENTO: anon executa resumo_por_categoria';

  v_falhou := false;
  begin
    perform * from public.resumo_por_dia('2025-01-01', '2025-01-31');
  exception when others then
    v_falhou := true;
  end;
  assert v_falhou, 'VAZAMENTO: anon executa resumo_por_dia';
end $$;

reset role;
do $$ begin raise notice 'RLS OK'; end $$;

rollback;

-- Só chega aqui se todas as verificações acima passaram.
select 'RLS OK' as resultado;
