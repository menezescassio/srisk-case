import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Deployed at https://menezescassio.github.io/srisk-case/
export default defineConfig({
  base: '/srisk-case/',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1200,
  },
})
