import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174, // Changed from 5173 to bypass browser cache
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    },
    // Force fresh JavaScript load on every server start
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  },
  build: {
    // Use esbuild for faster minification
    minify: 'esbuild',
    // Disable source maps in production (faster build, smaller output)
    sourcemap: false,
    // Reduce chunk size warning limit
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Optimize chunk splitting
        manualChunks: {
          vendor: ['react', 'react-dom'],
          socket: ['socket.io-client'],
          terminal: ['@xterm/xterm', '@xterm/addon-canvas']
        }
      }
    }
  },
  // Define environment variables for Render.com deployment
  define: {
    // VITE_API_URL will be set by Render.com environment variables
  }
})