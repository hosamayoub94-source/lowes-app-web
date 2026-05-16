import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
        },
      },
    },
  },
});
