import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@amiexpress/bbs-door-sdk/client': path.resolve(__dirname, '../../sdk/dist/client/index.js'),
      '@amiexpress/bbs-door-sdk/common': path.resolve(__dirname, '../../sdk/dist/common/index.js'),
      '@amiexpress/bbs-door-sdk/core': path.resolve(__dirname, '../../sdk/dist/core/index.js'),
      '@amiexpress/bbs-door-sdk/engines': path.resolve(__dirname, '../../sdk/dist/engines/index.js'),
      '@amiexpress/bbs-door-sdk/components': path.resolve(__dirname, '../../sdk/dist/components/index.js'),
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
    include: [
      'zmodem.js/dist/zmodem',
      '@amiexpress/bbs-door-sdk/client',
      'react-router-dom',
      'react-router',
      '@xterm/xterm',
      '@xterm/addon-canvas',
      'socket.io-client'
    ]
  },
  build: {
    commonjsOptions: {
      include: [
        /zmodem\.js/,
        /@amiexpress\/bbs-door-sdk/,
        /@amiexpress\/terminal/,
        /react/,
        /react-dom/,
        /react-router/,
        /@xterm/,
        /socket\.io-client/,
        /node_modules/
      ],
      transformMixedEsModules: true
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
