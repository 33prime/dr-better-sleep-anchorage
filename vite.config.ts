import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/*.png', 'manifest.webmanifest'],
      manifest: {
        name: 'Dr. Better Sleep',
        short_name: 'Dr. Sleep',
        description: 'Quiet, attentive sleep coach. Anchorage edition.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0B1416',
        theme_color: '#0B1416',
        categories: ['health', 'lifestyle', 'medical'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest,ico}'],
        navigateFallback: '/index.html',
      },
    }),
  ],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        index: resolve(here, 'index.html'),
        gallery: resolve(here, 'gallery.html'),
        directions: resolve(here, 'directions.html'),
      },
    },
  },
});
