/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Caminho público do app. Local (dev/preview) é '/'. No GitHub Pages o
// workflow define VITE_BASE=/<nome-do-repo>/ (ex.: /controle-producao/).
// Com HashRouter não é preciso 404.html. Normaliza para começar e terminar com '/'.
const rawBase = process.env.VITE_BASE?.trim() || '/';
const base = `/${rawBase.replace(/^\/+|\/+$/g, '')}/`.replace(/\/{2,}/g, '/');

const THEME_COLOR = '#C2410C'; // primary (tailwind.config.ts)
const BACKGROUND_COLOR = '#F8FAFC'; // page (tailwind.config.ts)

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // Os ícones já entram pelo globPatterns abaixo (evita entradas duplicadas).
      includeManifestIcons: false,
      manifest: {
        id: base,
        name: 'Entregas — Controle de Produção',
        short_name: 'Entregas',
        description: 'Controle de produção de entregas',
        lang: 'pt-BR',
        dir: 'ltr',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        theme_color: THEME_COLOR,
        background_color: BACKGROUND_COLOR,
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache só do app shell: JS/CSS/HTML do build + ícones de public/.
        // O manifest.webmanifest é adicionado pelo próprio plugin.
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        navigateFallback: 'index.html',
        // O Supabase fica em outra origem (*.supabase.co), então o navigateFallback
        // nunca o intercepta; não é preciso navigateFallbackDenylist.
        // SEM runtimeCaching: as respostas do Supabase (*.supabase.co) vão sempre
        // direto para a rede, para nunca exibir dados financeiros desatualizados.
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    rolldownOptions: {
      output: {
        // Separa as bibliotecas grandes em chunks próprios (cache melhor entre
        // deploys e sem o aviso de chunk > 500 kB). API do Rolldown (Vite 8).
        codeSplitting: {
          groups: [
            {
              name: 'vendor-react',
              test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/,
              priority: 30,
            },
            { name: 'vendor-supabase', test: /node_modules[\\/]@supabase[\\/]/, priority: 20 },
            { name: 'vendor-tanstack', test: /node_modules[\\/]@tanstack[\\/]/, priority: 20 },
            { name: 'vendor', test: /node_modules[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Fuso fixo para que os testes de data sejam determinísticos (inclusive no Windows).
    env: { TZ: 'America/Sao_Paulo' },
    css: false,
  },
});
