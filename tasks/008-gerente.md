# Tasks — 008 Papel Gerente
Spec: [specs/008-gerente.md](../specs/008-gerente.md)

- [x] **T008.1** — Migration `0006_gerente.sql`: role 'gerente', `is_gestor()`, `criado_por` + trigger anti-forja, novas políticas RLS (categorias, lançamentos, profiles), RPCs de resumo com `p_usuario`, `resumo_por_usuario`, `resumo_por_usuario_nomes`, `autores`, grants. — agent: db-supabase — depende de: — — aceite: aplica sobre a 0005 e reaplica sem erro.
- [x] **T008.2** — Ampliar o `rls_check.sql` com os cenários da spec (gerente, admin = gestor, entregador isolado, anti-forja, 42501). — agent: db-supabase — depende de: T008.1 — aceite: "RLS OK".
- [x] **T008.3** — Edge Function `admin-users`: role 'gerente' em `set_role` e `create` (role opcional); veto a autorrebaixamento para user/gerente. — agent: db-supabase — depende de: T008.1 — aceite: revisão + `docs/qa/admin-curl.md` atualizado.
- [ ] **T008.4** — Tipos (`database.types.ts`), `useAuth` (isGerente/isGestor), `GestorRoute`, BottomNav com Equipe. — agent: frontend-ui — depende de: T008.1 (contrato) — aceite: testes de guard e nav.
- [ ] **T008.5** — `UsuarioAlvoSelect` + `useUsuarioAlvo` (URL `?usuario=`), aplicado em Lançar (insert com user_id alvo), Categorias (CRUD do alvo) e Relatório (`p_usuario`); faixa "como gestor para X". — agent: frontend-ui — depende de: T008.4 — aceite: o gestor lança para o João e o João vê.
- [ ] **T008.6** — Selo "por <nome>" na lista de lançamentos (RPC `autores`). — agent: frontend-ui — depende de: T008.4 — aceite: aparece só quando criado_por ≠ user_id.
- [ ] **T008.7** — Página Equipe (`/equipe`): período, total a pagar, filtro por nome de categoria, lista por entregador, navegação para o relatório do entregador. — agent: frontend-ui — depende de: T008.4 — aceite: wireframe em 360px; R$ 255,00 no exemplo.
- [ ] **T008.8** — Admin › Usuários: papel Gerente (menu e formulário de criação), selos. — agent: frontend-ui — depende de: T008.3 (contrato) — aceite: criar gerente e trocar papel.
- [ ] **T008.9** — Testes de front para T008.4–T008.8. — agent: qa-tester — depende de: T008.4–T008.8 — aceite: `npm test` verde.
- [ ] **T008.10** — Deploy na ordem banco (0006) → Edge Function → front (push), com a validação em produção dos critérios de aceite. — agent: orquestrador — depende de: todas — aceite: critérios da spec marcados.
