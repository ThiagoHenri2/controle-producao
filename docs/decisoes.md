# Decisões de arquitetura (ADR resumidas)

| # | Data | Decisão | Motivo |
|---|---|---|---|
| 1 | 2026-11-20 | Web app PWA em vez de app Android nativo | Hospedagem gratuita no GitHub Pages, instalável no Android sem Play Store, um único código. |
| 2 | 2026-11-20 | Supabase (Postgres + Auth + RLS) como back-end | O GitHub Pages só serve arquivos estáticos; o Supabase oferece banco relacional e login no plano gratuito, e o RLS garante o isolamento entre usuários. |
| 3 | 2026-11-20 | Só o admin cria usuários; signup público desativado | Evitar contas de estranhos. A criação usa uma Edge Function com `service_role`. |
| 4 | 2026-11-20 | Login por username via e-mail sintético `@entregas.local` | O Supabase Auth exige e-mail; o usuário só vê o username. |
| 5 | 2026-11-20 | Preço unitário congelado no lançamento | Reajustes de preço não podem alterar o histórico financeiro. |
| 6 | 2026-11-20 | `HashRouter` | O GitHub Pages não tem rewrite de SPA; o hash evita 404 no reload. |
| 7 | 2026-11-20 | Edge Function única `admin-users` com ações | Menos deploys e lógica de autorização centralizada (o plano citava `admin-create-user`). |
