# BBSInfo Final Fix Plan - 2025-12-16

## Root Cause Analysis

The diagnostic door shows garbage for user data queries:
- `getname() = " "` (single space)
- `getlocation() = "\`"` (backtick = 0x60)
- `getbbsname() = ""` (empty)
- `GetTheDate() = "\`"` (backtick = 0x60)
- `GetTheTime() = ""` (empty)

### Why This Happens

1. **Real Library Execution**: The real AEDoor.library binary executes (not TypeScript implementations)
2. **Memory-Based Data**: Library functions (GetUserName, CopyLocationString) read from MEMORY, not XIM messages
3. **Pointer Problem**: Library reads from pointers at DoorInfo+0x1c and +0x20
4. **Initialization Order**:
   - Door calls Register() → Library's CreateComm() runs
   - CreateComm() allocates DoorInfo and sets up pointers
   - We call populateDoorInfoStructs() AFTER CreateComm
   - But the pointers still point to library's own (uninitialized) buffers!

### The Actual Problem

The library's CreateComm() at address 0x0170 (from disassembly) does:
1. Allocates DIFace structure
2. Sets up BBSInfo at DIFace+0x46
3. Copies CLI name to BBSInfo+0x14
4. Sets DoorInfo+0x20 → BBSInfo+0x14 (user name pointer)
5. Sets DoorInfo+0x1c → BBSInfo+0xdc (location pointer)

But the CLI name buffer and location buffer are NOT being populated with actual user data!

## Solution Approaches

### Approach 1: Populate AFTER Library Init (RECOMMENDED)
Hook the Register/CreateComm flow to inject user data AFTER library initializes:
1. Library calls CreateComm()
2. CreateComm() sets up pointers
3. Intercept AFTER CreateComm completes
4. Write user data to the addresses pointed to by DoorInfo+0x1c and +0x20

### Approach 2: Hook Library Functions
Intercept GetUserName/CopyLocationString and return data directly:
- Trap LVO -78 (GetUserName)
- Trap LVO -126 (CopyLocationString)
- Return user data instead of reading from memory

### Approach 3: Patch Library Binary (NOT RECOMMENDED)
Modify the AEDoor.library binary to call our handler - too fragile.

## Implementation Plan

### Step 1: Add Post-Register Hook
After JH_REGISTER completes, populate the BBSInfo data at the correct addresses:

```typescript
// In XIMProtocol.ts or DoorMessageHandler.ts
private handleRegisterComplete(difaceAddr: number) {
  console.log('[BBSInfo] Post-register population...');

  // Read the pointers the library set up
  const userPtr = this.emulator.readMemory32(difaceAddr + 0x20);
  const locPtr = this.emulator.readMemory32(difaceAddr + 0x1c);

  console.log(`[BBSInfo] User pointer: 0x${userPtr.toString(16)}`);
  console.log(`[BBSInfo] Location pointer: 0x${locPtr.toString(16)}`);

  // Write actual user data to those addresses
  const username = this.bbsSession?.user?.username || 'Guest';
  const location = this.bbsSession?.user?.location || 'Unknown';

  this.writeCString(userPtr, username, 198);
  this.writeCString(locPtr, location, 60);

  // Also populate other BBSInfo fields
  const bbsInfoAddr = difaceAddr + 0x46;
  this.writeCString(bbsInfoAddr + 0x120, 'AmiExpress-Web', 40);
  this.writeCString(bbsInfoAddr + 0x150, this.getFormattedDate(), 19);
  this.writeCString(bbsInfoAddr + 0x170, this.getFormattedTime(), 19);

  console.log(`[BBSInfo] Populated: user="${username}", loc="${location}"`);
}
```

### Step 2: Call Hook at Right Time
In XIMProtocol message handling, after JH_REGISTER:

```typescript
case XIMCommand.JH_REGISTER:
  // ... existing register handling ...

  // NEW: Populate BBSInfo AFTER register completes
  this.handleRegisterComplete(msg.msgAddr);
  break;
```

### Step 3: Add Debug Verification
Read back the data to verify it was written correctly:

```typescript
// Read back verification
const verifyUser = this.readCString(userPtr, 198);
const verifyLoc = this.readCString(locPtr, 60);
console.log(`[BBSInfo] Verify: user="${verifyUser}", loc="${verifyLoc}"`);
```

## Testing

After implementing:
1. Restart backend server
2. Run DIAGNOSTIC command
3. Check output for correct user data
4. Verify backend logs show BBSInfo population

Expected output:
```
[DEBUG] getname() = sysop
[DEBUG] getlocation() = Server Room
[DEBUG] getbbsname() = AmiExpress-Web
[DEBUG] GetTheDate() = 12/16/2025
[DEBUG] GetTheTime() = HH:MM:SS
```

## Files to Modify

1. `/web/backend/src/amiga-emulation/xim/io.ts` - Add post-register hook
2. `/web/backend/src/amiga-emulation/session/door-info.util.ts` - Update comments
3. Test with diagnostic door

## Status

- [ ] Implement post-register hook
- [ ] Test with diagnostic door
- [ ] Verify all user data queries return correct values
- [ ] Document final solution

---

**Date**: 2025-12-16
**Issue**: BBSInfo user data showing garbage in doors
**Solution**: Populate BBSInfo AFTER library initialization, using library-set pointers
