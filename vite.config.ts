import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Everything a visitor has - their chats and their API key - is readable by any
// script on the page, so the built page may run only its own. connect-src stays
// open because the provider is whatever URL the visitor types in.
// Build only: the dev server needs inline scripts for hot reload.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' blob: data:",
  'connect-src *',
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const contentSecurityPolicy = (): Plugin => ({
  name: 'fabled-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

// GitHub Pages serves a project (non-root) site from /<repo>/, so the build
// needs every asset path prefixed with that. Local dev and other static hosts
// stay at the domain root; the deploy workflow sets VITE_BASE to override it.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'web') },
  },
  server: { port: 5173 },
});
