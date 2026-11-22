import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://beta-climb-production.up.railway.app',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            const cookies = proxyRes.headers['set-cookie']
            if (!cookies) return
            // The API sees Railway's HTTPS hop and marks the cookie Secure.
            // The local page is HTTP, so the browser would drop that cookie and lose the upload.
            proxyRes.headers['set-cookie'] = cookies.map((cookie) => cookie.replace(/;\s*Secure/gi, ''))
          })
        },
      },
    },
  },
})
