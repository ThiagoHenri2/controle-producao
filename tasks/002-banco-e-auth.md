# Tasks — 002 Banco de dados e autenticação
Spec: [specs/002-banco-e-auth.md](../specs/002-banco-e-auth.md)

- [x] **T002.1** — Inicializar `supabase/` (`npx supabase init`) e escrever `docs/setup.md` (seção Supabase: criar projeto em sa-east-1, desativar signup e confirmação de e-mail, pegar URL e anon key). — agent: db-supabase — depende de: — — aceite: guia revisável por um leigo.
- [x] **T002.2** — Migration `0001_schema_inicial.sql`: tabelas `profiles`, `categorias`, `lancamentos`, índice `(user_id, data)`. — agent: db-supabase — depende de: T002.1 — aceite: aplica do zero sem erro.
- [x] **T002.3** — Na mesma migration: funções `is_admin()`, `is_ativo()`, `set_updated_at()` e o trigger `lancamentos_preco_snapshot()`. — agent: db-supabase — depende de: T002.2 — aceite: insert sem preço copia o da categoria; categoria de outro usuário ou inativa falha.
- [x] **T002.4** — Políticas RLS de todas as tabelas conforme a tabela da spec. — agent: db-supabase — depende de: T002.3 — aceite: RLS habilitado nas 3 tabelas.
- [x] **T002.5** — `supabase/seed_admin.sql` (promove o usuário `admin@entregas.local` a admin em `profiles`). — agent: db-supabase — depende de: T002.2 — aceite: após rodar, `is_admin()` é true para ele.
- [x] **T002.6** — `supabase/tests/rls_check.sql` simulando os usuários A e B. — agent: qa-tester — depende de: T002.4 — aceite: o script termina com "OK" e falha ruidosamente se houver vazamento.
- [ ] **T002.7** — Gerar tipos TS do banco em `src/lib/database.types.ts` (`npx supabase gen types typescript`) e tipar o cliente. — agent: frontend-ui — depende de: T002.4, T001.6 — aceite: `supabase.from('categorias')` é tipado.
- [ ] **T002.8** — `src/lib/auth.ts` (`usernameToEmail`), `AuthProvider`, `useAuth`, checagem de `ativo`. — agent: frontend-ui — depende de: T002.7 — aceite: sessão persiste no reload.
- [ ] **T002.9** — `LoginPage` conforme o wireframe + mensagens de erro genéricas. — agent: frontend-ui — depende de: T002.8, T001.8 — aceite: login válido leva a `/`.
- [ ] **T002.10** — `ProtectedRoute`, `AdminRoute`, botão "Sair" no header. — agent: frontend-ui — depende de: T002.8 — aceite: rotas protegidas redirecionam corretamente.
- [ ] **T002.11** — Testes de `usernameToEmail`, LoginPage (erro genérico, loading) e guards (com mock). — agent: qa-tester — depende de: T002.9, T002.10 — aceite: `npm test` verde.
