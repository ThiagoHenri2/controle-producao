# Tasks — 005 Relatório
Spec: [specs/005-relatorio.md](../specs/005-relatorio.md)

- [ ] **T005.1** — Migration `0003_resumo.sql`: RPCs `resumo_por_categoria` e `resumo_por_dia` (stable, security invoker, com `total_geral`) + `grant execute` para `authenticated`. — agent: db-supabase — depende de: T002.4 — aceite: com os dados de exemplo, retorna 125,00 / 100,00 / total 225,00.
- [ ] **T005.2** — Atualizar `database.types.ts` com as RPCs. — agent: frontend-ui — depende de: T005.1 — aceite: `supabase.rpc('resumo_por_categoria')` é tipado.
- [ ] **T005.3** — `src/features/relatorio/periodos.ts`: cálculo de Hoje / Semana (seg–dom) / Mês / Personalizado + validação (início ≤ fim, ≤ 366 dias). — agent: frontend-ui — depende de: T001.5 — aceite: testes da T005.7.
- [ ] **T005.4** — `useResumo(de, ate)` (as duas RPCs em paralelo) + sincronização do filtro com a query string. — agent: frontend-ui — depende de: T005.2, T005.3 — aceite: o reload mantém o filtro.
- [ ] **T005.5** — `RelatorioPage`: chips de filtro, card de total, lista por categoria com barras CSS (marcando as inativas), lista por dia, EmptyState e skeleton. — agent: frontend-ui — depende de: T005.4 — aceite: wireframe em 360px.
- [ ] **T005.6** — Seletor "Período" personalizado (duas datas nativas) com mensagem de erro. — agent: frontend-ui — depende de: T005.5 — aceite: início > fim é bloqueado.
- [ ] **T005.7** — Testes de `periodos.ts` (data fixada num domingo e no dia 1º; virada de ano) e da página (total R$ 225,00 com mock). — agent: qa-tester — depende de: T005.6 — aceite: `npm test` verde.
- [ ] **T005.8** — Incluir as RPCs no `rls_check.sql` (B não soma dados de A). — agent: qa-tester — depende de: T005.1 — aceite: o script passa.
