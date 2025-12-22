import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  base: '/sdk/',
  plugins: [react()],
  resolve: {
    alias: {
      '@amiexpress/bbs-door-sdk/client': path.resolve(__dirname, '../../../client/index.ts'),
      '@amiexpress/bbs-door-sdk/common': path.resolve(__dirname, '../../../common/index.ts'),
      '@amiexpress/bbs-door-sdk/core': path.resolve(__dirname, '../../../core/index.ts'),
      '@amiexpress/bbs-door-sdk/engines': path.resolve(__dirname, '../../../engines/index.ts'),
      '@amiexpress/bbs-door-sdk/components': path.resolve(__dirname, '../../../components/index.ts'),
    },
    extensions: ['.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
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
  optimizeDeps: {
    include: ['zmodem.js/dist/zmodem', '@amiexpress/bbs-door-sdk/client']
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    chunkSizeWarningLimit: 2048,
    commonjsOptions: {
      include: [/zmodem\.js/, /@amiexpress\/bbs-door-sdk/]
    },
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
