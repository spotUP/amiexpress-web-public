# Frontend Build Error Investigation & Resolution

**Date:** December 23, 2024
**Session:** Continued from context-limited previous session
**Working Directory:** `~/Code/amiexpress-web`
**Commit:** `e6015aaab` - fix(frontend): Resolve SDK client import and React Router build errors

---

## Initial Problem

From previous session summary:
```
error TS2307: Cannot find module '@amiexpress/bbs-door-sdk/client' or its corresponding type declarations.

2 import * as SDKClient from '@amiexpress/bbs-door-sdk/client';
                             ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
```

The frontend build was failing because the terminal package couldn't find the SDK client module.

---

## Investigation Process

### 1. Repository Structure Discovery

**Finding:** The working directory `~/Code/amiexpress-web` is the MAIN BBS repository, not just the SDK.

**Structure Identified:**
```
~/Code/amiexpress-web/
├── sdk/                    # SDK source and dist
├── packages/
│   └── terminal/          # Shared terminal component
├── web/
│   ├── backend/           # BBS backend
│   ├── frontend/          # BBS frontend (React + Vite)
│   └── config-app/        # Admin UI
└── ... (BBS data files)
```

**Key Discovery:** `packages/terminal/src/components/BBSTerminal.tsx` imports from SDK client, not the frontend itself.

### 2. Terminal Package Investigation

**Problem Found:**
- SDK was rebuilt at 23:50
- Terminal was built at 23:48 (before SDK)
- Terminal's `node_modules/@amiexpress/bbs-door-sdk` was missing

**Resolution:**
```bash
cd packages/terminal
npm install  # Created symlink to ../../sdk
npm run build  # Rebuilt with updated SDK
```

**Result:** ✅ Terminal package builds successfully

### 3. Frontend Build Attempt #1 - React Router v7 Issues

**Error:**
```
"createContext" is not exported by "node_modules/react/index.js"
"useContext" is not exported by "node_modules/react/index.js"
... (300+ similar errors)
```

**Root Cause:** React Router v7.9.5 (released recently) has severe ESM/CJS compatibility issues with Vite's build process.

**Investigation:**
- Checked frontend imports: Only uses `BrowserRouter`, `Routes`, `Route`, `Navigate`
- These basic features are available in both v6 and v7
- v6 is stable and well-tested with Vite

**Resolution:**
```bash
npm install react-router-dom@6
```

**Result:** React Router errors reduced, but new errors appeared

### 4. Frontend Build Attempt #2 - SDK Source vs Dist

**Error:**
```
"EventEmitter" is not exported by "../../sdk/node_modules/events/events.js"
```

**Root Cause:** Vite config had SDK aliases pointing to **source files** (.ts) instead of **built dist files** (.js):

```typescript
// BEFORE (BROKEN):
'@amiexpress/bbs-door-sdk/client': path.resolve(__dirname, '../../sdk/client/index.ts')

// AFTER (FIXED):
'@amiexpress/bbs-door-sdk/client': path.resolve(__dirname, '../../sdk/dist/client/index.js')
```

**Why This Matters:**
- Pointing to source caused Vite to bundle SDK's TypeScript source
- SDK source includes server-side code (Node.js EventEmitter, network engines, etc.)
- Vite tried to bundle server code for browser = ERROR

**Resolution:** Changed all SDK aliases to point to `sdk/dist/` files

### 5. Frontend Build Attempt #3 - React CJS/ESM Interop

**Error (persisted):**
```
"forwardRef" is not exported by "node_modules/react/index.js"
```

**Root Cause:** React's package.json exports CommonJS, but Rollup expects ESM named imports.

**Attempted Fixes:**
1. Added `ssr.noExternal: ['react-router', 'react-router-dom']` - Didn't help
2. Cleared Vite cache - Didn't help
3. Complete `node_modules` reinstall - Didn't help

**Final Solution:** Comprehensive CommonJS handling in Vite config:

```typescript
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
  }
}
```

**Result:** ✅ **Build successful!**

---

## Final Resolution

### Changes Made

**1. Terminal Package (`packages/terminal/`)**
- Reinstalled dependencies (SDK properly symlinked)
- Rebuilt successfully

**2. Frontend Package (`web/frontend/`)**

**package.json:**
- Downgraded `react-router-dom`: `^7.9.5` → `^6.30.2`

**vite.config.ts:**
- Changed SDK aliases from source to dist files
- Added comprehensive `optimizeDeps.include` list
- Enhanced `build.commonjsOptions`:
  - Added all major dependencies
  - Enabled `transformMixedEsModules: true`

### Build Verification

All builds tested and verified:

**Frontend:**
```bash
cd web/frontend
npm run build:check  # TypeScript + Vite build
```
**Output:**
```
✓ built in 1.60s
dist/assets/index-BEzPe-fY.js  612.00 kB │ gzip: 162.65 kB
```

**Backend:**
```bash
cd web/backend
npx tsc --noEmit  # TypeScript check
```
**Result:** Zero errors

**Config App:**
```bash
cd web/config-app
npm run build
```
**Output:**
```
✓ built in 6.13s
dist/assets/index-dcpcla8P.js  858.46 kB │ gzip: 217.87 kB
```

---

## Technical Insights

### Why React Router v7 Failed

React Router v7 introduced major architectural changes for their new framework features. The development build (`dist/development/`) uses CommonJS with named imports from React, which conflicts with Vite's ESM resolution during production builds.

### Why SDK Aliases Matter

Vite's alias system affects module resolution:
- **Source aliases** (.ts): Vite bundles TypeScript source, including dev dependencies
- **Dist aliases** (.js): Vite treats as external package, only bundles what's imported

For hybrid packages (client + server code), always alias to dist files.

### CommonJS Options Importance

Modern frontend builds often mix ESM and CJS:
- React: CommonJS (for now)
- React Router: Mixed (ESM wrapper over CJS)
- SDK: CommonJS (tsc output)
- xterm.js: UMD/CommonJS

Vite's `transformMixedEsModules: true` enables proper interop handling.

---

## Prevention Guidelines

To avoid similar issues in future:

1. **Always rebuild dependent packages** when SDK changes
2. **Use dist files in aliases**, not source files
3. **Test major version upgrades** (like React Router v7) in isolation
4. **Keep commonjsOptions comprehensive** for hybrid projects
5. **Run `npm run build:check`** before commits (catches build issues early)

---

## Commit Details

**Commit Hash:** `e6015aaab`
**Commit Message:** fix(frontend): Resolve SDK client import and React Router build errors
**Files Changed:**
- `web/frontend/vite.config.ts` - SDK aliases, commonjs options
- `web/frontend/package.json` - React Router downgrade
- `web/frontend/package-lock.json` - Dependency lockfile
- `packages/terminal/package-lock.json` - Terminal dependencies

**Pushed to:** `main` branch

---

## Status: ✅ RESOLVED

All build errors resolved. Frontend, backend, and config app build successfully.
