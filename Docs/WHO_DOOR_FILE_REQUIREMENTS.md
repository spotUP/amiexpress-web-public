# WHO Door File Requirements - Implementation Plan

## Problem
WHO door (RTW) executes but produces no output because it cannot find the node status data it needs to display the user list.

## Root Cause
AmiExpress-Web stores all data in PostgreSQL database. The original AmiExpress writes **binary files to disk** that doors read directly. WHO door expects these files to exist.

## Critical Discovery from E Source Analysis

**50+ file types** need to be implemented for full 1:1 compatibility. The agent found that AmiExpress writes:

### Most Critical for WHO Door (Phase 1)
1. **`BBS:node{n}.user`** - Binary user struct for each active node
   - Source: express.e:2935-2945
   - Format: Raw binary `user` structure (SIZEOF user)
   - Created: On login via `createNodeUserFiles()`
   - WHO reads this to see who's on which node

2. **`BBS:node{n}.userkeys`** - Binary userkeys struct for each node
   - Source: express.e:2945-2950
   - Format: Raw binary `userKeys` structure (SIZEOF userKeys)
   - Created: On login via `createNodeUserFiles()`
   - WHO reads this for user settings/permissions

3. **`BBS:Node{n}/CallersLog`** - Activity log per node
   - Source: express.e:9499-9517
   - Format: Text file with timestamped actions
   - Updated: Throughout session

4. **DOOR.SYS** drop file
   - **NOT FOUND in express.e** but standard BBS door format
   - Required by many doors for compatibility
   - Must be generated before door execution

### User Database Files (Phase 2)
- `BBS:user.data` - Main user database
- `BBS:user.keys` - User keys/settings
- `BBS:user.misc` - Miscellaneous user data

### Node Working Directories (Phase 2)
- `BBS:Node0/` through `BBS:Node7/`
- Each contains: Playpen/, temp files, door data

### Additional Files (Phase 3+)
- Conference message tracking
- File transfer queues
- Voting/questionnaire data
- System statistics

## Implementation Strategy

### Approach 1: Hybrid (RECOMMENDED)
- Keep PostgreSQL for persistent data (users, messages, files)
- Write **runtime files** to disk for door compatibility
- Sync PostgreSQL → disk files on login/status changes
- Clean up temp files on logoff

**Advantages:**
- Maintains database benefits (queries, backups, multi-user)
- Provides file compatibility for doors
- Can generate files on-demand

**Disadvantages:**
- Must keep DB and files in sync
- Slightly more complex

### Approach 2: Full File-Based (NOT RECOMMENDED)
- Rewrite all storage to use files like original
- Abandon PostgreSQL completely

**Advantages:**
- 100% identical to original
- No sync issues

**Disadvantages:**
- Loses all database benefits
- Much harder to query/manage
- Worse scalability
- Major rewrite required

## Recommended Implementation Plan

### Phase 1: WHO Door Support (START HERE)
**Goal:** Get WHO door displaying user list

1. **Create NodeFileManager service**
   - `writeNodeUserFile(nodeId, user)` - Write `node{n}.user`
   - `writeNodeUserKeysFile(nodeId, userKeys)` - Write `node{n}.userkeys`
   - `deleteNodeFiles(nodeId)` - Clean up on logoff

2. **Update login flow**
   - After successful login, call `NodeFileManager.writeNodeUserFile()`
   - Write current user data to `BBS:node{nodeId}.user`

3. **Update door execution**
   - Before launching door, ensure node files exist
   - Update node status in files

4. **Test with WHO door**
   - WHO should now find `node0.user` and display "sysop"

### Phase 2: Full Door Support
- Implement DOOR.SYS drop file generation
- Implement DORINFOx.DEF
- Create Node{n}/ working directories
- Add CallersLog writing

### Phase 3: Complete File System
- Implement all remaining file types
- Full 1:1 compatibility

## File Format Notes

### Binary Struct Files
E language writes raw memory:
```e
Write(fh, loggedOnUser, SIZEOF user)
```

TypeScript equivalent:
```typescript
// Must match exact E struct layout!
const buffer = Buffer.alloc(sizeOfUserStruct);
// Write each field at correct offset
fs.writeFileSync(path, buffer);
```

**CRITICAL:** Must match exact byte layout of E structs. Need to:
1. Find axcommon.e struct definitions
2. Calculate exact sizes and offsets
3. Write fields in correct order with correct padding

## Next Steps

1. ✅ Analyze E sources for file writes (DONE by agent)
2. ⏳ Find user/userKeys struct definitions in axcommon.e
3. ⏳ Create NodeFileManager service
4. ⏳ Implement node{n}.user writing on login
5. ⏳ Test WHO door

## Files Created This Session
- `~/Code/amiexpress-web/web/backend/src/nodes/NodeStatusManager.ts` - In-memory node status (semaphores)
  - **NOTE:** This is NOT enough! Doors need DISK FILES, not just memory structures.

## Key Insight
WHO door doesn't use FindPort/FindSemaphore to access node data. It **reads binary files directly from disk**. We must write these files or WHO will never work.
