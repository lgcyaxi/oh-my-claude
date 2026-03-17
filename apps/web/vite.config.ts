import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/web/',
  build: {
    outDir: '../../dist/proxy/web',
    emptyOutDir: true,
    target: 'esnext',
    minify: 'esbuild',
  },
  server: {
    port: 5174,
    proxy: {
      '/health': 'http://localhost:18911',
      '/status': 'http://localhost:18911',
      '/sessions': 'http://localhost:18911',
      '/usage': 'http://localhost:18911',
      '/providers': 'http://localhost:18911',
      '/models': 'http://localhost:18911',
      '/switch': 'http://localhost:18911',
      '/revert': 'http://localhost:18911',
      '/api': 'http://localhost:18911',
    },
  },
});
