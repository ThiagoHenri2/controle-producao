-- =====================================================================
-- 0007_despesas.sql
-- Spec 009 — Lançamento de despesas (T009.1). Requer a 0006 (is_gestor,
-- lancamentos_criado_por, autores).
--
-- Conteúdo:
--   1. Tabela categorias_despesa (nome + ativa, SEM valor) + índice único
--      (user_id, lower(btrim(nome))) + trigger set_updated_at.
--   2. Tabela despesas (valor livre numeric(10,2) > 0, data <= hoje + 1,
--      descricao <= 200, criado_por; FK da categoria on delete no action
--      => 23503 ao excluir categoria em uso) + índices (user_id, data),
--      (categoria_despesa_id), (criado_por).
--   3. Trigger de validação da categoria (mesmo user_id => senão 23503;
--      ativa => senão 23514) no insert e quando categoria/usuário mudam.
--   4. Trigger anti-forja de criado_por: REUTILIZA public.lancamentos_criado_por()
--      da 0006 (genérica: só usa new/old.criado_por e new.user_id).
--   5. RLS nas duas tabelas, 4 operações:
--        is_ativo() and (user_id = auth.uid() or is_gestor())
--      Grants: authenticated CRUD; anon nada.
--   6. RPCs (stable, security invoker, período validado => 22023):
--        resumo_despesas_por_categoria(p_de date, p_ate date, p_categorias uuid[] default null, p_usuario uuid default null)
--          returns table (categoria_id uuid, nome text, ativa boolean, quantidade bigint, valor numeric, total_geral numeric)
--        resumo_despesas_por_dia(p_de date, p_ate date, p_categorias uuid[] default null, p_usuario uuid default null)
--          returns table (data date, quantidade bigint, valor numeric)
--        resumo_despesas_por_usuario_nomes(p_de date, p_ate date, p_nomes text[] default null)
--          returns table (user_id uuid, nome text, username text, role text, ativo boolean,
--                         quantidade bigint, valor numeric, total_geral numeric)
--      quantidade = nº de lançamentos de despesa.
--      p_usuario alheio sem ser gestor => 42501; por_usuario_nomes só gestor => 42501.
--   7. autores(p_ids uuid[]) passa a considerar também despesas.criado_por
--      (mesma assinatura e retorno).
--   8. Grants + notify pgrst.
--
-- As RPCs de receitas (resumo_por_*) NÃO são alteradas.
-- IDEMPOTENTE: if not exists, drop ... if exists, create or replace.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) categorias_despesa
-- ---------------------------------------------------------------------
create table if not exists public.categorias_despesa (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  nome        text not null,
  ativa       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint categorias_despesa_nome_check
    check (length(btrim(nome)) between 1 and 60)
);

-- Nome único por usuário sem diferenciar maiúsculas/espaços nas pontas (23505).
create unique index if not exists categorias_despesa_user_id_nome_ci_key
  on public.categorias_despesa (user_id, lower(btrim(nome)));

drop trigger if exists categorias_despesa_set_updated_at on public.categorias_despesa;
create trigger categorias_despesa_set_updated_at
  before update on public.categorias_despesa
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 2) despesas
--    criado_por: nullable de propósito (on delete set null), como em
--    lancamentos.criado_por (0006).
--    categoria_despesa_id: "on delete NO ACTION" (e não RESTRICT) de
--    propósito. Os dois impedem excluir uma categoria com despesas, mas o
--    Postgres sinaliza RESTRICT com SQLSTATE 23001 (restrict_violation) e
--    NO ACTION com 23503 (foreign_key_violation), que é o código que o
--    contrato da spec 009 (e o front: "oferece Desativar") espera.
-- ---------------------------------------------------------------------
create table if not exists public.despesas (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users on delete cascade,
  categoria_despesa_id  uuid not null references public.categorias_despesa on delete no action,
  data                  date not null,
  valor                 numeric(10,2) not null,
  descricao             text,
  criado_por            uuid null default auth.uid() references auth.users on delete set null,
  created_at            timestamptz not null default now(),
  -- margem de +1 dia: fuso do cliente (America/Sao_Paulo) x servidor (UTC), como na 0002
  constraint despesas_data_nao_futura check (data <= current_date + 1),
  constraint despesas_valor_check     check (valor > 0 and valor <= 99999999.99),
  constraint despesas_descricao_check check (length(descricao) <= 200)
);

create index if not exists despesas_user_id_data_idx
  on public.despesas (user_id, data);
create index if not exists despesas_categoria_despesa_id_idx
  on public.despesas (categoria_despesa_id);
create index if not exists despesas_criado_por_idx
  on public.despesas (criado_por);

-- ---------------------------------------------------------------------
-- 3) Validação da categoria da despesa
--    Espelha lancamentos_preco_snapshot (0001) sem o snapshot de preço
--    (despesa tem valor livre). security invoker: o select passa pela RLS,
--    então o entregador só enxerga as próprias categorias (alheia = não
--    encontrada => 23503). A comparação explícita com new.user_id cobre o
--    gestor (que enxerga todas) e o service_role (sem RLS).
-- ---------------------------------------------------------------------
create or replace function public.despesas_validar_categoria()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cat_user  uuid;
  v_cat_ativa boolean;
begin
  if tg_op = 'UPDATE'
     and new.categoria_despesa_id = old.categoria_despesa_id
     and new.user_id = old.user_id then
    return new;
  end if;

  select c.user_id, c.ativa
    into v_cat_user, v_cat_ativa
    from public.categorias_despesa c
   where c.id = new.categoria_despesa_id;

  if v_cat_user is null or v_cat_user is distinct from new.user_id then
    raise exception 'Categoria de despesa inválida: não encontrada ou não pertence ao usuário.'
      using errcode = '23503';
  end if;

  if not v_cat_ativa then
    raise exception 'Categoria de despesa inativa: não é possível lançar nesta categoria.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.despesas_validar_categoria() from public, anon, authenticated;

drop trigger if exists despesas_validar_categoria on public.despesas;
create trigger despesas_validar_categoria
  before insert or update of categoria_despesa_id, user_id on public.despesas
  for each row execute function public.despesas_validar_categoria();

-- ---------------------------------------------------------------------
-- 4) Anti-forja de criado_por (reutiliza a função da 0006)
--    INSERT: criado_por = auth.uid() quando houver sessão; sem sessão
--            mantém o enviado ou, se nulo, user_id.
--    UPDATE: criado_por não muda (exceto o set null da FK ao apagar o autor).
-- ---------------------------------------------------------------------
drop trigger if exists despesas_criado_por on public.despesas;
create trigger despesas_criado_por
  before insert or update on public.despesas
  for each row execute function public.lancamentos_criado_por();

-- ---------------------------------------------------------------------
-- 5) Grants + RLS
-- ---------------------------------------------------------------------
revoke all on table public.categorias_despesa from anon, public;
revoke all on table public.despesas           from anon, public;

revoke all on table public.categorias_despesa from authenticated;
revoke all on table public.despesas           from authenticated;
grant select, insert, update, delete on table public.categorias_despesa to authenticated;
grant select, insert, update, delete on table public.despesas           to authenticated;

grant all on table public.categorias_despesa, public.despesas to service_role;

alter table public.categorias_despesa enable row level security;
alter table public.despesas           enable row level security;

-- categorias_despesa
drop policy if exists categorias_despesa_select on public.categorias_despesa;
create policy categorias_despesa_select on public.categorias_despesa
  for select to authenticated
  using ((select public.is_ativo())
         and (user_id = (select auth.uid()) or (select public.is_gestor())));

drop policy if exists categorias_despesa_insert on public.categorias_despesa;
create policy categorias_despesa_insert on public.categorias_despesa
  for insert to authenticated
  with check ((select public.is_ativo())
              and (user_id = (select auth.uid()) or (select public.is_gestor())));

drop policy if exists categorias_despesa_update on public.categorias_despesa;
create policy categorias_despesa_update on public.categorias_despesa
  for update to authenticated
  using ((select public.is_ativo())
         and (user_id = (select auth.uid()) or (select public.is_gestor())))
  with check ((select public.is_ativo())
              and (user_id = (select auth.uid()) or (select public.is_gestor())));

drop policy if exists categorias_despesa_delete on public.categorias_despesa;
create policy categorias_despesa_delete on public.categorias_despesa
  for delete to authenticated
  using ((select public.is_ativo())
         and (user_id = (select auth.uid()) or (select public.is_gestor())));

-- despesas (o trigger de validação exige categoria do mesmo user_id)
drop policy if exists despesas_select on public.despesas;
create policy despesas_select on public.despesas
  for select to authenticated
  using ((select public.is_ativo())
         and (user_id = (select auth.uid()) or (select public.is_gestor())));

drop policy if exists despesas_insert on public.despesas;
create policy despesas_insert on public.despesas
  for insert to authenticated
  with check ((select public.is_ativo())
              and (user_id = (select auth.uid()) or (select public.is_gestor())));

drop policy if exists despesas_update on public.despesas;
create policy despesas_update on public.despesas
  for update to authenticated
  using ((select public.is_ativo())
         and (user_id = (select auth.uid()) or (select public.is_gestor())))
  with check ((select public.is_ativo())
              and (user_id = (select auth.uid()) or (select public.is_gestor())));

drop policy if exists despesas_delete on public.despesas;
create policy despesas_delete on public.despesas
  for delete to authenticated
  using ((select public.is_ativo())
         and (user_id = (select auth.uid()) or (select public.is_gestor())));

-- ---------------------------------------------------------------------
-- 6) RPCs de resumo de despesas
--    p_usuario null => auth.uid(). Diferente de auth.uid() => exige
--    is_gestor(), senão 42501. O filtro explícito d.user_id = v_usuario
--    impede o resumo do gestor de somar todo mundo.
--    p_categorias: null = todas; '{}' = nada; array = só essas (ids de
--    categorias_despesa).
-- ---------------------------------------------------------------------
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

  if v_usuario is distinct from auth.uid() and not public.is_gestor() then
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

  if v_usuario is distinct from auth.uid() and not public.is_gestor() then
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

-- Só gestor (senão 42501). Todos os perfis, quem não teve despesa aparece
-- com 0. Filtro por NOME de categoria de despesa (sem caixa/espaços nas
-- pontas): null = todas; '{}' = nada. Ordem: valor desc, nome, username.
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
begin
  perform public.resumo_validar_periodo(p_de, p_ate);

  if not public.is_gestor() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

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
     group by p.id, p.nome, p.username, p.role, p.ativo
     order by 7 desc, 2, 3;
end;
$$;

-- ---------------------------------------------------------------------
-- 7) autores(p_ids): agora também autores de despesas visíveis ao chamador
--    (próprias, ou de qualquer um se for gestor). Mesma assinatura.
-- ---------------------------------------------------------------------
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
            and (l.user_id = auth.uid() or public.is_gestor())
       )
       or exists (
         select 1
           from public.despesas d
          where d.criado_por = p.id
            and (d.user_id = auth.uid() or public.is_gestor())
       )
     )
   order by p.nome;
$$;

-- ---------------------------------------------------------------------
-- 8) Grants das funções
-- ---------------------------------------------------------------------
revoke all on function public.resumo_despesas_por_categoria(date, date, uuid[], uuid) from public, anon;
revoke all on function public.resumo_despesas_por_dia(date, date, uuid[], uuid)       from public, anon;
revoke all on function public.resumo_despesas_por_usuario_nomes(date, date, text[])   from public, anon;
revoke all on function public.autores(uuid[])                                         from public, anon;

grant execute on function public.resumo_despesas_por_categoria(date, date, uuid[], uuid) to authenticated, service_role;
grant execute on function public.resumo_despesas_por_dia(date, date, uuid[], uuid)       to authenticated, service_role;
grant execute on function public.resumo_despesas_por_usuario_nomes(date, date, text[])   to authenticated, service_role;
grant execute on function public.autores(uuid[])                                         to authenticated, service_role;

-- PostgREST: recarrega o cache de schema.
notify pgrst, 'reload schema';
