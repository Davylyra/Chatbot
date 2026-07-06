import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(() => {
  return {
    plugins: [react()],
    base: '/', // CRITICAL: Use '/' for SPA routing
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        output: {
        },
      },
      chunkSizeWarningLimit: 1000,
      sourcemap: false,
      target: 'es2015',
      minify: 'esbuild' as const,
      cssCodeSplit: false, // Keep CSS together to avoid loading issues
      assetsInlineLimit: 4096,
      reportCompressedSize: false,
    },
    server: {
      port: 5173,
      host: true,
      hmr: {
        overlay: false,
      },
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-router-dom', 'framer-motion', 'react-icons', 'zustand'],
      exclude: ['@vite/client', '@vite/env'],
    },
    esbuild: {
      drop: [],
    },
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '2.1.0'),
    },
    preview: {
      port: 4176,
      strictPort: false,
      host: true,
      open: false,
      // CRITICAL: Proper cache control for assets
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    },
    envPrefix: 'VITE_',
  }
})