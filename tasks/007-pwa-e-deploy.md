# Tasks — 007 PWA e deploy
Spec: [specs/007-pwa-e-deploy.md](../specs/007-pwa-e-deploy.md)

- [x] **T007.1** — `vite.config.ts`: `base` via `VITE_BASE`; instalar e configurar o `vite-plugin-pwa` (manifest, autoUpdate, sem cache do Supabase). — agent: devops-deploy — depende de: T001.1 — aceite: `npm run build` gera `manifest.webmanifest` e `sw.js`.
- [x] **T007.2** — Ícones `pwa-192.png`, `pwa-512.png`, `maskable-512.png`, `apple-touch-icon.png` e `favicon.svg` (gerados a partir de um SVG simples). — agent: devops-deploy — depende de: T007.1 — aceite: o Lighthouse não aponta ícone faltando.
- [x] **T007.3** — `.github/workflows/deploy.yml` (lint → test → build → Pages). — agent: devops-deploy — depende de: T007.1 — aceite: o workflow passa num repositório de teste.
- [x] **T007.4** — `.github/workflows/keep-alive.yml` (cron semanal + `workflow_dispatch`). — agent: devops-deploy — depende de: — — aceite: a execução manual retorna 200.
- [x] **T007.5** — Componente `InstallBanner` (`beforeinstallprompt`, dispensável) e `OfflineBanner`. — agent: frontend-ui — depende de: T001.8 — aceite: o banner aparece no Chrome Android e some após instalar ou dispensar.
- [x] **T007.6** — Completar `docs/setup.md` (GitHub: repo, secrets, Pages; instalação no celular) para leigos. — agent: devops-deploy — depende de: T007.3 — aceite: seguindo o guia, uma pessoa nova publica o app.
- [ ] **T007.7** — QA final: `docs/qa/checklist-mobile.md`, Lighthouse mobile, fluxo fim a fim em produção (login → categorias → lançar 50+20 → relatório R$ 225,00 → reajuste não altera o histórico), dois usuários isolados. — agent: qa-tester — depende de: T007.1–T007.6 e todas as specs anteriores — aceite: todos os critérios de aceite das specs 001–007 marcados ou com bug reportado.
