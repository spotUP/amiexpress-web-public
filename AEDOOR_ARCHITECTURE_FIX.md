# AEDoor.library Architecture Fix

**Date**: 2025-12-15
**Issue**: Incorrect trap-based TypeScript reimplementation
**Status**: CRITICAL - Requires immediate fix

---

## Executive Summary

The current AEDoor.library implementation uses a **trap-based approach** that intercepts library calls and reimplements them in TypeScript. This is **architecturally wrong**. The correct approach is to:

1. **Load the real AEDoor.library binary** (./Libs/AEDoor.library - 1128 bytes, AmigaOS binary from 1996)
2. **Execute the real 68K code** when doors call library functions
3. **Bridge message port I/O** between the emulated environment and Node.js BBS

---

## Current (INCORRECT) Architecture

```
Door → JSR to library → TRAP intercepted → TypeScript AEDoorLibrary.createComm()
                                                ↓
                                        XIMProtocol.handleMessage()
                                                ↓
                                            BBS Backend
```

**Problems:**
- Duplicates functionality that exists in the real binary
- TypeScript reimplements library functions (741+ lines of code)
- Must be kept in sync with real library behavior (impossible)
- Violates "use real library from disk" requirement

---

## Correct Architecture

```
Door → JSR to library → Real 68K code executes → PutMsg to AEDoorPort
                                                        ↓
                                                ExecLibrary.putMsg() intercepts
                                                        ↓
                                                XIMProtocol.handleMessage()
                                                        ↓
                                                  Reply via message port
                                                        ↓
                                        Door calls GetMsg → Real library returns
```

**Benefits:**
- Uses real, battle-tested Amiga library code
- No TypeScript reimplementation needed
- Guaranteed 100% compatibility with real AmiExpress
- Minimal bridging code (message port I/O only)

---

## Technical Details

### Real AEDoor.library Binary

- **Location**: `./Libs/AEDoor.library`
- **Size**: 1128 bytes
- **Format**: AmigaOS loadseg()able executable
- **Version**: AEDoorLib 2.7 (18 May 1996)
- **Dependencies**: dos.library
- **Contains**: Real 68K code for all library functions

### Disassembly Evidence

```m68k
0x000000e0  2f0d           move.l a5,-(a7)
0x000000e2  2a40           movea.l d0,a5
0x000000e4  2b4e0022       move.l a6,0x22(a5)
0x000000e8  2b48002a       move.l a0,0x2a(a5)
0x000000ec  43faff83       lea.l 0x71(pc),a1
0x000000f0  7000           moveq 0x0,d0
0x000000f2  4eaefdd8       jsr -0x228(a6)  ← Calls dos.library
```

The library contains actual implementation code that:
- Allocates memory
- Creates message ports
- Sends/receives messages via Exec
- Manages door interface structures

### Message Port Communication

The real library uses standard Amiga IPC:

1. **CreateComm()** in real library:
   - Allocates DoorInfo structure
   - Creates reply port for door
   - Calls FindPort("AEDoorPort{n}")
   - Sends registration message via PutMsg
   - Waits for reply via GetMsg

2. **WriteStr()** in real library:
   - Constructs XIM message in memory
   - Calls PutMsg to send to AEDoorPort
   - Waits for reply
   - Returns result

### Current TypeScript Traps (WRONG)

**File**: `web/backend/src/amiga-emulation/api/LibraryTraps.ts`

```typescript
const AEDOOR_VECTORS: LibraryVector[] = [
  {
    offset: -30, // LVO -30 (CreateComm)
    handler: (emu, lib: AEDoorLibrary) => {
      return lib.createComm(); // ← TypeScript reimplementation!
    },
  },
  // ... 18 more traps
];
```

This intercepts the CPU before it can execute the real code.

---

## Implementation Plan

### Phase 1: Prepare Real Library Loading

1. **Verify LibraryLoader works correctly** for AEDoor.library
   - Already has code to load Amiga HUNK format
   - Parse jump table from library base
   - Apply relocations correctly

2. **Load library at emulator startup**
   - Use ExecLibrary.loadRealAEDoorLibrary() (already exists)
   - Or use LibraryLoader.loadLibrary() (preferred)
   - Store library base address
   - Register in library list

### Phase 2: Remove Trap Interception

1. **Disable AEDoor traps** in LibraryTraps.ts
   - Comment out or remove AEDOOR_VECTORS
   - Let CPU execute real library code

2. **Keep Exec/DOS traps** (these are still needed)
   - PutMsg, GetMsg, WaitPort
   - FindPort, CreatePort, DeletePort
   - These bridge emulated Exec to TypeScript

### Phase 3: Bridge Message Port I/O

1. **ExecLibrary.putMsg()** (already exists, line 3279)
   - When door's library code calls PutMsg to AEDoorPort
   - Extract message from emulator memory
   - Parse as XIM message
   - Route to XIMProtocol.handleMessage()

2. **ExecLibrary.getMsg()** (already exists, line 1051)
   - When library code calls GetMsg on reply port
   - Check if BBS has sent reply message
   - Write message to emulator memory
   - Return message address to library

3. **Message Queue Management**
   - Track pending messages per port
   - Handle WaitPort blocking correctly
   - Signal task when message arrives

### Phase 4: Minimal AEDoorLibrary Class

The TypeScript AEDoorLibrary class should become MINIMAL:

```typescript
export class AEDoorLibrary {
  // NO createComm(), deleteComm(), writeStr(), etc.
  // Those are in the REAL library!

  // Only helpers for message port bridge:
  private parseXIMMessage(msgAddr: number): XIMMessage { }
  private createReplyMessage(command: number, data: any): number { }

  // Public interface is just for XIM protocol callbacks
  handleXIMCommand(command: number, data: any): Promise<any> { }
}
```

---

## Files to Modify

### High Priority

1. **web/backend/src/amiga-emulation/api/AEDoorLibrary.ts**
   - Remove all library function implementations (createComm, deleteComm, etc.)
   - Keep only message parsing/formatting helpers
   - Reduce from 815 lines to ~200 lines

2. **web/backend/src/amiga-emulation/api/LibraryTraps.ts**
   - Comment out AEDOOR_VECTORS array
   - Document why traps are disabled

3. **web/backend/src/amiga-emulation/api/ExecLibrary.ts**
   - Verify putMsg/getMsg intercepts work correctly
   - Add message queue per port
   - Handle AEDoorPort message routing

4. **web/backend/src/amiga-emulation/LibraryManager.ts**
   - Use LibraryLoader to load AEDoor.library properly
   - Don't use trap-based AEDoorLibrary class for library functions

### Medium Priority

5. **web/backend/src/amiga-emulation/loader/LibraryLoader.ts**
   - Verify HUNK parsing is correct for AEDoor.library
   - Test jump table extraction
   - Handle small libraries (1KB) correctly

6. **web/backend/src/amiga-emulation/XIMProtocol.ts**
   - Verify message handling works with real library
   - May need adjustments for message format

---

## Testing Plan

### Unit Tests

1. Load AEDoor.library with LibraryLoader
2. Verify jump table has 19 entries
3. Verify library base address is valid
4. Verify relocations applied correctly

### Integration Tests

1. Run simple XIM door (e.g., GetAnswer)
2. Verify CreateComm() executes real code
3. Verify WriteStr() sends XIM message
4. Verify message arrives at XIMProtocol
5. Verify reply gets back to door

### Regression Tests

1. Test all existing doors still work
2. Compare behavior with real AmiExpress
3. Verify no functionality lost

---

## Risks & Mitigation

### Risk: Real library doesn't work in emulator

**Likelihood**: Low - Library is simple, uses only basic Exec functions
**Mitigation**:
- Test with vamos first (known working)
- Disassemble to understand what it does
- Verify Exec function implementations

### Risk: Message format incompatibility

**Likelihood**: Medium - XIM protocol must match exactly
**Mitigation**:
- Study express.e message handling (lines 3379-3500)
- Capture real AmiExpress message traffic
- Byte-for-byte comparison

### Risk: Breaking existing doors

**Likelihood**: High initially - Major architecture change
**Mitigation**:
- Implement behind feature flag
- Test with simple doors first
- Keep trap-based fallback temporarily

---

## Success Criteria

1. ✅ Real AEDoor.library loads successfully
2. ✅ Door calls CreateComm → real code executes
3. ✅ PutMsg intercepted and routed to XIM
4. ✅ GetMsg returns BBS replies correctly
5. ✅ All XIM doors work identically to before
6. ✅ TypeScript AEDoorLibrary reduced to <200 lines
7. ✅ No traps for library functions (only Exec/DOS)

---

## Timeline

- **Phase 1**: 2 hours - Verify library loading
- **Phase 2**: 1 hour - Disable traps
- **Phase 3**: 4 hours - Message port bridge
- **Phase 4**: 2 hours - Cleanup AEDoorLibrary class
- **Testing**: 3 hours - Full integration testing

**Total**: ~12 hours of focused work

---

## References

- Real library: `./Libs/AEDoor.library`
- Original sources: `AmiExpress-Sources/express.e` (lines 3379-3500)
- LibraryLoader: `web/backend/src/amiga-emulation/loader/LibraryLoader.ts`
- XIM Protocol: `web/backend/src/amiga-emulation/XIMProtocol.ts`
- NDK Autodocs: Message Port System (exec.library)

---

## Next Steps

1. Review and approve this plan
2. Create feature branch: `fix/real-aedoor-library`
3. Implement Phase 1 (library loading)
4. Test with simple door
5. Proceed through phases incrementally
6. Merge when all tests pass

---

**Author**: Claude (AI Assistant)
**Reviewer**: TBD
**Status**: Awaiting approval to proceed
