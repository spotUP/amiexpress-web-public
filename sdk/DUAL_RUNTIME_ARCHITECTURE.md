# Dual-Runtime Architecture for AmiExpress SDK

## Overview

The AmiExpress SDK now supports **two execution runtimes** to properly handle the fundamental incompatibility between Node.js and browser environments:

- **Server Doors** - Run on backend with full Node.js capabilities (fs, database, networking)
- **Client Doors** - Run in browser with full Web APIs (Audio, Canvas, WebGL, DOM)
- **Hybrid Doors** - Client UI + Server persistence via WebSocket RPC

## The Problem This Solves

Previously, the SDK tried to run browser-dependent code (Tone.js, Web Audio API) in Node.js through mocking. This is architecturally unsound:

```typescript
// IMPOSSIBLE: Can't have both in same execution environment
import * as Tone from 'tone';    // Requires browser AudioContext
import * as fs from 'fs';        // Requires Node.js filesystem
```

Mocking Web Audio in Node.js creates a fragile, unmaintainable system that breaks with every library update.

## Solution: Honest Runtime Separation

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      AmiExpress BBS                         │
│                                                             │
│  ┌──────────────┐              ┌──────────────┐           │
│  │ Door Loader  │              │ Door Manager │           │
│  │              │              │              │           │
│  │ - Read manifest              │ - Process mgmt │         │
│  │ - Detect runtime            │ - WebSocket bridge │     │
│  │ - Route execution           │ - Client bundle serve│   │
│  └──────┬───────┘              └──────────────┘           │
│         │                                                  │
└─────────┼──────────────────────────────────────────────────┘
          │
          ├─────────────┬─────────────────┐
          │             │                 │
    ┌─────▼──────┐ ┌────▼─────┐   ┌──────▼─────┐
    │ Server Door│ │Client Door│   │ Hybrid Door│
    │            │ │           │   │            │
    │ Runs in    │ │ Runs in   │   │ Client +   │
    │ Node.js    │ │ Browser   │   │ Server     │
    │            │ │           │   │            │
    │ - fs       │ │ - Audio   │   │ - Audio UI │
    │ - database │ │ - Canvas  │   │ - fs save  │
    │ - network  │ │ - WebGL   │   │ via RPC    │
    └────────────┘ └───────────┘   └────────────┘
```

## Runtime Types

### 1. Server Door (runtime: "server")

**Execution**: Node.js process on backend
**I/O**: stdio protocol (ANSI text in/out)
**Capabilities**: Full Node.js (fs, database, child_process, etc)
**Use Cases**: Database managers, file utilities, admin tools, text-based games

**Example**:
```typescript
import { ServerDoor } from '@amiexpress/sdk/server';

const door = new ServerDoor({
  name: 'User Manager',
  version: '1.0.0'
});

door.onConnect(async (user) => {
  // Real Node.js filesystem
  const data = await fs.promises.readFile('./data.json', 'utf8');
  door.send(`Loaded ${data.length} bytes\r\n`);
});

door.start();
```

**Door Manifest**:
```json
{
  "name": "user-manager",
  "runtime": "server",
  "entry": "./dist/index.js"
}
```

### 2. Client Door (runtime: "client")

**Execution**: Browser JavaScript
**I/O**: WebSocket bridge to BBS
**Capabilities**: Full Web APIs (Audio, Canvas, WebGL, Storage, etc)
**Use Cases**: Music trackers, graphics demos, audio visualizers, games with rich UI

**Example**:
```typescript
import { ClientDoor } from '@amiexpress/sdk/client';

const door = new ClientDoor({
  name: 'Music Tracker',
  version: '1.0.0'
});

door.onConnect(async (user) => {
  // Real Web Audio API - no mocks!
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  osc.connect(ctx.destination);
  osc.start();

  door.send('Playing tone!\r\n');
});

door.start();
```

**Door Manifest**:
```json
{
  "name": "tracker-door",
  "runtime": "client",
  "entry": "./dist/client.bundle.js"
}
```

### 3. Hybrid Door (runtime: "hybrid")

**Execution**: Client in browser + Server process
**I/O**: Client WebSocket + Server stdio + RPC bridge
**Capabilities**: Browser UI + Server persistence
**Use Cases**: Complex applications needing both rich UI and file/database access

**Example**:
```typescript
// client.ts - Runs in browser
import { ClientDoor } from '@amiexpress/sdk/client';

const door = new ClientDoor({
  name: 'Advanced Tracker',
  version: '1.0.0',
  hybrid: true
});

door.onConnect(async (user) => {
  // Browser: Audio UI
  const ctx = new AudioContext();

  // RPC to server: Save file
  const result = await door.rpc('saveSong', { data: songData });
  door.send(`Saved: ${result.filename}\r\n`);
});

// server.ts - Runs in Node.js
import { ServerDoor } from '@amiexpress/sdk/server';

const door = new ServerDoor({
  name: 'Advanced Tracker Server',
  version: '1.0.0',
  hybrid: true
});

door.onRPC('saveSong', async (params) => {
  const filename = `song-${Date.now()}.json`;
  await fs.promises.writeFile(filename, JSON.stringify(params.data));
  return { filename };
});
```

**Door Manifest**:
```json
{
  "name": "advanced-tracker",
  "runtime": "hybrid",
  "client": {
    "entry": "./dist/client.bundle.js"
  },
  "server": {
    "entry": "./dist/server.js"
  }
}
```

## SDK Package Structure

```
@amiexpress/sdk/
├── common/              # Shared types and utilities
│   ├── types.ts        # BBSUser, DoorConfig, KeyEvent, etc
│   ├── protocol.ts     # WebSocket message protocol
│   └── manifest.ts     # Door manifest types
│
├── server/             # Node.js runtime
│   ├── index.ts        # ServerDoor class
│   ├── stdio-io.ts     # stdin/stdout protocol
│   ├── rpc-server.ts   # RPC handler for hybrid
│   └── process-mgr.ts  # Child process utilities
│
├── client/             # Browser runtime
│   ├── index.ts        # ClientDoor class
│   ├── websocket-io.ts # WebSocket bridge
│   ├── rpc-client.ts   # RPC caller for hybrid
│   └── terminal.ts     # ANSI terminal emulator
│
└── index.ts            # Main exports (backward compatible)
```

## Communication Protocols

### Server Door I/O (stdio)
```
[BBS] ──stdin──> [Door Process]
[BBS] <──stdout─ [Door Process]

- ANSI text output on stdout
- Keyboard input on stdin
- Clean process management
```

### Client Door I/O (WebSocket)
```
[Browser Door] <──WebSocket──> [BBS WebSocket Server]

Messages:
{
  "type": "output",
  "data": { "text": "Hello\r\n" }
}

{
  "type": "input",
  "data": { "key": "a", "code": 97 }
}
```

### Hybrid Door RPC
```
[Client Door] ──RPC Request──> [BBS Bridge] ──> [Server Component]
[Client Door] <──RPC Response─ [BBS Bridge] <── [Server Component]

RPC Message:
{
  "type": "rpc",
  "id": "req-123",
  "method": "saveSong",
  "params": { "data": {...} }
}

RPC Response:
{
  "type": "rpc-response",
  "id": "req-123",
  "result": { "filename": "song.json" }
}
```

## Door Manifest Schema

```typescript
interface DoorManifest {
  name: string;
  version: string;
  description: string;
  author: string;

  // NEW: Runtime type
  runtime: 'server' | 'client' | 'hybrid';

  // For server/hybrid
  entry?: string;

  // For client/hybrid
  client?: {
    entry: string;
    bundle?: string;  // Pre-bundled JS
  };

  // For hybrid only
  server?: {
    entry: string;
  };

  // BBS integration
  minSecurity?: number;
  maxTime?: number;
  multiplayer?: boolean;
}
```

## BBS Door Loader Changes

```typescript
// web/backend/src/doors/door-loader.ts

async function loadDoor(doorId: string): Promise<void> {
  const manifest = await loadManifest(doorId);

  switch (manifest.runtime) {
    case 'server':
      return loadServerDoor(doorId, manifest);

    case 'client':
      return loadClientDoor(doorId, manifest);

    case 'hybrid':
      return loadHybridDoor(doorId, manifest);

    default:
      // Backward compatibility: treat as server
      return loadServerDoor(doorId, manifest);
  }
}

function loadServerDoor(doorId: string, manifest: DoorManifest) {
  // Existing behavior: spawn Node.js process
  const doorProcess = spawn('node', [manifest.entry]);
  // stdio bridge
}

function loadClientDoor(doorId: string, manifest: DoorManifest) {
  // NEW: Serve bundled JS to browser
  // 1. Bundle with esbuild if needed
  // 2. Serve on /api/doors/:doorId/bundle.js
  // 3. Establish WebSocket connection
  // 4. Bridge WebSocket <-> BBS terminal
}

function loadHybridDoor(doorId: string, manifest: DoorManifest) {
  // NEW: Both server process + client bundle
  // 1. Spawn server component
  // 2. Serve client bundle
  // 3. Establish RPC bridge between them
}
```

## Preview System Changes

```typescript
// sdk/tools/preview/server.js

function startPreview(doorPath: string) {
  const manifest = loadManifest(doorPath);

  switch (manifest.runtime) {
    case 'server':
      return previewServerDoor(doorPath);

    case 'client':
      return previewClientDoor(doorPath);

    case 'hybrid':
      return previewHybridDoor(doorPath);
  }
}

function previewServerDoor(doorPath: string) {
  // Existing: Spawn process, show in terminal
  const door = spawn('node', [doorPath]);
  door.stdout.on('data', (data) => {
    process.stdout.write(data);
  });
}

function previewClientDoor(doorPath: string) {
  // NEW: Bundle + serve in browser
  const bundle = await buildClientBundle(doorPath);
  const server = express();
  server.get('/', (req, res) => {
    res.send(renderPreviewHTML(bundle));
  });
  server.listen(8080);
  console.log('Preview: http://localhost:8080');
}
```

## Migration Path

### Phase 1: SDK Package Structure
1. Create `sdk/common/`, `sdk/server/`, `sdk/client/`
2. Move existing Door class to `server/`
3. Implement ClientDoor class
4. Add manifest schema

### Phase 2: BBS Integration
1. Update door loader
2. Add client door bundling
3. Add WebSocket bridge
4. Test with simple examples

### Phase 3: Tracker-Door Migration
1. Refactor tracker-door as client door
2. Remove web-audio-mock (no longer needed!)
3. Use real Tone.js in browser
4. Optionally add server component for file saving (hybrid)

### Phase 4: Documentation
1. Update SDK docs
2. Create migration guide
3. Add examples for each runtime type

## Benefits

✅ **Architectural Honesty** - No more pretending browser is Node.js
✅ **Zero Mocking** - Real APIs in their native environments
✅ **Better Performance** - No overhead from shims/polyfills
✅ **Easier Debugging** - Standard tools work (Chrome DevTools, Node debugger)
✅ **Future-Proof** - Won't break when libraries update
✅ **Clear Intent** - Developers know what environment they're in
✅ **Backward Compatible** - Existing server doors work unchanged

## Implementation Timeline

- **Day 1**: SDK package structure + ServerDoor API (4-6 hours)
- **Day 2**: ClientDoor API + WebSocket bridge (6-8 hours)
- **Day 3**: BBS integration + preview system (6-8 hours)
- **Day 4**: Tracker-door migration + testing (4-6 hours)

**Total**: 2-3 days of focused work

## Success Criteria

- [ ] Tracker-door runs in browser with real Tone.js (no mocks)
- [ ] Server doors work unchanged (backward compatible)
- [ ] Preview system detects runtime and launches appropriately
- [ ] Client doors have working WebSocket I/O
- [ ] Hybrid doors can do RPC between client/server
- [ ] All existing doors still function
- [ ] Documentation complete

---

This architecture makes the SDK genuinely powerful by embracing both runtimes for their strengths rather than fighting against their fundamental differences.
