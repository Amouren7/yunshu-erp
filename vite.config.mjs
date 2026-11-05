import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(process.cwd(), 'web/src') },
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true } },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 3000,
  },
});
