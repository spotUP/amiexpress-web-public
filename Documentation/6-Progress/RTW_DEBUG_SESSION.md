# RTW Door Debugging Session

## Problem
RTW exits with code 30, showing "This is a XIM-DOOR for AmiExpress 3.x"

## Root Cause Analysis

### Step 1: Traced exit code 30 in disassembly
- RTW entry point at 0x1008
- Calls FindPort at 0x1006 (jsr -390(a6), which is LVO -390 = FindPort)
- If FindPort returns 0 (port NOT found): D7=1, continues
- If FindPort returns non-zero (port found): D7=0, exits with code 30

### Step 2: Initial hypothesis - searching for "AEServer"
- **WRONG**: RTW is NOT searching for "AEServer"
- Removed bare "AEServer" port creation in LibraryManager.ts line 411
- **Result**: Still exits with code 30

### Step 3: Check FindPort logs
- RTW searches for "AEDoorPort1" (not "AEServer")
- FindPort returns 0xa0200 (found the port)
- Port is created by LibraryManager.ts line 410: `this.execLibrary.createPublicPort(\`\${altBasePortName}\${amigaNodeId}\`);`

## Solution Attempts

### Attempt 1: Remove port pre-creation (WRONG)
Removed lines 410-415 - don't pre-create "AEDoorPort1" port
**Result**: RTW doesn't exit with code 30 anymore, but now stuck in infinite loop polling for port

### Attempt 2: Dynamic port creation on AEDoor.library open (CORRECT SOLUTION)
**Analysis**: Disassembled RTW startup sequence (0x1008-0x105c):
1. Check if "AEDoorPort1" exists (0x1006 FindPort) - expects NOT found
2. If port found → exit code 30 (duplicate instance)
3. If port NOT found → delay briefly, then open AEDoor.library (0x105c-0x1062)
4. Use port for communication (polling at 0x20d0+)

**Solution**: Create "AEDoorPort1" dynamically when RTW opens AEDoor.library
**File**: `~/Code/amiexpress-web/web/backend/src/amiga-emulation/api/ExecLibrary.ts`
**Lines**: 1749-1771
**Implementation**: Added hook in `openLibrary()` to create `AEDoorPort{nodeId}` when "aedoor.library" is opened
**Result**: Port doesn't exist during duplicate check, but appears when door needs it for IPC

## Changes Made

### Change 1: Removed bare port creation (LibraryManager.ts line 411)
**File**: `~/Code/amiexpress-web/web/backend/src/amiga-emulation/LibraryManager.ts`
**Line**: 411
**Before**: `this.execLibrary.createPublicPort(altBasePortName);`
**After**: Commented out with explanation
**Result**: Still failed - RTW searches for "AEDoorPort1" not bare "AEDoorPort"

### Change 2: Remove ALL alternate port pre-creation (lines 410-415)
**File**: `~/Code/amiexpress-web/web/backend/src/amiga-emulation/LibraryManager.ts`
**Lines**: 410-415
**Before**:
- Line 410: `this.execLibrary.createPublicPort(\`\${altBasePortName}\${amigaNodeId}\`);` → Created "AEDoorPort1"
- Line 411: `this.execLibrary.createPublicPort(altBasePortName);` → Created bare "AEDoorPort"
- Line 413-415: Created zero-based variant if nodeId differs

**After**: All removed, replaced with comments explaining doors create their own ports
**Reason**: RTW expects "AEDoorPort1" to NOT exist so it can create it during initialization
**Status**: ✓ COMPLETED

### Change 3: Dynamic AEDoorPort creation on library open
**File**: `~/Code/amiexpress-web/web/backend/src/amiga-emulation/api/ExecLibrary.ts`
**Lines**: 1749-1771 (inside `openLibrary()` method)
**Implementation**:
```typescript
if (name.toLowerCase() === "aedoor.library") {
  const nodeId = this.doorPortNodeId || 1;
  const portName = `AEDoorPort${nodeId}`;
  const existingPortAddr = this.findPortByName(portName);
  if (!existingPortAddr) {
    const portAddr = this.createPublicPort(portName);
    console.log(`Created ${portName} at 0x${portAddr.toString(16)} (dynamic XIM port creation)`);
  }
}
```
**Reason**: Create port AFTER duplicate-instance check but BEFORE door needs it for IPC
**Status**: ✓ COMPLETED - Ready for testing

### Change 4: Remove BBS-initiated INIT/STAT messages (CRITICAL FIX)
**File**: `~/Code/amiexpress-web/web/backend/src/amiga-emulation/session/DoorMessageHandler.ts`
**Lines**: 154-166 (in `sendStartupMessage()` method)
**Problem**: BBS was sending INIT (0) and STAT (1) messages to door at startup
**Real Amiga**: Door initiates with JH_REGISTER (cmd=1), BBS only responds
**Evidence**: Real Amiga logs show NO cmd=0 or STAT messages from BBS
**Fix**: Disabled `sendInitAndStatusMessages()`, door starts conversation
**Status**: ✓ COMPLETED

## Key Insights

### Real Amiga XIM Protocol (From Actual BBS Logs)
**Source**: See `Documentation/4-Door-Developers/REAL_AMIGA_XIM_SEQUENCES.md`

All real XIM doors follow this pattern:
1. **Door sends JH_REGISTER (cmd=1)** with reply port name (e.g., "AEDoorRP.000")
2. **Door makes requests** (DT_NAME, BB_MAINLINE, EXPRESS_VERSION, etc.)
3. **BBS responds** to each request
4. **Door outputs** with JH_SM (cmd=4)

**Critical**: BBS never sends INIT/STAT - door initiates ALL communication.

### Change 5: Fix BBSInfo Node ID at Offset 0xf (CRITICAL FIX)
**File**: `~/Code/amiexpress-web/web/backend/src/amiga-emulation/api/AEDoorLibrary.ts`
**Lines**: 300-304 (in `populateBBSInfo()` method)
**Problem**: RTW was searching for "AEDoorPort1" when running on Node 3
**Root Cause**: RTW reads node ID from BBSInfo+0xf (byte offset 15), but we weren't writing it
**Evidence**: Disassembly shows RTW at 0x111c: `move.b 0xf(a0), d0` - reads byte at offset 0xf
**Investigation**:
- Disassembled RTW: 0x1118 loads pointer from A4+0x450, then 0x111c reads offset 0xf
- A4+0x450 points to BBSInfo structure (returned by CreateComm)
- RTW uses this byte to format "AEDoorPort%d" port name
- Without this, RTW defaulted to node 1 (garbage data or zero-initialized memory + 1)
**Fix**: Write node ID byte to BBSInfo+0xf during populateBBSInfo()
```typescript
// CRITICAL: Write node ID to BBSInfo+0xf (RTW and other doors read this!)
const nodeId = this.resolveNodeId();
this.emulator.writeMemory(bbsInfoAddr + 0xf, nodeId); // Node ID as byte at +0xf
```
**Result**: RTW now correctly searches for "AEDoorPort3" when on Node 3
**Status**: ✓ COMPLETED - Ready for testing

### Timing is Critical
XIM doors like RTW have a 2-phase startup:
1. **Duplicate Instance Check**: FindPort("AEDoorPort1") - expects NOT found → exit code 30 if found
2. **Communication Setup**: Opens AEDoor.library, then expects port to exist for IPC

Solution: Create port dynamically between these phases (when library is opened).

### XIM Door Startup Sequence
```
0x1006: FindPort("AEDoorPort1")     # Duplicate check - expects NULL
0x100c: beq.b 0x1012                # If NULL → continue
0x1012: moveq #1, d7                # Set D7=1 (port not found flag)
... delay loops ...
0x105c-0x1062: OpenLibrary("AEDoor.library")  # Port created HERE
0x20d0+: FindPort("AEDoorPort1")    # Communication loop - expects port to exist
0x20d4+: WaitPort/GetMsg            # Wait for BBS messages
```
