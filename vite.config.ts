/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// GitHub Pages serves the app from /chair-log/. Override with BASE=/ for other hosts.
const base = process.env.BASE ?? '/chair-log/';

// Strict CSP (NFR-7). Injected only into the production build because the Vite
// dev server relies on inline scripts for hot reload. GitHub Pages cannot set
// headers, so it ships as a meta tag. A build with a Supabase project may talk
// to that one origin (HTTPS and its websocket) and nothing else.
const csp = (supabaseUrl: string | undefined) => {
  const host = supabaseUrl ? new URL(supabaseUrl).host : null;
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    host ? `connect-src 'self' https://${host} wss://${host}` : "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
};

function cspPlugin(supabaseUrl: string | undefined): Plugin {
  return {
    name: 'chair-log-csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp(supabaseUrl)}" />`,
      ),
  };
}

export default defineConfig(({ mode }) => ({
  base,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    cspPlugin(loadEnv(mode, process.cwd(), 'VITE_').VITE_SUPABASE_URL),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        id: base,
        name: 'Aurelle',
        short_name: 'Aurelle',
        description: 'Aurelle: a private book-of-business log for an aesthetic injector.',
        display: 'standalone',
        start_url: base,
        scope: base,
        orientation: 'any',
        theme_color: '#fbfafa',
        background_color: '#fbfafa',
        icons: [
          { src: 'icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,ico,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: { target: 'es2022', chunkSizeWarningLimit: 800 },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/unit/setup.ts'],
  },
}));
