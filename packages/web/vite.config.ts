import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  css: {
    preprocessorOptions: {
      less: {
        javascriptEnabled: true,
        modifyVars: {
          '@primary-color': '#1BAEE5',
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Split heavy 3D libs into their own chunk so the landing chunk only
    // pulls them in when the user actually scrolls to the 3D scene. The
    // landing-page lazy import + this chunk boundary together keep the
    // initial SPA load lean.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three/')) return 'three';
          if (id.includes('@react-three/')) return 'three';
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
});
