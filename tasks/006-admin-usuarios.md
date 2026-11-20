# Tasks — 006 Administração de usuários
Spec: [specs/006-admin-usuarios.md](../specs/006-admin-usuarios.md)

- [x] **T006.1** — Edge Function `supabase/functions/admin-users/index.ts`: CORS, validação de JWT, checagem de admin (401/403), roteamento por `action`. — agent: db-supabase — depende de: T002.4 — aceite: um JWT de user comum recebe 403.
- [x] **T006.2** — Ação `create` com validação de username/senha, 409 para duplicado e rollback do auth user se o profile falhar. — agent: db-supabase — depende de: T006.1 — aceite: o usuário criado consegue logar.
- [x] **T006.3** — Ações `reset_password`, `set_active` (ban/unban + `profiles.ativo`) e `set_role`; bloquear ação sobre si mesmo. — agent: db-supabase — depende de: T006.1 — aceite: o desativado não loga; o admin não se desativa.
- [x] **T006.4** — Documentar o deploy da função em `docs/setup.md` (`npx supabase functions deploy admin-users`). — agent: db-supabase — depende de: T006.3 — aceite: passo a passo claro.
- [x] **T006.5** — `src/features/admin/api.ts` + `hooks.ts` (`listProfiles`, `invoke` por ação, mapeamento de 403/409). — agent: frontend-ui — depende de: T002.7 — aceite: hooks tipados.
- [x] **T006.6** — `UsuariosPage` + sheet "Novo usuário" + menu ⋮ (redefinir senha, ativar/desativar, tornar admin com confirmação); item "Usuários" na BottomNav só para admin. — agent: frontend-ui — depende de: T006.5, T002.10 — aceite: wireframe em 360px.
- [x] **T006.7** — Testes: a BottomNav esconde Usuários de quem não é admin, mensagens 409/403 e confirmação de "tornar admin". Script `docs/qa/admin-curl.md` com curl testando o 403 (escrito pelo db-supabase). — agent: qa-tester — depende de: T006.6 — aceite: critérios da spec cobertos.
