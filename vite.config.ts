/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` mantém os caminhos relativos, o que funciona no GitHub Pages
// (subpasta do repositório) junto com o HashRouter. A spec 007 pode ajustar.
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
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
