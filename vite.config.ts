import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'web') },
  },
  server: {
    port: 5173,
    proxy: {
      // Forward API calls to the Node server. SSE streams pass through unbuffered.
      '/api': 'http://127.0.0.1:3001',
    },
  },
});
