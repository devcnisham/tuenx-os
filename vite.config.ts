import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const API_PORT = process.env.API_PORT ?? '5174'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    /**
     * Fail rather than move.
     *
     * Vite's default is to walk up to the next free port when 5173 is taken,
     * which — with a second `npm run dev` already running — lands it on 5174,
     * the API's port. It binds `::1` there while the API holds `127.0.0.1`, so
     * `/api` requests resolving to IPv6 hit Vite, which proxies them to
     * localhost:5174, which is itself. The loop makes every request take ten
     * to twenty seconds instead of failing, so it reads as "the app is slow"
     * rather than "two dev servers are running".
     */
    strictPort: true,
    // The API runs as a separate Node process (server/index.ts). Proxying keeps
    // the client on one origin, so there is no CORS story to carry into Phase 9.
    // 127.0.0.1, not localhost: the API binds IPv4 only, and localhost resolves
    // to ::1 first on macOS.
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: true,
      },
    },
  },
})
