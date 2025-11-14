# Hybrid Mode Implementation Plan

## Overview
Implement hybrid door runtime support to enable doors that need both browser APIs (Web Audio) and Node.js features (file system, database).

## Doors Requiring Migration
1. **tracker-door** - Currently `runtime: "client"`, uses Tone.js
2. **tetris** - Uses AudioEngine (Tone.js), needs hybrid for audio + high scores

## Implementation Phases

### Phase 1: SDK Infrastructure (4-6 hours)

#### 1.1 Directory Structure
```
sdk/
├── common/          # Shared types and utilities
│   ├── index.ts
│   ├── types.ts
│   ├── protocol.ts  # WebSocket message protocol
│   └── rpc.ts       # RPC types
├── server/          # Node.js runtime
│   ├── index.ts     # ServerDoor class
│   ├── stdio-io.ts  # stdin/stdout protocol
│   └── rpc-server.ts# RPC handler for hybrid
├── client/          # Browser runtime
│   ├── index.ts     # ClientDoor class
│   ├── websocket-io.ts# WebSocket bridge
│   └── rpc-client.ts# RPC caller for hybrid
└── index.ts         # Main exports (backward compatible)
```

#### 1.2 Common Types (`sdk/common/types.ts`)
- Already exists with `DoorRuntime` type
- Add RPC message types
- Add WebSocket protocol types

#### 1.3 ServerDoor Class (`sdk/server/index.ts`)
- Migrate existing Door class to server/
- Add RPC server for hybrid mode
- stdio-based I/O for BBS communication

#### 1.4 ClientDoor Class (`sdk/client/index.ts`)
- New class for browser execution
- WebSocket-based I/O
- RPC client for calling server methods
- No file system or Node.js APIs

#### 1.5 RPC Bridge
- Bidirectional RPC between client and server
- Message types: request, response, error
- Promise-based API

### Phase 2: BBS Backend Integration (6-8 hours)

#### 2.1 Door Loader (`web/backend/src/doors/door-loader.ts`)
```typescript
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
      // Backward compatibility
      return loadServerDoor(doorId, manifest);
  }
}
```

#### 2.2 Client Door Bundling
- Use esbuild to bundle client doors
- Serve bundles at `/api/doors/:doorId/bundle.js`
- Support source maps for debugging

#### 2.3 WebSocket Bridge
- Extend existing Socket.IO door bridge
- Map WebSocket messages to BBS terminal
- Handle input/output translation

#### 2.4 Hybrid Door Manager
- Spawn server component as Node.js process
- Serve client bundle to browser
- Establish RPC bridge between them
- Coordinate lifecycle (startup, shutdown)

### Phase 3: Preview System (4-6 hours)

#### 3.1 Runtime Detection (`sdk/tools/preview/server.js`)
```typescript
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
```

#### 3.2 Client Preview
- Bundle door with esbuild
- Serve in iframe with WebSocket connection
- Mock BBS environment in browser

#### 3.3 Hybrid Preview
- Start both server and client components
- Establish local RPC bridge
- Show both components in preview UI

### Phase 4: Door Migration (4-6 hours)

#### 4.1 Tracker-Door Migration
Current structure:
- `runtime: "client"`
- Uses Tone.js for audio
- Needs file saving for songs

New structure:
```json
{
  "runtime": "hybrid",
  "client": {
    "entry": "./dist/client.js"
  },
  "server": {
    "entry": "./dist/server.js"
  }
}
```

Split into:
- `client.ts` - UI + Tone.js audio engine
- `server.ts` - Song file saving/loading
- RPC methods: `saveSong()`, `loadSong()`, `listSongs()`

#### 4.2 Tetris Migration
Current structure:
- No runtime specified (defaults to server)
- Uses AudioEngine (Tone.js)
- Has file I/O for high scores (already in code)

New structure:
- Keep as `runtime: "server"` initially
- OR migrate to hybrid if we want browser audio

Options:
1. Keep server, use Node.js audio libraries instead of Tone.js
2. Migrate to hybrid for Web Audio

Recommendation: Migrate to hybrid as example

#### 4.3 AudioEngine Migration
Current: Detects environment and disables in Node.js
New: Split into two versions:
- `AudioEngineClient` - Uses Tone.js in browser
- `AudioEngineServer` - Placeholder/Node.js audio libraries
- Hybrid doors use client version + RPC for persistence

### Phase 5: Testing (2-3 hours)

#### 5.1 Unit Tests
- SDK: Test RPC message serialization
- SDK: Test client/server door initialization
- BBS: Test door loader runtime detection
- BBS: Test bundling process

#### 5.2 Integration Tests
- Test server door (backward compatibility)
- Test client door (new feature)
- Test hybrid door (full stack)
- Test preview system for all three modes

#### 5.3 Example Door Tests
- Build all example doors
- Test tracker-door hybrid mode
- Test tetris hybrid mode (if migrated)
- Verify no regressions in other doors

### Phase 6: Documentation (2-3 hours)

#### 6.1 Update DUAL_RUNTIME_ARCHITECTURE.md
- Mark as implemented
- Add actual API examples
- Document RPC protocol

#### 6.2 Update Door Development Guide
- Explain when to use each runtime
- Provide hybrid door template
- Show RPC examples

#### 6.3 Migration Guide
- How to migrate client doors to hybrid
- How to add persistence to client doors
- Common patterns

## Implementation Order

### Day 1: Core SDK (6-8 hours)
1. Create sdk/common/, sdk/server/, sdk/client/ directories
2. Implement RPC types and protocol
3. Create ServerDoor class (migrate from existing)
4. Create ClientDoor class (new)
5. Implement RPC bridge

### Day 2: BBS Integration (6-8 hours)
1. Update door loader with runtime detection
2. Implement client door bundling (esbuild)
3. Create WebSocket bridge
4. Implement hybrid door manager
5. Test with simple examples

### Day 3: Door Migration (6-8 hours)
1. Split AudioEngine into client/server versions
2. Migrate tracker-door to hybrid
3. Migrate tetris to hybrid
4. Test both doors thoroughly
5. Update documentation

## Success Criteria

- [ ] SDK has three runtime modes: server, client, hybrid
- [ ] BBS can load and execute all three runtime types
- [ ] Preview system supports all three runtime types
- [ ] tracker-door runs with real Tone.js in browser
- [ ] tracker-door can save/load songs via RPC
- [ ] tetris uses Web Audio for sound
- [ ] tetris saves high scores via RPC
- [ ] All existing doors still work (backward compatible)
- [ ] Documentation complete
- [ ] All tests pass

## Estimated Timeline

**Total: 20-27 hours** (2.5-3.5 days of focused work)

- Phase 1 (SDK): 4-6 hours
- Phase 2 (BBS): 6-8 hours
- Phase 3 (Preview): 4-6 hours
- Phase 4 (Migration): 4-6 hours
- Phase 5 (Testing): 2-3 hours
- Phase 6 (Docs): 2-3 hours

## Risks and Mitigation

### Risk: Breaking existing doors
**Mitigation**: Ensure backward compatibility, default to server runtime

### Risk: Complex RPC debugging
**Mitigation**: Add extensive logging, use simple message protocol

### Risk: WebSocket connection issues
**Mitigation**: Use existing Socket.IO infrastructure, add reconnection logic

### Risk: Bundle size for client doors
**Mitigation**: Use esbuild with tree-shaking, externalize common libraries

## Next Steps

1. Review and approve plan
2. Begin Phase 1 (SDK infrastructure)
3. Test incrementally after each phase
4. Migrate one door at a time
