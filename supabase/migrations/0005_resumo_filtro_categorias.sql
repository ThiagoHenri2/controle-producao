-- =====================================================================
-- 0005_resumo_filtro_categorias.sql
-- Spec 005 — Relatório, "Filtro por categorias" (T005.9)
--
-- As RPCs de resumo passam a aceitar um filtro opcional de categorias:
--   resumo_por_categoria(p_de date, p_ate date, p_categorias uuid[] default null)
--     returns table (categoria_id uuid, nome text, ativa boolean,
--                    quantidade bigint, valor numeric, total_geral numeric)
--     ordem: valor desc, nome
--   resumo_por_dia(p_de date, p_ate date, p_categorias uuid[] default null)
--     returns table (data date, quantidade bigint, valor numeric)
--     ordem: data desc
--
-- p_categorias:
--   null        => todas as categorias (mesmo comportamento da 0003);
--   '{}'        => nenhuma linha (= any de array vazio é sempre falso);
--   array[...]  => só lançamentos dessas categorias. total_geral e os totais
--                  por dia consideram apenas as linhas filtradas.
-- IDs de outro usuário no array não vazam nada: o filtro l.user_id = auth.uid()
-- (e a RLS, já que é security invoker) continua valendo.
--
-- As assinaturas antigas (date, date) são removidas: se coexistissem com as
-- novas (que têm default), uma chamada só com p_de/p_ate ficaria ambígua no
-- PostgREST/Postgres.
--
-- Período inválido => 22023 via resumo_validar_periodo (0003, inalterada).
--
-- Idempotente (drop if exists + create or replace).
-- =====================================================================

drop function if exists public.resumo_por_categoria(date, date);
drop function if exists public.resumo_por_dia(date, date);

-- ---------------------------------------------------------------------
-- Total por categoria (com filtro opcional)
-- ---------------------------------------------------------------------
create or replace function public.resumo_por_categoria(
  p_de         date,
  p_ate        date,
  p_categorias uuid[] default null
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
begin
  perform public.resumo_validar_periodo(p_de, p_ate);

  return query
    select c.id                                   as categoria_id,
           c.nome                                 as nome,
           c.ativa                                as ativa,
           sum(l.quantidade)::bigint              as quantidade,
           sum(l.valor_total)::numeric            as valor,
           (sum(sum(l.valor_total)) over ())::numeric as total_geral
      from public.lancamentos l
      join public.categorias  c on c.id = l.categoria_id
     where l.user_id = auth.uid()
       and l.data between p_de and p_ate
       and (p_categorias is null or l.categoria_id = any (p_categorias))
     group by c.id, c.nome, c.ativa
     order by 5 desc, 2;
end;
$$;

-- ---------------------------------------------------------------------
-- Total por dia (com filtro opcional)
-- ---------------------------------------------------------------------
create or replace function public.resumo_por_dia(
  p_de         date,
  p_ate        date,
  p_categorias uuid[] default null
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
begin
  perform public.resumo_validar_periodo(p_de, p_ate);

  return query
    select l.data                        as data,
           sum(l.quantidade)::bigint     as quantidade,
           sum(l.valor_total)::numeric   as valor
      from public.lancamentos l
     where l.user_id = auth.uid()
       and l.data between p_de and p_ate
       and (p_categorias is null or l.categoria_id = any (p_categorias))
     group by l.data
     order by 1 desc;
end;
$$;

-- ---------------------------------------------------------------------
-- Grants: só usuários autenticados
-- ---------------------------------------------------------------------
revoke all on function public.resumo_por_categoria(date, date, uuid[]) from public, anon;
revoke all on function public.resumo_por_dia(date, date, uuid[])       from public, anon;

grant execute on function public.resumo_por_categoria(date, date, uuid[]) to authenticated, service_role;
grant execute on function public.resumo_por_dia(date, date, uuid[])       to authenticated, service_role;

-- PostgREST: recarrega o cache de schema para enxergar as novas assinaturas.
notify pgrst, 'reload schema';
