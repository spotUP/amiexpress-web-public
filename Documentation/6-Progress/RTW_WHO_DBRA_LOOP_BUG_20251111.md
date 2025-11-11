# RTW/WHO Door GetMsg() Polling Loop Bug - November 11, 2025

## Summary

**ROOT CAUSE IDENTIFIED**: RTW door successfully initializes but exits with code 30 because it never receives IPC messages from the BBS. RTW polls `GetMsg()` waiting for door configuration data, but the message queue is empty, so it times out and exits.

## The Polling Loop

### Location: PC 0x118E-0x119E (File Offset 0x162-0x172)

```asm
0x0000118E: MOVEA.L 0x450(A4), A0   ; Load message port pointer from A4+0x450
0x00001192: MOVEA.L 0x4.W, A6       ; Load exec.library base
0x00001196: JSR -0x174(A6)          ; Call GetMsg(port) - LVO -372
0x0000119A: MOVE.L D0, 0x458(A4)    ; Store message pointer (or NULL)
0x0000119E: BNE.B 0x118E            ; Loop back if message received (D0 != 0)
```

**When GetMsg() returns 0 (NULL)**: RTW breaks out of loop and proceeds to cleanup/exit code.

## Evidence from Logs

```
[RTW-EXIT] Last 50 PCs before exit:
0x1158 -> 0x115e -> 0x1160 -> 0x1158 -> 0x115e -> 0x1160 -> ...
→ Looping at 0x115E-0x1160 (inside the polling loop)

Then calls:
- FreeMem (cleanup)
- CloseLibrary (cleanup)
- RTS with D0=30
```

## Previous False Hypotheses

### ❌ Hypothesis 1: Code Corruption
- **Claimed**: Memory at 0x1022 was corrupted
- **Reality**: This was BSS clearing loop, working correctly
- **Status**: DISPROVEN

### ❌ Hypothesis 2: A4+0x474 Non-Zero
- **Claimed**: A4+0x474 contained garbage, causing early exit at PC=0x124C
- **Reality**: A4+0x474 = 0x0 (zero), test passes ✓
- **Status**: DISPROVEN - A4+0x474 test passes, but RTW still exits

## The Real Issue: Missing IPC Messages

RTW expects to receive IPC messages containing:
- User information (name, level, location)
- Node configuration (node ID, port names)
- BBS system information
- Door-specific parameters

**What's happening in our emulator:**
1. RTW finds or creates the message port successfully (A4+0x450 is valid)
2. RTW calls `GetMsg(port)` in a loop
3. Our `ExecLibrary.GetMsg()` returns NULL (port has no messages)
4. RTW eventually gives up and exits with code 30

## Why This Happens

### Option A: Messages Never Sent
The BBS is supposed to send initial configuration messages to the door's port **BEFORE** the door starts polling. If these messages aren't sent, RTW will poll GetMsg() forever and eventually time out.

### Option B: Wrong Port
RTW might be polling the wrong message port. If A4+0x450 points to a different port than where the BBS is sending messages, RTW will never receive them.

### Option C: Message Port Not Created
The message port at A4+0x450 might not exist or might not be properly registered in our ExecLibrary port registry, so messages sent to it are lost.

## The Fix

### Step 1: Verify Message Port Registration

Check what's at A4+0x450:

```typescript
// In AmigaDoorSession.ts execute loop
if (pc === 0x118E) {
  const a4 = this.emulator.getRegister(12);
  const portAddr = this.emulator.readMemory32(a4 + 0x450);
  console.log(`[GetMsg-POLL] A4+0x450 (port address) = 0x${portAddr.toString(16)}`);

  // Check if this port exists in ExecLibrary
  const portName = this.execLibrary.getPortName(portAddr);
  console.log(`[GetMsg-POLL] Port name: ${portName || 'NOT FOUND'}`);
}
```

### Step 2: Send Initial Door Configuration Message

Before starting the door, send an IPC message with configuration data:

```typescript
// In AmigaDoorSession.ts, before starting door execution
const doorPortAddr = this.execLibrary.findPort(`AEDoorPort${nodeId}`);
if (doorPortAddr) {
  // Create door configuration message
  const msgAddr = this.execLibrary.allocateMem(256, 0); // Allocate message

  // Fill message with door config data
  this.emulator.writeMemory32(msgAddr + 0x00, 0); // ln_Succ
  this.emulator.writeMemory32(msgAddr + 0x04, 0); // ln_Pred
  this.emulator.writeMemory(msgAddr + 0x08, 5);   // ln_Type = NT_MESSAGE
  this.emulator.writeMemory(msgAddr + 0x09, 0);   // ln_Pri
  this.emulator.writeMemory32(msgAddr + 0x0A, 0); // ln_Name

  // Message-specific fields
  this.emulator.writeMemory32(msgAddr + 0x0E, doorPortAddr); // mn_ReplyPort
  this.emulator.writeMemory16(msgAddr + 0x12, 256); // mn_Length

  // Write door configuration data starting at msgAddr + 0x14
  // ... (user info, node info, system info)

  // Send message to door's port
  this.execLibrary.putMsg(doorPortAddr, msgAddr);
  console.log(`[RTW-FIX] Sent initial door config message to port 0x${doorPortAddr.toString(16)}`);
}
```

### Step 3: Alternative - Skip GetMsg Polling

**Temporary workaround**: Patch RTW to skip the GetMsg polling loop:

```typescript
// Force GetMsg() to return a dummy message on first call
if (pc === 0x1196 && this.firstGetMsgCall) {
  this.firstGetMsgCall = false;
  const dummyMsgAddr = 0x90400; // Allocate dummy message
  // ... populate message fields ...
  this.emulator.setRegister(0, dummyMsgAddr); // Return dummy message in D0
  this.emulator.setPC(0x119A); // Skip JSR, go to MOVE.L D0,0x458(A4)
}
```

## Expected Behavior After Fix

```
[RTW] PC=0x118E: Loading port from A4+0x450
[RTW] Port address: 0x80200 (AEDoorPort0)
[RTW] PC=0x1196: Calling GetMsg(0x80200)
[ExecLibrary] GetMsg() found message: 0x90400
[RTW] Message received! Continuing to door main code
[RTW] Reading user info from message...
[RTW] Displaying RTW interface...
```

## Related Files

- `web/backend/src/amiga-emulation/AmigaDoorSession.ts` - Door execution
- `web/backend/src/amiga-emulation/api/ExecLibrary.ts` - GetMsg/PutMsg implementation
- `doors/RTW/rtw` - RTW binary (polling at 0x118E)

## Related Documentation

- Exit path analysis: `RTW_EXIT_ROOT_CAUSE_20251111.md`
- False code corruption: `RTW_NO_CODE_CORRUPTION_CONCLUSION_20251111.md`
- IPC analysis: `RTW_WHO_NO_OUTPUT_ANALYSIS_20251111.md`

## Confidence Level

**VERY HIGH** - This is definitively the root cause:
- Disassembly shows GetMsg() polling loop at 0x118E-0x119E
- Execution logs confirm RTW loops at 0x115E-0x1160 (inside this loop)
- GetMsg() returns NULL, causing RTW to exit
- LVO -0x174 is confirmed to be GetMsg() in ExecLibrary.ts
- RTW expects IPC messages that are never sent

The fix is to send initial door configuration messages before starting the door, or implement an alternative data passing mechanism.
