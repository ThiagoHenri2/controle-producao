# Tasks — 005 Relatório
Spec: [specs/005-relatorio.md](../specs/005-relatorio.md)

- [x] **T005.1** — Migration `0003_resumo.sql`: RPCs `resumo_por_categoria` e `resumo_por_dia` (stable, security invoker, com `total_geral`) + `grant execute` para `authenticated`. — agent: db-supabase — depende de: T002.4 — aceite: com os dados de exemplo, retorna 125,00 / 100,00 / total 225,00.
- [x] **T005.2** — Atualizar `database.types.ts` com as RPCs. — agent: frontend-ui — depende de: T005.1 — aceite: `supabase.rpc('resumo_por_categoria')` é tipado.
- [x] **T005.3** — `src/features/relatorio/periodos.ts`: cálculo de Hoje / Semana (seg–dom) / Mês / Personalizado + validação (início ≤ fim, ≤ 366 dias). — agent: frontend-ui — depende de: T001.5 — aceite: testes da T005.7.
- [x] **T005.4** — `useResumo(de, ate)` (as duas RPCs em paralelo) + sincronização do filtro com a query string. — agent: frontend-ui — depende de: T005.2, T005.3 — aceite: o reload mantém o filtro.
- [x] **T005.5** — `RelatorioPage`: chips de filtro, card de total, lista por categoria com barras CSS (marcando as inativas), lista por dia, EmptyState e skeleton. — agent: frontend-ui — depende de: T005.4 — aceite: wireframe em 360px.
- [x] **T005.6** — Seletor "Período" personalizado (duas datas nativas) com mensagem de erro. — agent: frontend-ui — depende de: T005.5 — aceite: início > fim é bloqueado.
- [x] **T005.7** — Testes de `periodos.ts` (data fixada num domingo e no dia 1º; virada de ano) e da página (total R$ 225,00 com mock). — agent: qa-tester — depende de: T005.6 — aceite: `npm test` verde.
- [x] **T005.8** — Incluir as RPCs no `rls_check.sql` (B não soma dados de A). — agent: qa-tester — depende de: T005.1 — aceite: o script passa.

## Filtro por categorias (melhoria)
- [x] **T005.9** — Migration `0005_resumo_filtro_categorias.sql`: `p_categorias uuid[] default null` nas duas RPCs (null = todas; `total_geral` só das filtradas); remover as assinaturas antigas; grants. Ampliar o `rls_check.sql` (filtro soma só as marcadas; B não soma A nem passando ids de A). — agent: db-supabase — depende de: T005.1 — aceite: com Sanduíche+Pizza e filtro só Pizza, total_geral = 100,00 e por dia só conta Pizza.
- [x] **T005.10** — Tipos das RPCs com `p_categorias?: string[]`; `useResumo(de, ate, categorias)` com a query key incluindo as categorias ordenadas; leitura e escrita de `?cats=` na URL. — agent: frontend-ui — depende de: T005.9 (contrato) — aceite: reload mantém a seleção.
- [x] **T005.11** — Botão "Categorias: …" + BottomSheet com checklist (Marcar todas, Limpar, Aplicar), aviso "Filtrando X de Y" no card de total. — agent: frontend-ui — depende de: T005.10 — aceite: wireframe em 360px.
- [x] **T005.12** — Testes: padrão = todas; desmarcar Sanduíche → total R$ 100,00 (com mock); Aplicar desabilitado sem seleção; URL `cats`; ids inválidos ignorados. — agent: qa-tester — depende de: T005.11 — aceite: `npm test` verde.
