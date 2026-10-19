import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'node:path';

const cesiumSource = path.resolve(__dirname, '../../node_modules/cesium/Build/Cesium');

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    viteStaticCopy({
      targets: ['Workers', 'ThirdParty', 'Assets', 'Widgets'].map((dir) => ({ src: path.join(cesiumSource, dir), dest: 'cesium' })),
    }),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'], globIgnores: ['cesium/**'], maximumFileSizeToCacheInBytes: 6 * 1024 * 1024 },
      manifest: {
        name: 'Contrail — live flight tracking',
        short_name: 'Contrail',
        description: 'Real-time map of the sky with 3D views, airports, playback and alerts.',
        theme_color: '#0b1220',
        background_color: '#0b1220',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Live map', url: '/' },
          { name: 'Airports', url: '/disruptions' },
          { name: 'Playback', url: '/playback' },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  define: { CESIUM_BASE_URL: JSON.stringify('/cesium') },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target: process.env.VITE_API_PROXY ?? 'http://localhost:8080', changeOrigin: true },
      '/ws': { target: process.env.VITE_API_PROXY ?? 'http://localhost:8080', ws: true, changeOrigin: true },
    },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/cesium')) return 'cesium';
          if (id.includes('node_modules/maplibre-gl')) return 'maplibre';
          if (id.includes('node_modules/react')) return 'react';
        },
      },
    },
  },
  test: { environment: 'jsdom' },
} as Parameters<typeof defineConfig>[0]);
