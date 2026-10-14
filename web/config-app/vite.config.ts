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
      // The RIP renderer, from SOURCE, for the same two reasons as the ANSI
      // editor core above - and one more: the admin has to draw a .rip screen
      // exactly as the caller's terminal draws it. A second renderer here
      // would be a second answer to "what does this file look like", and the
      // vendored RIPtermJS is the one the board actually ships.
      '@amiexpress/terminal/rip': path.resolve(__dirname, '../../packages/terminal/src/rip'),
      // Reached through packages/terminal's dist, not imported here directly:
      // the PETSCII preview renders through PetsciiMachine. From SOURCE for
      // the same two reasons as the editor above - sdk/dist is gitignored,
      // and a stale dist hides a source edit.
      '@amiexpress/bbs-door-sdk/petscii': path.resolve(__dirname, '../../sdk/petscii'),
      // The board's own MCI parser, from the backend source.
      //
      // A screen's ~CC_/~SS_/~SR_/~CL. codes are already parsed in exactly one
      // place, whose header says the patterns mirror the loader's; a second
      // copy in the admin would be a third parser to keep in step. The module
      // is pure - no fs, no path - so it bundles like any other source file.
      // The magazine's front page edits (frontToggle, frontMove, frontLead,
      // normalizeFront) and desk labels, from the SDK source: pure, no Node
      // imports. The MAG door and the board's Magazine route run the same
      // functions, so the three cannot disagree on how the list changes.
      '@amiexpress/bbs-door-sdk/formats/magazine': path.resolve(__dirname, '../../sdk/formats/magazine'),
      // Which doors the W menu lists is ONE parse (declaresSettings): the admin's
      // "Listed under W" box reads the tooltype the way the board does. The module
      // is pure - no imports at all.
      '@bbs/settings-doors': path.resolve(__dirname, '../backend/src/handlers/commands/w-settings-doors'),
      '@bbs/screens': path.resolve(__dirname, '../backend/src/screens'),
      // Same rule, same reason: which ACS file serves a level is express.e's
      // (findAcsLevel, express.e:3025), and the admin has to apply it in a
      // browser. acs-level-serving.ts is the disk-free half of that service.
      '@bbs/config-services': path.resolve(__dirname, '../backend/src/services/config-services'),
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
      // RIPtermJS fetches its .CHR vector fonts and its icons at runtime.
      // They are served with the board's own frontend, which shares an origin
      // with the admin in production; in dev the admin is on its own port, so
      // a RIP preview would draw without fonts without this.
      '/rip': {
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
