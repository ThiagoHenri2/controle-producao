-- =====================================================================
-- 0008_equipes.sql
-- Spec 010 — Troca de senha e atendentes por gerente (T010.1).
-- Ver docs/decisoes.md #10 (restringe a #8).
--
-- O gerente passa a ver e operar só ELE MESMO + os ATENDENTES vinculados a
-- ele (profiles.gerente_id). O admin continua vendo todos. O atendente
-- (role 'user') continua isolado.
--
-- Conteúdo:
--   1. profiles.gerente_id uuid null -> profiles(id) on delete set null
--      + check (gerente_id <> id) + índice.
--   2. Triggers em profiles:
--      a) profiles_gerente_validar (BEFORE insert/update of gerente_id, role):
--         - gerente_id apontando para quem não é 'gerente' => 23514
--           "O responsável precisa ser um gerente.";
--         - só atendentes (role 'user') têm gerente. Se um atendente é
--           PROMOVIDO (role deixa de ser 'user' sem mexer no gerente_id),
--           o gerente_id é limpo; gravar gerente_id em quem não é 'user'
--           => 23514 "Só atendentes podem ter um gerente.".
--      b) profiles_gerente_liberar (AFTER update of role): quem deixa de ser
--         'gerente' libera os atendentes (gerente_id = null).
--      Ambos são security invoker: o cliente (authenticated) não tem UPDATE
--      em profiles; quem escreve é a Edge Function (service_role, bypassrls)
--      ou o SQL Editor (postgres), que enxergam todas as linhas.
--   3. pode_gerir(p_alvo uuid) (security definer, stable): quem chama está
--      ativo E (p_alvo = auth.uid() OU é admin OU é gerente e p_alvo é
--      atendente dele).
--   4. RLS de categorias, lancamentos, categorias_despesa e despesas
--      (4 operações): is_ativo() and pode_gerir(user_id).
--      profiles select: id = auth.uid() or is_admin()
--                       or (gerente_id = auth.uid() and is_gestor()).
--   5. RPCs (MESMAS assinaturas e retornos da 0006/0007):
--      - resumo_por_categoria / resumo_por_dia / resumo_despesas_por_categoria
--        / resumo_despesas_por_dia: p_usuario alheio exige pode_gerir() (42501).
--      - resumo_por_usuario / resumo_por_usuario_nomes /
--        resumo_despesas_por_usuario_nomes: admin => todos os perfis;
--        gerente => ele + os atendentes dele; demais => 42501.
--      - autores(p_ids): só autores de linhas que o chamador pode gerir.
--   6. meu_gerente(): nome/username do gerente do chamador (para "Minha
--      conta"; o atendente não lê o profile do gerente pela RLS).
--   7. Grants + notify pgrst.
--
-- Segura para produção com dados existentes (a coluna nasce nula: ninguém
-- tem gerente; os gerentes passam a ver só a si mesmos até o admin vincular
-- atendentes) e IDEMPOTENTE (if not exists, drop ... if exists,
-- create or replace).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) profiles.gerente_id
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists gerente_id uuid null;

alter table public.profiles drop constraint if exists profiles_gerente_id_fkey;
alter table public.profiles
  add constraint profiles_gerente_id_fkey
  foreign key (gerente_id) references public.profiles (id) on delete set null;

alter table public.profiles drop constraint if exists profiles_gerente_id_check;
alter table public.profiles
  add constraint profiles_gerente_id_check
  check (gerente_id is null or gerente_id <> id);

create index if not exists profiles_gerente_id_idx
  on public.profiles (gerente_id);

-- ---------------------------------------------------------------------
-- 2a) Validação do gerente_id (BEFORE insert/update)
-- ---------------------------------------------------------------------
create or replace function public.profiles_gerente_validar()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_role_gerente text;
begin
  if new.gerente_id is null then
    return new;
  end if;

  -- Só atendentes têm gerente.
  if new.role is distinct from 'user' then
    if tg_op = 'UPDATE'
       and old.role = 'user'
       and new.gerente_id is not distinct from old.gerente_id then
      -- Promoção de atendente (set_role): libera o vínculo em silêncio.
      new.gerente_id := null;
      return new;
    end if;
    raise exception 'Só atendentes podem ter um gerente.'
      using errcode = '23514';
  end if;

  -- O responsável precisa ser um gerente (trava a linha contra uma troca
  -- de papel concorrente).
  select p.role
    into v_role_gerente
    from public.profiles p
   where p.id = new.gerente_id
     for share;

  if v_role_gerente is distinct from 'gerente' then
    raise exception 'O responsável precisa ser um gerente.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.profiles_gerente_validar() from public, anon, authenticated;

drop trigger if exists profiles_gerente_validar on public.profiles;
create trigger profiles_gerente_validar
  before insert or update of gerente_id, role on public.profiles
  for each row execute function public.profiles_gerente_validar();

-- ---------------------------------------------------------------------
-- 2b) Quem deixa de ser gerente libera os atendentes (AFTER update of role)
-- ---------------------------------------------------------------------
create or replace function public.profiles_gerente_liberar()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.role = 'gerente' and new.role is distinct from 'gerente' then
    update public.profiles
       set gerente_id = null
     where gerente_id = new.id;
  end if;
  return null;
end;
$$;

revoke all on function public.profiles_gerente_liberar() from public, anon, authenticated;

drop trigger if exists profiles_gerente_liberar on public.profiles;
create trigger profiles_gerente_liberar
  after update of role on public.profiles
  for each row execute function public.profiles_gerente_liberar();

-- ---------------------------------------------------------------------
-- 3) pode_gerir(p_alvo)
--    security definer: lê profiles sem RLS (é usada nas políticas, inclusive
--    indiretamente pela de profiles via is_gestor()). Por isso valida que
--    quem chama existe e está ativo. Sem sessão (auth.uid() nulo) => false.
-- ---------------------------------------------------------------------
create or replace function public.pode_gerir(p_alvo uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select eu.ativo
           and (
             p_alvo = eu.id
             or eu.role = 'admin'
             or (eu.role = 'gerente'
                 and exists (select 1
                               from public.profiles a
                              where a.id = p_alvo
                                and a.gerente_id = eu.id
                                and a.role = 'user'))
           )
      from public.profiles eu
     where eu.id = auth.uid()
       and p_alvo is not null
  ), false);
$$;

revoke all on function public.pode_gerir(uuid) from public, anon;
grant execute on function public.pode_gerir(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4) RLS
-- ---------------------------------------------------------------------

-- profiles: o próprio; o admin todos; o gerente (ativo) os atendentes dele.
-- gerente_id = auth.uid() é coluna da própria linha (sem subconsulta em
-- profiles => sem recursão); is_admin()/is_gestor() são security definer.
-- Escrita continua só via Edge Function (service_role).
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid())
         or (select public.is_admin())
         or (gerente_id = (select auth.uid()) and (select public.is_gestor())));

-- categorias
drop policy if exists categorias_select on public.categorias;
create policy categorias_select on public.categorias
  for select to authenticated
  using ((select public.is_ativo()) and public.pode_gerir(user_id));

drop policy if exists categorias_insert on public.categorias;
create policy categorias_insert on public.categorias
  for insert to authenticated
  with check ((select public.is_ativo()) and public.pode_gerir(user_id));

drop policy if exists categorias_update on public.categorias;
create policy categorias_update on public.categorias
  for update to authenticated
  using ((select public.is_ativo()) and public.pode_gerir(user_id))
  with check ((select public.is_ativo()) and public.pode_gerir(user_id));

drop policy if exists categorias_delete on public.categorias;
create policy categorias_delete on public.categorias
  for delete to authenticated
  using ((select public.is_ativo()) and public.pode_gerir(user_id));

-- lancamentos (o trigger de snapshot continua exigindo categoria do mesmo user_id)
drop policy if exists lancamentos_select on public.lancamentos;
create policy lancamentos_select on public.lancamentos
  for select to authenticated
  using ((select public.is_ativo()) and public.pode_gerir(user_id));

drop policy if exists lancamentos_insert on public.lancamentos;
create policy lancamentos_insert on public.lancamentos
  for insert to authenticated
  with check ((select public.is_ativo()) and public.pode_gerir(user_id));

drop policy if exists lancamentos_update on public.lancamentos;
create policy lancamentos_update on public.lancamentos
  for update to authenticated
  using ((select public.is_ativo()) and public.pode_gerir(user_id))
  with check ((select public.is_ativo()) and public.pode_gerir(user_id));

drop policy if exists lancamentos_delete on public.lancamentos;
create policy lancamentos_delete on public.lancamentos
  for delete to authenticated
  using ((select public.is_ativo()) and public.pode_gerir(user_id));

-- categorias_despesa
drop policy if exists categorias_despesa_select on public.categorias_despesa;
create policy categorias_despesa_select on public.categorias_despesa
  for select to authenticated
  using ((select public.is_ativo()) and public.pode_gerir(user_id));

drop policy if exists categorias_despesa_insert on public.categorias_despesa;
create policy categorias_despesa_insert on public.categorias_despesa
  for insert to authenticated
  with check ((select public.is_ativo()) and public.pode_gerir(user_id));

drop policy if exists categorias_despesa_update on public.categorias_despesa;
create policy categorias_despesa_update on public.categorias_despesa
  for update to authenticated
  using ((select public.is_ativo()) and public.pode_gerir(user_id))
  with check ((select public.is_ativo()) and public.pode_gerir(user_id));

drop policy if exists categorias_despesa_delete on public.categorias_despesa;
create policy categorias_despesa_delete on public.categorias_despesa
  for delete to authenticated
  using ((select public.is_ativo()) and public.pode_gerir(user_id));

-- despesas (o trigger de validação exige categoria do mesmo user_id)
drop policy if exists despesas_select on public.despesas;
create policy despesas_select on public.despesas
  for select to authenticated
  using ((select public.is_ativo()) and public.pode_gerir(user_id));

drop policy if exists despesas_insert on public.despesas;
create policy despesas_insert on public.despesas
  for insert to authenticated
  with check ((select public.is_ativo()) and public.pode_gerir(user_id));

drop policy if exists despesas_update on public.despesas;
create policy despesas_update on public.despesas
  for update to authenticated
  using ((select public.is_ativo()) and public.pode_gerir(user_id))
  with check ((select public.is_ativo()) and public.pode_gerir(user_id));

drop policy if exists despesas_delete on public.despesas;
create policy despesas_delete on public.despesas
  for delete to authenticated
  using ((select public.is_ativo()) and public.pode_gerir(user_id));

-- ---------------------------------------------------------------------
-- 5) RPCs — mesmas assinaturas/retornos; muda só a autorização/escopo.
-- ---------------------------------------------------------------------

-- 5.1 Receitas por categoria (p_usuario alheio => pode_gerir, senão 42501)
create or replace function public.resumo_por_categoria(
  p_de         date,
  p_ate        date,
  p_categorias uuid[] default null,
  p_usuario    uuid   default null
)
returns table (
  categoria_id uuid,
  nome         text,
  ativa        boolean,
  quantidade   bigint,
  valor        numeric,
  total_geral  numeric
)
language plpgsql
stable
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_usuario uuid := coalesce(p_usuario, auth.uid());
begin
  perform public.resumo_validar_periodo(p_de, p_ate);

  if v_usuario is distinct from auth.uid() and not public.pode_gerir(v_usuario) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  return query
    select c.id                                   as categoria_id,
           c.nome                                 as nome,
           c.ativa                                as ativa,
           sum(l.quantidade)::bigint              as quantidade,
           sum(l.valor_total)::numeric            as valor,
           (sum(sum(l.valor_total)) over ())::numeric as total_geral
      from public.lancamentos l
      join public.categorias  c on c.id = l.categoria_id
     where l.user_id = v_usuario
       and l.data between p_de and p_ate
       and (p_categorias is null or l.categoria_id = any (p_categorias))
     group by c.id, c.nome, c.ativa
     order by 5 desc, 2;
end;
$$;

-- 5.2 Receitas por dia
create or replace function public.resumo_por_dia(
  p_de         date,
  p_ate        date,
  p_categorias uuid[] default null,
  p_usuario    uuid   default null
)
returns table (
  data        date,
  quantidade  bigint,
  valor       numeric
)
language plpgsql
stable
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_usuario uuid := coalesce(p_usuario, auth.uid());
begin
  perform public.resumo_validar_periodo(p_de, p_ate);

  if v_usuario is distinct from auth.uid() and not public.pode_gerir(v_usuario) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  return query
    select l.data                        as data,
           sum(l.quantidade)::bigint     as quantidade,
           sum(l.valor_total)::numeric   as valor
      from public.lancamentos l
     where l.user_id = v_usuario
       and l.data between p_de and p_ate
       and (p_categorias is null or l.categoria_id = any (p_categorias))
     group by l.data
     order by 1 desc;
end;
$$;

-- 5.3 Receitas por usuário (Equipe)
--     admin => todos os perfis; gerente => ele + atendentes dele; senão 42501.
create or replace function public.resumo_por_usuario(
  p_de         date,
  p_ate        date,
  p_categorias uuid[] default null
)
returns table (
  user_id      uuid,
  nome         text,
  username     text,
  role         text,
  ativo        boolean,
  quantidade   bigint,
  valor        numeric,
  total_geral  numeric
)
language plpgsql
stable
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_admin boolean;
  v_eu    uuid := auth.uid();
begin
  perform public.resumo_validar_periodo(p_de, p_ate);

  if not public.is_gestor() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  v_admin := public.is_admin();

  return query
    select p.id                                              as user_id,
           p.nome                                            as nome,
           p.username                                        as username,
           p.role                                            as role,
           p.ativo                                           as ativo,
           coalesce(sum(l.quantidade), 0)::bigint            as quantidade,
           coalesce(sum(l.valor_total), 0)::numeric          as valor,
           (sum(coalesce(sum(l.valor_total), 0)) over ())::numeric as total_geral
      from public.profiles p
      left join public.lancamentos l
             on l.user_id = p.id
            and l.data between p_de and p_ate
            and (p_categorias is null or l.categoria_id = any (p_categorias))
     where v_admin or p.id = v_eu or p.gerente_id = v_eu
     group by p.id, p.nome, p.username, p.role, p.ativo
     order by 7 desc, 2, 3;
end;
$$;

-- 5.4 Receitas por usuário filtrando por NOME de categoria
create or replace function public.resumo_por_usuario_nomes(
  p_de     date,
  p_ate    date,
  p_nomes  text[] default null
)
returns table (
  user_id      uuid,
  nome         text,
  username     text,
  role         text,
  ativo        boolean,
  quantidade   bigint,
  valor        numeric,
  total_geral  numeric
)
language plpgsql
stable
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_nomes text[];
  v_admin boolean;
  v_eu    uuid := auth.uid();
begin
  perform public.resumo_validar_periodo(p_de, p_ate);

  if not public.is_gestor() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  v_admin := public.is_admin();

  if p_nomes is not null then
    select coalesce(array_agg(lower(btrim(n))), '{}'::text[])
      into v_nomes
      from unnest(p_nomes) as n
     where n is not null;
  end if;

  return query
    select p.id                                              as user_id,
           p.nome                                            as nome,
           p.username                                        as username,
           p.role                                            as role,
           p.ativo                                           as ativo,
           coalesce(sum(l.quantidade), 0)::bigint            as quantidade,
           coalesce(sum(l.valor_total), 0)::numeric          as valor,
           (sum(coalesce(sum(l.valor_total), 0)) over ())::numeric as total_geral
      from public.profiles p
      left join (public.lancamentos l
                 join public.categorias c on c.id = l.categoria_id)
             on l.user_id = p.id
            and l.data between p_de and p_ate
            and (p_nomes is null or lower(btrim(c.nome)) = any (v_nomes))
     where v_admin or p.id = v_eu or p.gerente_id = v_eu
     group by p.id, p.nome, p.username, p.role, p.ativo
     order by 7 desc, 2, 3;
end;
$$;

-- 5.5 Despesas por categoria
create or replace function public.resumo_despesas_por_categoria(
  p_de         date,
  p_ate        date,
  p_categorias uuid[] default null,
  p_usuario    uuid   default null
)
returns table (
  categoria_id uuid,
  nome         text,
  ativa        boolean,
  quantidade   bigint,
  valor        numeric,
  total_geral  numeric
)
language plpgsql
stable
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_usuario uuid := coalesce(p_usuario, auth.uid());
begin
  perform public.resumo_validar_periodo(p_de, p_ate);

  if v_usuario is distinct from auth.uid() and not public.pode_gerir(v_usuario) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  return query
    select c.id                                as categoria_id,
           c.nome                              as nome,
           c.ativa                             as ativa,
           count(*)::bigint                    as quantidade,
           sum(d.valor)::numeric               as valor,
           (sum(sum(d.valor)) over ())::numeric as total_geral
      from public.despesas d
      join public.categorias_despesa c on c.id = d.categoria_despesa_id
     where d.user_id = v_usuario
       and d.data between p_de and p_ate
       and (p_categorias is null or d.categoria_despesa_id = any (p_categorias))
     group by c.id, c.nome, c.ativa
     order by 5 desc, 2;
end;
$$;

-- 5.6 Despesas por dia
create or replace function public.resumo_despesas_por_dia(
  p_de         date,
  p_ate        date,
  p_categorias uuid[] default null,
  p_usuario    uuid   default null
)
returns table (
  data        date,
  quantidade  bigint,
  valor       numeric
)
language plpgsql
stable
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_usuario uuid := coalesce(p_usuario, auth.uid());
begin
  perform public.resumo_validar_periodo(p_de, p_ate);

  if v_usuario is distinct from auth.uid() and not public.pode_gerir(v_usuario) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  return query
    select d.data                  as data,
           count(*)::bigint        as quantidade,
           sum(d.valor)::numeric   as valor
      from public.despesas d
     where d.user_id = v_usuario
       and d.data between p_de and p_ate
       and (p_categorias is null or d.categoria_despesa_id = any (p_categorias))
     group by d.data
     order by 1 desc;
end;
$$;

-- 5.7 Despesas por usuário filtrando por NOME de categoria de despesa
create or replace function public.resumo_despesas_por_usuario_nomes(
  p_de     date,
  p_ate    date,
  p_nomes  text[] default null
)
returns table (
  user_id      uuid,
  nome         text,
  username     text,
  role         text,
  ativo        boolean,
  quantidade   bigint,
  valor        numeric,
  total_geral  numeric
)
language plpgsql
stable
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_nomes text[];
  v_admin boolean;
  v_eu    uuid := auth.uid();
begin
  perform public.resumo_validar_periodo(p_de, p_ate);

  if not public.is_gestor() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  v_admin := public.is_admin();

  if p_nomes is not null then
    select coalesce(array_agg(lower(btrim(n))), '{}'::text[])
      into v_nomes
      from unnest(p_nomes) as n
     where n is not null;
  end if;

  return query
    select p.id                                          as user_id,
           p.nome                                        as nome,
           p.username                                    as username,
           p.role                                        as role,
           p.ativo                                       as ativo,
           count(d.id)::bigint                           as quantidade,
           coalesce(sum(d.valor), 0)::numeric            as valor,
           (sum(coalesce(sum(d.valor), 0)) over ())::numeric as total_geral
      from public.profiles p
      left join (public.despesas d
                 join public.categorias_despesa c on c.id = d.categoria_despesa_id)
             on d.user_id = p.id
            and d.data between p_de and p_ate
            and (p_nomes is null or lower(btrim(c.nome)) = any (v_nomes))
     where v_admin or p.id = v_eu or p.gerente_id = v_eu
     group by p.id, p.nome, p.username, p.role, p.ativo
     order by 7 desc, 2, 3;
end;
$$;

-- 5.8 autores(p_ids): security definer (o atendente não lê profiles
--     alheios). Só devolve quem é criado_por de lançamento/despesa de um
--     usuário que o chamador pode gerir (próprio; atendentes, se gerente;
--     todos, se admin). Chamador inativo/sem sessão => nenhuma linha.
create or replace function public.autores(p_ids uuid[])
returns table (id uuid, nome text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.nome
    from public.profiles p
   where auth.uid() is not null
     and public.is_ativo()
     and p.id = any (p_ids)
     and (
       exists (
         select 1
           from public.lancamentos l
          where l.criado_por = p.id
            and public.pode_gerir(l.user_id)
       )
       or exists (
         select 1
           from public.despesas d
          where d.criado_por = p.id
            and public.pode_gerir(d.user_id)
       )
     )
   order by p.nome;
$$;

-- ---------------------------------------------------------------------
-- 6) meu_gerente(): gerente responsável pelo chamador (0 ou 1 linha).
--    security definer porque a RLS de profiles não deixa o atendente ler o
--    profile do gerente. Só devolve o gerente do PRÓPRIO chamador, e só se
--    o chamador estiver ativo.
-- ---------------------------------------------------------------------
create or replace function public.meu_gerente()
returns table (id uuid, nome text, username text)
language sql
stable
security definer
set search_path = public
as $$
  select g.id, g.nome, g.username
    from public.profiles eu
    join public.profiles g on g.id = eu.gerente_id
   where eu.id = auth.uid()
     and eu.ativo;
$$;

-- ---------------------------------------------------------------------
-- 7) Grants (revoke/grant são idempotentes) + PostgREST
-- ---------------------------------------------------------------------
revoke all on function public.resumo_por_categoria(date, date, uuid[], uuid)          from public, anon;
revoke all on function public.resumo_por_dia(date, date, uuid[], uuid)                from public, anon;
revoke all on function public.resumo_por_usuario(date, date, uuid[])                  from public, anon;
revoke all on function public.resumo_por_usuario_nomes(date, date, text[])            from public, anon;
revoke all on function public.resumo_despesas_por_categoria(date, date, uuid[], uuid) from public, anon;
revoke all on function public.resumo_despesas_por_dia(date, date, uuid[], uuid)       from public, anon;
revoke all on function public.resumo_despesas_por_usuario_nomes(date, date, text[])   from public, anon;
revoke all on function public.autores(uuid[])                                         from public, anon;
revoke all on function public.meu_gerente()                                           from public, anon;

grant execute on function public.resumo_por_categoria(date, date, uuid[], uuid)          to authenticated, service_role;
grant execute on function public.resumo_por_dia(date, date, uuid[], uuid)                to authenticated, service_role;
grant execute on function public.resumo_por_usuario(date, date, uuid[])                  to authenticated, service_role;
grant execute on function public.resumo_por_usuario_nomes(date, date, text[])            to authenticated, service_role;
grant execute on function public.resumo_despesas_por_categoria(date, date, uuid[], uuid) to authenticated, service_role;
grant execute on function public.resumo_despesas_por_dia(date, date, uuid[], uuid)       to authenticated, service_role;
grant execute on function public.resumo_despesas_por_usuario_nomes(date, date, text[])   to authenticated, service_role;
grant execute on function public.autores(uuid[])                                         to authenticated, service_role;
grant execute on function public.meu_gerente()                                           to authenticated, service_role;

notify pgrst, 'reload schema';
