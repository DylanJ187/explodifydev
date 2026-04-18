import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  resolve: {
    alias: [
      { find: /^postcss\/index\.js$/, replacement: 'postcss/lib/postcss.mjs' },
    ],
  },
  server: {
    proxy: {
      '/jobs': 'http://localhost:8000',
      '/preview': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
      '/gallery': 'http://localhost:8000',
      '/stitch': 'http://localhost:8000',
    },
    // /jobs covers /jobs/{id}/video, /jobs/{id}/base_video, /jobs/{id}/frames/*
    // /jobs already covers /jobs/{id}/frames — no extra entry needed
  },
})
