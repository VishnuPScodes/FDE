import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  publicDir: false,
  worker: { format: 'es' },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      showMaximumFileSizeToCacheInBytesWarning: true,
      workbox: {
        globPatterns: ['**/*.{css,html,ico,png,svg,woff2}'],
        globIgnores: ['**/*.js', '**/assets/PythonWorkspace-*.js'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/pyodide\/v314\.0\.7\/full\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pyodide-runtime-v314',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/assets\/.*\.(?:js|wasm|data)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'app-code-chunks',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      manifest: {
        name: 'FDE Learning Platform',
        short_name: 'FDE',
        description: 'Become a Forward Deployed Engineer — free, self-paced, hands-on',
        theme_color: '#0f0f23',
        background_color: '#0f0f23',
        display: 'standalone',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@fde/ui': path.resolve(__dirname, '../../packages/ui/src/index.ts'),
      '@fde/content-schema': path.resolve(__dirname, '../../packages/content-schema/src/index.ts'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          router: ['react-router-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
});
