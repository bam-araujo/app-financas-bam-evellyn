import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Base path: ajustado pela env BASE_PATH para suportar GitHub Pages em /<repo>/.
// Local e em deploy custom domain: '/'.
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'],
      manifest: {
        name: 'Dueto — Finanças do casal',
        short_name: 'Dueto',
        description: 'Liberdade financeira conquistada em conjunto',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        lang: 'pt-BR',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,ico}'],
        // SW novo assume controle imediatamente em vez de ficar em "waiting"
        // até todas as abas fecharem. Combinado com o listener de
        // controllerchange em main.tsx, faz com que uma nova versão em prod
        // apareça já na primeira abertura (1 reload silencioso), em vez de
        // exigir 2-3 ciclos abrir/fechar do PWA.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
