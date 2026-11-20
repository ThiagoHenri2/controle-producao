-- =====================================================================
-- 0009_privacidade_atendente.sql
-- Spec 011 — Privacidade do atendente perante o gerente (T011.1).
-- Ver docs/decisoes.md #11 (restringe #8 e #10 para o gerente).
--
-- O atendente decide quais das SUAS categorias de lançamento o gerente
-- vê (categorias.visivel_gerente, padrão FALSE). O gerente NUNCA vê as
-- despesas (nem as categorias de despesa) dos atendentes. O admin não é
-- afetado; o gerente continua operando normalmente os PRÓPRIOS dados.
--
-- Conteúdo:
--   1. categorias.visivel_gerente boolean not null default false.
--      As linhas existentes ficam FALSE (backfill pelo default): logo após
--      a migration o gerente não vê nenhuma categoria de atendente.
--   2. Trigger categorias_visibilidade (BEFORE insert/update):
--      - insert feito pelo GERENTE do dono => força visivel_gerente = true
--        (categoria criada pelo gerente nasce visível); dono e admin
--        respeitam o valor enviado (padrão false);
--      - update de visivel_gerente: só o dono, o admin ou chamadas sem
--        sessão (service_role / SQL Editor). O gerente => 42501
--        "Apenas o atendente pode alterar a visibilidade.".
--      Como é BEFORE, roda antes do WITH CHECK da RLS (o insert do gerente
--      passa porque o with check já enxerga true).
--   3. pode_ver_categoria(p_categoria_id) e pode_gerir_despesas(p_alvo)
--      (security definer, stable, chamador precisa estar ativo).
--   4. RLS:
--      categorias: dono OU admin OU (pode_gerir e visivel_gerente);
--      lancamentos: pode_gerir(user_id) e pode_ver_categoria(categoria_id);
--      categorias_despesa e despesas: pode_gerir_despesas(user_id).
--   5. RPCs (MESMAS assinaturas e retornos da 0008): escopo por categoria
--      visível nas de receitas; despesas só do dono/admin; Equipe de
--      despesas do gerente = só a linha dele.
--   6. Grants + notify pgrst.
--
-- Segura para produção e IDEMPOTENTE (add column if not exists,
-- drop ... if exists, create or replace).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) categorias.visivel_gerente
-- ---------------------------------------------------------------------
alter table public.categorias
  add column if not exists visivel_gerente boolean not null default false;

-- ---------------------------------------------------------------------
-- 3) Funções de permissão (criadas antes do trigger e das políticas)
-- ---------------------------------------------------------------------

-- pode_ver_categoria: verdadeiro se quem chama (ativo) é o dono da
-- categoria, é admin, ou é o gerente do dono e a categoria é visível.
-- security definer: lê profiles/categorias sem passar pela RLS (é usada
-- dentro das próprias políticas). Sem sessão ou categoria inexistente
-- => false.
create or replace function public.pode_ver_categoria(p_categoria_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select eu.ativo
           and (
             c.user_id = eu.id
             or eu.role = 'admin'
             or (eu.role = 'gerente'
                 and c.visivel_gerente
                 and exists (select 1
                               from public.profiles a
                              where a.id = c.user_id
                                and a.gerente_id = eu.id
                                and a.role = 'user'))
           )
      from public.profiles eu
      join public.categorias c on c.id = p_categoria_id
     where eu.id = auth.uid()
       and p_categoria_id is not null
  ), false);
$$;

revoke all on function public.pode_ver_categoria(uuid) from public, anon;
grant execute on function public.pode_ver_categoria(uuid) to authenticated, service_role;

-- pode_gerir_despesas: só o próprio dono ou o admin (o gerente NÃO).
create or replace function public.pode_gerir_despesas(p_alvo uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select eu.ativo
           and (p_alvo = eu.id or eu.role = 'admin')
      from public.profiles eu
     where eu.id = auth.uid()
       and p_alvo is not null
  ), false);
$$;

revoke all on function public.pode_gerir_despesas(uuid) from public, anon;
grant execute on function public.pode_gerir_despesas(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2) Trigger de visibilidade em categorias (BEFORE insert/update)
--    security invoker: só usa auth.uid(), pode_gerir() e is_admin()
--    (as duas últimas são security definer).
-- ---------------------------------------------------------------------
create or replace function public.categorias_visibilidade()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_eu uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    -- Gerente do dono (não o próprio dono, não o admin): nasce visível.
    if v_eu is not null
       and v_eu is distinct from new.user_id
       and not public.is_admin()
       and public.pode_gerir(new.user_id) then
      new.visivel_gerente := true;
    end if;
    return new;
  end if;

  -- UPDATE: só dono, admin ou sem sessão (service_role / postgres)
  -- alteram a visibilidade.
  if new.visivel_gerente is distinct from old.visivel_gerente
     and v_eu is not null
     and v_eu is distinct from old.user_id
     and not public.is_admin() then
    raise exception 'Apenas o atendente pode alterar a visibilidade.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.categorias_visibilidade() from public, anon, authenticated;

drop trigger if exists categorias_visibilidade on public.categorias;
create trigger categorias_visibilidade
  before insert or update on public.categorias
  for each row execute function public.categorias_visibilidade();

-- ---------------------------------------------------------------------
-- 4) RLS
-- ---------------------------------------------------------------------

-- categorias
drop policy if exists categorias_select on public.categorias;
create policy categorias_select on public.categorias
  for select to authenticated
  using ((select public.is_ativo())
         and (user_id = (select auth.uid())
              or (select public.is_admin())
              or (public.pode_gerir(user_id) and visivel_gerente)));

drop policy if exists categorias_insert on public.categorias;
create policy categorias_insert on public.categorias
  for insert to authenticated
  with check ((select public.is_ativo())
              and (user_id = (select auth.uid())
                   or (select public.is_admin())
                   or (public.pode_gerir(user_id) and visivel_gerente)));

drop policy if exists categorias_update on public.categorias;
create policy categorias_update on public.categorias
  for update to authenticated
  using ((select public.is_ativo())
         and (user_id = (select auth.uid())
              or (select public.is_admin())
              or (public.pode_gerir(user_id) and visivel_gerente)))
  with check ((select public.is_ativo())
              and (user_id = (select auth.uid())
                   or (select public.is_admin())
                   or (public.pode_gerir(user_id) and visivel_gerente)));

drop policy if exists categorias_delete on public.categorias;
create policy categorias_delete on public.categorias
  for delete to authenticated
  using ((select public.is_ativo())
         and (user_id = (select auth.uid())
              or (select public.is_admin())
              or (public.pode_gerir(user_id) and visivel_gerente)));

-- lancamentos
drop policy if exists lancamentos_select on public.lancamentos;
create policy lancamentos_select on public.lancamentos
  for select to authenticated
  using ((select public.is_ativo())
         and public.pode_gerir(user_id)
         and public.pode_ver_categoria(categoria_id));

drop policy if exists lancamentos_insert on public.lancamentos;
create policy lancamentos_insert on public.lancamentos
  for insert to authenticated
  with check ((select public.is_ativo())
              and public.pode_gerir(user_id)
              and public.pode_ver_categoria(categoria_id));

drop policy if exists lancamentos_update on public.lancamentos;
create policy lancamentos_update on public.lancamentos
  for update to authenticated
  using ((select public.is_ativo())
         and public.pode_gerir(user_id)
         and public.pode_ver_categoria(categoria_id))
  with check ((select public.is_ativo())
              and public.pode_gerir(user_id)
              and public.pode_ver_categoria(categoria_id));

drop policy if exists lancamentos_delete on public.lancamentos;
create policy lancamentos_delete on public.lancamentos
  for delete to authenticated
  using ((select public.is_ativo())
         and public.pode_gerir(user_id)
         and public.pode_ver_categoria(categoria_id));

-- categorias_despesa (o gerente não vê, não cria, não altera)
drop policy if exists categorias_despesa_select on public.categorias_despesa;
create policy categorias_despesa_select on public.categorias_despesa
  for select to authenticated
  using ((select public.is_ativo()) and public.pode_gerir_despesas(user_id));

drop policy if exists categorias_despesa_insert on public.categorias_despesa;
create policy categorias_despesa_insert on public.categorias_despesa
  for insert to authenticated
  with check ((select public.is_ativo()) and public.pode_gerir_despesas(user_id));

drop policy if exists categorias_despesa_update on public.categorias_despesa;
create policy categorias_despesa_update on public.categorias_despesa
  for update to authenticated
  using ((select public.is_ativo()) and public.pode_gerir_despesas(user_id))
  with check ((select public.is_ativo()) and public.pode_gerir_despesas(user_id));

drop policy if exists categorias_despesa_delete on public.categorias_despesa;
create policy categorias_despesa_delete on public.categorias_despesa
  for delete to authenticated
  using ((select public.is_ativo()) and public.pode_gerir_despesas(user_id));

-- despesas
drop policy if exists despesas_select on public.despesas;
create policy despesas_select on public.despesas
  for select to authenticated
  using ((select public.is_ativo()) and public.pode_gerir_despesas(user_id));

drop policy if exists despesas_insert on public.despesas;
create policy despesas_insert on public.despesas
  for insert to authenticated
  with check ((select public.is_ativo()) and public.pode_gerir_despesas(user_id));

drop policy if exists despesas_update on public.despesas;
create policy despesas_update on public.despesas
  for update to authenticated
  using ((select public.is_ativo()) and public.pode_gerir_despesas(user_id))
  with check ((select public.is_ativo()) and public.pode_gerir_despesas(user_id));

drop policy if exists despesas_delete on public.despesas;
create policy despesas_delete on public.despesas
  for delete to authenticated
  using ((select public.is_ativo()) and public.pode_gerir_despesas(user_id));

-- ---------------------------------------------------------------------
-- 5) RPCs — mesmas assinaturas/retornos; muda só a autorização/escopo.
-- ---------------------------------------------------------------------

-- 5.1 Receitas por categoria. p_usuario alheio => pode_gerir (42501);
--     para o gerente só entram as categorias visíveis (dono e admin: todas).
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
  v_todas   boolean;
begin
  perform public.resumo_validar_periodo(p_de, p_ate);

  if v_usuario is distinct from auth.uid() and not public.pode_gerir(v_usuario) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  v_todas := v_usuario is not distinct from auth.uid() or public.is_admin();

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
       and (v_todas or c.visivel_gerente)
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
  v_todas   boolean;
begin
  perform public.resumo_validar_periodo(p_de, p_ate);

  if v_usuario is distinct from auth.uid() and not public.pode_gerir(v_usuario) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  v_todas := v_usuario is not distinct from auth.uid() or public.is_admin();

  return query
    select l.data                        as data,
           sum(l.quantidade)::bigint     as quantidade,
           sum(l.valor_total)::numeric   as valor
      from public.lancamentos l
     where l.user_id = v_usuario
       and l.data between p_de and p_ate
       and (p_categorias is null or l.categoria_id = any (p_categorias))
       and (v_todas or public.pode_ver_categoria(l.categoria_id))
     group by l.data
     order by 1 desc;
end;
$$;

-- 5.3 Receitas por usuário (Equipe)
--     admin => todos os perfis e todas as categorias;
--     gerente => ele (tudo) + atendentes dele (só categorias visíveis);
--     senão 42501.
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
            and (v_admin or l.user_id = v_eu
                 or public.pode_ver_categoria(l.categoria_id))
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
            and (v_admin or l.user_id = v_eu or c.visivel_gerente)
     where v_admin or p.id = v_eu or p.gerente_id = v_eu
     group by p.id, p.nome, p.username, p.role, p.ativo
     order by 7 desc, 2, 3;
end;
$$;

-- 5.5 Despesas por categoria (p_usuario alheio => pode_gerir_despesas)
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

  if v_usuario is distinct from auth.uid() and not public.pode_gerir_despesas(v_usuario) then
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

  if v_usuario is distinct from auth.uid() and not public.pode_gerir_despesas(v_usuario) then
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
--     admin => todos os perfis; gerente => SÓ a própria linha (os
--     atendentes não aparecem); demais => 42501.
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
     where v_admin or p.id = v_eu
     group by p.id, p.nome, p.username, p.role, p.ativo
     order by 7 desc, 2, 3;
end;
$$;

-- 5.8 autores(p_ids): security definer (não passa pela RLS), então repete
--     a regra: só autores de lançamentos que o chamador pode gerir E ver
--     (categoria visível) ou de despesas que ele pode gerir (dono/admin).
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
            and public.pode_ver_categoria(l.categoria_id)
       )
       or exists (
         select 1
           from public.despesas d
          where d.criado_por = p.id
            and public.pode_gerir_despesas(d.user_id)
       )
     )
   order by p.nome;
$$;

-- ---------------------------------------------------------------------
-- 6) Grants (revoke/grant são idempotentes) + PostgREST
-- ---------------------------------------------------------------------
revoke all on function public.resumo_por_categoria(date, date, uuid[], uuid)          from public, anon;
revoke all on function public.resumo_por_dia(date, date, uuid[], uuid)                from public, anon;
revoke all on function public.resumo_por_usuario(date, date, uuid[])                  from public, anon;
revoke all on function public.resumo_por_usuario_nomes(date, date, text[])            from public, anon;
revoke all on function public.resumo_despesas_por_categoria(date, date, uuid[], uuid) from public, anon;
revoke all on function public.resumo_despesas_por_dia(date, date, uuid[], uuid)       from public, anon;
revoke all on function public.resumo_despesas_por_usuario_nomes(date, date, text[])   from public, anon;
revoke all on function public.autores(uuid[])                                         from public, anon;

grant execute on function public.resumo_por_categoria(date, date, uuid[], uuid)          to authenticated, service_role;
grant execute on function public.resumo_por_dia(date, date, uuid[], uuid)                to authenticated, service_role;
grant execute on function public.resumo_por_usuario(date, date, uuid[])                  to authenticated, service_role;
grant execute on function public.resumo_por_usuario_nomes(date, date, text[])            to authenticated, service_role;
grant execute on function public.resumo_despesas_por_categoria(date, date, uuid[], uuid) to authenticated, service_role;
grant execute on function public.resumo_despesas_por_dia(date, date, uuid[], uuid)       to authenticated, service_role;
grant execute on function public.resumo_despesas_por_usuario_nomes(date, date, text[])   to authenticated, service_role;
grant execute on function public.autores(uuid[])                                         to authenticated, service_role;

notify pgrst, 'reload schema';
