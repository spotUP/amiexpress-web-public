import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@amiexpress/bbs-door-sdk/client': path.resolve(__dirname, '../../sdk/client/index.ts'),
      '@amiexpress/bbs-door-sdk/common': path.resolve(__dirname, '../../sdk/common/index.ts'),
      '@amiexpress/bbs-door-sdk/core': path.resolve(__dirname, '../../sdk/core/index.ts'),
      '@amiexpress/bbs-door-sdk/engines': path.resolve(__dirname, '../../sdk/engines/index.ts'),
      '@amiexpress/bbs-door-sdk/components': path.resolve(__dirname, '../../sdk/components/index.ts'),
    },
    extensions: ['.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
  },
  server: {
    port: 5174, // Changed from 5173 to bypass browser cache
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    },
    fs: {
      allow: ['..', '../../', '../../../']
    },
    // Force fresh JavaScript load on every server start
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  },
  optimizeDeps: {
    include: ['zmodem.js/dist/zmodem', '@amiexpress/bbs-door-sdk/client']
  },
  build: {
    commonjsOptions: {
      include: [/zmodem\.js/, /@amiexpress\/bbs-door-sdk/]
    },
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
