# Tasks — 011 Privacidade do atendente
Spec: [specs/011-privacidade-atendente.md](../specs/011-privacidade-atendente.md)
Modelo dos agents: **Sonnet 5.5** (pedido do usuário).

- [x] **T011.1** — Migration `0009_privacidade_atendente.sql`: `visivel_gerente` + trigger, `pode_ver_categoria`, `pode_gerir_despesas`, RLS de categorias/lançamentos/despesas, RPCs com escopo (mesmas assinaturas). — agent: db-supabase — depende de: T010.1 — aceite: aplica sobre a 0008 e reaplica sem erro.
- [x] **T011.2** — `rls_check.sql` com os cenários da spec. — agent: db-supabase — depende de: T011.1 — aceite: "RLS OK".
- [ ] **T011.3** — Categorias: switch "Visível para <gerente>" (lista, sheet, Mostrar/Ocultar todas), avisos; tipos (`visivel_gerente`). — agent: frontend-ui — depende de: T010 front — aceite: critério 2.
- [ ] **T011.4** — Gerente → atendente: esconder a aba Despesas, o tipo no Relatório e na Equipe; notas e EmptyStates. — agent: frontend-ui — depende de: T011.3 — aceite: critérios 5 e 6.
- [ ] **T011.5** — Testes de front T011.3–T011.4. — agent: qa-tester — depende de: T011.3–T011.4 — aceite: `npm test` verde.
- [ ] **T011.6** — Deploy (0008 + 0009 → Edge Function → push) e validação. — agent: orquestrador — depende de: todas e da spec 010 — aceite: critérios marcados.
