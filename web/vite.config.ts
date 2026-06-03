import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (
            id.includes('maplibre-gl') ||
            id.includes('pmtiles') ||
            id.includes('@mapbox') ||
            id.includes('gl-matrix')
          ) {
            return 'map-vendor'
          }
          if (
            id.includes('react-dom') ||
            id.includes('react-router') ||
            id.includes('/react/')
          ) {
            return 'react-vendor'
          }
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.API_PORT || '8000'}`,
        changeOrigin: true,
      },
    },
  },
})
