/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // The SDK's ANSI editor core, from SOURCE rather than sdk/dist.
      //
      // Two reasons. The build is gitignored, so a fresh checkout has no dist
      // and the admin would fail to bundle; and a stale dist is a trap this
      // repo has been caught by before - a source edit stays invisible until
      // someone remembers to rebuild. Vite compiles the TypeScript directly,
      // so the browser and the door run the same file.
      //
      // core/, tools/ and input/ carry no Node imports; only api/ and ui/
      // bind to blessed, and nothing here reaches those.
      '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor': path.resolve(
        __dirname, '../../sdk/engines/ui/ansi-editor',
      ),
      // The board's own MCI parser, from the backend source.
      //
      // A screen's ~CC_/~SS_/~SR_/~CL. codes are already parsed in exactly one
      // place, whose header says the patterns mirror the loader's; a second
      // copy in the admin would be a third parser to keep in step. The module
      // is pure - no fs, no path - so it bundles like any other source file.
      '@bbs/screens': path.resolve(__dirname, '../backend/src/screens'),
    },
  },
  server: {
    port: 5175,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    // Ensure assets are correctly referenced from /admin/
    assetsDir: 'assets',
  },
})
