import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// During development the SPA runs on :5173 and proxies API/auth calls to
// jmail-api on :4000 so cookies share the same origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/auth': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
});
