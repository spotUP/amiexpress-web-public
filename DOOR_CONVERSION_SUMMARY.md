# Example Door Runtime Conversion Summary

## Analysis Results

### Doors Needing Hybrid Mode Conversion
These doors use browser APIs (AudioEngine, SaveManager) and need BOTH client + server components:

1. **dungeon-rpg** - Uses AudioEngine + SaveManager → Convert to hybrid
2. **fire-emblem** - Uses SaveManager + has tone dependency → Convert to hybrid
3. **space-shooter** - Has tone dependency (likely AudioEngine) → Convert to hybrid

### Doors That Should Be Server Runtime
These use only text-based UI (neo-blessed, blessed) and should run as server-only:

1. **bbs-dashboard** - Currently client, should be server (text UI only)
2. **neo-blessed-demo** - Currently client, should be server (text UI only)
3. **blessed-contrib-demos** - Currently client, should be server (text UI only)
4. **hello-world** - Currently client, should be server (simple text)

### Doors That Can Stay Client
These are simple demos without persistence or file I/O needs:

1. **tic-tac-toe** - Simple game, no save needed
2. **drawille-cube** - Graphics demo
3. **bug-tracker** - UI demo

## Conversion Actions Required

### Priority 1: Convert to Hybrid (Critical)
Convert these 3 doors similar to tetris/tracker-door:

**dungeon-rpg**:
- Create server.ts with RPC for save game
- Update package.json to hybrid runtime
- Update client to use RPC instead of SaveManager
- Add telnet/SSH text fallback

**fire-emblem**:
- Create server.ts with RPC for campaign progress
- Update package.json to hybrid runtime
- Update client to use RPC
- Add telnet/SSH text fallback

**space-shooter**:
- Create server.ts with RPC for high scores
- Update package.json to hybrid runtime
- Update client to use RPC if SaveManager exists
- Add telnet/SSH text fallback

### Priority 2: Convert to Server Runtime
Change these 4 doors from client → server:

**bbs-dashboard, neo-blessed-demo, blessed-contrib-demos, hello-world**:
- Change `runtime: "client"` → `runtime: "server"` in package.json
- Change imports from `/client` → `/server`
- Change `ClientDoor` → `ServerDoor`

##Implementation Plan

Given the scope, I recommend:

**Option A: Convert Top 3 Critical Doors**
- dungeon-rpg (most complete game)
- fire-emblem (campaign system)
- space-shooter (if it uses SaveManager)

**Option B: Quick Fixes Only**
- Just fix the server runtime doors (package.json changes only)
- Leave complex hybrid conversions for later

**My Recommendation**: Start with Option B (quick wins), then tackle Option A door-by-door.

## Commands to Execute

### Quick Server Runtime Fixes
```bash
# bbs-dashboard
sed -i 's/"runtime": "client"/"runtime": "server"/' sdk/doors/bbs-dashboard/package.json

# neo-blessed-demo
sed -i 's/"runtime": "client"/"runtime": "server"/' sdk/doors/neo-blessed-demo/package.json

# blessed-contrib-demos
sed -i 's/"runtime": "client"/"runtime": "server"/' sdk/doors/blessed-contrib-demos/package.json

# hello-world
sed -i 's/"runtime": "client"/"runtime": "server"/' sdk/doors/hello-world/package.json
```

### Dungeon RPG Hybrid Conversion
1. Create `sdk/doors/dungeon-rpg/server.ts`
2. Update `sdk/doors/dungeon-rpg/package.json` → hybrid
3. Update `sdk/doors/dungeon-rpg/index.ts` → use RPC

(Same pattern for fire-emblem and space-shooter)

## Next Steps

Should I:
1. **Do quick fixes** (convert 4 doors to server runtime - 5 minutes)
2. **Full conversion** (convert 3 doors to hybrid - 30-60 minutes)
3. **Both** (quick fixes first, then hybrid conversions)
