import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

const shared = { '@shared': resolve(__dirname, 'src/shared') };

export default defineConfig({
  main: {
    resolve: { alias: shared },
    build: { externalizeDeps: true },
  },
  preload: {
    resolve: { alias: shared },
    // Sandboxed preloads can only require('electron'), so bundle everything else (e.g. zod).
    build: { externalizeDeps: { exclude: ['zod'] } },
  },
  renderer: {
    resolve: {
      alias: { ...shared, '@': resolve(__dirname, 'src/renderer/src') },
    },
    plugins: [react()],
  },
});
