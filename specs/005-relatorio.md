# Spec 005 — Relatório / acompanhamento

**Etapa:** 3 · **Agents:** db-supabase (RPC), frontend-ui (tela), qa-tester · **Depende de:** 002 (RPC), 003/004 para os dados reais

## Objetivo
Mostrar quanto foi produzido em um período: o **total geral em R$**, o **total por categoria** (quantidade e R$) e o detalhamento por dia, com filtro de datas.

## Histórias
- Como usuário, vejo rapidamente quanto fiz **hoje**, **nesta semana** e **neste mês**.
- Como usuário, escolho um período personalizado (de/até).
- Como usuário, vejo por categoria: "Sanduíche — 320 un — R$ 800,00".
- Como usuário, vejo a lista por dia para conferir com o que recebi.

## Regras de negócio
- Filtros rápidos: **Hoje**, **Semana** (segunda a domingo da semana atual), **Mês** (mês atual) e **Personalizado** (data início ≤ data fim, intervalo máximo de 366 dias). Padrão: **Mês**.
- Todos os valores vêm do banco (soma de `valor_total`, ou seja, dos preços congelados).
- Categorias inativas aparecem se tiverem lançamentos no período.
- O filtro escolhido fica na URL (`/#/relatorio?de=2026-11-01&ate=2026-11-30`), para sobreviver ao reload.

## Dados / API (migration `0003_resumo.sql`)
```sql
-- stable, security invoker; RLS já filtra por usuário
resumo_por_categoria(p_de date, p_ate date)
  returns table (categoria_id uuid, nome text, quantidade bigint, valor numeric)
  -- group by categoria, order by valor desc

resumo_por_dia(p_de date, p_ate date)
  returns table (data date, quantidade bigint, valor numeric)
  -- group by data, order by data desc
```
O total geral é a soma de `resumo_por_categoria.valor`. Some no front em **centavos**, ou retorne pela RPC; prefira acrescentar `total_geral` via `sum() over ()`.

Front (`src/features/relatorio/`): `useResumo(de, ate)` chama as duas RPCs em paralelo. Query key: `['resumo', de, ate]`.

## Wireframe
```
┌──────────────────────────────┐
│ Relatório                    │
│ (Hoje)(Semana)[Mês](Período) │  ← chips; "Período" abre de/até
│ 01/11/2026 – 30/11/2026      │
├──────────────────────────────┤
│ ┌──────────────────────────┐ │
│ │ Total no período         │ │
│ │ R$ 3.450,00              │ │  ← destaque, tabular-nums
│ │ 1.020 entregas           │ │
│ └──────────────────────────┘ │
│ Por categoria                │
│ Sanduíche  820 un  R$2.050,00│ ▓▓▓▓▓▓▓░░
│ Pizza      200 un  R$1.000,00│ ▓▓▓░░░░░░
│ Hot-dog     — inativa —  ... │
│ Por dia                      │
│ 20/11  70 un        R$225,00 │
│ 19/11  65 un        R$210,00 │
├──────────────────────────────┤
│  BottomNav                   │
└──────────────────────────────┘
```
- As barras horizontais (% do total) são feitas em CSS puro, sem biblioteca de gráficos.
- Período sem dados: EmptyState "Nenhum lançamento neste período".

## Critérios de aceite
- [ ] Com 50 Sanduíche × 2,50 + 20 Pizza × 5,00 hoje, o filtro "Hoje" mostra o total **R$ 225,00**, Sanduíche 50 un R$ 125,00 e Pizza 20 un R$ 100,00.
- [ ] "Semana" e "Mês" calculam os limites corretos (testar com a data fixada em um domingo e no dia 1º).
- [ ] Personalizado com início > fim é bloqueado com mensagem.
- [ ] Reajuste de preço não altera totais de períodos passados.
- [ ] O usuário B nunca vê valores do usuário A (RLS aplicado nas RPCs).
- [ ] Reload mantém o filtro (query string).
