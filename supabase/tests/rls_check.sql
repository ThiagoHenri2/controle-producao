-- =====================================================================
-- supabase/tests/rls_check.sql
-- Verificação de RLS e do snapshot de preço (spec 002), data futura
-- (0002, spec 004), RPCs de resumo (0003, spec 005) e nome de categoria
-- único sem diferenciar maiúsculas (0004) e filtro por categorias nas
-- RPCs de resumo (0005), papel gerente / gestor (0006, spec 008) e
-- despesas (0007, spec 009: seções 3d, 3e, 4f e trechos de 4d/4e/5/6) e
-- equipes por gerente (0008, spec 010: setup, 4b, 4f, 4g, 4h e trechos de
-- 4c/4d/4e/6) e privacidade do atendente (0009, spec 011: seção 4a2, e
-- ajustes em 4b, 4f, 4g e 6).
--
-- Requer as migrations 0001..0009 aplicadas.
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
--   H = 00000000-0000-4000-a000-00000000000e   segundo gerente (G2, 0008)
--   A faz o papel do "João" da spec 008.
--
-- Equipes (0008, spec 010), definidas no setup:
--   G1 = G  com o atendente A   (A.gerente_id = G)
--   G2 = H  com o atendente C   (C.gerente_id = H)   ["B de G2" da spec]
--   B  = sem gerente; vira admin na seção 4.
--
-- Privacidade (0009, spec 011): o gerente só vê as categorias de lançamento
-- que o atendente liberou (categorias.visivel_gerente, padrão false) e
-- NUNCA vê despesas/categorias de despesa de atendentes. Das categorias de A,
-- Sanduíche e Antiga ficam ocultas o teste todo; Lanche e Pizza são
-- liberadas na seção 4a2. O admin não é afetado.
--
-- Obs.: para o ADMIN, resumo_por_usuario lista TODOS os perfis do banco.
-- Rodando no projeto real, os perfis reais aparecem também; por isso as
-- asserções do admin olham as linhas dos usuários de teste e usam um
-- período antigo (2001-01) onde não deve haver dados reais. As despesas
-- usam 2001-02. Para o GERENTE de teste a lista é exata (ele + atendentes
-- de teste), pois nenhum perfil real aponta para os ids fixos.
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
   now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-00000000000e',
   'authenticated', 'authenticated', 'rls_teste_h@entregas.local', '',
   now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (id, username, nome, role, ativo) values
  ('00000000-0000-4000-a000-00000000000a', 'rls_teste_a', 'Teste A', 'user', true),
  ('00000000-0000-4000-a000-00000000000b', 'rls_teste_b', 'Teste B', 'user', true),
  ('00000000-0000-4000-a000-00000000000c', 'rls_teste_g', 'Teste Gerente', 'gerente', true),
  ('00000000-0000-4000-a000-00000000000d', 'rls_teste_c', 'Teste C', 'user', true),
  ('00000000-0000-4000-a000-00000000000e', 'rls_teste_h', 'Teste Gerente 2', 'gerente', true);

-- Equipes (0008): A é atendente de G (G1); C é atendente de H (G2).
update public.profiles set gerente_id = '00000000-0000-4000-a000-00000000000c'
 where id = '00000000-0000-4000-a000-00000000000a';
update public.profiles set gerente_id = '00000000-0000-4000-a000-00000000000e'
 where id = '00000000-0000-4000-a000-00000000000d';

-- Regras de gerente_id (0008)
do $$
declare
  v_estado text;
  v_msg    text;
begin
  -- estrutura: FK on delete set null, check gerente_id <> id, índice
  assert (select confdeltype from pg_constraint
           where conrelid = 'public.profiles'::regclass
             and conname = 'profiles_gerente_id_fkey') = 'n',
    'profiles_gerente_id_fkey deveria ser on delete set null';
  assert exists (select 1 from pg_constraint
                  where conrelid = 'public.profiles'::regclass
                    and conname = 'profiles_gerente_id_check' and contype = 'c'),
    'profiles_gerente_id_check deveria existir';
  assert exists (select 1 from pg_indexes
                  where schemaname = 'public' and indexname = 'profiles_gerente_id_idx'),
    'índice profiles_gerente_id_idx deveria existir';

  -- gerente_id apontando para quem NÃO é gerente (B, user) => 23514
  v_estado := null;
  begin
    update public.profiles set gerente_id = '00000000-0000-4000-a000-00000000000b'
     where id = '00000000-0000-4000-a000-00000000000a';
  exception when others then
    v_estado := sqlstate; v_msg := sqlerrm;
  end;
  assert v_estado = '23514' and v_msg = 'O responsável precisa ser um gerente.',
    format('gerente_id -> user deveria dar 23514 "O responsável precisa ser um gerente." (veio %s %s)', v_estado, v_msg);

  -- gerente_id inexistente => 23514 (o trigger roda antes da FK)
  v_estado := null;
  begin
    update public.profiles set gerente_id = '00000000-0000-4000-a000-0000000000ff'
     where id = '00000000-0000-4000-a000-00000000000a';
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '23514', format('gerente_id inexistente deveria dar 23514 (veio %s)', v_estado);

  -- gerente_id = o próprio id => erro (check / trigger)
  v_estado := null;
  begin
    update public.profiles set gerente_id = id
     where id = '00000000-0000-4000-a000-00000000000a';
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '23514', format('gerente_id = id deveria dar 23514 (veio %s)', v_estado);

  -- só atendente tem gerente: H (gerente) com gerente G => 23514
  v_estado := null;
  begin
    update public.profiles set gerente_id = '00000000-0000-4000-a000-00000000000c'
     where id = '00000000-0000-4000-a000-00000000000e';
  exception when others then
    v_estado := sqlstate; v_msg := sqlerrm;
  end;
  assert v_estado = '23514' and v_msg = 'Só atendentes podem ter um gerente.',
    format('gerente com gerente_id deveria dar 23514 "Só atendentes..." (veio %s %s)', v_estado, v_msg);

  -- insert com gerente_id de quem não é gerente também falha
  v_estado := null;
  begin
    insert into public.profiles (id, username, nome, role, gerente_id)
    values ('00000000-0000-4000-a000-00000000000a', 'x_dup', 'x', 'user',
            '00000000-0000-4000-a000-00000000000b');
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '23514', format('insert com gerente_id -> user deveria dar 23514 (veio %s)', v_estado);

  assert (select gerente_id from public.profiles where id = '00000000-0000-4000-a000-00000000000a')
         = '00000000-0000-4000-a000-00000000000c',
    'A deveria continuar com gerente G após as tentativas inválidas';
end $$;

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
-- 4a2) Privacidade do atendente (0009, spec 011). Período antigo: receitas
--      de A em 2025-01 (Lanche 125,00 em 01-15; Pizza 100,00 em 01-15 e
--      5,00 em 01-16) e Sanduíche em 2026-11-20 (16,00).
--      Estado inicial: TODAS as categorias de A estão ocultas para G
--      (padrão false). Depois A libera/oculta e G reage.
--      Ids: Sanduíche a1, Antiga a2 (nunca liberadas), Lanche a3, Pizza a4.
-- ---------------------------------------------------------------------

-- estrutura (como postgres)
reset role;
do $$
begin
  assert (select data_type from information_schema.columns
           where table_schema = 'public' and table_name = 'categorias'
             and column_name = 'visivel_gerente') = 'boolean',
    'categorias.visivel_gerente deveria existir (boolean)';
  assert (select is_nullable from information_schema.columns
           where table_schema = 'public' and table_name = 'categorias'
             and column_name = 'visivel_gerente') = 'NO',
    'categorias.visivel_gerente deveria ser not null';
  assert (select column_default from information_schema.columns
           where table_schema = 'public' and table_name = 'categorias'
             and column_name = 'visivel_gerente') = 'false',
    'categorias.visivel_gerente deveria ter default false';
  assert not exists (select 1 from public.categorias
                      where user_id = '00000000-0000-4000-a000-00000000000a' and visivel_gerente),
    'categorias de A deveriam nascer ocultas (default false)';
  assert exists (select 1 from pg_trigger
                  where tgrelid = 'public.categorias'::regclass and tgname = 'categorias_visibilidade'),
    'trigger categorias_visibilidade deveria existir';
  assert (select prosecdef and provolatile = 's' from pg_proc
           where oid = 'public.pode_ver_categoria(uuid)'::regprocedure),
    'pode_ver_categoria deveria ser security definer e stable';
  assert (select prosecdef and provolatile = 's' from pg_proc
           where oid = 'public.pode_gerir_despesas(uuid)'::regprocedure),
    'pode_gerir_despesas deveria ser security definer e stable';
end $$;

set local role authenticated;

-- (1) G, estado inicial: nada de A é visível
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-00000000000c', 'role', 'authenticated')::text, true);

do $$
declare
  v_linhas integer;
  r        record;
begin
  assert auth.uid() = '00000000-0000-4000-a000-00000000000c', 'setup: auth.uid() deveria ser G';

  assert (select count(*) from public.categorias where user_id = '00000000-0000-4000-a000-00000000000a') = 0,
    'VAZAMENTO: G vê categorias ocultas de A';
  assert (select count(*) from public.lancamentos where user_id = '00000000-0000-4000-a000-00000000000a') = 0,
    'VAZAMENTO: G vê lançamentos de categorias ocultas de A';
  assert not public.pode_ver_categoria('00000000-0000-4000-c000-0000000000a3')
     and not public.pode_ver_categoria('00000000-0000-4000-c000-0000000000a4'),
    'VAZAMENTO: pode_ver_categoria true para categoria oculta';
  assert not public.pode_ver_categoria(null), 'pode_ver_categoria(null) deveria ser false';
  assert not public.pode_ver_categoria('00000000-0000-4000-c000-00000000ffff'),
    'pode_ver_categoria(inexistente) deveria ser false';

  -- resumos: nada de A
  assert not exists (select 1 from public.resumo_por_categoria('2025-01-01', '2025-01-31', null,
                       '00000000-0000-4000-a000-00000000000a')),
    'VAZAMENTO: resumo_por_categoria de A (tudo oculto) retornou dados para G';
  assert not exists (select 1 from public.resumo_por_dia('2025-01-01', '2025-01-31', null,
                       '00000000-0000-4000-a000-00000000000a')),
    'VAZAMENTO: resumo_por_dia de A (tudo oculto) retornou dados para G';
  assert not exists (select 1 from public.resumo_por_dia('2026-11-20', '2026-11-20', null,
                       '00000000-0000-4000-a000-00000000000a')),
    'VAZAMENTO: resumo_por_dia de A em 2026-11-20 (Sanduíche oculta) retornou dados para G';
  -- Equipe: A aparece com 0; total 0
  assert (select count(*) from public.resumo_por_usuario('2025-01-15', '2025-01-16')) = 2,
    'Equipe de G deveria ter 2 linhas (G e A)';
  select * into r from public.resumo_por_usuario('2025-01-15', '2025-01-16')
   where user_id = '00000000-0000-4000-a000-00000000000a';
  assert r.valor = 0 and r.quantidade = 0 and r.total_geral = 0,
    format('VAZAMENTO: Equipe de G deveria mostrar A com 0 (veio %s)', r);
  select * into r from public.resumo_por_usuario_nomes('2025-01-15', '2025-01-16', array['pizza'])
   where user_id = '00000000-0000-4000-a000-00000000000a';
  assert r.valor = 0 and r.total_geral = 0,
    format('VAZAMENTO: Equipe [pizza] de G deveria mostrar A com 0 (veio %s)', r);
  assert (select valor from public.resumo_por_usuario('2026-11-20', '2026-11-20')
           where user_id = '00000000-0000-4000-a000-00000000000a') = 0,
    'VAZAMENTO: Equipe de G soma a Sanduíche oculta de A';
  -- autores: A só é autor de lançamentos em categorias ocultas
  assert not exists (select 1 from public.autores(array['00000000-0000-4000-a000-00000000000a']::uuid[])),
    'VAZAMENTO: autores (G) devolveu A, autor só de lançamentos ocultos';

  -- G não altera nem apaga categoria oculta (RLS filtra: 0 linhas)
  update public.categorias set valor_unitario = 0.01 where id = '00000000-0000-4000-c000-0000000000a3';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 0, 'VAZAMENTO: G alterou categoria oculta de A';
  delete from public.categorias where id = '00000000-0000-4000-c000-0000000000a2';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 0, 'VAZAMENTO: G apagou categoria oculta de A';
  update public.categorias set visivel_gerente = true where id = '00000000-0000-4000-c000-0000000000a3';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 0, 'VAZAMENTO: G liberou sozinho uma categoria oculta de A';
  update public.lancamentos set quantidade = 999 where id = '00000000-0000-4000-d000-0000000000a1';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 0, 'VAZAMENTO: G alterou lançamento de categoria oculta';
  delete from public.lancamentos where id = '00000000-0000-4000-d000-0000000000a1';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 0, 'VAZAMENTO: G apagou lançamento de categoria oculta';
end $$;

-- (2) A (dono): vê as 4 categorias, todas ocultas; libera só Pizza; respeita
--     o flag enviado no insert; pode_ver_categoria true para o dono.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-00000000000a', 'role', 'authenticated')::text, true);

do $$
declare
  v_linhas integer;
begin
  assert (select count(*) from public.categorias) = 4, 'A (dono) deveria ver as 4 categorias';
  assert (select count(*) from public.categorias where visivel_gerente) = 0,
    'as categorias de A deveriam estar todas ocultas';
  assert public.pode_ver_categoria('00000000-0000-4000-c000-0000000000a1')
     and public.pode_ver_categoria('00000000-0000-4000-c000-0000000000a2'),
    'pode_ver_categoria deveria ser true para o dono';
  assert (select count(*) from public.lancamentos where categoria_id = '00000000-0000-4000-c000-0000000000a1') = 2,
    'A (dono) deveria ver os lançamentos da categoria oculta';

  -- insert do dono respeita o valor enviado (padrão false)
  insert into public.categorias (id, nome, valor_unitario, visivel_gerente)
  values ('00000000-0000-4000-c000-0000000000a7', 'Doce', 1.00, true);
  assert (select visivel_gerente from public.categorias where id = '00000000-0000-4000-c000-0000000000a7'),
    'insert do dono com visivel_gerente = true deveria ser respeitado';
  delete from public.categorias where id = '00000000-0000-4000-c000-0000000000a7';

  -- A libera a Pizza
  update public.categorias set visivel_gerente = true where id = '00000000-0000-4000-c000-0000000000a4';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 1, 'A deveria poder liberar a própria categoria';
end $$;

-- (3) G: só a Pizza (e os lançamentos dela) está visível
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-00000000000c', 'role', 'authenticated')::text, true);

do $$
declare
  v_estado text;
  v_linhas integer;
  r        record;
begin
  assert (select array_agg(id) from public.categorias where user_id = '00000000-0000-4000-a000-00000000000a')
         = array['00000000-0000-4000-c000-0000000000a4']::uuid[],
    'G deveria ver só a Pizza de A';
  assert public.pode_ver_categoria('00000000-0000-4000-c000-0000000000a4'), 'pode_ver_categoria(Pizza) para G';
  assert not public.pode_ver_categoria('00000000-0000-4000-c000-0000000000a3'), 'pode_ver_categoria(Lanche) oculta para G';
  assert (select count(*) from public.lancamentos where user_id = '00000000-0000-4000-a000-00000000000a') = 2,
    'G deveria ver só os 2 lançamentos de Pizza de A (2025-01-15 e 2025-01-16)';
  assert not exists (select 1 from public.lancamentos
                      where categoria_id in ('00000000-0000-4000-c000-0000000000a1',
                                             '00000000-0000-4000-c000-0000000000a3')),
    'VAZAMENTO: G vê lançamentos de Sanduíche/Lanche (ocultas)';

  -- resumos: só Pizza (100,00 em 01-15 + 5,00 em 01-16)
  select * into r from public.resumo_por_categoria('2025-01-01', '2025-01-31', null,
                         '00000000-0000-4000-a000-00000000000a');
  assert r.nome = 'Pizza' and r.valor = 105.00 and r.total_geral = 105.00,
    format('G: resumo_por_categoria de A deveria ser só Pizza 105,00 (veio %s)', r);
  assert (select count(*) from public.resumo_por_categoria('2025-01-01', '2025-01-31', null,
            '00000000-0000-4000-a000-00000000000a')) = 1,
    'G: resumo_por_categoria de A deveria ter 1 linha';
  -- pedir explicitamente a categoria oculta não devolve nada
  assert not exists (select 1 from public.resumo_por_categoria('2025-01-01', '2025-01-31',
                       array['00000000-0000-4000-c000-0000000000a3']::uuid[],
                       '00000000-0000-4000-a000-00000000000a')),
    'VAZAMENTO: G filtrou a categoria oculta (Lanche) e viu dados';
  assert (select valor from public.resumo_por_dia('2025-01-15', '2025-01-15', null,
            '00000000-0000-4000-a000-00000000000a')) = 100.00,
    'G: resumo_por_dia de A em 2025-01-15 deveria ser 100,00 (sem o Lanche)';
  assert (select sum(valor) from public.resumo_por_dia('2025-01-01', '2025-01-31', null,
            '00000000-0000-4000-a000-00000000000a')) = 105.00,
    'G: resumo_por_dia de A no mês deveria somar 105,00';
  assert not exists (select 1 from public.resumo_por_dia('2026-11-20', '2026-11-20', null,
                       '00000000-0000-4000-a000-00000000000a')),
    'VAZAMENTO: G vê a Sanduíche oculta em resumo_por_dia';
  -- Equipe
  select * into r from public.resumo_por_usuario('2025-01-15', '2025-01-15')
   where user_id = '00000000-0000-4000-a000-00000000000a';
  assert r.valor = 100.00 and r.quantidade = 20 and r.total_geral = 100.00,
    format('Equipe de G: A deveria ter só a Pizza (20 / 100,00) (veio %s)', r);
  select * into r from public.resumo_por_usuario_nomes('2025-01-15', '2025-01-15', array['lanche'])
   where user_id = '00000000-0000-4000-a000-00000000000a';
  assert r.valor = 0, format('VAZAMENTO: Equipe [lanche] de G mostra o Lanche oculto (veio %s)', r);
  assert (select valor from public.resumo_por_usuario_nomes('2025-01-15', '2025-01-15')
           where user_id = '00000000-0000-4000-a000-00000000000a') = 100.00,
    'Equipe (nomes null) de G: A deveria ter 100,00';
  assert (select count(*) from public.autores(array['00000000-0000-4000-a000-00000000000a']::uuid[])) = 1,
    'autores (G) deveria devolver A (autor de lançamentos de Pizza, visíveis)';

  -- G não altera o flag (nem por API): visível => 42501
  v_estado := null;
  begin
    update public.categorias set visivel_gerente = false where id = '00000000-0000-4000-c000-0000000000a4';
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '42501', format('VAZAMENTO: G alterou visivel_gerente (veio %s)', v_estado);
  v_estado := null;
  begin
    update public.categorias set visivel_gerente = false, nome = 'X'
     where id = '00000000-0000-4000-c000-0000000000a4';
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '42501', format('VAZAMENTO: G alterou visivel_gerente junto com outro campo (veio %s)', v_estado);
  -- sem mexer no flag, G edita a categoria visível (preço)
  update public.categorias set valor_unitario = 5.00 where id = '00000000-0000-4000-c000-0000000000a4';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 1, 'G deveria editar o preço de uma categoria visível de A';

  -- G não lança em categoria oculta (Lanche), nem repontar lançamento para ela
  v_estado := null;
  begin
    insert into public.lancamentos (user_id, categoria_id, data, quantidade)
    values ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-c000-0000000000a3', '2001-01-09', 1);
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado in ('23503', '42501'),
    format('VAZAMENTO: G lançou em categoria oculta de A (veio %s)', v_estado);
  v_estado := null;
  begin
    update public.lancamentos set categoria_id = '00000000-0000-4000-c000-0000000000a3'
     where categoria_id = '00000000-0000-4000-c000-0000000000a4' and data = '2025-01-16';
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado in ('23503', '42501'),
    format('VAZAMENTO: G repontou lançamento para categoria oculta (veio %s)', v_estado);
  assert (select categoria_id from public.lancamentos where data = '2025-01-16'
             and user_id = '00000000-0000-4000-a000-00000000000a')
         = '00000000-0000-4000-c000-0000000000a4',
    'o lançamento de Pizza de A não deveria ter mudado de categoria';

  -- categoria criada pelo gerente nasce visível (mesmo enviando false)
  insert into public.categorias (id, user_id, nome, valor_unitario, visivel_gerente)
  values ('00000000-0000-4000-c000-0000000000c8', '00000000-0000-4000-a000-00000000000a', 'Bebida G', 1.50, false);
  assert (select visivel_gerente from public.categorias where id = '00000000-0000-4000-c000-0000000000c8'),
    'categoria criada pelo gerente para A deveria nascer visível';
  -- o gerente cria categoria PRÓPRIA: sem forçar o flag (padrão false)
  insert into public.categorias (id, nome, valor_unitario)
  values ('00000000-0000-4000-c000-0000000000c7', 'Minha', 1.00);
  assert not (select visivel_gerente from public.categorias where id = '00000000-0000-4000-c000-0000000000c7'),
    'categoria própria do gerente deveria respeitar o padrão false';
  delete from public.categorias where id = '00000000-0000-4000-c000-0000000000c7';
end $$;

-- (4) A: vê a categoria criada pelo gerente (visível); libera Lanche e
--     oculta a Pizza de novo.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-00000000000a', 'role', 'authenticated')::text, true);

do $$
declare
  v_linhas integer;
begin
  assert (select visivel_gerente from public.categorias where id = '00000000-0000-4000-c000-0000000000c8'),
    'A deveria ver a categoria criada por G, visível';
  update public.categorias set visivel_gerente = true where id = '00000000-0000-4000-c000-0000000000a3';
  update public.categorias set visivel_gerente = false where id = '00000000-0000-4000-c000-0000000000a4';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 1, 'A deveria poder ocultar a Pizza de novo';
end $$;

-- (5) G: só Lanche (+ a Bebida G criada por ele) visíveis; a Pizza sumiu
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-00000000000c', 'role', 'authenticated')::text, true);

do $$
declare
  r record;
begin
  assert (select array_agg(id order by id) from public.categorias where user_id = '00000000-0000-4000-a000-00000000000a')
         = array['00000000-0000-4000-c000-0000000000a3', '00000000-0000-4000-c000-0000000000c8']::uuid[],
    'G deveria ver só Lanche e Bebida G (a Pizza foi ocultada de novo)';
  assert not exists (select 1 from public.lancamentos
                      where categoria_id = '00000000-0000-4000-c000-0000000000a4'),
    'VAZAMENTO: G ainda vê lançamentos da Pizza reocultada';
  select * into r from public.resumo_por_categoria('2025-01-01', '2025-01-31', null,
                         '00000000-0000-4000-a000-00000000000a');
  assert r.nome = 'Lanche' and r.valor = 125.00 and r.total_geral = 125.00,
    format('G: resumo de A deveria ser só Lanche 125,00 (veio %s)', r);
  assert (select valor from public.resumo_por_usuario('2025-01-15', '2025-01-16')
           where user_id = '00000000-0000-4000-a000-00000000000a') = 125.00,
    'Equipe de G: A deveria ter só o Lanche (125,00)';
  assert (select valor from public.resumo_por_usuario_nomes('2025-01-15', '2025-01-16', array['pizza'])
           where user_id = '00000000-0000-4000-a000-00000000000a') = 0,
    'VAZAMENTO: Equipe [pizza] de G mostra a Pizza reocultada';
end $$;

-- (6) A volta a liberar a Pizza e remove a Bebida G: estado final do
--     restante do script = Lanche e Pizza visíveis; Sanduíche e Antiga ocultas.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-00000000000a', 'role', 'authenticated')::text, true);

do $$
begin
  update public.categorias set visivel_gerente = true where id = '00000000-0000-4000-c000-0000000000a4';
  delete from public.categorias where id = '00000000-0000-4000-c000-0000000000c8';
  assert (select count(*) from public.categorias where visivel_gerente) = 2,
    'A deveria terminar com Lanche e Pizza visíveis';
end $$;

-- (7) Admin (B): não é afetado (vê as 4 categorias e todos os lançamentos de
--     A, inclusive das ocultas) e pode alterar o flag.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-00000000000b', 'role', 'authenticated')::text, true);

do $$
declare
  v_linhas integer;
begin
  assert public.is_admin(), 'B deveria ser admin';
  assert (select count(*) from public.categorias where user_id = '00000000-0000-4000-a000-00000000000a') = 4,
    'admin deveria ver as 4 categorias de A (inclusive ocultas)';
  assert public.pode_ver_categoria('00000000-0000-4000-c000-0000000000a1'), 'pode_ver_categoria true para o admin';
  assert (select count(*) from public.lancamentos where categoria_id = '00000000-0000-4000-c000-0000000000a1') = 2,
    'admin deveria ver os lançamentos da categoria oculta de A';
  assert (select total_geral from public.resumo_por_categoria('2025-01-15', '2025-01-15', null,
            '00000000-0000-4000-a000-00000000000a') limit 1) = 225.00,
    'admin: resumo de A (2025-01-15) deveria incluir tudo (225,00)';
  assert (select valor from public.resumo_por_dia('2026-11-20', '2026-11-20', null,
            '00000000-0000-4000-a000-00000000000a')) = 16.00,
    'admin: resumo_por_dia de A em 2026-11-20 deveria ser 16,00 (Sanduíche oculta)';
  assert (select valor from public.resumo_por_usuario('2026-11-20', '2026-11-20')
           where user_id = '00000000-0000-4000-a000-00000000000a') = 16.00,
    'admin: Equipe deveria mostrar A com 16,00 em 2026-11-20';
  assert (select valor from public.resumo_por_usuario_nomes('2026-11-20', '2026-11-20', array['sanduíche'])
           where user_id = '00000000-0000-4000-a000-00000000000a') = 16.00,
    'admin: Equipe [sanduíche] deveria mostrar A com 16,00';

  -- admin altera o flag e volta
  update public.categorias set visivel_gerente = true where id = '00000000-0000-4000-c000-0000000000a2';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 1, 'admin deveria poder alterar visivel_gerente';
  update public.categorias set visivel_gerente = false where id = '00000000-0000-4000-c000-0000000000a2';
  -- admin cria categoria para A: respeita o valor (padrão false)
  insert into public.categorias (id, user_id, nome, valor_unitario)
  values ('00000000-0000-4000-c000-0000000000b8', '00000000-0000-4000-a000-00000000000a', 'Criada pelo admin', 1.00);
  assert not (select visivel_gerente from public.categorias where id = '00000000-0000-4000-c000-0000000000b8'),
    'categoria criada pelo admin deveria respeitar o padrão (false)';
  delete from public.categorias where id = '00000000-0000-4000-c000-0000000000b8';
end $$;

-- (8) Sem sessão (postgres / service_role) altera o flag
reset role;
do $$
begin
  update public.categorias set visivel_gerente = true where id = '00000000-0000-4000-c000-0000000000a2';
  assert (select visivel_gerente from public.categorias where id = '00000000-0000-4000-c000-0000000000a2'),
    'postgres/service_role deveria poder alterar visivel_gerente';
  update public.categorias set visivel_gerente = false where id = '00000000-0000-4000-c000-0000000000a2';
end $$;

set local role authenticated;

-- ---------------------------------------------------------------------
-- 4b) Gerente G ("Maria", G1): vê, lança, edita e exclui para A ("João",
--     atendente dela); altera preço/CRUD das categorias de A; criado_por
--     não é forjável. 0008: NÃO vê C (atendente de G2), B, nem G2.
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

  -- 0008: vê só ele + o atendente A (não B, não C, não H, nem perfis reais)
  assert (select count(*) from public.profiles) = 2,
    format('VAZAMENTO: gerente G1 deveria ver só 2 perfis (G1 e A), viu %s', (select count(*) from public.profiles));
  assert (select array_agg(id order by id) from public.profiles)
         = array['00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000c']::uuid[],
    'VAZAMENTO: gerente G1 deveria ver exatamente G1 e A';
  assert public.pode_gerir('00000000-0000-4000-a000-00000000000a'), 'pode_gerir(A) deveria ser true para G1';
  assert public.pode_gerir('00000000-0000-4000-a000-00000000000c'), 'pode_gerir(G1) deveria ser true para G1';
  assert not public.pode_gerir('00000000-0000-4000-a000-00000000000d'), 'VAZAMENTO: pode_gerir(C, de G2) para G1';
  assert not public.pode_gerir('00000000-0000-4000-a000-00000000000e'), 'VAZAMENTO: pode_gerir(G2) para G1';
  assert not public.pode_gerir('00000000-0000-4000-a000-00000000000b'), 'VAZAMENTO: pode_gerir(B, sem gerente) para G1';
  assert not public.pode_gerir(null), 'pode_gerir(null) deveria ser false';
  -- 0009: só as categorias liberadas por A (Lanche e Pizza; Sanduíche e Antiga ocultas)
  assert (select count(*) from public.categorias where user_id = '00000000-0000-4000-a000-00000000000a') = 2,
    'gerente deveria ver só as 2 categorias liberadas de A';
  assert (select count(*) from public.lancamentos where user_id = '00000000-0000-4000-a000-00000000000d') = 0,
    'VAZAMENTO: gerente G1 vê lançamentos de C (atendente de G2)';
  assert (select count(*) from public.lancamentos where user_id not in (
            '00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000c')) = 0,
    'VAZAMENTO: gerente G1 vê lançamentos de fora da equipe';
  assert (select count(*) from public.categorias where user_id not in (
            '00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000c')) = 0,
    'VAZAMENTO: gerente G1 vê categorias de fora da equipe';

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

  -- edita e exclui lançamento de A (0009: só em categoria liberada, Lanche)
  update public.lancamentos set quantidade = 7 where id = '00000000-0000-4000-d000-0000000000c1';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 1, 'gerente deveria editar lançamento de A em categoria liberada';
  update public.lancamentos set quantidade = 50 where id = '00000000-0000-4000-d000-0000000000c1';
  -- ... e não os da categoria oculta (Sanduíche): 0 linhas
  update public.lancamentos set quantidade = 7 where id = '00000000-0000-4000-d000-0000000000a2';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 0, 'VAZAMENTO: gerente editou lançamento de categoria oculta de A';

  insert into public.lancamentos (id, user_id, categoria_id, data, quantidade)
  values ('00000000-0000-4000-d000-0000000000c4', '00000000-0000-4000-a000-00000000000a',
          '00000000-0000-4000-c000-0000000000a3', '2001-01-12', 1);
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
  assert (select criado_por from public.lancamentos
           where categoria_id = '00000000-0000-4000-c000-0000000000a3' and data = '2025-01-15')
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

  -- Equipe de G1 (0008): só G1 + A. C (30,00 em 2001-01-10, de G2) e B
  -- (admin) NÃO aparecem. Em 2001-01: A 225,00 + 25,00 (5 Pizzas em 01-11).
  -- Dia 2001-01-10 (cenário da spec): A 225,00, G1 0, total 225,00
  assert (select count(*) from public.resumo_por_usuario('2001-01-10', '2001-01-10')) = 2,
    'VAZAMENTO: Equipe de G1 deveria ter só 2 linhas (G1 e A)';
  select * into r from public.resumo_por_usuario('2001-01-10', '2001-01-10')
   where user_id = '00000000-0000-4000-a000-00000000000a';
  assert r.valor = 225.00 and r.quantidade = 70 and r.nome = 'Teste A' and r.username = 'rls_teste_a'
     and r.role = 'user' and r.ativo and r.total_geral = 225.00,
    format('Equipe: A deveria ter 70 / 225,00 / total 225,00 (veio %s)', r);
  assert not exists (select 1 from public.resumo_por_usuario('2001-01-10', '2001-01-10')
                      where user_id in ('00000000-0000-4000-a000-00000000000d',
                                        '00000000-0000-4000-a000-00000000000b',
                                        '00000000-0000-4000-a000-00000000000e')),
    'VAZAMENTO: Equipe de G1 mostra C, B ou G2';
  -- quem não produziu aparece com 0
  select * into r from public.resumo_por_usuario('2001-01-10', '2001-01-10')
   where user_id = '00000000-0000-4000-a000-00000000000c';
  assert r.valor = 0 and r.quantidade = 0 and r.role = 'gerente',
    format('Equipe: G deveria aparecer com 0 / 0 (veio %s)', r);
  -- total_geral = soma da equipe
  assert (select bool_and(total_geral = 225.00) from public.resumo_por_usuario('2001-01-10', '2001-01-10')),
    'Equipe: total_geral deveria ser 225,00 (só a equipe de G1)';
  -- ordem: valor desc => A antes de G1
  assert (select array_agg(user_id) from public.resumo_por_usuario('2001-01-10', '2001-01-10'))
         = array['00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000c']::uuid[],
    'Equipe: ordem deveria ser valor desc (A antes de G1)';

  -- filtro por NOME "Pizza" (sem caixa/espaços): A 100,00; C não aparece
  select * into r from public.resumo_por_usuario_nomes('2001-01-10', '2001-01-10', array[' PIZZA '])
   where user_id = '00000000-0000-4000-a000-00000000000a';
  assert r.valor = 100.00 and r.quantidade = 20, format('Equipe [Pizza]: A deveria ter 20 / 100,00 (veio %s)', r);
  assert not exists (select 1 from public.resumo_por_usuario_nomes('2001-01-10', '2001-01-10', array[' PIZZA '])
                      where user_id = '00000000-0000-4000-a000-00000000000d'),
    'VAZAMENTO: Equipe [Pizza] de G1 mostra C';
  assert (select count(*) from public.resumo_por_usuario_nomes('2001-01-10', '2001-01-10', array['pizza'])) = 2,
    'VAZAMENTO: Equipe [Pizza] de G1 deveria ter 2 linhas';
  assert (select sum(valor) from public.resumo_por_usuario_nomes('2001-01-10', '2001-01-10', array['pizza'])) = 100.00,
    'Equipe [Pizza]: total da equipe deveria ser 100,00';
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
  assert not exists (select 1 from public.resumo_por_usuario('2001-01-10', '2001-01-10',
            array['00000000-0000-4000-c000-0000000000a4']::uuid[])
           where user_id = '00000000-0000-4000-a000-00000000000d'),
    'VAZAMENTO: Equipe [id Pizza de A] de G1 mostra C';
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

  -- 0008: A vê o próprio gerente_id e o gerente via meu_gerente()
  assert (select gerente_id from public.profiles where id = auth.uid()) = '00000000-0000-4000-a000-00000000000c',
    'A deveria ver o próprio gerente_id = G';
  select * into r from public.meu_gerente();
  assert r.id = '00000000-0000-4000-a000-00000000000c' and r.nome = 'Teste Gerente' and r.username = 'rls_teste_g',
    format('meu_gerente (A): deveria devolver G (veio %s)', r);
  assert (select count(*) from public.meu_gerente()) = 1, 'meu_gerente (A): deveria ter 1 linha';
  assert not public.pode_gerir('00000000-0000-4000-a000-00000000000c'),
    'VAZAMENTO: atendente A pode_gerir o próprio gerente';

  -- 0008: o atendente não altera o próprio gerente_id (profiles sem update pelo cliente)
  v_estado := null;
  begin
    update public.profiles set gerente_id = null where id = auth.uid();
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '42501', format('VAZAMENTO: A alterou o próprio gerente_id (veio %s)', v_estado);
  v_estado := null;
  begin
    update public.profiles set gerente_id = '00000000-0000-4000-a000-00000000000e' where id = auth.uid();
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '42501', format('VAZAMENTO: A trocou o próprio gerente (veio %s)', v_estado);

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
--     G gerente de A; H (G2) gerente de C. Período 2001-02.
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

-- Gerente G ("Maria"): 0009 — NÃO vê, não lança, não edita nem exclui despesas
-- e categorias de despesa de A (nem de ninguém além dele). Equipe de despesas
-- do gerente = só a linha dele. As despesas/categorias dele próprio funcionam.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-00000000000c', 'role', 'authenticated')::text, true);

do $$
declare
  v_linhas integer;
  v_estado text;
  r        record;
begin
  assert auth.uid() = '00000000-0000-4000-a000-00000000000c', 'setup: auth.uid() deveria ser G';

  -- funções de permissão
  assert not public.pode_gerir_despesas('00000000-0000-4000-a000-00000000000a'),
    'VAZAMENTO: pode_gerir_despesas(A) deveria ser false para o gerente';
  assert public.pode_gerir_despesas('00000000-0000-4000-a000-00000000000c'),
    'pode_gerir_despesas(G) deveria ser true para o próprio gerente';
  assert not public.pode_gerir_despesas(null), 'pode_gerir_despesas(null) deveria ser false';

  -- não vê nada de A nem de ninguém de fora
  assert (select count(*) from public.categorias_despesa) = 0,
    'VAZAMENTO: gerente vê categorias de despesa de atendentes';
  assert (select count(*) from public.despesas) = 0,
    'VAZAMENTO: gerente vê despesas de atendentes';

  -- não altera / não apaga
  update public.despesas set valor = 1 where id = '00000000-0000-4000-f000-0000000000a1';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 0, 'VAZAMENTO: gerente alterou despesa de A';
  delete from public.despesas where id = '00000000-0000-4000-f000-0000000000a2';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 0, 'VAZAMENTO: gerente apagou despesa de A';
  update public.categorias_despesa set nome = 'hackeada' where id = '00000000-0000-4000-e000-0000000000a1';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 0, 'VAZAMENTO: gerente alterou categoria de despesa de A';
  delete from public.categorias_despesa where id = '00000000-0000-4000-e000-0000000000a3';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 0, 'VAZAMENTO: gerente apagou categoria de despesa de A';

  -- não cria categoria de despesa para A (RLS => 42501)
  v_estado := null;
  begin
    insert into public.categorias_despesa (user_id, nome)
    values ('00000000-0000-4000-a000-00000000000a', 'Lavagem');
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '42501', format('VAZAMENTO: gerente criou categoria de despesa para A (veio %s)', v_estado);

  -- não lança despesa para A (a categoria de A não é visível => 23503 antes da RLS)
  v_estado := null;
  begin
    insert into public.despesas (user_id, categoria_despesa_id, data, valor)
    values ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-e000-0000000000a1', '2001-02-12', 5.00);
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado in ('23503', '42501'),
    format('VAZAMENTO: gerente lançou despesa para A (veio %s)', v_estado);

  -- RPCs de despesas de A => 42501 (inclusive quem tem categorias de receita liberadas)
  v_estado := null;
  begin
    perform * from public.resumo_despesas_por_categoria('2001-02-01', '2001-02-28', null,
                                                        '00000000-0000-4000-a000-00000000000a');
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '42501', format('VAZAMENTO: gerente viu resumo_despesas_por_categoria de A (veio %s)', v_estado);
  v_estado := null;
  begin
    perform * from public.resumo_despesas_por_dia(p_de => '2001-02-01', p_ate => '2001-02-28',
                                                  p_usuario => '00000000-0000-4000-a000-00000000000a');
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '42501', format('VAZAMENTO: gerente viu resumo_despesas_por_dia de A (veio %s)', v_estado);

  -- Equipe de despesas do gerente: SÓ a linha dele (A não aparece), mesmo
  -- com A tendo despesas em 2001-02 (50,00)
  assert (select count(*) from public.resumo_despesas_por_usuario_nomes('2001-02-01', '2001-02-28')) = 1,
    'VAZAMENTO: Equipe de despesas do gerente deveria ter só 1 linha (ele mesmo)';
  select * into r from public.resumo_despesas_por_usuario_nomes('2001-02-01', '2001-02-28');
  assert r.user_id = '00000000-0000-4000-a000-00000000000c' and r.role = 'gerente'
     and r.valor = 0 and r.quantidade = 0 and r.total_geral = 0,
    format('Equipe despesas: o gerente deveria ver só a própria linha com 0 (veio %s)', r);
  assert not exists (select 1 from public.resumo_despesas_por_usuario_nomes('2001-02-01', '2001-02-28',
                       array['combustível'])
                      where user_id = '00000000-0000-4000-a000-00000000000a'),
    'VAZAMENTO: Equipe de despesas [Combustível] do gerente mostra A';
  -- período inválido => 22023
  v_estado := null;
  begin
    perform * from public.resumo_despesas_por_usuario_nomes('2001-02-28', '2001-02-01');
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '22023', format('resumo_despesas_por_usuario_nomes: início > fim deveria dar 22023 (veio %s)', v_estado);

  -- sem p_usuario: só as próprias (nada)
  assert not exists (select 1 from public.resumo_despesas_por_categoria('2001-02-01', '2001-02-28')),
    'resumo_despesas_por_categoria do gerente sem p_usuario deveria ser vazio';

  -- o gerente opera as PRÓPRIAS despesas e categorias de despesa normalmente
  insert into public.categorias_despesa (id, nome) values ('00000000-0000-4000-e000-0000000000c1', 'Combustível');
  insert into public.despesas (id, categoria_despesa_id, data, valor)
  values ('00000000-0000-4000-f000-0000000000c1', '00000000-0000-4000-e000-0000000000c1', '2001-02-12', 5.00);
  update public.despesas set valor = 6.00 where id = '00000000-0000-4000-f000-0000000000c1';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 1, 'gerente deveria editar a própria despesa';
  assert (select total_geral from public.resumo_despesas_por_categoria('2001-02-01', '2001-02-28') limit 1) = 6.00,
    'gerente: resumo_despesas_por_categoria próprio deveria ser 6,00';
  assert (select valor from public.resumo_despesas_por_usuario_nomes('2001-02-01', '2001-02-28')
           where user_id = '00000000-0000-4000-a000-00000000000c') = 6.00,
    'Equipe despesas: a linha do gerente deveria ter 6,00';
  assert (select count(*) from public.resumo_despesas_por_usuario_nomes('2001-02-01', '2001-02-28')) = 1,
    'Equipe despesas: o gerente continua só com a própria linha';
  delete from public.despesas where id = '00000000-0000-4000-f000-0000000000c1';
  delete from public.categorias_despesa where id = '00000000-0000-4000-e000-0000000000c1';

  -- receitas não somam despesas: Equipe de receitas em 2001-02 => A 0
  assert (select valor from public.resumo_por_usuario_nomes('2001-02-01', '2001-02-28')
           where user_id = '00000000-0000-4000-a000-00000000000a') = 0,
    'resumo_por_usuario_nomes (receitas) não deveria somar despesas';

  -- autores: G e A são autores de lançamentos visíveis
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
  assert (select count(*) from public.despesas) = 3, 'A deveria ver as 3 próprias despesas';
  assert (select count(*) from public.despesas where user_id <> '00000000-0000-4000-a000-00000000000a') = 0,
    'VAZAMENTO: A vê despesas alheias';
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
  delete from public.despesas where id = '00000000-0000-4000-f000-0000000000a9';

  assert (select total_geral from public.resumo_despesas_por_categoria('2001-02-01', '2001-02-28') limit 1) = 50.00,
    'A: resumo_despesas_por_categoria próprio deveria ser 50,00';
  -- A é dono das despesas, não o gerente: A vê todas as 3 categorias de despesa
  assert (select count(*) from public.categorias_despesa) = 3, 'A deveria ver as 3 próprias categorias de despesa';
end $$;

-- ---------------------------------------------------------------------
-- 4g) Equipes (0008, spec 010). Estado: G1 = G com A; G2 = H com C;
--     B admin. Período 2001-01 (receitas) e 2001-02 (despesas).
-- ---------------------------------------------------------------------

-- G2 (H): dados próprios e lançamentos para C (atendente dele).
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-00000000000e', 'role', 'authenticated')::text, true);

do $$
declare
  v_estado text;
  v_linhas integer;
  r        record;
begin
  assert auth.uid() = '00000000-0000-4000-a000-00000000000e', 'setup: auth.uid() deveria ser H (G2)';
  assert public.is_gestor() and not public.is_admin(), 'H deveria ser gestor (gerente) e não admin';

  -- vê só ele + C
  assert (select array_agg(id order by id) from public.profiles)
         = array['00000000-0000-4000-a000-00000000000d', '00000000-0000-4000-a000-00000000000e']::uuid[],
    'VAZAMENTO: G2 deveria ver exatamente G2 e C';

  -- dados próprios: 2 × 4,00 = 8,00 em 2001-01-10
  insert into public.categorias (id, nome, valor_unitario)
  values ('00000000-0000-4000-c000-0000000000e1', 'Pizza', 4.00);
  insert into public.lancamentos (id, categoria_id, data, quantidade)
  values ('00000000-0000-4000-d000-0000000000e9', '00000000-0000-4000-c000-0000000000e1', '2001-01-10', 2);
  insert into public.categorias_despesa (id, nome) values ('00000000-0000-4000-e000-0000000000e1', 'Combustível');
  insert into public.despesas (id, categoria_despesa_id, data, valor)
  values ('00000000-0000-4000-f000-0000000000e9', '00000000-0000-4000-e000-0000000000e1', '2001-02-10', 11.00);

  -- 0009: C ainda não liberou a Marmita => G2 não vê o lançamento de C,
  -- e nunca vê as despesas de C
  assert (select count(*) from public.categorias where user_id = '00000000-0000-4000-a000-00000000000d') = 0,
    'VAZAMENTO: G2 vê a categoria oculta de C';
  assert (select count(*) from public.lancamentos where user_id = '00000000-0000-4000-a000-00000000000d') = 0,
    'VAZAMENTO: G2 vê o lançamento de C em categoria oculta';
  assert (select count(*) from public.despesas where user_id = '00000000-0000-4000-a000-00000000000d') = 0,
    'VAZAMENTO: G2 vê as despesas de C';
  assert (select valor from public.resumo_por_usuario('2001-01-10', '2001-01-10')
           where user_id = '00000000-0000-4000-a000-00000000000d') = 0,
    'VAZAMENTO: Equipe de G2 soma a categoria oculta de C';
end $$;

-- C libera a Marmita para o gerente G2
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-00000000000d', 'role', 'authenticated')::text, true);

update public.categorias set visivel_gerente = true where id = '00000000-0000-4000-c000-0000000000d1';

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-00000000000e', 'role', 'authenticated')::text, true);

do $$
declare
  v_estado text;
  v_linhas integer;
  r        record;
begin
  -- vê e opera os dados de C: lança 1 Marmita (3,00) para C em 2001-01-10
  assert (select count(*) from public.lancamentos where user_id = '00000000-0000-4000-a000-00000000000d') = 1,
    'G2 deveria ver o lançamento de C (categoria liberada)';
  insert into public.lancamentos (id, user_id, categoria_id, data, quantidade)
  values ('00000000-0000-4000-d000-0000000000e8', '00000000-0000-4000-a000-00000000000d',
          '00000000-0000-4000-c000-0000000000d1', '2001-01-10', 1);
  assert (select criado_por from public.lancamentos where id = '00000000-0000-4000-d000-0000000000e8')
         = '00000000-0000-4000-a000-00000000000e',
    'criado_por do lançamento de G2 para C deveria ser G2';
  update public.categorias set valor_unitario = 3.00 where id = '00000000-0000-4000-c000-0000000000d1';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 1, 'G2 deveria editar categoria de C';

  -- não vê nada de A nem de G1
  assert (select count(*) from public.lancamentos where user_id in (
            '00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000c')) = 0,
    'VAZAMENTO: G2 vê lançamentos de A/G1';
  assert (select count(*) from public.despesas where user_id in (
            '00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000c')) = 0,
    'VAZAMENTO: G2 vê despesas de A/G1';

  -- Equipe de G2 em 2001-01-10: C 33,00 (11), G2 8,00 (2); total 41,00
  assert (select count(*) from public.resumo_por_usuario('2001-01-10', '2001-01-10')) = 2,
    'VAZAMENTO: Equipe de G2 deveria ter 2 linhas';
  select * into r from public.resumo_por_usuario('2001-01-10', '2001-01-10')
   where user_id = '00000000-0000-4000-a000-00000000000d';
  assert r.valor = 33.00 and r.quantidade = 11 and r.total_geral = 41.00,
    format('Equipe G2: C deveria ter 11 / 33,00 / total 41,00 (veio %s)', r);
  assert (select valor from public.resumo_por_usuario_nomes('2001-01-10', '2001-01-10', array['pizza'])
           where user_id = '00000000-0000-4000-a000-00000000000e') = 8.00,
    'Equipe G2 [pizza]: G2 deveria ter 8,00';
  -- despesas (0009): G2 só vê a própria linha (11,00); as de C não entram
  assert (select count(*) from public.resumo_despesas_por_usuario_nomes('2001-02-01', '2001-02-28')) = 1,
    'Equipe despesas G2: deveria ter só a linha do próprio G2';
  assert (select sum(valor) from public.resumo_despesas_por_usuario_nomes('2001-02-01', '2001-02-28')) = 11.00,
    'Equipe despesas G2: total deveria ser 11,00 (sem as despesas de C)';
  -- relatório de C
  assert (select total_geral from public.resumo_por_categoria('2001-01-01', '2001-01-31', null,
            '00000000-0000-4000-a000-00000000000d') limit 1) = 33.00,
    'G2: resumo_por_categoria de C deveria ser 33,00';
  v_estado := null;
  begin
    perform * from public.resumo_despesas_por_dia('2001-02-01', '2001-02-28', null,
                                                  '00000000-0000-4000-a000-00000000000d');
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '42501', format('VAZAMENTO: G2 viu despesas de C por resumo_despesas_por_dia (veio %s)', v_estado);
  -- relatório de A => 42501
  v_estado := null;
  begin
    perform * from public.resumo_por_categoria('2001-01-01', '2001-01-31', null,
                                               '00000000-0000-4000-a000-00000000000a');
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '42501', format('VAZAMENTO: G2 viu relatório de A (veio %s)', v_estado);
end $$;

-- G1 (G) não vê nem opera dados de C (atendente de G2) nem de G2.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-00000000000c', 'role', 'authenticated')::text, true);

do $$
declare
  v_estado text;
  v_linhas integer;
  v_alvo   uuid;
begin
  assert auth.uid() = '00000000-0000-4000-a000-00000000000c', 'setup: auth.uid() deveria ser G (G1)';

  -- não vê
  assert (select count(*) from public.categorias where user_id in (
            '00000000-0000-4000-a000-00000000000d', '00000000-0000-4000-a000-00000000000e')) = 0,
    'VAZAMENTO: G1 vê categorias de C/G2';
  assert (select count(*) from public.lancamentos where user_id in (
            '00000000-0000-4000-a000-00000000000d', '00000000-0000-4000-a000-00000000000e')) = 0,
    'VAZAMENTO: G1 vê lançamentos de C/G2';
  assert (select count(*) from public.categorias_despesa where user_id in (
            '00000000-0000-4000-a000-00000000000d', '00000000-0000-4000-a000-00000000000e')) = 0,
    'VAZAMENTO: G1 vê categorias de despesa de C/G2';
  assert (select count(*) from public.despesas where user_id in (
            '00000000-0000-4000-a000-00000000000d', '00000000-0000-4000-a000-00000000000e')) = 0,
    'VAZAMENTO: G1 vê despesas de C/G2';
  assert not exists (select 1 from public.profiles where id in (
            '00000000-0000-4000-a000-00000000000d', '00000000-0000-4000-a000-00000000000e')),
    'VAZAMENTO: G1 vê perfis de C/G2';

  -- não altera / não apaga
  update public.lancamentos set quantidade = 99 where id = '00000000-0000-4000-d000-0000000000d1';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 0, 'VAZAMENTO: G1 alterou lançamento de C';
  delete from public.lancamentos where id = '00000000-0000-4000-d000-0000000000e9';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 0, 'VAZAMENTO: G1 apagou lançamento de G2';
  update public.categorias set valor_unitario = 0 where id in (
    '00000000-0000-4000-c000-0000000000d1', '00000000-0000-4000-c000-0000000000e1');
  get diagnostics v_linhas = row_count;
  assert v_linhas = 0, 'VAZAMENTO: G1 alterou categoria de C/G2';
  update public.despesas set valor = 1 where id in (
    '00000000-0000-4000-f000-0000000000d1', '00000000-0000-4000-f000-0000000000e9');
  get diagnostics v_linhas = row_count;
  assert v_linhas = 0, 'VAZAMENTO: G1 alterou despesa de C/G2';
  delete from public.categorias_despesa where id = '00000000-0000-4000-e000-0000000000e1';
  get diagnostics v_linhas = row_count;
  assert v_linhas = 0, 'VAZAMENTO: G1 apagou categoria de despesa de G2';

  -- não grava dados para C nem para G2 (RLS => 42501)
  foreach v_alvo in array array['00000000-0000-4000-a000-00000000000d',
                                '00000000-0000-4000-a000-00000000000e']::uuid[] loop
    v_estado := null;
    begin
      insert into public.categorias (user_id, nome, valor_unitario) values (v_alvo, 'Intrusa', 1.00);
    exception when others then v_estado := sqlstate;
    end;
    assert v_estado = '42501', format('VAZAMENTO: G1 criou categoria para %s (veio %s)', v_alvo, v_estado);

    v_estado := null;
    begin
      insert into public.categorias_despesa (user_id, nome) values (v_alvo, 'Intrusa');
    exception when others then v_estado := sqlstate;
    end;
    assert v_estado = '42501', format('VAZAMENTO: G1 criou categoria de despesa para %s (veio %s)', v_alvo, v_estado);
  end loop;

  v_estado := null;
  begin
    insert into public.lancamentos (user_id, categoria_id, data, quantidade)
    values ('00000000-0000-4000-a000-00000000000d', '00000000-0000-4000-c000-0000000000d1', '2001-01-10', 1);
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado is not null, 'VAZAMENTO: G1 lançou para C';

  v_estado := null;
  begin
    insert into public.despesas (user_id, categoria_despesa_id, data, valor)
    values ('00000000-0000-4000-a000-00000000000e', '00000000-0000-4000-e000-0000000000e1', '2001-02-10', 1.00);
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado is not null, 'VAZAMENTO: G1 lançou despesa para G2';

  -- não transfere lançamento de A para C
  v_estado := null;
  begin
    update public.lancamentos set user_id = '00000000-0000-4000-a000-00000000000d'
     where id = '00000000-0000-4000-d000-0000000000c3';
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado is not null, 'VAZAMENTO: G1 transferiu lançamento de A para C';

  -- RPCs com p_usuario de C ou de G2 => 42501
  foreach v_alvo in array array['00000000-0000-4000-a000-00000000000d',
                                '00000000-0000-4000-a000-00000000000e']::uuid[] loop
    v_estado := null;
    begin
      perform * from public.resumo_por_categoria('2001-01-01', '2001-01-31', null, v_alvo);
    exception when others then v_estado := sqlstate;
    end;
    assert v_estado = '42501', format('VAZAMENTO: G1 resumo_por_categoria de %s (veio %s)', v_alvo, v_estado);
    v_estado := null;
    begin
      perform * from public.resumo_por_dia('2001-01-01', '2001-01-31', null, v_alvo);
    exception when others then v_estado := sqlstate;
    end;
    assert v_estado = '42501', format('VAZAMENTO: G1 resumo_por_dia de %s (veio %s)', v_alvo, v_estado);
    v_estado := null;
    begin
      perform * from public.resumo_despesas_por_categoria('2001-02-01', '2001-02-28', null, v_alvo);
    exception when others then v_estado := sqlstate;
    end;
    assert v_estado = '42501', format('VAZAMENTO: G1 resumo_despesas_por_categoria de %s (veio %s)', v_alvo, v_estado);
    v_estado := null;
    begin
      perform * from public.resumo_despesas_por_dia('2001-02-01', '2001-02-28', null, v_alvo);
    exception when others then v_estado := sqlstate;
    end;
    assert v_estado = '42501', format('VAZAMENTO: G1 resumo_despesas_por_dia de %s (veio %s)', v_alvo, v_estado);
  end loop;

  -- Equipe de G1 continua só G1 + A (C/G2 têm dados em 2001-01-10)
  assert (select array_agg(user_id order by user_id) from public.resumo_por_usuario('2001-01-10', '2001-01-10'))
         = array['00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000c']::uuid[],
    'VAZAMENTO: Equipe de G1 deveria ser só G1 e A';
  assert (select bool_and(total_geral = 225.00) from public.resumo_por_usuario('2001-01-10', '2001-01-10')),
    'VAZAMENTO: total da Equipe de G1 soma dados de fora';

  -- autores: G2 é autor só de dados de C/G2 => não aparece para G1
  assert not exists (select 1 from public.autores(array['00000000-0000-4000-a000-00000000000e',
                                                        '00000000-0000-4000-a000-00000000000d']::uuid[])),
    'VAZAMENTO: autores (G1) devolveu G2/C';
  -- G1 não tem gerente
  assert not exists (select 1 from public.meu_gerente()), 'meu_gerente (G1) deveria ser vazio';
end $$;

-- C ("Ana", atendente de G2): vê o lançamento de G2 com autor; gerente = G2.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-00000000000d', 'role', 'authenticated')::text, true);

do $$
begin
  assert (select count(*) from public.lancamentos) = 2, 'C deveria ver os 2 próprios lançamentos';
  assert exists (select 1 from public.autores(array['00000000-0000-4000-a000-00000000000e']::uuid[])),
    'autores (C): deveria devolver G2';
  assert (select id from public.meu_gerente()) = '00000000-0000-4000-a000-00000000000e',
    'meu_gerente (C): deveria ser G2';
  assert (select count(*) from public.profiles) = 1, 'VAZAMENTO: C vê perfis alheios (inclusive G2)';
end $$;

-- Admin (B) vê todos, inclusive as duas equipes.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-00000000000b', 'role', 'authenticated')::text, true);

do $$
begin
  assert (select count(*) from public.profiles where id in (
            '00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000b',
            '00000000-0000-4000-a000-00000000000c', '00000000-0000-4000-a000-00000000000d',
            '00000000-0000-4000-a000-00000000000e')) = 5,
    'admin deveria ver os 5 perfis de teste';
  assert public.pode_gerir('00000000-0000-4000-a000-00000000000a')
     and public.pode_gerir('00000000-0000-4000-a000-00000000000d')
     and public.pode_gerir('00000000-0000-4000-a000-00000000000e'),
    'admin deveria pode_gerir todos';
  assert (select count(*) from public.lancamentos where user_id in (
            '00000000-0000-4000-a000-00000000000d', '00000000-0000-4000-a000-00000000000e')) = 3,
    'admin deveria ver os lançamentos de C e G2';
  -- Equipe do admin em 2001-01-10: A 225, C 33, G2 8, G1 0, B 0 => 266
  assert (select sum(valor) from public.resumo_por_usuario('2001-01-10', '2001-01-10')
           where user_id in ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000b',
                             '00000000-0000-4000-a000-00000000000c', '00000000-0000-4000-a000-00000000000d',
                             '00000000-0000-4000-a000-00000000000e')) = 266.00,
    'admin: Equipe dos usuários de teste deveria somar 266,00';
  assert (select count(*) from public.resumo_por_usuario('2001-01-10', '2001-01-10')
           where user_id in ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000b',
                             '00000000-0000-4000-a000-00000000000c', '00000000-0000-4000-a000-00000000000d',
                             '00000000-0000-4000-a000-00000000000e')) = 5,
    'admin: Equipe deveria listar os 5 perfis de teste';
  assert (select sum(valor) from public.resumo_despesas_por_usuario_nomes('2001-02-01', '2001-02-28')
           where user_id in ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000d',
                             '00000000-0000-4000-a000-00000000000e')) = 88.00,
    'admin: Equipe de despesas de A + C + G2 deveria somar 88,00 (50 + 27 + 11)';
  assert (select total_geral from public.resumo_por_categoria('2001-01-01', '2001-01-31', null,
            '00000000-0000-4000-a000-00000000000d') limit 1) = 33.00,
    'admin: resumo_por_categoria de C deveria ser 33,00';
end $$;

-- ---------------------------------------------------------------------
-- 4h) Mudança de papel (0008), desfeita com savepoint:
--     rebaixar G1 libera A (gerente_id = null) e G1 perde o acesso a A;
--     promover o atendente C limpa o gerente_id dele.
-- ---------------------------------------------------------------------
reset role;
savepoint papel;

update public.profiles set role = 'user' where id = '00000000-0000-4000-a000-00000000000c';
update public.profiles set role = 'gerente' where id = '00000000-0000-4000-a000-00000000000d';

do $$
begin
  assert (select gerente_id from public.profiles where id = '00000000-0000-4000-a000-00000000000a') is null,
    'rebaixar G1 deveria liberar A (gerente_id = null)';
  assert (select gerente_id from public.profiles where id = '00000000-0000-4000-a000-00000000000d') is null,
    'promover C a gerente deveria limpar o gerente_id de C';
  assert (select role from public.profiles where id = '00000000-0000-4000-a000-00000000000d') = 'gerente',
    'C deveria ter virado gerente';
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-00000000000c', 'role', 'authenticated')::text, true);

do $$
declare
  v_estado text;
begin
  assert not public.pode_gerir('00000000-0000-4000-a000-00000000000a'), 'G1 rebaixado ainda pode_gerir A';
  assert (select count(*) from public.lancamentos where user_id = '00000000-0000-4000-a000-00000000000a') = 0,
    'VAZAMENTO: G1 rebaixado ainda vê lançamentos de A';
  assert (select count(*) from public.profiles) = 1, 'VAZAMENTO: G1 rebaixado ainda vê perfis alheios';
  v_estado := null;
  begin
    perform * from public.resumo_por_usuario('2001-01-10', '2001-01-10');
  exception when others then v_estado := sqlstate;
  end;
  assert v_estado = '42501', format('G1 rebaixado: resumo_por_usuario deveria dar 42501 (veio %s)', v_estado);
end $$;

reset role;
rollback to savepoint papel;
release savepoint papel;

do $$
begin
  assert (select gerente_id from public.profiles where id = '00000000-0000-4000-a000-00000000000a')
         = '00000000-0000-4000-a000-00000000000c',
    'setup: A deveria voltar a ser atendente de G1 após o rollback do savepoint';
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
  assert not public.pode_gerir('00000000-0000-4000-a000-00000000000a'),
    'VAZAMENTO: gerente inativo pode_gerir o atendente A';
  assert not public.pode_gerir(auth.uid()), 'VAZAMENTO: gerente inativo pode_gerir a si mesmo';
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
  -- 0008: excluir o gerente libera o atendente (FK profiles.gerente_id on delete set null)
  assert (select gerente_id from public.profiles where id = '00000000-0000-4000-a000-00000000000a') is null,
    'on delete set null: A deveria ficar sem gerente após excluir G';
  assert (select gerente_id from public.profiles where id = '00000000-0000-4000-a000-00000000000d')
         = '00000000-0000-4000-a000-00000000000e',
    'C deveria continuar atendente de G2';
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

  -- equipes (0008)
  v_falhou := false;
  begin
    perform public.pode_gerir('00000000-0000-4000-a000-00000000000a');
  exception when others then
    v_falhou := true;
  end;
  assert v_falhou, 'VAZAMENTO: anon executa pode_gerir';

  v_falhou := false;
  begin
    perform * from public.meu_gerente();
  exception when others then
    v_falhou := true;
  end;
  assert v_falhou, 'VAZAMENTO: anon executa meu_gerente';

  -- privacidade (0009)
  v_falhou := false;
  begin
    perform public.pode_ver_categoria('00000000-0000-4000-c000-0000000000a3');
  exception when others then
    v_falhou := true;
  end;
  assert v_falhou, 'VAZAMENTO: anon executa pode_ver_categoria';

  v_falhou := false;
  begin
    perform public.pode_gerir_despesas('00000000-0000-4000-a000-00000000000a');
  exception when others then
    v_falhou := true;
  end;
  assert v_falhou, 'VAZAMENTO: anon executa pode_gerir_despesas';

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
