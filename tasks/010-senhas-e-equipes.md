# Tasks — 010 Senhas e equipes
Spec: [specs/010-senhas-e-equipes.md](../specs/010-senhas-e-equipes.md)

- [x] **T010.1** — Migration `0008_equipes.sql`: `gerente_id` + triggers, `pode_gerir()`, RLS das 4 tabelas de dados e profiles, RPCs com escopo do gerente (mesmas assinaturas). — agent: db-supabase — depende de: T009.1 — aceite: aplica sobre a 0007 e reaplica sem erro.
- [x] **T010.2** — `rls_check.sql`: cenários G1/G2/A/B/admin da spec. — agent: db-supabase — depende de: T010.1 — aceite: "RLS OK".
- [x] **T010.3** — Edge Function: `set_gerente`, `create` com `gerente_id`, `reset_password` liberado ao gerente para os seus atendentes, DTO com `gerente_id`; `docs/qa/admin-curl.md`. — agent: db-supabase — depende de: T010.1 — aceite: revisão + tsc strict.
- [ ] **T010.4** — Página Minha conta + troca de senha (verifica a atual). — agent: frontend-ui — depende de: — — aceite: critério 1.
- [ ] **T010.5** — Admin › Usuários: vínculo de gerente (menu, criação, exibição), "N atendentes". — agent: frontend-ui — depende de: T010.3 (contrato) — aceite: critério 2.
- [ ] **T010.6** — Equipe: "Redefinir senha" por atendente (gerente e admin). — agent: frontend-ui — depende de: T010.3 — aceite: critério 3.
- [ ] **T010.7** — Renomear "Entregador" → "Atendente" na UI. — agent: frontend-ui — depende de: — — aceite: grep sem "Entregador" na UI.
- [ ] **T010.8** — Testes de front T010.4–T010.7. — agent: qa-tester — depende de: T010.4–T010.7 — aceite: `npm test` verde.
- [ ] **T010.9** — Deploy (0008 → Edge Function → push) e validação em produção. — agent: orquestrador — depende de: todas — aceite: critérios marcados.
