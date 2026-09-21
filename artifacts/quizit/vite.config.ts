import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';
import { TOPICS } from './src/content/topics';

// PORT/BASE_PATH are injected by the Replit runtime; default them for plain
// local dev (`pnpm --filter quizit dev`) so the app runs outside Replit too.
const rawPort = process.env.PORT ?? '5173';
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? '/';

// SEO: canonical/OG URLs, sitemap.xml and robots.txt all derive from one site URL, so a domain change is one env var (VITE_SITE_URL).
const SITE_URL = (process.env.VITE_SITE_URL ?? 'https://quiz1v1.tech').replace(/\/+$/, '');
const PUBLIC_PATHS = ['/', ...TOPICS.map((t) => `/topics/${t.slug}`), '/signup', '/login'];
const PRIVATE_PATHS = ['/auth/', '/arena', '/practice', '/duel/', '/leaderboard', '/friends', '/profile', '/progress', '/settings'];

const seo = (): Plugin => ({
  name: 'quiz1v1-seo',
  // order: 'pre' so the absolute URL is in place before Vite rebases <link href> (it would otherwise mangle the canonical on nested routes)
  transformIndexHtml: { order: 'pre', handler: (html) => html.replace(/__SITE_URL__/g, SITE_URL) },
  generateBundle() {
    const urls = PUBLIC_PATHS.map((p) => `  <url><loc>${SITE_URL}${p}</loc></url>`).join('\n');
    this.emitFile({
      type: 'asset',
      fileName: 'sitemap.xml',
      source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    });
    this.emitFile({
      type: 'asset',
      fileName: 'robots.txt',
      source: `User-agent: *\nAllow: /\n${PRIVATE_PATHS.map((p) => `Disallow: ${p}`).join('\n')}\n\nSitemap: ${SITE_URL}/sitemap.xml\n`,
    });
  },
});

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    seo(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
