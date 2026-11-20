-- =====================================================================
-- 0006_gerente.sql
-- Spec 008 — Papel Gerente (T008.1). Ver docs/decisoes.md #8.
--
-- "Gestor" = profile ativo com role 'gerente' OU 'admin' (admin ⊇ gerente).
-- O gestor vê e opera categorias/lançamentos de todos os entregadores;
-- entregadores (role 'user') continuam isolados entre si.
--
-- Conteúdo:
--   1. profiles.role aceita 'gerente' (recria profiles_role_check).
--   2. is_gestor().
--   3. lancamentos.criado_por (auditoria) + backfill (= user_id) + FK
--      on delete set null (por isso a coluna é NULLABLE) + índice.
--   4. Trigger anti-forja de criado_por.
--   5. RLS: categorias/lancamentos = is_ativo() and (user_id = auth.uid() or is_gestor());
--      profiles select = id = auth.uid() or is_gestor().
--   6. RPCs de resumo com p_usuario (drop das assinaturas (date,date,uuid[])):
--        resumo_por_categoria(p_de date, p_ate date, p_categorias uuid[] default null, p_usuario uuid default null)
--        resumo_por_dia      (p_de date, p_ate date, p_categorias uuid[] default null, p_usuario uuid default null)
--   7. resumo_por_usuario(p_de date, p_ate date, p_categorias uuid[] default null)
--      resumo_por_usuario_nomes(p_de date, p_ate date, p_nomes text[] default null)
--   8. autores(p_ids uuid[]).
--   9. Grants + notify pgrst.
--
-- Segura para produção com dados existentes e IDEMPOTENTE (pode ser
-- reaplicada): add column/backfill só na 1ª execução, drop ... if exists,
-- create or replace.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) profiles.role: 'admin' | 'gerente' | 'user'
--    A 0001 criou o check inline na coluna; o nome gerado pelo Postgres é
--    profiles_role_check. Por garantia, remove também qualquer outro check
--    de profiles que restrinja apenas a coluna role.
-- ---------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;

do $$
declare
  r record;
begin
  for r in
    select con.conname
      from pg_constraint con
     where con.conrelid = 'public.profiles'::regclass
       and con.contype = 'c'
       and con.conkey = array[(select attnum from pg_attribute
                                where attrelid = 'public.profiles'::regclass
                                  and attname = 'role')]::smallint[]
  loop
    execute format('alter table public.profiles drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'gerente', 'user'));

-- ---------------------------------------------------------------------
-- 2) is_gestor(): gerente ou admin, ativo.
--    security definer pelo mesmo motivo de is_admin(): é usada na política
--    de profiles e não pode passar pela RLS de profiles (recursão).
-- ---------------------------------------------------------------------
create or replace function public.is_gestor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.profiles
     where id = auth.uid()
       and role in ('admin', 'gerente')
       and ativo
  );
$$;

revoke all on function public.is_gestor() from public, anon;
grant execute on function public.is_gestor() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3) lancamentos.criado_por
--    Na 1ª execução: adiciona a coluna (sem default, para não gravar null
--    nas linhas existentes) e faz o backfill criado_por = user_id ANTES de
--    qualquer trigger. Em reaplicações o backfill não roda de novo (assim
--    um criado_por que virou null por exclusão do autor não é reescrito).
--    Nullable de propósito: on delete set null.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_attribute
     where attrelid = 'public.lancamentos'::regclass
       and attname = 'criado_por'
       and not attisdropped
  ) then
    alter table public.lancamentos add column criado_por uuid;
    update public.lancamentos set criado_por = user_id where criado_por is null;
  end if;
end $$;

alter table public.lancamentos alter column criado_por drop not null;
alter table public.lancamentos alter column criado_por set default auth.uid();

alter table public.lancamentos drop constraint if exists lancamentos_criado_por_fkey;
alter table public.lancamentos
  add constraint lancamentos_criado_por_fkey
  foreign key (criado_por) references auth.users (id) on delete set null;

-- Apoio à FK (set null ao apagar o autor) e à RPC autores().
create index if not exists lancamentos_criado_por_idx
  on public.lancamentos (criado_por);

-- ---------------------------------------------------------------------
-- 4) Anti-forja de criado_por
--    INSERT: criado_por = auth.uid() quando houver sessão; sem sessão
--            (service_role / SQL Editor) mantém o enviado ou, se nulo, user_id.
--    UPDATE: criado_por não muda. Única exceção: virar null quando o autor
--            já não existe em auth.users (ação "on delete set null" da FK).
--
--    security definer: precisa ler auth.users para reconhecer a ação da FK
--    (authenticated não tem acesso a auth.users). Não expõe nada: só
--    consulta a existência do autor antigo da própria linha.
-- ---------------------------------------------------------------------
create or replace function public.lancamentos_criado_por()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.criado_por := coalesce(auth.uid(), new.criado_por, new.user_id);
    return new;
  end if;

  -- UPDATE
  if new.criado_por is distinct from old.criado_por then
    if new.criado_por is null
       and old.criado_por is not null
       and not exists (select 1 from auth.users u where u.id = old.criado_por) then
      return new;  -- on delete set null do autor
    end if;
    new.criado_por := old.criado_por;
  end if;
  return new;
end;
$$;

revoke all on function public.lancamentos_criado_por() from public, anon, authenticated;

drop trigger if exists lancamentos_criado_por on public.lancamentos;
create trigger lancamentos_criado_por
  before insert or update on public.lancamentos
  for each row execute function public.lancamentos_criado_por();

-- ---------------------------------------------------------------------
-- 5) RLS
-- ---------------------------------------------------------------------

-- profiles: o próprio perfil; o gestor lista todos. Escrita continua só via
-- Edge Function (service_role).
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_gestor()));

-- categorias
drop policy if exists categorias_select on public.categorias;
create policy categorias_select on public.categorias
  for select to authenticated
  using ((select public.is_ativo())
         and (user_id = (select auth.uid()) or (select public.is_gestor())));

drop policy if exists categorias_insert on public.categorias;
create policy categorias_insert on public.categorias
  for insert to authenticated
  with check ((select public.is_ativo())
              and (user_id = (select auth.uid()) or (select public.is_gestor())));

drop policy if exists categorias_update on public.categorias;
create policy categorias_update on public.categorias
  for update to authenticated
  using ((select public.is_ativo())
         and (user_id = (select auth.uid()) or (select public.is_gestor())))
  with check ((select public.is_ativo())
              and (user_id = (select auth.uid()) or (select public.is_gestor())));

drop policy if exists categorias_delete on public.categorias;
create policy categorias_delete on public.categorias
  for delete to authenticated
  using ((select public.is_ativo())
         and (user_id = (select auth.uid()) or (select public.is_gestor())));

-- lancamentos (o trigger de snapshot continua exigindo categoria do mesmo user_id)
drop policy if exists lancamentos_select on public.lancamentos;
create policy lancamentos_select on public.lancamentos
  for select to authenticated
  using ((select public.is_ativo())
         and (user_id = (select auth.uid()) or (select public.is_gestor())));

drop policy if exists lancamentos_insert on public.lancamentos;
create policy lancamentos_insert on public.lancamentos
  for insert to authenticated
  with check ((select public.is_ativo())
              and (user_id = (select auth.uid()) or (select public.is_gestor())));

drop policy if exists lancamentos_update on public.lancamentos;
create policy lancamentos_update on public.lancamentos
  for update to authenticated
  using ((select public.is_ativo())
         and (user_id = (select auth.uid()) or (select public.is_gestor())))
  with check ((select public.is_ativo())
              and (user_id = (select auth.uid()) or (select public.is_gestor())));

drop policy if exists lancamentos_delete on public.lancamentos;
create policy lancamentos_delete on public.lancamentos
  for delete to authenticated
  using ((select public.is_ativo())
         and (user_id = (select auth.uid()) or (select public.is_gestor())));

-- ---------------------------------------------------------------------
-- 6) RPCs de resumo com p_usuario
--    p_usuario null => auth.uid(). Diferente de auth.uid() => exige
--    is_gestor(), senão 42501 "Acesso negado".
--    O filtro explícito l.user_id = v_usuario é o que impede o resumo do
--    gestor de somar todo mundo (a RLS agora deixa o gestor ver tudo).
--    As assinaturas (date, date, uuid[]) da 0005 são removidas: coexistindo
--    com as novas, chamadas só com p_de/p_ate ficariam ambíguas.
-- ---------------------------------------------------------------------
drop function if exists public.resumo_por_categoria(date, date);
drop function if exists public.resumo_por_dia(date, date);
drop function if exists public.resumo_por_categoria(date, date, uuid[]);
drop function if exists public.resumo_por_dia(date, date, uuid[]);

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

  if v_usuario is distinct from auth.uid() and not public.is_gestor() then
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

  if v_usuario is distinct from auth.uid() and not public.is_gestor() then
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

-- ---------------------------------------------------------------------
-- 7) Resumo por usuário (só gestor; senão 42501)
--    Todos os perfis (ativos e inativos, inclusive gestores), quem não
--    produziu aparece com quantidade 0 e valor 0. total_geral = soma de
--    todos (window). Ordem: valor desc, nome (username desempata).
--    security invoker: a RLS deixa o gestor ver tudo; is_gestor() no início.
-- ---------------------------------------------------------------------
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
begin
  perform public.resumo_validar_periodo(p_de, p_ate);

  if not public.is_gestor() then
    raise exception 'Acesso negado' using errcode = '42501';
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
      left join public.lancamentos l
             on l.user_id = p.id
            and l.data between p_de and p_ate
            and (p_categorias is null or l.categoria_id = any (p_categorias))
     group by p.id, p.nome, p.username, p.role, p.ativo
     order by 7 desc, 2, 3;
end;
$$;

-- Mesmo retorno, filtrando por NOME de categoria (sem caixa/espaços nas
-- pontas): "somar só Pizza de todo mundo". p_nomes null = todas;
-- '{}' = nada (todos com 0).
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
     group by p.id, p.nome, p.username, p.role, p.ativo
     order by 7 desc, 2, 3;
end;
$$;

-- ---------------------------------------------------------------------
-- 8) autores(p_ids): nomes dos autores (criado_por) para o selo "por <nome>".
--    security definer (o entregador não lê profiles alheios), mas só devolve
--    ids que sejam criado_por de algum lançamento visível ao chamador:
--    lançamentos próprios, ou de qualquer um se for gestor. Chamador
--    inativo/sem sessão => nenhuma linha.
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
     and exists (
       select 1
         from public.lancamentos l
        where l.criado_por = p.id
          and (l.user_id = auth.uid() or public.is_gestor())
     )
   order by p.nome;
$$;

-- ---------------------------------------------------------------------
-- 9) Grants: só usuários autenticados (e service_role)
-- ---------------------------------------------------------------------
revoke all on function public.resumo_por_categoria(date, date, uuid[], uuid) from public, anon;
revoke all on function public.resumo_por_dia(date, date, uuid[], uuid)       from public, anon;
revoke all on function public.resumo_por_usuario(date, date, uuid[])         from public, anon;
revoke all on function public.resumo_por_usuario_nomes(date, date, text[])   from public, anon;
revoke all on function public.autores(uuid[])                                from public, anon;

grant execute on function public.resumo_por_categoria(date, date, uuid[], uuid) to authenticated, service_role;
grant execute on function public.resumo_por_dia(date, date, uuid[], uuid)       to authenticated, service_role;
grant execute on function public.resumo_por_usuario(date, date, uuid[])         to authenticated, service_role;
grant execute on function public.resumo_por_usuario_nomes(date, date, text[])   to authenticated, service_role;
grant execute on function public.autores(uuid[])                                to authenticated, service_role;

-- PostgREST: recarrega o cache de schema para enxergar as novas assinaturas.
notify pgrst, 'reload schema';
