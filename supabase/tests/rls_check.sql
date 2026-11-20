-- =====================================================================
-- supabase/tests/rls_check.sql
-- Verificação de RLS e do snapshot de preço (spec 002), data futura
-- (0002, spec 004), RPCs de resumo (0003, spec 005) e nome de categoria
-- único sem diferenciar maiúsculas (0004) e filtro por categorias nas
-- RPCs de resumo (0005), papel gerente / gestor (0006, spec 008) e
-- despesas (0007, spec 009: seções 3d, 3e, 4f e trechos de 4d/4e/5/6).
--
-- Requer as migrations 0001..0007 aplicadas.
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
--   B = 00000000-0000-4000-a000-00000000000b   (vira admin na seção 4)
--   G = 00000000-0000-4000-a000-00000000000c   gerente ("Maria")
--   C = 00000000-0000-4000-a000-00000000000d   entregador ("Ana")
--   A faz o papel do "João" da spec 008.
--
-- Obs.: resumo_por_usuario lista TODOS os perfis do banco. Rodando no
-- projeto real, os perfis reais aparecem também; por isso as asserções da
-- seção 4 olham as linhas dos usuários de teste e usam um período antigo
-- (2001-01) onde não deve haver dados reais. As despesas usam 2001-02
-- (resumo_despesas_por_usuario_nomes também lista todos os perfis).
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
   now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-00000000000c',
   'authenticated', 'authenticated', 'rls_teste_g@entregas.local', '',
   now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-00000000000d',
   'authenticated', 'authenticated', 'rls_teste_c@entregas.local', '',
   now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (id, username, nome, role, ativo) values
  ('00000000-0000-4000-a000-00000000000a', 'rls_teste_a', 'Teste A', 'user', true),
  ('00000000-0000-4000-a000-00000000000b', 'rls_teste_b', 'Teste B', 'user', true),
  ('00000000-0000-4000-a000-00000000000c', 'rls_teste_g', 'Teste Gerente', 'gerente', true),
  ('00000000-0000-4000-a000-00000000000d', 'rls_teste_c', 'Teste C', 'user', true);

-- check de role (0006): aceita 'gerente', rejeita outros valores
do $$
declare
  v_estado text;
begin
  v_estado := null;
  begin
    update public.profiles set role = 'chefe' where id = '00000000-0000-4000-a000-00000000000d';
  exception when others then
    v_estado := sqlstate;
  end;
  assert v_estado = '23514', format('role "chefe" deveria falhar com 23514 (veio %s)', v_estado);

  -- criado_por: nullable (on delete set null), default auth.uid()
  assert (select not attnotnull from pg_attribute
           where attrelid = 'public.lancamentos'::regclass and attname = 'criado_por'),
    'lancamentos.criado_por deveria ser nullable (on delete set null)';
  assert (select confdeltype from pg_constraint
           where conrelid = 'public.lancamentos'::regclass
             and conname = 'lancamentos_criado_por_fkey') = 'n',
    'lancamentos_criado_por_fkey deveria ser on delete set null';
end $$;

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

  -- -------------------------------------------------------------------
  -- Filtro por categorias (0005). Em 2025-01-15: Lanche 50 × 2,50 = 125,00
  -- e Pizza 20 × 5,00 = 100,00.
  -- -------------------------------------------------------------------
  -- só Pizza: uma linha, total_geral = 100,00
  select count(*) into v_n
    from public.resumo_por_categoria('2025-01-15', '2025-01-15',
                                     array['00000000-0000-4000-c000-0000000000a4']::uuid[]);
  assert v_n = 1, format('filtro [Pizza]: resumo_por_categoria deveria ter 1 linha (veio %s)', v_n);

  select * into r
    from public.resumo_por_categoria('2025-01-15', '2025-01-15',
                                     array['00000000-0000-4000-c000-0000000000a4']::uuid[]);
  assert r.categoria_id = '00000000-0000-4000-c000-0000000000a4' and r.nome = 'Pizza'
     and r.quantidade = 20 and r.valor = 100.00 and r.total_geral = 100.00,
    format('filtro [Pizza]: deveria ser Pizza 20 / 100,00 / total 100,00 (veio %s)', r);

  -- por dia com só Pizza: 2025-01-15 conta só os 100,00
  select count(*) into v_n
    from public.resumo_por_dia('2025-01-15', '2025-01-15',
                               array['00000000-0000-4000-c000-0000000000a4']::uuid[]);
  assert v_n = 1, format('filtro [Pizza]: resumo_por_dia deveria ter 1 linha (veio %s)', v_n);

  select * into r
    from public.resumo_por_dia('2025-01-15', '2025-01-15',
                               array['00000000-0000-4000-c000-0000000000a4']::uuid[]);
  assert r.data = '2025-01-15' and r.quantidade = 20 and r.valor = 100.00,
    format('filtro [Pizza]: resumo_por_dia deveria ser 2025-01-15 / 20 / 100,00 (veio %s)', r);

  -- só Lanche no mês: o dia 2025-01-16 (só Pizza) some do resumo por dia
  select count(*) into v_n
    from public.resumo_por_dia('2025-01-01', '2025-01-31',
                               array['00000000-0000-4000-c000-0000000000a3']::uuid[]);
  assert v_n = 1, format('filtro [Lanche]: resumo_por_dia no mês deveria ter 1 dia (veio %s)', v_n);

  -- as duas marcadas = sem filtro
  assert (select total_geral from public.resumo_por_categoria('2025-01-15', '2025-01-15',
            array['00000000-0000-4000-c000-0000000000a3',
                  '00000000-0000-4000-c000-0000000000a4']::uuid[]) limit 1) = 225.00,
    'filtro [Lanche, Pizza]: total_geral deveria ser 225,00';

  -- null = todas
  assert (select count(*) from public.resumo_por_categoria('2025-01-15', '2025-01-15', null)) = 2,
    'filtro null: resumo_por_categoria deveria ter 2 linhas';
  assert (select total_geral from public.resumo_por_categoria('2025-01-15', '2025-01-15', null) limit 1) = 225.00,
    'filtro null: total_geral deveria ser 225,00';
  assert (select valor from public.resumo_por_dia('2025-01-15', '2025-01-15', null)) = 225.00,
    'filtro null: resumo_por_dia deveria ser 225,00';

  -- array vazio = nenhuma linha
  assert not exists (select 1 from public.resumo_por_categoria('2025-01-15', '2025-01-15', '{}'::uuid[])),
    'filtro {}: resumo_por_categoria deveria retornar vazio';
  assert not exists (select 1 from public.resumo_por_dia('2025-01-15', '2025-01-15', '{}'::uuid[])),
    'filtro {}: resumo_por_dia deveria retornar vazio';

  -- id inexistente = nenhuma linha
  assert not exists (select 1 from public.resumo_por_categoria('2025-01-15', '2025-01-15',
                       array['00000000-0000-4000-c000-00000000ffff']::uuid[])),
    'filtro [id inexistente]: resumo_por_categoria deveria retornar vazio';

  -- chamada só com (p_de, p_ate), posicional e nomeada (como o PostgREST faz):
  -- sem ambiguidade e equivalente a null
  assert (select total_geral from public.resumo_por_categoria('2025-01-15', '2025-01-15') limit 1) = 225.00,
    'chamada (p_de, p_ate): total_geral deveria ser 225,00';
  assert (select total_geral from public.resumo_por_categoria(p_de => '2025-01-15', p_ate => '2025-01-15') limit 1) = 225.00,
    'chamada nomeada (p_de, p_ate): total_geral deveria ser 225,00';
  assert (select valor from public.resumo_por_dia(p_de => '2025-01-15', p_ate => '2025-01-15')) = 225.00,
    'chamada nomeada (p_de, p_ate): resumo_por_dia deveria ser 225,00';
  assert (select total_geral from public.resumo_por_categoria(
            p_de => '2025-01-15', p_ate => '2025-01-15',
            p_categorias => array['00000000-0000-4000-c000-0000000000a4']::uuid[]) limit 1) = 100.00,
    'chamada nomeada com p_categorias: total_geral deveria ser 100,00';

  -- só existe uma assinatura de cada RPC (as antigas (date, date) foram removidas)
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'resumo_por_categoria') = 1,
    'resumo_por_categoria deveria ter uma única assinatura';
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'resumo_por_dia') = 1,
    'resumo_por_dia deveria ter uma única assinatura';
  assert (select pg_get_function_identity_arguments(p.oid) from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'resumo_por_categoria')
         = 'p_de date, p_ate date, p_categorias uuid[], p_usuario uuid',
    'resumo_por_categoria deveria ser (p_de, p_ate, p_categorias, p_usuario)';

  -- período inválido continua validado com filtro
  v_estado := null;
  begin
    perform * from public.resumo_por_dia('2025-01-31', '2025-01-01',
                                         array['00000000-0000-4000-c000-0000000000a4']::uuid[]);
  exception when others then
    v_estado := sqlstate;
  end;
  assert v_estado = '22023', format('resumo_por_dia com filtro: início > fim deveria falhar com 22023 (veio %s)', v_estado);
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

  -- B passando os ids das categorias de A: nada de A é somado
  assert not exists (select 1 from public.resumo_por_categoria('2025-01-01', '2025-01-31',
                       array['00000000-0000-4000-c000-0000000000a3',
                             '00000000-0000-4000-c000-0000000000a4']::uuid[])),
    'VAZAMENTO: resumo_por_categoria de B filtrando ids de A retorna dados de A';
  assert not exists (select 1 from public.resumo_por_dia('2025-01-01', '2025-01-31',
                       array['00000000-0000-4000-c000-0000000000a3',
                             '00000000-0000-4000-c000-0000000000a4']::uuid[])),
    'VAZAMENTO: resumo_por_dia de B filtrando ids de A retorna dados de A';
  assert not exists (select 1 from public.resumo_por_categoria('2026-11-20', '2026-11-20',
                       array['00000000-0000-4000-c000-0000000000a1']::uuid[])),
    'VAZAMENTO: resumo_por_categoria de B filtrando a categoria de A em 2026-11-20';
  assert not exists (select 1 from public.resumo_por_dia('2026-11-20', '2026-11-20',
                       array['00000000-0000-4000-c000-0000000000a1']::uuid[])),
    'VAZAMENTO: resumo_por_dia de B filtrando a categoria de A em 2026-11-20';

  -- ids misturados (A + B): só o próprio total de B (1 × 3,00)
  select * into r from public.resumo_por_categoria('2026-11-20', '2026-11-20',
                       array['00000000-0000-4000-c000-0000000000a1',
                             '00000000-0000-4000-c000-0000000000b1']::uuid[]);
  assert r.categoria_id = '00000000-0000-4000-c000-0000000000b1' and r.total_geral = 3.00,
    format('VAZAMENTO: filtro [A, B] de B deveria somar só 3,00 (veio %s)', r);
  assert (select valor from public.resumo_por_dia('2026-11-20', '2026-11-20',
            array['00000000-0000-4000-c000-0000000000a1',
                  '00000000-0000-4000-c000-0000000000b1']::uuid[])) = 3.00,
    'VAZAMENTO: resumo_por_dia de B com filtro [A, B] deveria ser 3,00';

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
-- 3d) Despesas (0007, spec 009) — usuário A (entregador), período 2001-02:
--     categorias de despesa (sem valor), despesas com valor livre,
--     validações, anti-forja e RPCs resumo_despesas_*.
--     Ids: categorias_despesa = ...-4000-e000-...; despesas = ...-4000-f000-...
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-00000000000a', 'role', 'authenticated')::text, true);

do $$
declare
  v_estado text;
  v_linhas integer;
  r        record;
begin
  assert auth.uid() = '00000000-0000-4000-a000-00000000000a', 'setup: auth.uid() deveria ser A';

  -- categorias de despesa: só nome e ativa (user_id vem do default)
  insert into public.categorias_despesa (id, nome) values
    ('00000000-0000-4000-e000-0000000000a1', 'Combustível'),
    ('00000000-0000-4000-e000-0000000000a2', 'Manutenção');
  insert into public.categorias_despesa (id, nome, ativa)
  values ('00000000-0000-4000-e000-0000000000a3', 'Antiga', false);
  assert (select user_id from public.categorias_despesa where id = '00000000-0000-4000-e000-0000000000a1')
         = '00000000-0000-4000-a000-00000000000a',
    'categorias_despesa: user_id deveria vir do default auth.uid()';

  -- nome duplicado sem diferenciar maiúsculas/espaços => 23505
  v_estado := null;
  begin
    insert into public.categorias_despesa (nome) values ('  combustível ');
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '23505', format('categorias_despesa: nome duplicado (ci) deveria dar 23505 (veio %s)', v_estado);

  -- nome vazio / > 60 => 23514
  v_estado := null;
  begin
    insert into public.categorias_despesa (nome) values ('   ');
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '23514', format('categorias_despesa: nome vazio deveria dar 23514 (veio %s)', v_estado);
  v_estado := null;
  begin
    insert into public.categorias_despesa (nome) values (repeat('x', 61));
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '23514', format('categorias_despesa: nome > 60 deveria dar 23514 (veio %s)', v_estado);

  -- updated_at mantido pelo trigger
  update public.categorias_despesa set nome = 'Manutenção' where id = '00000000-0000-4000-e000-0000000000a2';
  assert (select updated_at >= created_at from public.categorias_despesa
           where id = '00000000-0000-4000-e000-0000000000a2'),
    'categorias_despesa: updated_at inválido';

  -- despesa de R$ 35,90 tentando forjar criado_por = B => vira A
  insert into public.despesas (id, criado_por, categoria_despesa_id, data, valor) values
    ('00000000-0000-4000-f000-0000000000a1', '00000000-0000-4000-a000-00000000000b',
     '00000000-0000-4000-e000-0000000000a1', '2001-02-10', 35.90);
  select * into r from public.despesas where id = '00000000-0000-4000-f000-0000000000a1';
  assert r.user_id = '00000000-0000-4000-a000-00000000000a' and r.valor = 35.90 and r.descricao is null,
    format('despesa de A deveria ter user_id A e valor 35,90 (veio %s)', r);
  assert r.criado_por = '00000000-0000-4000-a000-00000000000a',
    'FORJA: despesa de A gravou criado_por = B';

  insert into public.despesas (id, categoria_despesa_id, data, valor, descricao) values
    ('00000000-0000-4000-f000-0000000000a2', '00000000-0000-4000-e000-0000000000a2', '2001-02-11', 10.00, 'Pneu'),
    ('00000000-0000-4000-f000-0000000000a3', '00000000-0000-4000-e000-0000000000a2', '2001-02-10', 4.10, null);

  -- valor 0 / negativo => 23514; vazio (null) => 23502
  v_estado := null;
  begin
    insert into public.despesas (categoria_despesa_id, data, valor)
    values ('00000000-0000-4000-e000-0000000000a1', '2001-02-10', 0);
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '23514', format('despesa: valor 0 deveria dar 23514 (veio %s)', v_estado);
  v_estado := null;
  begin
    insert into public.despesas (categoria_despesa_id, data, valor)
    values ('00000000-0000-4000-e000-0000000000a1', '2001-02-10', -0.01);
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '23514', format('despesa: valor negativo deveria dar 23514 (veio %s)', v_estado);
  v_estado := null;
  begin
    insert into public.despesas (categoria_despesa_id, data, valor)
    values ('00000000-0000-4000-e000-0000000000a1', '2001-02-10', null);
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '23502', format('despesa: valor vazio deveria dar 23502 (veio %s)', v_estado);

  -- data futura (hoje + 2) => 23514; hoje + 1 é a margem de fuso (aceita)
  v_estado := null;
  begin
    insert into public.despesas (categoria_despesa_id, data, valor)
    values ('00000000-0000-4000-e000-0000000000a1', current_date + 2, 1.00);
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '23514', format('despesa: data hoje+2 deveria dar 23514 (veio %s)', v_estado);

  -- descrição > 200 => 23514
  v_estado := null;
  begin
    insert into public.despesas (categoria_despesa_id, data, valor, descricao)
    values ('00000000-0000-4000-e000-0000000000a1', '2001-02-10', 1.00, repeat('x', 201));
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '23514', format('despesa: descrição > 200 deveria dar 23514 (veio %s)', v_estado);

  -- categoria inativa => 23514; categoria inexistente => 23503
  v_estado := null;
  begin
    insert into public.despesas (categoria_despesa_id, data, valor)
    values ('00000000-0000-4000-e000-0000000000a3', '2001-02-10', 1.00);
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '23514', format('despesa: categoria inativa deveria dar 23514 (veio %s)', v_estado);
  v_estado := null;
  begin
    insert into public.despesas (categoria_despesa_id, data, valor)
    values ('00000000-0000-4000-e000-0000000000ff', '2001-02-10', 1.00);
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '23503', format('despesa: categoria inexistente deveria dar 23503 (veio %s)', v_estado);

  -- update: valor 0 => 23514; trocar para categoria inativa => 23514
  v_estado := null;
  begin
    update public.despesas set valor = 0 where id = '00000000-0000-4000-f000-0000000000a1';
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '23514', format('despesa: update para valor 0 deveria dar 23514 (veio %s)', v_estado);
  v_estado := null;
  begin
    update public.despesas set categoria_despesa_id = '00000000-0000-4000-e000-0000000000a3'
     where id = '00000000-0000-4000-f000-0000000000a1';
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '23514', format('despesa: update para categoria inativa deveria dar 23514 (veio %s)', v_estado);

  -- editar valor/descrição/categoria (ativa) funciona
  update public.despesas set valor = 36.00, descricao = 'Posto' where id = '00000000-0000-4000-f000-0000000000a1';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 1, 'A deveria editar a própria despesa';
  update public.despesas set valor = 35.90, descricao = null where id = '00000000-0000-4000-f000-0000000000a1';

  -- excluir categoria com despesas => 23503 (FK on delete no action); desativar funciona
  v_estado := null;
  begin
    delete from public.categorias_despesa where id = '00000000-0000-4000-e000-0000000000a2';
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '23503', format('excluir categoria de despesa com despesas deveria dar 23503 (veio %s)', v_estado);
  update public.categorias_despesa set ativa = false where id = '00000000-0000-4000-e000-0000000000a2';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 1, 'A deveria desativar a categoria de despesa';
  -- despesas antigas continuam editáveis (categoria não mudou)
  update public.despesas set descricao = 'Pneu dianteiro' where id = '00000000-0000-4000-f000-0000000000a2';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 1, 'despesa em categoria desativada deveria continuar editável (sem trocar a categoria)';
  update public.categorias_despesa set ativa = true where id = '00000000-0000-4000-e000-0000000000a2';

  -- RPC por categoria (2001-02): Combustível 35,90 (1) e Manutenção 14,10 (2); total 50,00
  assert (select count(*) from public.resumo_despesas_por_categoria('2001-02-01', '2001-02-28')) = 2,
    'resumo_despesas_por_categoria: A deveria ter 2 categorias em 2001-02';
  select * into r from public.resumo_despesas_por_categoria('2001-02-01', '2001-02-28')
   where categoria_id = '00000000-0000-4000-e000-0000000000a1';
  assert r.nome = 'Combustível' and r.ativa and r.quantidade = 1 and r.valor = 35.90 and r.total_geral = 50.00,
    format('resumo_despesas_por_categoria: Combustível deveria ser 1 / 35,90 / total 50,00 (veio %s)', r);
  select * into r from public.resumo_despesas_por_categoria('2001-02-01', '2001-02-28')
   where categoria_id = '00000000-0000-4000-e000-0000000000a2';
  assert r.quantidade = 2 and r.valor = 14.10 and r.total_geral = 50.00,
    format('resumo_despesas_por_categoria: Manutenção deveria ser 2 / 14,10 (veio %s)', r);
  assert (select categoria_id from public.resumo_despesas_por_categoria('2001-02-01', '2001-02-28') limit 1)
         = '00000000-0000-4000-e000-0000000000a1',
    'resumo_despesas_por_categoria: ordem deveria ser valor desc (Combustível primeiro)';
  -- p_usuario = o próprio id funciona
  assert (select total_geral from public.resumo_despesas_por_categoria('2001-02-01', '2001-02-28', null,
            '00000000-0000-4000-a000-00000000000a') limit 1) = 50.00,
    'resumo_despesas_por_categoria: p_usuario = A deveria ser 50,00';
  -- filtro por categoria
  assert (select total_geral from public.resumo_despesas_por_categoria('2001-02-01', '2001-02-28',
            array['00000000-0000-4000-e000-0000000000a2']::uuid[]) limit 1) = 14.10,
    'resumo_despesas_por_categoria [Manutenção]: total deveria ser 14,10';
  assert not exists (select 1 from public.resumo_despesas_por_categoria('2001-02-01', '2001-02-28', '{}'::uuid[])),
    'resumo_despesas_por_categoria [{}]: deveria vir vazio';

  -- RPC por dia: 02-11 10,00 (1); 02-10 40,00 (2); ordem data desc
  assert (select count(*) from public.resumo_despesas_por_dia('2001-02-01', '2001-02-28')) = 2,
    'resumo_despesas_por_dia: A deveria ter 2 dias';
  select * into r from public.resumo_despesas_por_dia('2001-02-01', '2001-02-28') limit 1;
  assert r.data = '2001-02-11' and r.quantidade = 1 and r.valor = 10.00,
    format('resumo_despesas_por_dia: 1ª linha deveria ser 2001-02-11 / 1 / 10,00 (veio %s)', r);
  select * into r from public.resumo_despesas_por_dia('2001-02-01', '2001-02-28') where data = '2001-02-10';
  assert r.quantidade = 2 and r.valor = 40.00,
    format('resumo_despesas_por_dia: 2001-02-10 deveria ser 2 / 40,00 (veio %s)', r);
  select * into r from public.resumo_despesas_por_dia('2001-02-01', '2001-02-28',
                     array['00000000-0000-4000-e000-0000000000a1']::uuid[]);
  assert r.data = '2001-02-10' and r.valor = 35.90,
    format('resumo_despesas_por_dia [Combustível]: deveria ser só 2001-02-10 / 35,90 (veio %s)', r);

  -- receitas não são afetadas: não há lançamentos de A em 2001-02
  assert not exists (select 1 from public.resumo_por_categoria('2001-02-01', '2001-02-28')),
    'resumo_por_categoria (receitas) não deveria somar despesas';

  -- período inválido => 22023
  v_estado := null;
  begin
    perform * from public.resumo_despesas_por_categoria('2001-02-28', '2001-02-01');
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '22023', format('resumo_despesas_por_categoria: início > fim deveria dar 22023 (veio %s)', v_estado);
  v_estado := null;
  begin
    perform * from public.resumo_despesas_por_dia('1999-01-01', '2001-02-01');
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '22023', format('resumo_despesas_por_dia: > 366 dias deveria dar 22023 (veio %s)', v_estado);
  v_estado := null;
  begin
    perform * from public.resumo_despesas_por_dia(null, '2001-02-01');
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '22023', format('resumo_despesas_por_dia: período nulo deveria dar 22023 (veio %s)', v_estado);

  -- entregador: RPC de gestor e p_usuario alheio => 42501
  v_estado := null;
  begin
    perform * from public.resumo_despesas_por_usuario_nomes('2001-02-01', '2001-02-28');
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '42501', format('VAZAMENTO: resumo_despesas_por_usuario_nomes de entregador deveria dar 42501 (veio %s)', v_estado);
  v_estado := null;
  begin
    perform * from public.resumo_despesas_por_categoria('2001-02-01', '2001-02-28', null,
                                                        '00000000-0000-4000-a000-00000000000b');
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '42501', format('VAZAMENTO: resumo_despesas_por_categoria com p_usuario alheio deveria dar 42501 (veio %s)', v_estado);
  v_estado := null;
  begin
    perform * from public.resumo_despesas_por_dia(p_de => '2001-02-01', p_ate => '2001-02-28',
                                                  p_usuario => '00000000-0000-4000-a000-00000000000b');
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '42501', format('VAZAMENTO: resumo_despesas_por_dia com p_usuario alheio deveria dar 42501 (veio %s)', v_estado);
end $$;

-- ---------------------------------------------------------------------
-- 3e) Despesas — usuário B (ainda entregador): isolado de A
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-00000000000b', 'role', 'authenticated')::text, true);

do $$
declare
  v_estado text;
  v_linhas integer;
  v_falhou boolean;
begin
  assert auth.uid() = '00000000-0000-4000-a000-00000000000b', 'setup: auth.uid() deveria ser B';
  assert not public.is_gestor(), 'is_gestor() deveria ser false para B (entregador)';

  -- não vê
  assert (select count(*) from public.categorias_despesa) = 0, 'VAZAMENTO: B vê categorias de despesa de A';
  assert (select count(*) from public.despesas) = 0, 'VAZAMENTO: B vê despesas de A';

  -- não altera / não apaga
  update public.despesas set valor = 999 where id = '00000000-0000-4000-f000-0000000000a1';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 0, 'VAZAMENTO: B alterou despesa de A';
  delete from public.despesas where id = '00000000-0000-4000-f000-0000000000a2';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 0, 'VAZAMENTO: B apagou despesa de A';
  update public.categorias_despesa set nome = 'hackeada' where id = '00000000-0000-4000-e000-0000000000a1';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 0, 'VAZAMENTO: B alterou categoria de despesa de A';
  delete from public.categorias_despesa where id = '00000000-0000-4000-e000-0000000000a3';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 0, 'VAZAMENTO: B apagou categoria de despesa de A';

  -- não lança na categoria de A (nem para si, nem para A)
  v_estado := null;
  begin
    insert into public.despesas (categoria_despesa_id, data, valor)
    values ('00000000-0000-4000-e000-0000000000a1', '2001-02-10', 1.00);
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '23503', format('VAZAMENTO: B lançou despesa na categoria de A (veio %s)', v_estado);
  v_falhou := false;
  begin
    insert into public.despesas (user_id, categoria_despesa_id, data, valor)
    values ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-e000-0000000000a1', '2001-02-10', 1.00);
  exception when others then v_falhou := true;
  end;
  assert v_falhou, 'VAZAMENTO: B lançou despesa para A';

  -- não cria categoria de despesa em nome de A
  v_estado := null;
  begin
    insert into public.categorias_despesa (user_id, nome)
    values ('00000000-0000-4000-a000-00000000000a', 'Intrusa');
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '42501', format('VAZAMENTO: B criou categoria de despesa com user_id de A (veio %s)', v_estado);

  -- B cria os próprios dados (mesmo nome de A é permitido)
  insert into public.categorias_despesa (id, nome)
  values ('00000000-0000-4000-e000-0000000000b1', 'Combustível');
  insert into public.despesas (id, categoria_despesa_id, data, valor)
  values ('00000000-0000-4000-f000-0000000000b1', '00000000-0000-4000-e000-0000000000b1', '2001-02-10', 99.00);

  -- não repontar a própria despesa para a categoria de A, nem passá-la para A
  v_estado := null;
  begin
    update public.despesas set categoria_despesa_id = '00000000-0000-4000-e000-0000000000a1'
     where id = '00000000-0000-4000-f000-0000000000b1';
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '23503', format('VAZAMENTO: B apontou despesa para categoria de A (veio %s)', v_estado);
  v_falhou := false;
  begin
    update public.despesas set user_id = '00000000-0000-4000-a000-00000000000a'
     where id = '00000000-0000-4000-f000-0000000000b1';
  exception when others then v_falhou := true;
  end;
  assert v_falhou, 'VAZAMENTO: B transferiu despesa para A';

  -- RPCs só somam o que é de B
  assert (select total_geral from public.resumo_despesas_por_categoria('2001-02-01', '2001-02-28') limit 1) = 99.00,
    'VAZAMENTO: resumo_despesas_por_categoria de B deveria ser só 99,00';
  assert (select sum(valor) from public.resumo_despesas_por_dia('2001-02-01', '2001-02-28')) = 99.00,
    'VAZAMENTO: resumo_despesas_por_dia de B deveria ser só 99,00';
  assert not exists (select 1 from public.resumo_despesas_por_categoria('2001-02-01', '2001-02-28',
                       array['00000000-0000-4000-e000-0000000000a1']::uuid[])),
    'VAZAMENTO: filtro com id de categoria de A devolveu dados para B';
  v_estado := null;
  begin
    perform * from public.resumo_despesas_por_categoria('2001-02-01', '2001-02-28', null,
                                                        '00000000-0000-4000-a000-00000000000a');
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '42501', format('VAZAMENTO: p_usuario = A por B deveria dar 42501 (veio %s)', v_estado);

  -- autores: A não é autor de nada visível a B
  assert not exists (select 1 from public.autores(array['00000000-0000-4000-a000-00000000000a']::uuid[])),
    'VAZAMENTO: autores (B) devolveu A';
end $$;

-- A continua com as próprias despesas intactas
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-00000000000a', 'role', 'authenticated')::text, true);

do $$
begin
  assert (select count(*) from public.despesas) = 3, 'A deveria ver só as 3 próprias despesas';
  assert (select sum(valor) from public.despesas) = 50.00, 'despesas de A deveriam somar 50,00 (B alterou algo?)';
  assert (select count(*) from public.categorias_despesa) = 3, 'A deveria ver só as 3 próprias categorias de despesa';
  assert (select nome from public.categorias_despesa where id = '00000000-0000-4000-e000-0000000000a1') = 'Combustível',
    'categoria de despesa de A foi alterada por B';
end $$;

-- ---------------------------------------------------------------------
-- 4) Admin = gestor (0006, decisão #8): vê todos os perfis E os dados de
--    todos. (Antes da 0006 este teste esperava o contrário.)
--    O resumo sem p_usuario continua sendo só do próprio admin.
-- ---------------------------------------------------------------------
reset role;
update public.profiles set role = 'admin' where id = '00000000-0000-4000-a000-00000000000b';

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-00000000000b', 'role', 'authenticated')::text, true);

do $$
declare
  v_linhas integer;
begin
  assert public.is_admin(), 'is_admin() deveria ser true para B promovido';
  assert public.is_gestor(), 'is_gestor() deveria ser true para o admin (admin ⊇ gerente)';
  assert (select count(*) from public.profiles where id in (
            '00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000b',
            '00000000-0000-4000-a000-00000000000c', '00000000-0000-4000-a000-00000000000d')) = 4,
    'admin deveria ver todos os perfis';
  assert (select count(*) from public.categorias where user_id = '00000000-0000-4000-a000-00000000000a') = 4,
    'admin (gestor) deveria ver as 4 categorias de A';
  assert (select count(*) from public.lancamentos where user_id = '00000000-0000-4000-a000-00000000000a') = 5,
    'admin (gestor) deveria ver os 5 lançamentos de A';

  -- resumo sem p_usuario = só o próprio admin (não soma A)
  assert not exists (select 1 from public.resumo_por_dia('2025-01-01', '2025-01-31')),
    'VAZAMENTO: resumo_por_dia do admin sem p_usuario soma dados de A';
  assert not exists (select 1 from public.resumo_por_categoria('2025-01-01', '2025-01-31')),
    'VAZAMENTO: resumo_por_categoria do admin sem p_usuario soma dados de A';
  -- com p_usuario = A, o admin vê o relatório de A
  assert (select total_geral from public.resumo_por_categoria('2025-01-15', '2025-01-15', null,
            '00000000-0000-4000-a000-00000000000a') limit 1) = 225.00,
    'admin: resumo_por_categoria com p_usuario = A deveria ser 225,00';
  assert exists (select 1 from public.resumo_por_usuario('2025-01-15', '2025-01-15')
                  where user_id = '00000000-0000-4000-a000-00000000000a' and valor = 225.00),
    'admin: resumo_por_usuario deveria mostrar A com 225,00';

  -- admin edita e exclui lançamento de A (lança e desfaz)
  insert into public.lancamentos (id, user_id, categoria_id, data, quantidade)
  values ('00000000-0000-4000-d000-0000000000b9', '00000000-0000-4000-a000-00000000000a',
          '00000000-0000-4000-c000-0000000000a1', '2026-11-20', 1);
  assert (select criado_por from public.lancamentos where id = '00000000-0000-4000-d000-0000000000b9')
         = '00000000-0000-4000-a000-00000000000b',
    'admin: criado_por do lançamento feito para A deveria ser o admin';
  update public.lancamentos set quantidade = 2 where id = '00000000-0000-4000-d000-0000000000b9';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 1, 'admin (gestor) deveria editar lançamento de A';
  delete from public.lancamentos where id = '00000000-0000-4000-d000-0000000000b9';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 1, 'admin (gestor) deveria excluir lançamento de A';
end $$;

-- ---------------------------------------------------------------------
-- 4a) Entregador C ("Ana"): dados próprios em 2001-01 (10 × 3,00 = 30,00)
--     e continua isolado; RPCs de gestor => 42501.
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-00000000000d', 'role', 'authenticated')::text, true);

do $$
declare
  v_estado text;
begin
  assert auth.uid() = '00000000-0000-4000-a000-00000000000d', 'setup: auth.uid() deveria ser C';
  assert not public.is_gestor(), 'is_gestor() deveria ser false para entregador';

  insert into public.categorias (id, nome, valor_unitario)
  values ('00000000-0000-4000-c000-0000000000d1', 'Marmita', 3.00);
  insert into public.lancamentos (id, categoria_id, data, quantidade)
  values ('00000000-0000-4000-d000-0000000000d1', '00000000-0000-4000-c000-0000000000d1', '2001-01-10', 10);

  assert (select count(*) from public.categorias) = 1, 'VAZAMENTO: C vê categorias alheias';
  assert (select count(*) from public.lancamentos) = 1, 'VAZAMENTO: C vê lançamentos alheios';
  assert (select count(*) from public.profiles) = 1, 'VAZAMENTO: C vê perfis alheios';

  -- resumo próprio com p_usuario = o próprio id funciona
  assert (select total_geral from public.resumo_por_categoria('2001-01-01', '2001-01-31', null,
            '00000000-0000-4000-a000-00000000000d') limit 1) = 30.00,
    'C: resumo com p_usuario = C deveria ser 30,00';

  -- RPCs de gestor e p_usuario de outro => 42501
  v_estado := null;
  begin
    perform * from public.resumo_por_usuario('2001-01-01', '2001-01-31');
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '42501', format('VAZAMENTO: resumo_por_usuario de entregador deveria dar 42501 (veio %s)', v_estado);

  v_estado := null;
  begin
    perform * from public.resumo_por_usuario_nomes('2001-01-01', '2001-01-31', array['pizza']);
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '42501', format('VAZAMENTO: resumo_por_usuario_nomes de entregador deveria dar 42501 (veio %s)', v_estado);

  v_estado := null;
  begin
    perform * from public.resumo_por_categoria('2025-01-01', '2025-01-31', null,
                                               '00000000-0000-4000-a000-00000000000a');
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '42501', format('VAZAMENTO: resumo_por_categoria com p_usuario de outro deveria dar 42501 (veio %s)', v_estado);

  v_estado := null;
  begin
    perform * from public.resumo_por_dia(p_de => '2025-01-01', p_ate => '2025-01-31',
                                         p_usuario => '00000000-0000-4000-a000-00000000000a');
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '42501', format('VAZAMENTO: resumo_por_dia com p_usuario de outro deveria dar 42501 (veio %s)', v_estado);
end $$;

-- ---------------------------------------------------------------------
-- 4b) Gerente G ("Maria"): vê, lança, edita e exclui para A ("João");
--     altera preço/CRUD das categorias de A; criado_por não é forjável.
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-00000000000c', 'role', 'authenticated')::text, true);

do $$
declare
  v_linhas integer;
  v_estado text;
  v_falhou boolean;
  r        record;
begin
  assert auth.uid() = '00000000-0000-4000-a000-00000000000c', 'setup: auth.uid() deveria ser G';
  assert public.is_gestor(), 'is_gestor() deveria ser true para gerente';
  assert not public.is_admin(), 'is_admin() deveria ser false para gerente';

  -- vê todos os perfis e os dados de A e C
  assert (select count(*) from public.profiles where id in (
            '00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000b',
            '00000000-0000-4000-a000-00000000000c', '00000000-0000-4000-a000-00000000000d')) = 4,
    'gerente deveria ver todos os perfis';
  assert (select count(*) from public.categorias where user_id = '00000000-0000-4000-a000-00000000000a') = 4,
    'gerente deveria ver as categorias de A';
  assert (select count(*) from public.lancamentos where user_id = '00000000-0000-4000-a000-00000000000d') = 1,
    'gerente deveria ver os lançamentos de C';

  -- altera o preço de uma categoria de A (Pizza estava 6,00 desde a seção 3b)
  update public.categorias set valor_unitario = 5.00 where id = '00000000-0000-4000-c000-0000000000a4';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 1, 'gerente deveria alterar o preço da categoria de A';

  -- CRUD de categoria de A
  insert into public.categorias (id, user_id, nome, valor_unitario)
  values ('00000000-0000-4000-c000-0000000000c9', '00000000-0000-4000-a000-00000000000a', 'Bebida', 1.00);
  update public.categorias set nome = 'Bebidas' where id = '00000000-0000-4000-c000-0000000000c9';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 1, 'gerente deveria renomear categoria de A';
  delete from public.categorias where id = '00000000-0000-4000-c000-0000000000c9';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 1, 'gerente deveria excluir categoria de A';

  -- lança para A (João): 50 × 2,50 + 20 × 5,00 = 225,00, tentando forjar criado_por = A
  insert into public.lancamentos (id, user_id, criado_por, categoria_id, data, quantidade) values
    ('00000000-0000-4000-d000-0000000000c1', '00000000-0000-4000-a000-00000000000a',
     '00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-c000-0000000000a3', '2001-01-10', 50),
    ('00000000-0000-4000-d000-0000000000c2', '00000000-0000-4000-a000-00000000000a',
     '00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-c000-0000000000a4', '2001-01-10', 20);
  assert (select count(*) from public.lancamentos
           where id in ('00000000-0000-4000-d000-0000000000c1', '00000000-0000-4000-d000-0000000000c2')
             and criado_por = '00000000-0000-4000-a000-00000000000c') = 2,
    'FORJA: criado_por enviado pelo gerente deveria ser substituído por auth.uid() (G)';
  assert (select valor_unitario from public.lancamentos where id = '00000000-0000-4000-d000-0000000000c2') = 5.00,
    'snapshot: lançamento do gerente para A deveria usar o preço da categoria de A (5,00)';

  -- "Maria lança 5 Pizzas para o João"
  insert into public.lancamentos (id, user_id, categoria_id, data, quantidade)
  values ('00000000-0000-4000-d000-0000000000c3', '00000000-0000-4000-a000-00000000000a',
          '00000000-0000-4000-c000-0000000000a4', '2001-01-11', 5);

  -- edita e exclui lançamento de A (um feito pelo próprio A na seção 1)
  update public.lancamentos set quantidade = 7 where id = '00000000-0000-4000-d000-0000000000a2';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 1, 'gerente deveria editar lançamento de A';
  update public.lancamentos set quantidade = 2 where id = '00000000-0000-4000-d000-0000000000a2';

  insert into public.lancamentos (id, user_id, categoria_id, data, quantidade)
  values ('00000000-0000-4000-d000-0000000000c4', '00000000-0000-4000-a000-00000000000a',
          '00000000-0000-4000-c000-0000000000a1', '2001-01-12', 1);
  delete from public.lancamentos where id = '00000000-0000-4000-d000-0000000000c4';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 1, 'gerente deveria excluir lançamento de A';

  -- update não muda criado_por (nem para outro, nem para null)
  update public.lancamentos set criado_por = '00000000-0000-4000-a000-00000000000d'
   where id = '00000000-0000-4000-d000-0000000000c3';
  update public.lancamentos set criado_por = null
   where id = '00000000-0000-4000-d000-0000000000c1';
  assert (select count(*) from public.lancamentos
           where id in ('00000000-0000-4000-d000-0000000000c1', '00000000-0000-4000-d000-0000000000c3')
             and criado_por = '00000000-0000-4000-a000-00000000000c') = 2,
    'FORJA: update alterou criado_por';
  assert (select criado_por from public.lancamentos where id = '00000000-0000-4000-d000-0000000000a1')
         = '00000000-0000-4000-a000-00000000000a',
    'criado_por do lançamento feito por A deveria continuar A';

  -- não lança para A usando categoria de C
  v_estado := null;
  begin
    insert into public.lancamentos (user_id, categoria_id, data, quantidade)
    values ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-c000-0000000000d1', '2001-01-10', 1);
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '23503', format('gerente lançou para A com categoria de C (veio %s)', v_estado);

  -- não repontar lançamento de A para categoria de C
  v_estado := null;
  begin
    update public.lancamentos set categoria_id = '00000000-0000-4000-c000-0000000000d1'
     where id = '00000000-0000-4000-d000-0000000000c3';
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '23503', format('gerente apontou lançamento de A para categoria de C (veio %s)', v_estado);

  -- gerente não escreve em profiles (só Edge Function)
  v_falhou := false;
  begin
    update public.profiles set role = 'admin' where id = '00000000-0000-4000-a000-00000000000c';
  exception when others then v_falhou := true;
  end;
  assert v_falhou, 'VAZAMENTO: gerente alterou profiles';

  -- Equipe em 2001-01: A 225,00 + 25,00 (5 Pizzas em 01-11) = 250,00; C 30,00
  -- Dia 2001-01-10 (cenário da spec): A 225,00, C 30,00, total 255,00
  select * into r from public.resumo_por_usuario('2001-01-10', '2001-01-10')
   where user_id = '00000000-0000-4000-a000-00000000000a';
  assert r.valor = 225.00 and r.quantidade = 70 and r.nome = 'Teste A' and r.username = 'rls_teste_a'
     and r.role = 'user' and r.ativo,
    format('Equipe: A deveria ter 70 / 225,00 (veio %s)', r);
  select * into r from public.resumo_por_usuario('2001-01-10', '2001-01-10')
   where user_id = '00000000-0000-4000-a000-00000000000d';
  assert r.valor = 30.00 and r.quantidade = 10, format('Equipe: C deveria ter 10 / 30,00 (veio %s)', r);
  -- quem não produziu aparece com 0
  select * into r from public.resumo_por_usuario('2001-01-10', '2001-01-10')
   where user_id = '00000000-0000-4000-a000-00000000000c';
  assert r.valor = 0 and r.quantidade = 0 and r.role = 'gerente',
    format('Equipe: G deveria aparecer com 0 / 0 (veio %s)', r);
  assert exists (select 1 from public.resumo_por_usuario('2001-01-10', '2001-01-10')
                  where user_id = '00000000-0000-4000-a000-00000000000b' and valor = 0 and role = 'admin'),
    'Equipe: B (admin) deveria aparecer com 0';
  -- total_geral = soma de todos (255,00 se não houver dados reais nesse dia)
  assert (select bool_and(total_geral = (select sum(valor) from public.resumo_por_usuario('2001-01-10', '2001-01-10')))
            from public.resumo_por_usuario('2001-01-10', '2001-01-10')),
    'Equipe: total_geral deveria ser a soma de todos';
  assert (select sum(valor) from public.resumo_por_usuario('2001-01-10', '2001-01-10')
           where user_id in ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000b',
                             '00000000-0000-4000-a000-00000000000c', '00000000-0000-4000-a000-00000000000d')) = 255.00,
    'Equipe: total dos usuários de teste deveria ser 255,00';
  -- ordem: valor desc => A antes de C antes dos zerados
  assert (select array_agg(user_id order by ord) from (
            select user_id, row_number() over () as ord
              from public.resumo_por_usuario('2001-01-10', '2001-01-10')) x
           where user_id in ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000d'))
         = array['00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000d']::uuid[],
    'Equipe: ordem deveria ser valor desc (A antes de C)';

  -- filtro por NOME "Pizza" (sem caixa/espaços): A 100,00, C 0, soma 100,00
  select * into r from public.resumo_por_usuario_nomes('2001-01-10', '2001-01-10', array[' PIZZA '])
   where user_id = '00000000-0000-4000-a000-00000000000a';
  assert r.valor = 100.00 and r.quantidade = 20, format('Equipe [Pizza]: A deveria ter 20 / 100,00 (veio %s)', r);
  select * into r from public.resumo_por_usuario_nomes('2001-01-10', '2001-01-10', array[' PIZZA '])
   where user_id = '00000000-0000-4000-a000-00000000000d';
  assert r.valor = 0 and r.quantidade = 0, format('Equipe [Pizza]: C deveria ter 0 (veio %s)', r);
  assert (select sum(valor) from public.resumo_por_usuario_nomes('2001-01-10', '2001-01-10', array['pizza'])
           where user_id in ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000d')) = 100.00,
    'Equipe [Pizza]: total dos usuários de teste deveria ser 100,00';
  assert (select bool_and(total_geral = (select sum(valor) from public.resumo_por_usuario_nomes('2001-01-10', '2001-01-10', array['pizza'])))
            from public.resumo_por_usuario_nomes('2001-01-10', '2001-01-10', array['pizza'])),
    'Equipe [Pizza]: total_geral deveria ser a soma de todos';
  -- nomes null = todas; '{}' = nada
  assert (select valor from public.resumo_por_usuario_nomes('2001-01-10', '2001-01-10')
           where user_id = '00000000-0000-4000-a000-00000000000a') = 225.00,
    'Equipe [nomes null]: A deveria ter 225,00';
  assert (select valor from public.resumo_por_usuario_nomes('2001-01-10', '2001-01-10', '{}'::text[])
           where user_id = '00000000-0000-4000-a000-00000000000a') = 0,
    'Equipe [nomes {}]: A deveria ter 0';
  -- filtro por ID de categoria
  assert (select valor from public.resumo_por_usuario('2001-01-10', '2001-01-10',
            array['00000000-0000-4000-c000-0000000000a4']::uuid[])
           where user_id = '00000000-0000-4000-a000-00000000000a') = 100.00,
    'Equipe [id Pizza de A]: A deveria ter 100,00';
  assert (select valor from public.resumo_por_usuario('2001-01-10', '2001-01-10',
            array['00000000-0000-4000-c000-0000000000a4']::uuid[])
           where user_id = '00000000-0000-4000-a000-00000000000d') = 0,
    'Equipe [id Pizza de A]: C deveria ter 0';
  -- período inválido => 22023
  v_estado := null;
  begin
    perform * from public.resumo_por_usuario('2001-01-31', '2001-01-01');
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '22023', format('resumo_por_usuario: início > fim deveria dar 22023 (veio %s)', v_estado);
  v_estado := null;
  begin
    perform * from public.resumo_por_usuario_nomes('1999-01-01', '2001-01-01');
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '22023', format('resumo_por_usuario_nomes: > 366 dias deveria dar 22023 (veio %s)', v_estado);

  -- relatório de A pelo gerente (p_usuario), mês 2001-01: 225,00 + 25,00 = 250,00
  assert (select total_geral from public.resumo_por_categoria('2001-01-01', '2001-01-31', null,
            '00000000-0000-4000-a000-00000000000a') limit 1) = 250.00,
    'gerente: resumo_por_categoria de A deveria ser 250,00';
  assert (select total_geral from public.resumo_por_categoria(
            p_de => '2001-01-01', p_ate => '2001-01-31',
            p_categorias => array['00000000-0000-4000-c000-0000000000a4']::uuid[],
            p_usuario => '00000000-0000-4000-a000-00000000000a') limit 1) = 125.00,
    'gerente: resumo_por_categoria de A só Pizza deveria ser 125,00';
  assert (select count(*) from public.resumo_por_dia('2001-01-01', '2001-01-31', null,
            '00000000-0000-4000-a000-00000000000a')) = 2,
    'gerente: resumo_por_dia de A deveria ter 2 dias';
  -- sem p_usuario: só o próprio gerente (nada) — não soma todo mundo
  assert not exists (select 1 from public.resumo_por_categoria('2001-01-01', '2001-01-31')),
    'VAZAMENTO: resumo_por_categoria do gerente sem p_usuario soma outros usuários';
  assert not exists (select 1 from public.resumo_por_dia('2001-01-01', '2001-01-31')),
    'VAZAMENTO: resumo_por_dia do gerente sem p_usuario soma outros usuários';

  -- autores: G criou lançamentos visíveis; A também
  assert (select count(*) from public.autores(array['00000000-0000-4000-a000-00000000000c',
                                                    '00000000-0000-4000-a000-00000000000a']::uuid[])) = 2,
    'autores (gerente): deveria devolver G e A';
end $$;

-- ---------------------------------------------------------------------
-- 4c) A ("João", entregador) vê o lançamento feito pela gerente, com autor;
--     continua sem ver C; não forja criado_por.
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-00000000000a', 'role', 'authenticated')::text, true);

do $$
declare
  v_estado text;
  r        record;
begin
  assert auth.uid() = '00000000-0000-4000-a000-00000000000a', 'setup: auth.uid() deveria ser A';

  select * into r from public.lancamentos where id = '00000000-0000-4000-d000-0000000000c3';
  assert r.quantidade = 5 and r.criado_por = '00000000-0000-4000-a000-00000000000c',
    format('A deveria ver as 5 Pizzas lançadas por G (veio %s)', r);

  -- selo "por <nome>": autores devolve G para A; C não (não é autor de nada visível a A)
  select * into r from public.autores(array['00000000-0000-4000-a000-00000000000c']::uuid[]);
  assert r.id = '00000000-0000-4000-a000-00000000000c' and r.nome = 'Teste Gerente',
    format('autores (A): deveria devolver "Teste Gerente" (veio %s)', r);
  assert not exists (select 1 from public.autores(array['00000000-0000-4000-a000-00000000000d',
                                                        '00000000-0000-4000-a000-00000000000b']::uuid[])),
    'VAZAMENTO: autores (A) devolveu nome de quem não é autor de lançamento de A';
  assert (select count(*) from public.profiles) = 1, 'VAZAMENTO: A vê perfis alheios';

  -- isolamento de C
  assert (select count(*) from public.lancamentos where user_id = '00000000-0000-4000-a000-00000000000d') = 0,
    'VAZAMENTO: A vê lançamentos de C';
  assert (select count(*) from public.categorias where user_id = '00000000-0000-4000-a000-00000000000d') = 0,
    'VAZAMENTO: A vê categorias de C';
  v_estado := null;
  begin
    perform * from public.resumo_por_usuario('2001-01-01', '2001-01-31');
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '42501', format('VAZAMENTO: resumo_por_usuario de A deveria dar 42501 (veio %s)', v_estado);
  v_estado := null;
  begin
    perform * from public.resumo_por_categoria('2001-01-01', '2001-01-31', null,
                                               '00000000-0000-4000-a000-00000000000d');
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '42501', format('VAZAMENTO: p_usuario = C por A deveria dar 42501 (veio %s)', v_estado);

  -- A não consegue lançar para C
  v_estado := null;
  begin
    insert into public.lancamentos (user_id, categoria_id, data, quantidade)
    values ('00000000-0000-4000-a000-00000000000d', '00000000-0000-4000-c000-0000000000d1', '2001-01-10', 1);
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado is not null, 'VAZAMENTO: A lançou para C';

  -- forja de criado_por por A: insert vira A; update não muda
  insert into public.lancamentos (id, criado_por, categoria_id, data, quantidade)
  values ('00000000-0000-4000-d000-0000000000a9', '00000000-0000-4000-a000-00000000000c',
          '00000000-0000-4000-c000-0000000000a1', '2001-01-12', 1);
  assert (select criado_por from public.lancamentos where id = '00000000-0000-4000-d000-0000000000a9')
         = '00000000-0000-4000-a000-00000000000a',
    'FORJA: A gravou criado_por = G';
  update public.lancamentos set criado_por = '00000000-0000-4000-a000-00000000000a'
   where id = '00000000-0000-4000-d000-0000000000c3';
  assert (select criado_por from public.lancamentos where id = '00000000-0000-4000-d000-0000000000c3')
         = '00000000-0000-4000-a000-00000000000c',
    'FORJA: A apagou a autoria da gerente';
  delete from public.lancamentos where id = '00000000-0000-4000-d000-0000000000a9';

  -- resumo próprio de A em 2001-01 inclui o que a gerente lançou: 250,00
  assert (select total_geral from public.resumo_por_categoria('2001-01-01', '2001-01-31') limit 1) = 250.00,
    'A: resumo próprio em 2001-01 deveria ser 250,00';
end $$;

-- C não recebe nomes de autores de lançamentos alheios
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-00000000000d', 'role', 'authenticated')::text, true);

do $$
begin
  assert not exists (select 1 from public.autores(array['00000000-0000-4000-a000-00000000000c',
                                                        '00000000-0000-4000-a000-00000000000a']::uuid[])),
    'VAZAMENTO: autores (C) devolveu autores de lançamentos de A';
  assert (select count(*) from public.lancamentos) = 1, 'VAZAMENTO: C vê lançamentos de A após ações de G';
end $$;

-- ---------------------------------------------------------------------
-- 4f) Despesas com gestor (0007). Estado: A e C entregadores, B admin,
--     G gerente. Período 2001-02.
--     C ("Ana") cria a própria despesa (20,00) e não vê as de A nem de B.
-- ---------------------------------------------------------------------
do $$
begin
  assert auth.uid() = '00000000-0000-4000-a000-00000000000d', 'setup: auth.uid() deveria ser C';
  assert (select count(*) from public.despesas) = 0, 'VAZAMENTO: C vê despesas alheias';
  assert (select count(*) from public.categorias_despesa) = 0, 'VAZAMENTO: C vê categorias de despesa alheias';

  insert into public.categorias_despesa (id, nome)
  values ('00000000-0000-4000-e000-0000000000d1', 'Combustível');
  insert into public.despesas (id, categoria_despesa_id, data, valor)
  values ('00000000-0000-4000-f000-0000000000d1', '00000000-0000-4000-e000-0000000000d1', '2001-02-10', 20.00);
end $$;

-- Gerente G ("Maria"): vê, lança, edita e exclui despesas e categorias de
-- despesa de A ("João"); anti-forja; Equipe de despesas com filtro por nome.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-00000000000c', 'role', 'authenticated')::text, true);

do $$
declare
  v_linhas integer;
  v_estado text;
  r        record;
begin
  assert auth.uid() = '00000000-0000-4000-a000-00000000000c', 'setup: auth.uid() deveria ser G';

  -- vê dados de despesa de todos
  assert (select count(*) from public.categorias_despesa where user_id = '00000000-0000-4000-a000-00000000000a') = 3,
    'gerente deveria ver as 3 categorias de despesa de A';
  assert (select count(*) from public.despesas where user_id = '00000000-0000-4000-a000-00000000000a') = 3,
    'gerente deveria ver as 3 despesas de A';
  assert (select count(*) from public.despesas where user_id = '00000000-0000-4000-a000-00000000000d') = 1,
    'gerente deveria ver a despesa de C';

  -- CRUD de categoria de despesa de A
  insert into public.categorias_despesa (id, user_id, nome)
  values ('00000000-0000-4000-e000-0000000000c9', '00000000-0000-4000-a000-00000000000a', 'Lavagem');
  update public.categorias_despesa set nome = 'Lavagens' where id = '00000000-0000-4000-e000-0000000000c9';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 1, 'gerente deveria renomear categoria de despesa de A';
  delete from public.categorias_despesa where id = '00000000-0000-4000-e000-0000000000c9';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 1, 'gerente deveria excluir categoria de despesa de A';
  insert into public.categorias_despesa (id, user_id, nome)
  values ('00000000-0000-4000-e000-0000000000a4', '00000000-0000-4000-a000-00000000000a', 'Pedágio');
  -- duplicado ci na lista de A => 23505
  v_estado := null;
  begin
    insert into public.categorias_despesa (user_id, nome)
    values ('00000000-0000-4000-a000-00000000000a', ' COMBUSTível ');
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '23505', format('gerente: categoria de despesa duplicada (ci) para A deveria dar 23505 (veio %s)', v_estado);

  -- lança despesa para A tentando forjar criado_por = A => vira G
  insert into public.despesas (id, user_id, criado_por, categoria_despesa_id, data, valor, descricao) values
    ('00000000-0000-4000-f000-0000000000c1', '00000000-0000-4000-a000-00000000000a',
     '00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-e000-0000000000a4', '2001-02-12', 5.00, 'Rodovia');
  assert (select criado_por from public.despesas where id = '00000000-0000-4000-f000-0000000000c1')
         = '00000000-0000-4000-a000-00000000000c',
    'FORJA: criado_por da despesa enviada pelo gerente deveria ser G';

  -- edita despesa de A (feita pelo próprio A)
  update public.despesas set valor = 36.00, descricao = 'corrigido'
   where id = '00000000-0000-4000-f000-0000000000a1';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 1, 'gerente deveria editar despesa de A';
  update public.despesas set valor = 35.90, descricao = null where id = '00000000-0000-4000-f000-0000000000a1';

  -- lança e exclui despesa de A
  insert into public.despesas (id, user_id, categoria_despesa_id, data, valor)
  values ('00000000-0000-4000-f000-0000000000c2', '00000000-0000-4000-a000-00000000000a',
          '00000000-0000-4000-e000-0000000000a1', '2001-02-13', 1.00);
  delete from public.despesas where id = '00000000-0000-4000-f000-0000000000c2';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 1, 'gerente deveria excluir despesa de A';

  -- update não muda criado_por (nem para outro, nem para null)
  update public.despesas set criado_por = '00000000-0000-4000-a000-00000000000d'
   where id = '00000000-0000-4000-f000-0000000000c1';
  update public.despesas set criado_por = null
   where id = '00000000-0000-4000-f000-0000000000c1';
  assert (select criado_por from public.despesas where id = '00000000-0000-4000-f000-0000000000c1')
         = '00000000-0000-4000-a000-00000000000c',
    'FORJA: update alterou criado_por da despesa';
  assert (select criado_por from public.despesas where id = '00000000-0000-4000-f000-0000000000a1')
         = '00000000-0000-4000-a000-00000000000a',
    'criado_por da despesa feita por A deveria continuar A após edição do gerente';

  -- categoria de outro usuário (C) => 23503; inativa de A => 23514; valor 0 => 23514; data +2 => 23514
  v_estado := null;
  begin
    insert into public.despesas (user_id, categoria_despesa_id, data, valor)
    values ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-e000-0000000000d1', '2001-02-10', 1.00);
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '23503', format('gerente lançou despesa para A com categoria de C (veio %s)', v_estado);
  v_estado := null;
  begin
    update public.despesas set categoria_despesa_id = '00000000-0000-4000-e000-0000000000d1'
     where id = '00000000-0000-4000-f000-0000000000c1';
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '23503', format('gerente apontou despesa de A para categoria de C (veio %s)', v_estado);
  v_estado := null;
  begin
    insert into public.despesas (user_id, categoria_despesa_id, data, valor)
    values ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-e000-0000000000a3', '2001-02-10', 1.00);
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '23514', format('gerente lançou despesa para A em categoria inativa (veio %s)', v_estado);
  v_estado := null;
  begin
    insert into public.despesas (user_id, categoria_despesa_id, data, valor)
    values ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-e000-0000000000a1', '2001-02-10', 0);
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '23514', format('gerente: despesa com valor 0 deveria dar 23514 (veio %s)', v_estado);
  v_estado := null;
  begin
    insert into public.despesas (user_id, categoria_despesa_id, data, valor)
    values ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-e000-0000000000a1', current_date + 2, 1.00);
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '23514', format('gerente: despesa com data hoje+2 deveria dar 23514 (veio %s)', v_estado);

  -- relatório de despesas de A (p_usuario): 35,90 + 14,10 + 5,00 = 55,00
  assert (select count(*) from public.resumo_despesas_por_categoria('2001-02-01', '2001-02-28', null,
            '00000000-0000-4000-a000-00000000000a')) = 3,
    'gerente: resumo_despesas_por_categoria de A deveria ter 3 categorias';
  assert (select total_geral from public.resumo_despesas_por_categoria('2001-02-01', '2001-02-28', null,
            '00000000-0000-4000-a000-00000000000a') limit 1) = 55.00,
    'gerente: resumo_despesas_por_categoria de A deveria ser 55,00';
  assert (select total_geral from public.resumo_despesas_por_categoria(
            p_de => '2001-02-01', p_ate => '2001-02-28',
            p_categorias => array['00000000-0000-4000-e000-0000000000a4']::uuid[],
            p_usuario => '00000000-0000-4000-a000-00000000000a') limit 1) = 5.00,
    'gerente: resumo_despesas_por_categoria de A só Pedágio deveria ser 5,00';
  assert (select count(*) from public.resumo_despesas_por_dia('2001-02-01', '2001-02-28', null,
            '00000000-0000-4000-a000-00000000000a')) = 3,
    'gerente: resumo_despesas_por_dia de A deveria ter 3 dias';
  assert (select valor from public.resumo_despesas_por_dia('2001-02-01', '2001-02-28', null,
            '00000000-0000-4000-a000-00000000000a') where data = '2001-02-12') = 5.00,
    'gerente: resumo_despesas_por_dia de A em 2001-02-12 deveria ser 5,00';
  -- sem p_usuario: só o próprio gerente (nada)
  assert not exists (select 1 from public.resumo_despesas_por_categoria('2001-02-01', '2001-02-28')),
    'VAZAMENTO: resumo_despesas_por_categoria do gerente sem p_usuario soma outros usuários';
  assert not exists (select 1 from public.resumo_despesas_por_dia('2001-02-01', '2001-02-28')),
    'VAZAMENTO: resumo_despesas_por_dia do gerente sem p_usuario soma outros usuários';

  -- Equipe de despesas 2001-02: A 55,00 (4), B 99,00 (1), C 20,00 (1), G 0
  select * into r from public.resumo_despesas_por_usuario_nomes('2001-02-01', '2001-02-28')
   where user_id = '00000000-0000-4000-a000-00000000000a';
  assert r.valor = 55.00 and r.quantidade = 4 and r.nome = 'Teste A' and r.username = 'rls_teste_a'
     and r.role = 'user' and r.ativo,
    format('Equipe despesas: A deveria ter 4 / 55,00 (veio %s)', r);
  select * into r from public.resumo_despesas_por_usuario_nomes('2001-02-01', '2001-02-28')
   where user_id = '00000000-0000-4000-a000-00000000000d';
  assert r.valor = 20.00 and r.quantidade = 1, format('Equipe despesas: C deveria ter 1 / 20,00 (veio %s)', r);
  select * into r from public.resumo_despesas_por_usuario_nomes('2001-02-01', '2001-02-28')
   where user_id = '00000000-0000-4000-a000-00000000000b';
  assert r.valor = 99.00 and r.quantidade = 1 and r.role = 'admin',
    format('Equipe despesas: B deveria ter 1 / 99,00 (veio %s)', r);
  select * into r from public.resumo_despesas_por_usuario_nomes('2001-02-01', '2001-02-28')
   where user_id = '00000000-0000-4000-a000-00000000000c';
  assert r.valor = 0 and r.quantidade = 0 and r.role = 'gerente',
    format('Equipe despesas: G deveria aparecer com 0 / 0 (veio %s)', r);
  assert (select bool_and(total_geral = (select sum(valor) from public.resumo_despesas_por_usuario_nomes('2001-02-01', '2001-02-28')))
            from public.resumo_despesas_por_usuario_nomes('2001-02-01', '2001-02-28')),
    'Equipe despesas: total_geral deveria ser a soma de todos';
  assert (select sum(valor) from public.resumo_despesas_por_usuario_nomes('2001-02-01', '2001-02-28')
           where user_id in ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000b',
                             '00000000-0000-4000-a000-00000000000c', '00000000-0000-4000-a000-00000000000d')) = 174.00,
    'Equipe despesas: total dos usuários de teste deveria ser 174,00';
  -- ordem: valor desc => B, A, C
  assert (select array_agg(user_id order by ord) from (
            select user_id, row_number() over () as ord
              from public.resumo_despesas_por_usuario_nomes('2001-02-01', '2001-02-28')) x
           where user_id in ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000b',
                             '00000000-0000-4000-a000-00000000000d'))
         = array['00000000-0000-4000-a000-00000000000b', '00000000-0000-4000-a000-00000000000a',
                 '00000000-0000-4000-a000-00000000000d']::uuid[],
    'Equipe despesas: ordem deveria ser valor desc (B, A, C)';

  -- filtro por NOME sem caixa/espaços (só letras ASCII mudam de caixa, para
  -- não depender do locale do lower()): " COMBUSTível " => A 35,90; B 99,00; C 20,00
  select * into r from public.resumo_despesas_por_usuario_nomes('2001-02-01', '2001-02-28', array[' COMBUSTível '])
   where user_id = '00000000-0000-4000-a000-00000000000a';
  assert r.valor = 35.90 and r.quantidade = 1, format('Equipe despesas [Combustível]: A deveria ter 1 / 35,90 (veio %s)', r);
  assert (select sum(valor) from public.resumo_despesas_por_usuario_nomes('2001-02-01', '2001-02-28', array[' COMBUSTível '])
           where user_id in ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000b',
                             '00000000-0000-4000-a000-00000000000d')) = 154.90,
    'Equipe despesas [Combustível]: total dos usuários de teste deveria ser 154,90';
  select * into r from public.resumo_despesas_por_usuario_nomes('2001-02-01', '2001-02-28', array['PEDágio'])
   where user_id = '00000000-0000-4000-a000-00000000000d';
  assert r.valor = 0 and r.quantidade = 0, format('Equipe despesas [Pedágio]: C deveria ter 0 (veio %s)', r);
  assert (select valor from public.resumo_despesas_por_usuario_nomes('2001-02-01', '2001-02-28', array['PEDágio'])
           where user_id = '00000000-0000-4000-a000-00000000000a') = 5.00,
    'Equipe despesas [Pedágio]: A deveria ter 5,00';
  assert (select valor from public.resumo_despesas_por_usuario_nomes('2001-02-01', '2001-02-28', '{}'::text[])
           where user_id = '00000000-0000-4000-a000-00000000000a') = 0,
    'Equipe despesas [nomes {}]: A deveria ter 0';
  -- receitas não somam despesas: Equipe de receitas em 2001-02 => A 0
  assert (select valor from public.resumo_por_usuario_nomes('2001-02-01', '2001-02-28')
           where user_id = '00000000-0000-4000-a000-00000000000a') = 0,
    'resumo_por_usuario_nomes (receitas) não deveria somar despesas';
  -- período inválido => 22023
  v_estado := null;
  begin
    perform * from public.resumo_despesas_por_usuario_nomes('2001-02-28', '2001-02-01');
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '22023', format('resumo_despesas_por_usuario_nomes: início > fim deveria dar 22023 (veio %s)', v_estado);

  -- autores: G e A são autores de despesas/lançamentos visíveis
  assert (select count(*) from public.autores(array['00000000-0000-4000-a000-00000000000c',
                                                    '00000000-0000-4000-a000-00000000000a']::uuid[])) = 2,
    'autores (gerente): deveria devolver G e A';
end $$;

-- Admin B também é gestor para despesas: lança para C (B não é autor de
-- nenhum lançamento visível a C, então o selo de C vem só de despesas).
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-00000000000b', 'role', 'authenticated')::text, true);

do $$
declare
  v_linhas integer;
begin
  assert public.is_gestor(), 'is_gestor() deveria ser true para o admin';
  assert (select count(*) from public.despesas where user_id = '00000000-0000-4000-a000-00000000000d') = 1,
    'admin deveria ver a despesa de C';
  insert into public.despesas (id, user_id, criado_por, categoria_despesa_id, data, valor) values
    ('00000000-0000-4000-f000-0000000000b9', '00000000-0000-4000-a000-00000000000d',
     '00000000-0000-4000-a000-00000000000d', '00000000-0000-4000-e000-0000000000d1', '2001-02-15', 7.00);
  assert (select criado_por from public.despesas where id = '00000000-0000-4000-f000-0000000000b9')
         = '00000000-0000-4000-a000-00000000000b',
    'FORJA: criado_por da despesa do admin para C deveria ser B';
  update public.despesas set descricao = 'Óleo' where id = '00000000-0000-4000-f000-0000000000b9';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 1, 'admin deveria editar despesa de C';
  assert (select total_geral from public.resumo_despesas_por_categoria('2001-02-01', '2001-02-28', null,
            '00000000-0000-4000-a000-00000000000d') limit 1) = 27.00,
    'admin: resumo_despesas_por_categoria de C deveria ser 27,00';
  -- sem p_usuario: só as do próprio admin (99,00)
  assert (select total_geral from public.resumo_despesas_por_categoria('2001-02-01', '2001-02-28') limit 1) = 99.00,
    'VAZAMENTO: resumo_despesas_por_categoria do admin sem p_usuario soma outros usuários';
end $$;

-- C vê a despesa lançada pelo admin, com o autor; continua isolada
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-00000000000d', 'role', 'authenticated')::text, true);

do $$
declare
  v_estado text;
  r        record;
begin
  assert (select count(*) from public.despesas) = 2, 'C deveria ver as 2 próprias despesas';
  assert (select criado_por from public.despesas where id = '00000000-0000-4000-f000-0000000000b9')
         = '00000000-0000-4000-a000-00000000000b',
    'C deveria ver a despesa com criado_por = B';
  -- selo "por <nome>" via despesas
  select * into r from public.autores(array['00000000-0000-4000-a000-00000000000b']::uuid[]);
  assert r.id = '00000000-0000-4000-a000-00000000000b' and r.nome = 'Teste B',
    format('autores (C): deveria devolver "Teste B" pela despesa (veio %s)', r);
  assert not exists (select 1 from public.autores(array['00000000-0000-4000-a000-00000000000c',
                                                        '00000000-0000-4000-a000-00000000000a']::uuid[])),
    'VAZAMENTO: autores (C) devolveu autores de despesas/lançamentos de A';
  assert (select total_geral from public.resumo_despesas_por_categoria('2001-02-01', '2001-02-28') limit 1) = 27.00,
    'C: resumo_despesas_por_categoria próprio deveria ser 27,00';
  v_estado := null;
  begin
    perform * from public.resumo_despesas_por_usuario_nomes('2001-02-01', '2001-02-28');
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '42501', format('VAZAMENTO: resumo_despesas_por_usuario_nomes de C deveria dar 42501 (veio %s)', v_estado);
  v_estado := null;
  begin
    perform * from public.resumo_despesas_por_dia('2001-02-01', '2001-02-28', null,
                                                  '00000000-0000-4000-a000-00000000000a');
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '42501', format('VAZAMENTO: resumo_despesas_por_dia com p_usuario = A por C deveria dar 42501 (veio %s)', v_estado);
end $$;

-- A vê a despesa lançada pela gerente, com autor; não forja criado_por
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-00000000000a', 'role', 'authenticated')::text, true);

do $$
declare
  r record;
begin
  assert (select count(*) from public.despesas) = 4, 'A deveria ver as 4 próprias despesas';
  assert (select count(*) from public.despesas where user_id <> '00000000-0000-4000-a000-00000000000a') = 0,
    'VAZAMENTO: A vê despesas alheias';
  select * into r from public.despesas where id = '00000000-0000-4000-f000-0000000000c1';
  assert r.valor = 5.00 and r.criado_por = '00000000-0000-4000-a000-00000000000c',
    format('A deveria ver a despesa de 5,00 lançada por G (veio %s)', r);
  assert exists (select 1 from public.autores(array['00000000-0000-4000-a000-00000000000c']::uuid[])),
    'autores (A): deveria devolver G';
  assert not exists (select 1 from public.autores(array['00000000-0000-4000-a000-00000000000b']::uuid[])),
    'VAZAMENTO: autores (A) devolveu B (autor só de despesas de C/B)';

  insert into public.despesas (id, criado_por, categoria_despesa_id, data, valor) values
    ('00000000-0000-4000-f000-0000000000a9', '00000000-0000-4000-a000-00000000000c',
     '00000000-0000-4000-e000-0000000000a1', '2001-02-14', 1.00);
  assert (select criado_por from public.despesas where id = '00000000-0000-4000-f000-0000000000a9')
         = '00000000-0000-4000-a000-00000000000a',
    'FORJA: A gravou despesa com criado_por = G';
  update public.despesas set criado_por = '00000000-0000-4000-a000-00000000000a'
   where id = '00000000-0000-4000-f000-0000000000c1';
  assert (select criado_por from public.despesas where id = '00000000-0000-4000-f000-0000000000c1')
         = '00000000-0000-4000-a000-00000000000c',
    'FORJA: A apagou a autoria da gerente na despesa';
  delete from public.despesas where id = '00000000-0000-4000-f000-0000000000a9';

  assert (select total_geral from public.resumo_despesas_por_categoria('2001-02-01', '2001-02-28') limit 1) = 55.00,
    'A: resumo_despesas_por_categoria próprio deveria ser 55,00';
end $$;

-- ---------------------------------------------------------------------
-- 4d) Gerente inativo perde tudo
-- ---------------------------------------------------------------------
reset role;
update public.profiles set ativo = false where id = '00000000-0000-4000-a000-00000000000c';
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-00000000000c', 'role', 'authenticated')::text, true);

do $$
declare
  v_estado text;
begin
  assert not public.is_gestor(), 'is_gestor() deveria ser false para gerente inativo';
  assert (select count(*) from public.lancamentos) = 0, 'VAZAMENTO: gerente inativo vê lançamentos';
  assert (select count(*) from public.categorias) = 0, 'VAZAMENTO: gerente inativo vê categorias';
  assert (select count(*) from public.profiles) = 1, 'VAZAMENTO: gerente inativo vê perfis alheios';
  assert not exists (select 1 from public.autores(array['00000000-0000-4000-a000-00000000000c']::uuid[])),
    'VAZAMENTO: autores para gerente inativo';
  v_estado := null;
  begin
    perform * from public.resumo_por_usuario('2001-01-01', '2001-01-31');
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '42501', format('gerente inativo: resumo_por_usuario deveria dar 42501 (veio %s)', v_estado);
  -- despesas (0007)
  assert (select count(*) from public.despesas) = 0, 'VAZAMENTO: gerente inativo vê despesas';
  assert (select count(*) from public.categorias_despesa) = 0, 'VAZAMENTO: gerente inativo vê categorias de despesa';
  v_estado := null;
  begin
    perform * from public.resumo_despesas_por_usuario_nomes('2001-02-01', '2001-02-28');
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '42501', format('gerente inativo: resumo_despesas_por_usuario_nomes deveria dar 42501 (veio %s)', v_estado);
  v_estado := null;
  begin
    perform * from public.resumo_despesas_por_categoria('2001-02-01', '2001-02-28', null,
                                                        '00000000-0000-4000-a000-00000000000a');
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '42501', format('gerente inativo: resumo_despesas_por_categoria de A deveria dar 42501 (veio %s)', v_estado);
end $$;

reset role;
update public.profiles set ativo = true where id = '00000000-0000-4000-a000-00000000000c';

-- ---------------------------------------------------------------------
-- 4e) Sem sessão (service_role / SQL Editor): mantém o criado_por enviado
--     ou usa user_id; exclusão do autor => criado_por null (on delete set null).
-- ---------------------------------------------------------------------
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $$
begin
  assert auth.uid() is null, 'setup: service_role não deveria ter auth.uid()';
  insert into public.lancamentos (id, user_id, criado_por, categoria_id, data, quantidade) values
    ('00000000-0000-4000-d000-0000000000e1', '00000000-0000-4000-a000-00000000000a',
     '00000000-0000-4000-a000-00000000000c', '00000000-0000-4000-c000-0000000000a1', '2001-01-13', 1);
  insert into public.lancamentos (id, user_id, categoria_id, data, quantidade) values
    ('00000000-0000-4000-d000-0000000000e2', '00000000-0000-4000-a000-00000000000a',
     '00000000-0000-4000-c000-0000000000a1', '2001-01-13', 1);
  assert (select criado_por from public.lancamentos where id = '00000000-0000-4000-d000-0000000000e1')
         = '00000000-0000-4000-a000-00000000000c',
    'service_role: criado_por enviado deveria ser mantido';
  assert (select criado_por from public.lancamentos where id = '00000000-0000-4000-d000-0000000000e2')
         = '00000000-0000-4000-a000-00000000000a',
    'service_role: sem criado_por deveria usar user_id';
  delete from public.lancamentos where id in ('00000000-0000-4000-d000-0000000000e1',
                                              '00000000-0000-4000-d000-0000000000e2');

  -- despesas (0007): mesma regra de criado_por sem sessão
  insert into public.despesas (id, user_id, criado_por, categoria_despesa_id, data, valor) values
    ('00000000-0000-4000-f000-0000000000e1', '00000000-0000-4000-a000-00000000000a',
     '00000000-0000-4000-a000-00000000000c', '00000000-0000-4000-e000-0000000000a1', '2001-02-16', 1.00);
  insert into public.despesas (id, user_id, categoria_despesa_id, data, valor) values
    ('00000000-0000-4000-f000-0000000000e2', '00000000-0000-4000-a000-00000000000a',
     '00000000-0000-4000-e000-0000000000a1', '2001-02-16', 1.00);
  assert (select criado_por from public.despesas where id = '00000000-0000-4000-f000-0000000000e1')
         = '00000000-0000-4000-a000-00000000000c',
    'service_role: criado_por enviado na despesa deveria ser mantido';
  assert (select criado_por from public.despesas where id = '00000000-0000-4000-f000-0000000000e2')
         = '00000000-0000-4000-a000-00000000000a',
    'service_role: despesa sem criado_por deveria usar user_id';
  -- service_role também não lança despesa de A em categoria de C (sem RLS, o trigger barra)
  declare
    v_estado text;
  begin
    insert into public.despesas (user_id, categoria_despesa_id, data, valor)
    values ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-e000-0000000000d1', '2001-02-16', 1.00);
  exception when others then
    v_estado := sqlstate;
    assert v_estado = '23503', format('service_role: despesa de A com categoria de C deveria dar 23503 (veio %s)', v_estado);
  end;
  assert not exists (select 1 from public.despesas
                      where user_id = '00000000-0000-4000-a000-00000000000a'
                        and categoria_despesa_id = '00000000-0000-4000-e000-0000000000d1'),
    'service_role: despesa de A com categoria de C foi aceita';
  delete from public.despesas where id in ('00000000-0000-4000-f000-0000000000e1',
                                           '00000000-0000-4000-f000-0000000000e2');
end $$;

reset role;
-- excluir o autor (G) zera criado_por dos lançamentos dele em A, sem apagá-los
delete from auth.users where id = '00000000-0000-4000-a000-00000000000c';

do $$
begin
  assert exists (select 1 from public.lancamentos
                  where id = '00000000-0000-4000-d000-0000000000c3' and criado_por is null),
    'on delete set null: lançamento feito por G deveria continuar, com criado_por null';
  assert not exists (select 1 from public.profiles where id = '00000000-0000-4000-a000-00000000000c'),
    'profile de G deveria ter sido apagado em cascata';
  assert exists (select 1 from public.despesas
                  where id = '00000000-0000-4000-f000-0000000000c1' and criado_por is null),
    'on delete set null: despesa feita por G deveria continuar, com criado_por null';
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

  -- despesas (0007)
  assert (select count(*) from public.despesas) = 0, 'VAZAMENTO: usuário inativo vê despesas';
  assert (select count(*) from public.categorias_despesa) = 0, 'VAZAMENTO: usuário inativo vê categorias de despesa';
  assert not exists (select 1 from public.resumo_despesas_por_categoria('2001-02-01', '2001-02-28')),
    'VAZAMENTO: usuário inativo vê o próprio resumo de despesas';
  update public.despesas set valor = 1 where id = '00000000-0000-4000-f000-0000000000a1';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 0, 'VAZAMENTO: usuário inativo alterou despesa';
  v_falhou := false;
  begin
    insert into public.categorias_despesa (nome) values ('Nova');
  exception when others then
    v_falhou := true;
  end;
  assert v_falhou, 'VAZAMENTO: usuário inativo criou categoria de despesa';
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

  v_falhou := false;
  begin
    perform * from public.resumo_por_categoria('2025-01-01', '2025-01-31',
                                               array['00000000-0000-4000-c000-0000000000a4']::uuid[]);
  exception when others then
    v_falhou := true;
  end;
  assert v_falhou, 'VAZAMENTO: anon executa resumo_por_categoria com filtro';

  v_falhou := false;
  begin
    perform * from public.resumo_por_usuario('2001-01-01', '2001-01-31');
  exception when others then
    v_falhou := true;
  end;
  assert v_falhou, 'VAZAMENTO: anon executa resumo_por_usuario';

  v_falhou := false;
  begin
    perform * from public.resumo_por_usuario_nomes('2001-01-01', '2001-01-31');
  exception when others then
    v_falhou := true;
  end;
  assert v_falhou, 'VAZAMENTO: anon executa resumo_por_usuario_nomes';

  v_falhou := false;
  begin
    perform * from public.autores(array['00000000-0000-4000-a000-00000000000a']::uuid[]);
  exception when others then
    v_falhou := true;
  end;
  assert v_falhou, 'VAZAMENTO: anon executa autores';

  v_falhou := false;
  begin
    perform public.is_gestor();
  exception when others then
    v_falhou := true;
  end;
  assert v_falhou, 'VAZAMENTO: anon executa is_gestor';

  -- despesas (0007)
  v_falhou := false;
  begin
    perform 1 from public.despesas limit 1;
  exception when others then
    v_falhou := true;
  end;
  assert v_falhou, 'VAZAMENTO: anon tem acesso a despesas';

  v_falhou := false;
  begin
    perform 1 from public.categorias_despesa limit 1;
  exception when others then
    v_falhou := true;
  end;
  assert v_falhou, 'VAZAMENTO: anon tem acesso a categorias_despesa';

  v_falhou := false;
  begin
    insert into public.despesas (user_id, categoria_despesa_id, data, valor)
    values ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-e000-0000000000a1', '2001-02-10', 1.00);
  exception when others then
    v_falhou := true;
  end;
  assert v_falhou, 'VAZAMENTO: anon insere em despesas';

  v_falhou := false;
  begin
    perform * from public.resumo_despesas_por_categoria('2001-02-01', '2001-02-28');
  exception when others then
    v_falhou := true;
  end;
  assert v_falhou, 'VAZAMENTO: anon executa resumo_despesas_por_categoria';

  v_falhou := false;
  begin
    perform * from public.resumo_despesas_por_dia('2001-02-01', '2001-02-28');
  exception when others then
    v_falhou := true;
  end;
  assert v_falhou, 'VAZAMENTO: anon executa resumo_despesas_por_dia';

  v_falhou := false;
  begin
    perform * from public.resumo_despesas_por_usuario_nomes('2001-02-01', '2001-02-28');
  exception when others then
    v_falhou := true;
  end;
  assert v_falhou, 'VAZAMENTO: anon executa resumo_despesas_por_usuario_nomes';
end $$;

reset role;
do $$ begin raise notice 'RLS OK'; end $$;

rollback;

-- Só chega aqui se todas as verificações acima passaram.
select 'RLS OK' as resultado;
