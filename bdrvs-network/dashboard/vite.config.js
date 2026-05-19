import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// B-DRVS Dashboard Vite configuration.
// Proxies /api/* to the REST gateway running on http://localhost:3000
// so the dashboard can call the gateway from the dev server without CORS issues.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
