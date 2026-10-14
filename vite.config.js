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
  const jsonFiles = () =>
    fs.readdirSync(dir, { recursive: true })
      .map((f) => f.split(path.sep).join('/'))
      .filter((f) => f.endsWith('.json'));
  return {
    name: 'lingo-word-bank',
    configureServer(server) {
      server.middlewares.use('/content/', (req, res, next) => {
        const file = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
        if (!jsonFiles().includes(file)) return next();
        res.setHeader('Content-Type', 'application/json');
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
  plugins: [
    wordBankFiles(),
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
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
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  }
})
