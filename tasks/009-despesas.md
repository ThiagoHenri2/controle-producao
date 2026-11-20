# Tasks — 009 Despesas
Spec: [specs/009-despesas.md](../specs/009-despesas.md)

- [x] **T009.1** — Migration `0007_despesas.sql`: tabelas, índices, triggers (updated_at, validação de categoria, anti-forja), RLS, grants, RPCs `resumo_despesas_*` e `autores` estendida. — agent: db-supabase — depende de: T008.1 — aceite: aplica sobre a 0006 e reaplica sem erro.
- [x] **T009.2** — `rls_check.sql`: cenários de despesas (isolamento, gestor, anti-forja, validações, totais, 42501). — agent: db-supabase — depende de: T009.1 — aceite: "RLS OK".
- [ ] **T009.3** — Componente `Tabs` + `?aba=` em Lançar e Categorias. — agent: frontend-ui — depende de: spec 008 publicada — aceite: abas acessíveis em 360px.
- [ ] **T009.4** — Categorias › Despesas (CRUD sem valor, desativar em caso de FK, duplicado). — agent: frontend-ui — depende de: T009.3 — aceite: critérios de categoria.
- [ ] **T009.5** — Lançar › Despesas (form de valor livre, lista do dia, editar/excluir, selo "por", usuário alvo). — agent: frontend-ui — depende de: T009.3 — aceite: R$ 35,90 lançado e listado.
- [ ] **T009.6** — Relatório com `tipo` (Receitas/Despesas/Ambos), saldo, por dia combinado e filtros `cats`/`dcats`. — agent: frontend-ui — depende de: T009.1 (contrato) — aceite: saldo R$ 189,10.
- [ ] **T009.7** — Equipe com `tipo`, merge por usuário e filtros `nomes`/`dnomes`. — agent: frontend-ui — depende de: T009.6 — aceite: João saldo R$ 189,10.
- [ ] **T009.8** — Testes de front T009.3–T009.7. — agent: qa-tester — depende de: T009.3–T009.7 — aceite: `npm test` verde.
- [ ] **T009.9** — Deploy (0007 → push) e validação em produção. — agent: orquestrador — depende de: todas — aceite: critérios da spec marcados.
