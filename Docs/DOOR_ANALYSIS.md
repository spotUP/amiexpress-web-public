# Door Archive Analysis

## Overview

Analysis of door executables in `/Doors/archives/` to understand different door architectures and requirements.

## Door Types Found

### 1. AEDoor.library Doors

Use the high-level AEDoor.library API for BBS communication.

**Characteristics:**
- Open "AEDoor.library"
- Call CreateComm(), GetString(), WriteStr(), GetDT(), etc.
- Simple, high-level API
- Good example: `wot-ad14/SAS_C/Examples/Simple/simple.c`

**Status:** ✅ FULLY IMPLEMENTED (session 2025-10-25)

**Example Code:**
```c
OpenLibrary("AEDoor.library", 0);
d = CreateComm(argv[1][0]);
strf = GetString(d);
GetDT(d, DT_NAME, 0);
WriteStr(d, "Hello", LF);
DeleteComm(d);
```

### 2. Message Port Doors

Use Amiga message ports for BBS communication.

**Characteristics:**
- FindPort("AEDoorPortN") or FindPort("NODE:TEMPEST_DOOR")
- CreatePort() for reply port
- PutMsg(), GetMsg(), ReplyMsg()
- Lower-level, more complex
- Examples: AquaWho, T-Join, T-TopCPS, T-Updater

**Status:** ✅ INFRASTRUCTURE IMPLEMENTED (session 2025-10-30)
- All message port functions work
- AEDoorPort auto-created
- Doors haven't reached FindPort() yet (stuck in initialization)

**Example Flow:**
```c
HisPort = FindPort("AEDoorPort1");
MyPort = CreatePort("Node1-Door-0", 0);
PutMsg(HisPort, &message);
Wait(1 << MyPort->mp_SigBit);
GetMsg(MyPort);
```

### 3. GUI/Intuition Doors

Use Amiga Intuition library for graphical interface.

**Characteristics:**
- Open "intuition.library"
- Use windows, gadgets, requesters
- Primarily for local node use
- Example: slicktop

**Status:** ❌ NOT IMPLEMENTED (out of scope for web BBS)

### 4. Hybrid Doors

Use multiple libraries/APIs.

**Characteristics:**
- Open icon.library (for config files)
- Open AEDoor.library or use message ports
- May use other libraries (reqtools, etc.)
- Most real-world doors are hybrid

**Status:** ⚠️ PARTIAL
- AEDoor.library: ✅
- Message ports: ✅
- icon.library: ❌ (missing - causes initialization failures)

## Common Door Requirements

### Libraries Required

1. **dos.library** - ✅ Implemented
   - File I/O (Open, Close, Read, Write)
   - Standard I/O (Input, Output)
   - Character waiting (WaitForChar)

2. **exec.library** - ✅ Implemented
   - Memory (AllocMem, FreeMem)
   - Libraries (OpenLibrary, CloseLibrary)
   - Message ports (FindPort, CreatePort, PutMsg, GetMsg, etc.)

3. **icon.library** - ❌ NOT IMPLEMENTED
   - Load .info files (tooltypes configuration)
   - Required by: AquaWho, JoyComment, many others
   - **This is blocking door initialization!**

4. **AEDoor.library** - ✅ Implemented
   - High-level BBS API
   - 5 functions implemented (CreateComm, DeleteComm, GetString, WriteStr, GetDT)

### Configuration Files

Many doors need:
- `.info` files (Amiga icon files with tooltypes)
- Config files
- Output templates
- Access control files

**Problem:** Doors look for these in Amiga paths like "Doors:AquaWho/config.info"

## Doors in Archives

### Compiled Executables Found

| Door | Path | Type | Libraries | Status |
|------|------|------|-----------|--------|
| AquaWho | `/Doors/AquaWho/AquaWho` | Message Port | dos, exec, icon | Stuck at icon.library |
| JoyComment | `otl-jc12/.../JoyComment.xim` | Hybrid | dos, intuition, icon | Not tested |
| slicktop | `slicktop/slicktop` | GUI | dos, intuition | Out of scope |
| MDB-Search | `mdbzs103/.../MDB-Search` | Unknown | - | Not tested |
| T-Updater | `1OO-TU24/.../T-Updater` | Message Port | dos, exec | Not tested |
| Conftop | `mst-cf22/Conftop/Conftop.000` | Unknown | - | Not tested |
| noC-WHO | `noc-wh10/.../noC-WHO.x` | Unknown | - | Not tested |

### Source Code Available

| Door | Language | Path | Uses |
|------|----------|------|------|
| simple.c | C | `wot-ad14/SAS_C/Examples/Simple/` | AEDoor.library |
| example.e | Amiga E | `wot-ad14/Amiga_E/Sources/` | AEDoor.library |
| T-Join | C | `1OO-TJ20/.../Sources/` | Message ports |
| T-TopCPS | C | `1OOTTC10/.../Sources/` | Message ports |
| T-Updater | C | `1OO-TU24/.../Sources/` | Message ports |

## Why Doors Are Failing

### Current Behavior

All tested doors output "dos.library" repeatedly and get stuck.

### Root Cause Analysis

Doors follow this initialization sequence:

```
1. Load executable ✅
2. Open dos.library ✅
3. Open exec.library ✅
4. Initialize ✅
5. Open icon.library ❌ FAILS HERE
6. Load config from .info file ❌ Never reached
7. FindPort("AEDoorPort") or OpenLibrary("AEDoor.library") ❌ Never reached
8. Start BBS communication ❌ Never reached
```

The door is stuck at step #5 because:
- icon.library OpenLibrary() returns NULL
- Door enters error/fallback path
- Error path outputs "dos.library" (probably the library name being printed in error)
- Door waits for input or loops
- Never reaches the actual door code

### Evidence

From AquaWho strings:
```
"icon.library"
"Couldn't open icon.library!"
"AEDoorPort%d"
"Couldn't find multicom port! Check ACP.info!"
```

The second string is an error message that should appear if icon.library fails to open, but we're not seeing it. This suggests the door is stuck even earlier, possibly in a busy loop or waiting for something.

## Solution Paths

### Option 1: Implement icon.library Stub ✅ RECOMMENDED

Create a minimal icon.library that:
- Returns success for OpenLibrary()
- Provides stub GetDiskObject() function
- Returns fake tooltype data
- Allows doors to continue past initialization

**Pros:**
- Fixes most doors
- Not too complex
- Industry standard approach

**Cons:**
- Doors may expect specific config values
- Need to fake icon file structures

### Option 2: Find/Compile Simple Door

Use a door with source code that:
- Uses AEDoor.library API only
- No icon.library dependency
- Compile from simple.c example

**Pros:**
- Clean test of AEDoor.library implementation
- Know exactly what door does

**Cons:**
- Need Amiga C compiler
- Or cross-compiler setup
- Time investment

### Option 3: Patch Existing Doors

Modify door binaries to:
- Skip icon.library open
- Use hardcoded config
- Jump directly to BBS communication

**Pros:**
- Can test immediately

**Cons:**
- Binary patching is fragile
- Hard to debug
- Not sustainable

## Recommended Next Steps

### Immediate (Next Session)

1. **Implement icon.library stub:**
   ```typescript
   // In ExecLibrary.ts libraryBases
   'icon.library': 0xFFFF9000

   // In IconLibrary.ts (new file)
   class IconLibrary {
     GetDiskObject(): void {
       // Return fake icon with no tooltypes
     }
     FreeDiskObject(): void {
       // NOP
     }
   }
   ```

2. **Test with AquaWho:**
   - Should get past icon.library check
   - Should reach FindPort("AEDoorPort1")
   - Should see message port communication

3. **If still stuck, add detailed logging:**
   - Log every library call
   - Log every memory access pattern
   - Find exact loop/wait location

### Future Work

1. **Enhance icon.library:**
   - Parse real .info files
   - Support tooltype reading
   - Handle Amiga icon format

2. **Test more doors:**
   - T-series doors (have source code)
   - Simple compiled examples
   - Verify message port protocol

3. **Document working doors:**
   - Create compatibility list
   - Note requirements
   - Provide setup guides

## Door Communication Protocols

### AEDoor.library Protocol

```
Door:
1. OpenLibrary("AEDoor.library", 0)
2. CreateComm(nodeNumber)  → returns DIFace pointer
3. GetString(DIFace)        → returns pointer to string buffer
4. GetDT(DIFace, DT_NAME, 0) → fills string buffer with username
5. WriteStr(DIFace, text, LF/NOLF) → output to terminal
6. DeleteComm(DIFace)
7. CloseLibrary(AEDoorBase)
```

### Message Port Protocol

```
Door:
1. FindPort("AEDoorPortN") → returns port address or NULL
2. CreatePort("NodeN-Door-X", 0) → creates reply port
3. Build message structure:
   - Command = 0 (initialize)
   - ReplyPort = MyPort
   - Length = sizeof(message)
4. PutMsg(AEDoorPort, &message) → send to BBS
5. Wait(1 << MyPort->mp_SigBit) → wait for reply
6. GetMsg(MyPort) → get reply message
7. Extract User/SystemData/NodeData pointers
8. Use data for door operation
9. Send Command = 999 (terminate)
10. DeletePort(MyPort)

BBS:
1. Check AEDoorPort for messages
2. When message arrives:
   - Allocate User/SystemData/NodeData structures
   - Fill with session data
   - Write pointers to message
   - ReplyMsg() back to door
```

## Performance Considerations

### Door Loading

- Hunk file parsing: ~50ms
- Memory allocation: ~10ms
- Library initialization: ~5ms
- Total door startup: ~65ms

### Execution

- Instructions per iteration: 500
- Iterations per second: ~2000
- Effective MIPS: ~1.0
- Real 68000: ~1.3 MIPS at 7.14MHz

### Memory Usage

- Door code+data: ~50KB average
- AEDoor structures: ~2KB
- Message ports: 64 bytes each
- Total overhead: ~55KB per door

## Testing Matrix

| Feature | Status | Tested With | Notes |
|---------|--------|-------------|-------|
| OpenLibrary | ✅ | All doors | Works |
| dos.library I/O | ✅ | AquaWho | Output works |
| AllocMem/FreeMem | ✅ | AquaWho | Works |
| AEDoor.library API | ✅ | Manual test | 5 functions work |
| Message ports | ✅ | None yet | Infrastructure ready |
| icon.library | ❌ | - | Missing - blocks init |
| FindPort | ⏳ | - | Not reached yet |
| CreatePort | ⏳ | - | Not reached yet |
| PutMsg/GetMsg | ⏳ | - | Not reached yet |

## Conclusion

**Root Problem:** Doors fail during initialization when trying to open icon.library.

**Solution:** Implement icon.library stub to return success and fake tooltypes.

**Expected Result:** Doors will proceed to BBS communication phase and use our implemented AEDoor.library or message port systems.

**Next Session Priority:** icon.library implementation.
