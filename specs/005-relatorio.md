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

### Filtro por categorias (adicionado em 20/11/2026, pedido do usuário)
- Como usuário, marco numa **checklist** quais categorias quero somar, e o relatório inteiro (total geral, nº de entregas, lista por categoria e lista por dia) passa a considerar **só as marcadas**.
- Padrão: **todas** marcadas. A checklist lista todas as categorias do usuário (ativas primeiro, depois inativas com o selo "inativa"), em ordem alfabética.
- Botão de filtro abaixo dos chips de período: "Categorias: Todas" / "Categorias: 2 de 5" / "Categorias: Sanduíche" (quando for só uma). Ele abre um BottomSheet com:
  - "Marcar todas" e "Limpar";
  - um checkbox por categoria (alvo ≥ 44px);
  - o botão "Aplicar".
- Sem nenhuma marcada → "Aplicar" desabilitado, com a dica "Selecione ao menos uma categoria".
- A seleção fica na URL: `?cats=<id>,<id>`. Sem `cats`, valem todas. IDs desconhecidos (ex.: categoria excluída) são ignorados; se não sobrar nenhum, volta para todas.
- Quando houver filtro ativo, o card de total mostra a linha "Filtrando 2 de 5 categorias" com o link "Limpar filtro".
- O filtro é aplicado **no banco**: as RPCs aceitam `p_categorias uuid[] default null`, em que `null` = todas (migration `0005_resumo_filtro_categorias.sql`).

## Dados / API (migration `0003_resumo.sql`)
```sql
-- stable, security invoker; RLS já filtra por usuário
resumo_por_categoria(p_de date, p_ate date)
  returns table (categoria_id uuid, nome text, ativa boolean, quantidade bigint, valor numeric, total_geral numeric)
  -- group by categoria, order by valor desc, nome; total_geral (sum() over ()) se repete em todas as linhas

resumo_por_dia(p_de date, p_ate date)
  returns table (data date, quantidade bigint, valor numeric)
  -- group by data, order by data desc
```
O total geral é a soma de `resumo_por_categoria.valor`. Some no front em **centavos**, ou retorne pela RPC; prefira acrescentar `total_geral` via `sum() over ()`.

Front (`src/features/relatorio/`): `useResumo(de, ate, categorias)` chama as duas RPCs em paralelo. Query key: `['resumo', de, ate, 'id1,id2' | 'todas']` (IDs ordenados; continua sob o prefixo `['resumo']`). Sem filtro, `p_categorias` é omitido (o banco usa o default `null`).

Período inválido (início > fim ou intervalo grande demais) → as RPCs levantam erro Postgres `22023` com mensagem pt-BR.

Implementação no front:
- `ativa` foi acrescentada ao retorno para marcar "inativa" na lista sem uma segunda consulta.
- O card usa `total_geral` da RPC. "N entregas" é a soma das quantidades (inteiros).
- O limite de 366 dias conta início e fim (`periodos.ts`). A RPC aceita `p_ate - p_de <= 366`, que é 1 dia mais folgada, então o front nunca envia um período que o banco recusaria.
- Query string: `?periodo=hoje|semana|mes` para os chips, `?de=…&ate=…` para o personalizado. Se a URL for inválida, o front cai no padrão (Mês).
- A tela Lançar invalida o prefixo `['resumo']` após cada mutation.
- Filtro por categorias (`filtroCategorias.ts`, `useCategoriasFiltro`):
  - a lista vem de `useCategorias({ incluirInativas: true })`;
  - `cats` é gravado com vírgulas legíveis (`?periodo=mes&cats=id1,id2`, sem `%2C`), na ordem da checklist. Trocar o período preserva `cats`;
  - marcar todas (por "Marcar todas" ou uma a uma) remove `cats`. Uma URL que lista todos os IDs existentes também é tratada como "todas" (sem a linha "Filtrando");
  - com `cats` na URL, o resumo espera a lista de categorias carregar para validar os IDs, e então consulta já com o filtro, sem uma consulta intermediária "todas";
  - **desvio:** se a lista de categorias falhar ao carregar, o botão de filtro some e o relatório mostra todas (não há como validar os IDs nem mostrar "X de Y");
  - **acréscimo:** o estado vazio com filtro ("Nenhum lançamento destas categorias neste período") oferece o botão "Limpar filtro".

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
- [x] Com 50 Sanduíche × 2,50 + 20 Pizza × 5,00 hoje, o filtro "Hoje" mostra o total **R$ 225,00**, Sanduíche 50 un R$ 125,00 e Pizza 20 un R$ 100,00.
- [x] "Semana" e "Mês" calculam os limites corretos (testar com a data fixada em um domingo e no dia 1º).
- [x] Personalizado com início > fim é bloqueado com mensagem.
- [ ] Reajuste de preço não altera totais de períodos passados.
- [ ] O usuário B nunca vê valores do usuário A (RLS aplicado nas RPCs).
- [x] Reload mantém o filtro (query string).
- [x] Filtro por categorias: o padrão é todas; desmarcar Sanduíche no exemplo acima → total **R$ 100,00** e a lista por dia só com Pizza (teste com mock).
- [x] "Aplicar" desabilitado sem nenhuma categoria marcada, com a dica "Selecione ao menos uma categoria".
- [x] `?cats=` é lido e escrito, sobrevive ao reload e à troca de período; marcar todas remove `cats`; IDs desconhecidos são ignorados.
- [x] "Limpar filtro" no card volta para todas; fechar o sheet sem aplicar não altera nada.
