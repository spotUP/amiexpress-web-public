# C Door Development Architecture Issues

**Date**: 2025-12-15
**Related**: AEDOOR_ARCHITECTURE_FIX.md
**Status**: CRITICAL - Same fundamental mistake as TypeScript implementation

---

## Problem Summary

The C door SDK in `dev/c-doors/` contains **stub implementations** of AmiExpress API functions. This is **architecturally wrong** for the same reason as the TypeScript AEDoor.library reimplementation.

---

## Current (INCORRECT) Approach

### File: `dev/c-doors/src/glue-amiga.c`

```c
/* AEDoor.library base - emulator loads it at 0xc0000 */
struct Library *AEDoorBase = (struct Library *)0xc0000;

/* Door API implementations - stubs for now */
VOID Register(int node)
{
    /* Stub - emulator handles initialization */
}

void sendmessage(char *text, int newline)
{
    /* Send message via XIM protocol using Jhmsg */
    if (!text) return;
    /* TODO: Implement proper message sending */
    /* Temporary: do nothing to avoid crashes */
}

void prompt(char *prompt_text, char *result, int max_len)
{
    /* Stub - copy a default response */
    if (result && max_len > 0) {
        result[0] = 't';
        result[1] = 'e';
        result[2] = 's';
        result[3] = 't';
        result[4] = '\0';
    }
}
```

**Problems:**
1. Hardcoded library base address (`0xc0000`)
2. Stub implementations that don't actually work
3. Comments say "emulator handles it" - this is wrong!
4. Duplicates functionality that's in the REAL AEDoor.library

---

## Correct Approach

C doors should call the **REAL AEDoor.library** via standard Amiga library calling convention:

```c
#include <exec/types.h>
#include <proto/exec.h>
#include "amiexpress.h"

struct Library *AEDoorBase = NULL;
struct ExecBase *SysBase = NULL;

int main(void) {
    SysBase = *(struct ExecBase **)4; /* AbsExecBase */

    /* Open AEDoor.library properly */
    AEDoorBase = OpenLibrary("AEDoor.library", 0);
    if (!AEDoorBase) {
        return 20; /* ERROR */
    }

    /* Call library functions - these execute in the REAL library */
    struct DoorInfo *di = CreateComm();  /* Calls LVO -30 */
    if (!di) {
        CloseLibrary(AEDoorBase);
        return 20;
    }

    WriteStr("Hello from C door!\n");  /* Calls LVO -42 */

    DeleteComm(di);  /* Calls LVO -36 */
    CloseLibrary(AEDoorBase);
    return 0;
}
```

**No stub implementations needed!** The real library does all the work.

---

## What Glue Layer SHOULD Contain

The glue layer should ONLY provide:

1. **C Runtime Startup Code**
   - `_start` entry point
   - Stack setup
   - BSS initialization
   - Calling `main()`

2. **Standard C Library Functions**
   - `printf()` → maps to WriteStr()
   - `malloc()`/`free()` → AllocMem()/FreeMem()
   - `strcpy()`, `strlen()`, etc. → inline implementations

3. **Amiga Library Calling Wrappers** (optional convenience)
   ```c
   /* Inline wrapper for WriteStr() */
   static inline void WriteStr(const char *str) {
       register struct Library *a6 asm("a6") = AEDoorBase;
       register const char *a0 asm("a0") = str;
       asm volatile (
           "jsr a6@(-42:w)"  /* LVO -42 */
           : /* no outputs */
           : "r"(a6), "r"(a0)
           : "d0", "d1", "a0", "a1", "memory"
       );
   }
   ```

**NEVER stub out the API functions!**

---

## Files That Need Fixing

### Delete or Rewrite

1. **dev/c-doors/src/glue-amiga.c** (311 lines)
   - Remove all stub API functions
   - Keep only C runtime startup
   - Add inline library call wrappers

2. **dev/c-doors/src/glue-stub.c** (868 lines)
   - Appears to be stubs for testing
   - Should be deleted or clearly marked as development-only

3. **dev/c-doors/src/glue.c** (813 lines)
   - Review - may have same stub issue

### Review and Fix

4. **dev/c-doors/includes/amiexpress.h**
   - Should declare function prototypes ONLY
   - Should NOT contain implementations
   - Should match real AEDoor.library interface

5. **dev/c-doors/templates/*.c**
   - Review all example doors
   - Ensure they call real library functions
   - Remove any stub implementations

---

## Impact on C Door Examples

### Current Examples (BROKEN)

Files in `dev/c-doors/doors/sdktest/`:
- `amiga-gcc-test.c`
- `amiga-test.c`
- `minimal.c`
- `simpletest.c`

These likely use the broken stub implementations and won't work correctly.

### Fix Required

1. Remove dependency on glue-amiga.c stubs
2. Use proper OpenLibrary() calls
3. Call real AEDoor.library functions
4. Test with real emulator

---

## Why This Matters

### Problem: Doors Don't Actually Work

Stub implementations like:
```c
void sendmessage(char *text, int newline) {
    /* Temporary: do nothing to avoid crashes */
}
```

Mean that C doors appear to run but produce no output!

### Correct Behavior

When a C door calls `WriteStr("Hello")`:
1. CPU jumps to LVO -42 in real AEDoor.library
2. Real library code constructs XIM message
3. Real library calls PutMsg to AEDoorPort
4. ExecLibrary intercepts PutMsg
5. Message routed to XIMProtocol
6. Output appears on BBS terminal

**No stubs needed!** The emulator handles the message passing.

---

## Relationship to TypeScript Issue

Both issues stem from the same misconception:

**WRONG**: "We need to implement the library functions ourselves"
**RIGHT**: "We need to use the REAL library and bridge the I/O"

### TypeScript Version
- Reimplements library in TypeScript
- Uses traps to intercept calls
- Duplicates real library code

### C Version
- Reimplements library in C stubs
- Hardcodes library base
- Duplicates real library code

### Both Are Wrong!

The real AEDoor.library should do ALL the work.

---

## Action Items

1. ✅ Delete stub implementations from glue-*.c files
2. ✅ Create proper C runtime startup code
3. ✅ Add inline library call wrappers (optional)
4. ✅ Fix example doors to use real library
5. ✅ Test with emulator
6. ✅ Document correct C door development

---

## References

- Main fix: `AEDOOR_ARCHITECTURE_FIX.md`
- Real library: `./Libs/AEDoor.library`
- NDK docs: Library calling conventions
- vbcc docs: Amiga development

---

**Conclusion**: The C door development infrastructure has the same fundamental flaw as the TypeScript implementation. Both need to be fixed to use the REAL AEDoor.library instead of reimplementing it.
