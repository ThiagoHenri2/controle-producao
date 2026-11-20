# Tasks — 003 Categorias
Spec: [specs/003-categorias.md](../specs/003-categorias.md)

- [ ] **T003.1** — `src/features/categorias/api.ts` + `hooks.ts` (list/create/update/delete, query keys, invalidação, mapeamento dos erros 23505/23503). — agent: frontend-ui — depende de: T002.7 — aceite: hooks tipados sem `any`.
- [ ] **T003.2** — Schema Zod do formulário (nome trim 1–60; valor aceita "2,50"/"2.50", ≥ 0, 2 casas). — agent: frontend-ui — depende de: — — aceite: testes da T003.6.
- [ ] **T003.3** — `CategoriasPage`: lista (ativas primeiro), seção recolhível de inativas, EmptyState, skeleton. — agent: frontend-ui — depende de: T003.1 — aceite: wireframe da spec em 360px.
- [ ] **T003.4** — Bottom sheet de criar/editar, com aviso de reajuste e toggle ativa. — agent: frontend-ui — depende de: T003.2, T003.3 — aceite: criar e editar refletem na lista sem reload.
- [ ] **T003.5** — Excluir com ConfirmDialog; quando houver erro de FK, oferecer "Desativar". — agent: frontend-ui — depende de: T003.4 — aceite: critério de exclusão da spec.
- [ ] **T003.6** — Testes: schema Zod, mensagens de erro (duplicado, FK), estado vazio. — agent: qa-tester — depende de: T003.5 — aceite: todos os critérios de aceite da spec cobertos ou justificados.
