# Tasks — 001 Fundação
Spec: [specs/001-fundacao.md](../specs/001-fundacao.md)

Formato: `[ ] ID — descrição — agent — depende de — aceite`

- [x] **T001.1** — Criar o projeto Vite React-TS na raiz, com TS strict e scripts `dev/build/preview/lint/test`. — agent: frontend-ui — depende de: — — aceite: `npm run dev` abre a página padrão.
- [x] **T001.2** — Configurar ESLint (flat) + Prettier + `eslint-plugin-react-hooks`. — agent: frontend-ui — depende de: T001.1 — aceite: `npm run lint` limpo.
- [x] **T001.3** — Configurar Tailwind + design tokens da spec + fonte system-ui + `tabular-nums`. — agent: frontend-ui — depende de: T001.1 — aceite: classe `bg-primary` funciona.
- [x] **T001.4** — Configurar Vitest + jsdom + Testing Library + `src/test/setup.ts`; teste de exemplo. — agent: qa-tester — depende de: T001.1 — aceite: `npm test` verde.
- [x] **T001.5** — `src/lib/format.ts` (`formatBRL`, `formatData`, `rotuloData`, `hojeISO`, `toCentavos`, `fromCentavos`) + testes. — agent: frontend-ui (código) e qa-tester (testes) — depende de: T001.4 — aceite: critérios de formatação e fuso da spec.
- [x] **T001.6** — `src/lib/supabase.ts` com validação das envs e tela de erro de configuração; `.env.example`. — agent: frontend-ui — depende de: T001.1 — aceite: sem as envs, aparece a mensagem legível.
- [x] **T001.7** — Componentes base em `src/components/ui/` (Button, Input, Card, Stepper, BottomNav, PageHeader, EmptyState, Skeleton, Toast, ConfirmDialog). — agent: frontend-ui — depende de: T001.3 — aceite: todos usados numa página de demonstração temporária; alvos ≥ 44px. _(Feito: em vez da página de demonstração, os componentes são exercitados nos testes em `src/components/ui/*.test.tsx` e nas páginas placeholder.)_
- [x] **T001.8** — `AppLayout` + `HashRouter` + `QueryClientProvider` + rotas placeholder. — agent: frontend-ui — depende de: T001.7 — aceite: navegação pela BottomNav em 360px sem scroll horizontal.
- [x] **T001.9** — Testes de `Stepper` (−/+, digitação, mínimo 0) e `Button` (loading desabilita). — agent: qa-tester — depende de: T001.7 — aceite: `npm test` verde.
