# Spec 007 — PWA e deploy gratuito

**Etapa:** 4 · **Agents:** devops-deploy (principal), frontend-ui (banner de instalação), qa-tester · **Depende de:** 001–006

## Objetivo
Publicar o app na internet de graça (GitHub Pages), instalável no Android como um aplicativo, com deploy automático e o Supabase sem pausar.

## Escopo
1. **Build para Pages:** `vite.config.ts` com `base: process.env.VITE_BASE ?? '/'`; o workflow define `VITE_BASE=/<repo>/`.
2. **Workflow `deploy.yml`:** push na `main` → lint → test → build → deploy no Pages.
3. **PWA (`vite-plugin-pwa`):**
   - manifest: `name: "Entregas — Controle de Produção"`, `short_name: "Entregas"`, `lang: "pt-BR"`, `display: "standalone"`, `orientation: "portrait"`, `theme_color` = primary, `background_color` = fundo.
   - ícones: `pwa-192.png`, `pwa-512.png`, `maskable-512.png` em `public/`, mais o `apple-touch-icon.png`.
   - service worker com `registerType: 'autoUpdate'`; precache somente do app shell; `navigateFallback: 'index.html'`; **sem** runtime cache de `*.supabase.co`.
4. **Banner "Instalar app"** (frontend-ui): captura `beforeinstallprompt` e mostra o botão "Instalar" no header ou em Lançar; pode ser dispensado (lembra em localStorage).
5. **Aviso offline:** se `navigator.onLine === false`, mostra uma faixa "Sem conexão — os lançamentos não serão salvos". O app não grava offline nesta versão.
6. **Workflow `keep-alive.yml`:** cron semanal, um `curl` na API REST do Supabase.
7. **`docs/setup.md`:** guia passo a passo para leigos, cobrindo a conta GitHub, a criação do repositório, os secrets, a ativação do Pages (Source: GitHub Actions), a criação do projeto Supabase, as migrations, o deploy da Edge Function, o primeiro admin e a instalação no celular.

## Fora de escopo (versões futuras)
- Lançamentos offline com sincronização.
- Exportar CSV/PDF do relatório.
- Domínio próprio.
- Publicação na Play Store (seria possível via TWA/Bubblewrap).

## Critérios de aceite
- [ ] O push na `main` publica automaticamente em `https://<usuario>.github.io/<repo>/`.
- [ ] O workflow falha (e não publica) se lint, teste ou build falharem.
- [ ] O Lighthouse (mobile) mostra PWA "Installable" e Performance ≥ 80.
- [ ] No Chrome Android, "Instalar app" adiciona o ícone na tela inicial, que abre em tela cheia.
- [ ] Um novo deploy atualiza o app instalado na próxima abertura (autoUpdate).
- [ ] Os dados do relatório nunca vêm do cache do service worker.
- [ ] O keep-alive roda manualmente (`workflow_dispatch`) com status 200.
