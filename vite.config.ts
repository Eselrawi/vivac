import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Vivac',
        short_name: 'Vivac',
        description: 'Dónde dormimos este finde en la Sierra de Guadarrama',
        lang: 'es',
        theme_color: '#0e1b2c',
        background_color: '#0e1b2c',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: `${base}index.html`,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
        globIgnores: ['**/graph.json'],
        runtimeCaching: [
          { urlPattern: /^https:\/\/protomaps\.github\.io\/basemaps-assets\//, handler: 'CacheFirst', options: { cacheName: 'mapa-fuentes', cacheableResponse: { statuses: [0, 200] } } },
          { urlPattern: /\/data\/graph\.json$/, handler: 'CacheFirst', options: { cacheName: 'rutas', cacheableResponse: { statuses: [200] } } },
          {
            urlPattern: /^https:\/\/(s3\.amazonaws\.com\/elevation-tiles-prod|www\.ign\.es\/wmts)\/.*/,
            handler: 'CacheFirst',
            options: { cacheName: 'tiles', cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 1200 },
})
