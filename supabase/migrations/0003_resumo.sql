-- =====================================================================
-- 0003_resumo.sql
-- Spec 005 — Relatório (T005.1)
--
-- RPCs de leitura para o relatório por período:
--   resumo_por_categoria(p_de date, p_ate date)
--     returns table (categoria_id uuid, nome text, ativa boolean,
--                    quantidade bigint, valor numeric, total_geral numeric)
--     ordem: valor desc, nome
--   resumo_por_dia(p_de date, p_ate date)
--     returns table (data date, quantidade bigint, valor numeric)
--     ordem: data desc
--
-- stable + security invoker: rodam com os privilégios de quem chama, então
-- a RLS de lancamentos/categorias se aplica (inclusive o filtro de usuário
-- ativo). Além disso filtram explicitamente por l.user_id = auth.uid().
--
-- Valores somados = lancamentos.valor_total (preço congelado no lançamento).
-- Categorias inativas aparecem se tiverem lançamentos no período.
--
-- Período inválido (nulo, p_de > p_ate ou p_ate - p_de > 366 dias)
-- => raise exception com errcode 22023 (invalid_parameter_value).
--
-- Idempotente (create or replace).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Validação do período (compartilhada pelas duas RPCs)
-- ---------------------------------------------------------------------
create or replace function public.resumo_validar_periodo(p_de date, p_ate date)
returns void
language plpgsql
immutable
security invoker
set search_path = public
as $$
begin
  if p_de is null or p_ate is null then
    raise exception 'Período inválido: informe a data inicial e a data final.'
      using errcode = '22023';
  end if;

  if p_de > p_ate then
    raise exception 'Período inválido: a data inicial deve ser menor ou igual à data final.'
      using errcode = '22023';
  end if;

  if p_ate - p_de > 366 then
    raise exception 'Período inválido: o intervalo máximo é de 366 dias.'
      using errcode = '22023';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Total por categoria
-- ---------------------------------------------------------------------
create or replace function public.resumo_por_categoria(p_de date, p_ate date)
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
     group by c.id, c.nome, c.ativa
     order by 5 desc, 2;
end;
$$;

-- ---------------------------------------------------------------------
-- Total por dia
-- ---------------------------------------------------------------------
create or replace function public.resumo_por_dia(p_de date, p_ate date)
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
     group by l.data
     order by 1 desc;
end;
$$;

-- ---------------------------------------------------------------------
-- Grants: só usuários autenticados
-- ---------------------------------------------------------------------
revoke all on function public.resumo_validar_periodo(date, date) from public, anon;
revoke all on function public.resumo_por_categoria(date, date)   from public, anon;
revoke all on function public.resumo_por_dia(date, date)         from public, anon;

grant execute on function public.resumo_validar_periodo(date, date) to authenticated, service_role;
grant execute on function public.resumo_por_categoria(date, date)   to authenticated, service_role;
grant execute on function public.resumo_por_dia(date, date)         to authenticated, service_role;
