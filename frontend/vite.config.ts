import { defineConfig } from 'vite'
import type { IncomingMessage } from 'http'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Let SPA routes like /gallery be served by Vite when the browser is
// asking for a page (Accept: text/html). API calls (fetch/XHR) keep flowing
// to the backend because they don't include text/html in Accept.
const htmlBypass = (req: IncomingMessage) => {
  const accept = req.headers.accept ?? ''
  if (req.method === 'GET' && accept.includes('text/html')) {
    return '/index.html'
  }
  return null
}

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
      '/account': { target: 'http://localhost:8000', bypass: htmlBypass },
      '/jobs':    { target: 'http://localhost:8000', bypass: htmlBypass },
      '/preview': { target: 'http://localhost:8000', bypass: htmlBypass },
      '/health':  { target: 'http://localhost:8000', bypass: htmlBypass },
      '/gallery': { target: 'http://localhost:8000', bypass: htmlBypass },
      '/stitch':  { target: 'http://localhost:8000', bypass: htmlBypass },
    },
  },
})
