import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies:    'injectManifest', // use our own src/sw.js
      srcDir:        'src',
      filename:      'sw.js',
      registerType:  'autoUpdate',
      includeAssets: ['favicon.ico', 'icons/*.png', 'icons/*.svg'],
      manifest: {
        name: "لوز برو — نظام الإدارة",
        short_name: "لوز برو",
        description: "نظام إدارة موظفي Lowe's Professional",
        theme_color: '#0f1f3d',
        background_color: '#0f1f3d',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        lang: 'ar',
        dir: 'rtl',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      // injectManifest — runtime caching handled in src/sw.js
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      devOptions: {
        enabled: false, // Don't run SW in dev (avoids confusing cache behavior)
        type:    'module',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
      '@components': path.resolve(process.cwd(), 'src/components'),
      '@screens': path.resolve(process.cwd(), 'src/screens'),
      '@layouts': path.resolve(process.cwd(), 'src/layouts'),
      '@services': path.resolve(process.cwd(), 'src/services'),
      '@hooks': path.resolve(process.cwd(), 'src/hooks'),
      '@stores': path.resolve(process.cwd(), 'src/stores'),
      '@utils': path.resolve(process.cwd(), 'src/utils'),
      '@context': path.resolve(process.cwd(), 'src/context'),
      '@data': path.resolve(process.cwd(), 'src/data'),
      '@styles': path.resolve(process.cwd(), 'src/styles'),
      '@routes': path.resolve(process.cwd(), 'src/routes'),
      '@modules': path.resolve(process.cwd(), 'src/modules'),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Code splitting for big vendor libs (xlsx is heavy)
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-xlsx': ['xlsx'],
          'vendor-recharts': ['recharts'],
        },
      },
    },
  },
});
