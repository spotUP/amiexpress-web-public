# CRITICAL DISCOVERY: AEDoor.library Usage

**Date:** 2025-11-01  
**Status:** 🔴 CRITICAL - Paradigm Shift Required

---

## The Discovery

After analyzing door source code, we discovered that **proper AmiExpress doors use AEDoor.library**, not direct XIM message passing!

### What We Were Doing Wrong

**Our Current Implementation:**
- GetAnswer door uses direct exec.library PutMsg/GetMsg
- Door manually constructs jhMessage structures  
- Door sends messages directly to AEDoorPort
- This is LOW-LEVEL protocol access

**What Doors Should Actually Do:**
- Open AEDoor.library
- Call CreateComm() to establish communication
- Use high-level library functions (WriteStr, Prompt, GetStr, etc.)
- Call DeleteComm() to clean up
- Close library and return

---

## Evidence from Source Code

### Assembly Example (Example.s)

```asm
Start:
	move.l	$4.w,a6
	lea	_AEDoorLib(PC),a1
	jsr	_LVOOpenLibrary(a6)        ; Open AEDoor.library
	move.l	d0,_AEDBase
	
	move.l	_AEDBase(PC),a6
	jsr	_LVOCreateComm(a6)          ; Establish communication
	move.l	d0,_DIF                    ; Save interface handle
	
	lea	MyString(PC),a0
	moveq	#NOLF,d1
	move.l	_DIF(PC),a1
	jsr	_LVOWriteStr(a6)            ; Write to terminal
	
	move.l	#JH_SYSOP,d0
	jsr	_LVOSendCmd(a6)             ; Get sysop name
	
	move.l	_DIF(PC),a1
	jsr	_LVODeleteComm(a6)          ; Clean up
	
	move.l	a6,a1
	move.l	$4.w,a6
	jsr	_LVOCloseLibrary(a6)        ; Close library
	
	moveq	#0,d0
	rts                                ; Return cleanly!
```

**Notice:** The door returns via RTS and expects it to work!

### E Language Example (example.e)

```e
PROC main()
  IF aedoorbase:=OpenLibrary('AEDoor.library',1)
    diface:=CreateComm(arg[])           /* Establish Link */
    strfield:=GetString(diface)         /* Get string buffer pointer */
    
    GetDT(diface,DT_NAME,0)             /* Get user name */
    WriteStr(diface,'User name : ',NOLF)
    WriteStr(diface,usern,LF)
    
    Prompt(diface,80,'\nGimme some input: ')
    
    DeleteComm(diface)                  /* Close Link */
    CloseLibrary(aedoorbase)
  ENDIF
ENDPROC                                 /* Returns cleanly! */
```

---

## AEDoor.library Functions

From the source code and includes, doors expect these functions:

### Communication Setup
- **CreateComm(nodeNumber)** - Initialize door interface, returns DIF handle
- **DeleteComm(DIF)** - Clean up and close communication
- **GetString(DIF)** - Get pointer to shared string buffer

### Output Functions
- **WriteStr(DIF, string, flags)** - Write text to terminal
  - NOLF = no line feed
  - LF = add line feed
- **SendCmd(DIF, command)** - Send XIM command
- **Write(DIF, data)** - Write raw data

### Input Functions
- **Prompt(DIF, maxlen, prompt)** - Display prompt and get line input
- **GetStr(DIF, maxlen, default)** - Get string with default value
- **GetKey(DIF)** - Get single key
- **HotKey(DIF, validkeys)** - Wait for specific key

### Data Functions
- **GetDT(DIF, type, param)** - Get BBS data (user name, location, etc.)
- **ShowFile(DIF, filename)** - Display DOS file
- **ShowGFile(DIF, filename)** - Display /X (compressed) file

---

## Why GetAnswer Crashes

**GetAnswer** appears to be using LOW-LEVEL XIM protocol:
1. It manually calls FindPort() to get AEDoorPort
2. It manually creates jhMessage structures
3. It manually calls PutMsg/GetMsg
4. It doesn't use AEDoor.library at all

**Result:** After sending a few messages, it has no clean way to exit. The stack gets corrupted because it's not following the proper CreateComm/DeleteComm lifecycle.

**A proper door would:**
1. Open AEDoor.library
2. Call CreateComm()
3. Use WriteStr() instead of manual PutMsg
4. Call DeleteComm()
5. Close library
6. RTS returns cleanly

---

## What We Need to Implement

### 1. AEDoor.library Implementation

We need to create a full AEDoor.library implementation in TypeScript that provides these high-level functions. The library would:

**Location:** `web/backend/src/amiga-emulation/api/AEDoorLibrary.ts`

**Current Status:** We have a STUB implementation with some functions

**What's Missing:**
- CreateComm() - needs full implementation
- DeleteComm() - needs full implementation  
- Proper DIF (Door Interface) structure
- All the input/output wrapper functions

### 2. Library Trap Registration

**Location:** `web/backend/src/amiga-emulation/api/LibraryTraps.ts`

**Current Status:** We have AEDOOR_VECTORS array with some functions

**What's Needed:**
- Verify all AEDoor.library offsets match the real library
- Ensure all functions are trapped and routed correctly

### 3. Test with Proper Doors

Instead of GetAnswer (which uses low-level protocol), we should test with:
- **Example.s** (if we can compile it)
- Any door that uses AEDoor.library properly

---

## The Good News

**Most of our work is still valid!**

- exec.library implementation ✅
- dos.library implementation ✅
- XIM protocol implementation ✅  
- Message passing ✅
- All the foundation is there ✅

**What changes:**
- AEDoor.library becomes the PRIMARY interface
- Doors call library functions, not direct PutMsg/GetMsg
- Library functions internally use our XIM protocol
- Much cleaner architecture!

---

## Recommended Next Steps

### Option 1: Complete AEDoor.library Implementation (BEST)

1. Read AEDoor.library documentation in `/doors/archives/wot-ad14/AmiX/doordocs`
2. Study the include files (aedoor.h, aedoor.i)
3. Implement all AEDoor.library functions properly
4. Test with Example.s source (compile it first)
5. Doors should now work perfectly with clean exit

**Pros:**
- Proper architecture  
- Doors will work correctly
- Clean exit via RTS
- Matches real AmiExpress

**Cons:**
- Need to implement ~20 library functions
- Requires compiling test doors

### Option 2: Fix GetAnswer to Use AEDoor.library

If GetAnswer is supposed to use AEDoor.library but isn't, we could:
1. Patch GetAnswer to call library functions
2. Or find a version that does use the library

**Pros:**
- Keeps working with GetAnswer

**Cons:**
- Still requires full AEDoor.library implementation

---

## Critical Files to Review

1. **AEDoor.library documentation:**
   - `/doors/archives/wot-ad14/AmiX/doordoors`
   - `/doors/archives/wot-ad14/Docs/ReadME!`

2. **Include files:**
   - `/doors/archives/wot-ad14/AmiX/AEDoor.i` - Assembly definitions
   - `/doors/archives/wot-ad14/SAS_C/Include/libraries/aedoor.h` - C definitions
   - `/doors/archives/wot-ad14/Amiga_E/Modules/aedoor.m` - E definitions

3. **Example source:**
   - `/doors/archives/wot-ad14/Assembler/Example.s`
   - `/doors/archives/wot-ad14/Amiga_E/Sources/example.e`
   - `/doors/archives/wot-ad14/SAS_C/Examples/Simple/simple.c`

4. **Our implementation:**
   - `web/backend/src/amiga-emulation/api/AEDoorLibrary.ts` - NEEDS COMPLETION
   - `web/backend/src/amiga-emulation/api/LibraryTraps.ts` - AEDOOR_VECTORS

---

## Conclusion

This discovery explains everything:

**Why GetAnswer crashes:** It's using low-level protocol without proper lifecycle

**Why doors should work:** With proper AEDoor.library, they'll follow CreateComm/DeleteComm pattern

**What we need to do:** Complete the AEDoor.library implementation

**The fix:** Implement AEDoor.library functions, test with proper example doors

This is actually GREAT news - it means there's a clear path forward with well-defined requirements!

---

**Status:** Ready to implement proper AEDoor.library  
**Priority:** HIGH - This unblocks all door functionality  
**Complexity:** Medium - Well documented, clear requirements  
**Impact:** HUGE - All doors will work correctly
