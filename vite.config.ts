import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/v1': {
        target: 'https://api.seating-chart.cedricmcguire.com',
        changeOrigin: true,
      },
    },
  },
})
