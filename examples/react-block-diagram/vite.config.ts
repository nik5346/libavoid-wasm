import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      'libavoid-wasm': path.resolve(__dirname, '../../ts/index.ts'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    fs: {
      allow: [path.resolve(__dirname, '../..'), path.resolve(__dirname, 'node_modules')],
    },
    middlewareMode: false,
  },
  build: {
    target: 'ES2020',
  },
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    exclude: ['libavoid-wasm'],
  },
});
