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
      includeAssets: ['favicon.svg', 'icon-192.svg', 'icon-512.svg'],
      manifest: {
        name: 'App de Finanças — Bam & Evellyn',
        short_name: 'Finanças',
        description: 'Controle financeiro do casal',
        theme_color: '#1f2937',
        background_color: '#ffffff',
        display: 'standalone',
        lang: 'pt-BR',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any maskable' },
          { src: 'icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,ico}'],
      },
    }),
  ],
})
