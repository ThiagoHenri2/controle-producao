-- =====================================================================
-- 0001_schema_inicial.sql
-- Spec 002 — Banco de dados e autenticação
-- Tabelas: profiles, categorias, lancamentos
-- Funções: is_admin(), is_ativo(), set_updated_at(), lancamentos_preco_snapshot()
-- RLS: isolamento por usuário (user_id = auth.uid()) + usuário ativo
--
-- Idempotente: pode ser reaplicada sem erro num projeto Supabase novo.
-- =====================================================================

create extension if not exists pgcrypto; -- gen_random_uuid() (já vem no Supabase)

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  username    text not null unique check (username ~ '^[a-z0-9._-]{3,30}$'),
  nome        text not null,
  role        text not null default 'user' check (role in ('admin', 'user')),
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.categorias (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users on delete cascade,
  nome            text not null check (length(trim(nome)) between 1 and 60),
  valor_unitario  numeric(10,2) not null check (valor_unitario >= 0),
  ativa           boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, nome)
);

create table if not exists public.lancamentos (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users on delete cascade,
  categoria_id    uuid not null references public.categorias on delete restrict,
  data            date not null,
  quantidade      integer not null check (quantidade > 0),
  valor_unitario  numeric(10,2) not null check (valor_unitario >= 0),
  valor_total     numeric(12,2) generated always as (quantidade * valor_unitario) stored,
  observacao      text check (length(observacao) <= 200),
  created_at      timestamptz not null default now()
);

create index if not exists lancamentos_user_id_data_idx
  on public.lancamentos (user_id, data);

-- Índice de apoio para a FK (evita seq scan ao apagar/consultar categoria).
create index if not exists lancamentos_categoria_id_idx
  on public.lancamentos (categoria_id);

-- ---------------------------------------------------------------------
-- Funções auxiliares de autorização
-- security definer: leem profiles sem passar pela RLS (evita recursão
-- na política de profiles, que chama is_admin()).
-- ---------------------------------------------------------------------

create or replace function public.is_admin()
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
       and role = 'admin'
       and ativo
  );
$$;

create or replace function public.is_ativo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select ativo from public.profiles where id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_ativo() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.is_ativo() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- updated_at automático em categorias
-- ---------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon;

drop trigger if exists categorias_set_updated_at on public.categorias;
create trigger categorias_set_updated_at
  before update on public.categorias
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Snapshot do preço + validação da categoria no lançamento
--
-- Roda como security invoker: o select em categorias passa pela RLS,
-- então o usuário autenticado só "enxerga" as próprias categorias
-- (categoria de outro usuário = não encontrada). A comparação explícita
-- com new.user_id cobre também chamadas via service_role (sem RLS).
--
-- Dispara em INSERT e em UPDATE que troque categoria_id/user_id, para
-- que um update não consiga apontar o lançamento para a categoria de
-- outro usuário (a FK sozinha não impede isso). Em UPDATE o preço já
-- gravado é mantido (preço congelado).
-- Não toca em valor_total (coluna gerada).
-- ---------------------------------------------------------------------

create or replace function public.lancamentos_preco_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cat_user  uuid;
  v_cat_preco numeric(10,2);
  v_cat_ativa boolean;
begin
  if tg_op = 'UPDATE'
     and new.categoria_id = old.categoria_id
     and new.user_id = old.user_id then
    return new;
  end if;

  select c.user_id, c.valor_unitario, c.ativa
    into v_cat_user, v_cat_preco, v_cat_ativa
    from public.categorias c
   where c.id = new.categoria_id;

  if v_cat_user is null or v_cat_user is distinct from new.user_id then
    raise exception 'Categoria inválida: não encontrada ou não pertence ao usuário.'
      using errcode = '23503';
  end if;

  if not v_cat_ativa then
    raise exception 'Categoria inativa: não é possível lançar nesta categoria.'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' and new.valor_unitario is null then
    new.valor_unitario := v_cat_preco;
  end if;

  return new;
end;
$$;

revoke all on function public.lancamentos_preco_snapshot() from public, anon;

drop trigger if exists lancamentos_preco_snapshot on public.lancamentos;
create trigger lancamentos_preco_snapshot
  before insert or update of categoria_id, user_id on public.lancamentos
  for each row execute function public.lancamentos_preco_snapshot();

-- ---------------------------------------------------------------------
-- Grants (anon não acessa nada; authenticated só o necessário)
-- ---------------------------------------------------------------------

revoke all on table public.profiles    from anon, public;
revoke all on table public.categorias  from anon, public;
revoke all on table public.lancamentos from anon, public;

revoke all on table public.profiles from authenticated;
grant select on table public.profiles to authenticated;

revoke all on table public.categorias  from authenticated;
revoke all on table public.lancamentos from authenticated;
grant select, insert, update, delete on table public.categorias  to authenticated;
grant select, insert, update, delete on table public.lancamentos to authenticated;

grant all on table public.profiles, public.categorias, public.lancamentos to service_role;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

alter table public.profiles    enable row level security;
alter table public.categorias  enable row level security;
alter table public.lancamentos enable row level security;

-- profiles: lê o próprio perfil; admin lê todos. Escrita só via Edge Function (service_role).
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

-- categorias
drop policy if exists categorias_select on public.categorias;
create policy categorias_select on public.categorias
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_ativo()));

drop policy if exists categorias_insert on public.categorias;
create policy categorias_insert on public.categorias
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_ativo()));

drop policy if exists categorias_update on public.categorias;
create policy categorias_update on public.categorias
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_ativo()))
  with check (user_id = (select auth.uid()) and (select public.is_ativo()));

drop policy if exists categorias_delete on public.categorias;
create policy categorias_delete on public.categorias
  for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.is_ativo()));

-- lancamentos
drop policy if exists lancamentos_select on public.lancamentos;
create policy lancamentos_select on public.lancamentos
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_ativo()));

drop policy if exists lancamentos_insert on public.lancamentos;
create policy lancamentos_insert on public.lancamentos
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_ativo()));

drop policy if exists lancamentos_update on public.lancamentos;
create policy lancamentos_update on public.lancamentos
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_ativo()))
  with check (user_id = (select auth.uid()) and (select public.is_ativo()));

drop policy if exists lancamentos_delete on public.lancamentos;
create policy lancamentos_delete on public.lancamentos
  for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.is_ativo()));
