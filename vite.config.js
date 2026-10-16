import { defineConfig } from 'vite'
import fs from 'fs';
import path from 'path';
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import tailwindcss from '@tailwindcss/vite'

// The word bank in content/ is also published as /content/... (in the build,
// and served from the folder in dev) so the app can fetch the newest copy at
// startup. On the live site that path can be overridden by content published
// without a release. content/ is downloaded from amahlaka/lingo-wordbase
// (scripts/pull-content.mjs, run before dev, build and test).
function wordBankFiles() {
  const dir = path.resolve(__dirname, 'content');
  // audio/ (voice clips, see src/games/README.md) is published by the Content
  // publish workflow, never built in; in dev it is served if you made some.
  const files = () =>
    fs.readdirSync(dir, { recursive: true })
      .map((f) => f.split(path.sep).join('/'));
  const jsonFiles = () => files().filter((f) => f.endsWith('.json') && !f.startsWith('audio/'));
  return {
    name: 'lingo-word-bank',
    configureServer(server) {
      server.middlewares.use('/content/', (req, res, next) => {
        // The app's own `import ... from '../../content/...'` is Vite's to answer.
        if (/[?&]import\b/.test(req.url)) return next();
        const file = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
        const audio = file.startsWith('audio/') && /\.(json|mp3)$/.test(file);
        if (!jsonFiles().includes(file) && !(audio && files().includes(file))) return next();
        res.setHeader('Content-Type', file.endsWith('.mp3') ? 'audio/mpeg' : 'application/json');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(fs.readFileSync(path.join(dir, file)));
      });
    },
    generateBundle() {
      for (const file of jsonFiles()) {
        this.emitFile({ type: 'asset', fileName: `content/${file}`, source: fs.readFileSync(path.join(dir, file)) });
      }
    },
  };
}

export default defineConfig({
  // Sent with problem reports (src/lib/feedback.js).
  define: {
    __APP_VERSION__: JSON.stringify((process.env.GITHUB_SHA || 'dev').slice(0, 8)),
  },
  plugins: [
    wordBankFiles(),
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // /api/ belongs to the backend (server/); the service worker must not
        // answer those addresses with the app's index.html.
        navigateFallbackDenylist: [/^\/api\//],
        // Shows reminders sent by the backend (public/push-sw.js).
        importScripts: ['push-sw.js'],
      },
      manifest: {
        name: 'Lingo',
        short_name: 'Lingo',
        description: 'Short English word games for Finnish-speaking adults',
        theme_color: '#1e5b80',
        background_color: '#f4f6f4',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      }
    })
  ],
  // `npm run dev` forwards /api to the backend when it runs locally
  // (cd server && npm run dev); without it the app works as usual.
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  }
})
