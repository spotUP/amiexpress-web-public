import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  base: '/sdk/',
  plugins: [react()],
  resolve: {
    alias: {
      '@amiexpress/terminal': path.resolve(__dirname, '../../../../packages/terminal/src')
    }
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:8080',
      '/ws': {
        target: 'http://localhost:8080',
        ws: true
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    chunkSizeWarningLimit: 2048,
    rollupOptions: {
      onwarn(warning, warn) {
        // Suppress warnings about unresolved imports (typically Node.js built-ins)
        if (warning.code === 'UNRESOLVED_IMPORT') {
          return
        }
        // Use default for all other warnings
        warn(warning)
      },
      output: {
        manualChunks: {
          xterm: ['@xterm/xterm', '@xterm/addon-fit', '@xterm/addon-canvas'],
          monaco: ['@monaco-editor/react'],
          radix: ['@radix-ui/react-dropdown-menu', '@radix-ui/react-switch', '@radix-ui/react-tabs'],
        },
      },
    },
  }
})
