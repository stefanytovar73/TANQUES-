import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendTarget = (process.env.VITE_BACKEND_URL || 'http://127.0.0.1:8001').replace(/\/+$/, '')

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/diagram': {
        target: backendTarget,
        changeOrigin: true,
      },
    },
    hmr: {
      host: '127.0.0.1',
    },
    watch: {
      usePolling: true,
      interval: 500,
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/diagram': {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
})
