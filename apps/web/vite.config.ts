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
  build: {
    rollupOptions: {
      output: {
        // Split rarely-changing vendor code into its own long-lived chunks so an
        // app-only redeploy doesn't invalidate the (large) framework cache for
        // returning users. Icons get their own chunk since they almost never change.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@tabler')) return 'icons';
          if (id.includes('@mantine')) return 'mantine';
          return 'vendor';
        },
      },
    },
  },
});
