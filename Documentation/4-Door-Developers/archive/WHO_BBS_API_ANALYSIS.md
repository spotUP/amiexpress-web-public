# WHO Door BBS API Analysis

**Date:** 2025-12-02
**Purpose:** Document WHO door's use of 0x790 BBS API calling convention

---

## WHO Door Purpose

WHO is a user list display door that shows currently connected users/nodes.
- Version: 2.0
- Author: SPY/MST
- Type: "/X DooR" (designed for AmiExpress /X)

**Strings found:**
```
WHO VERSION 2.0 BY SPY/MST
doors:WHO/WHO
Do_not_show_Node.%d
User
[32mUser (ANSI color code)
```

---

## BBS API Calling Convention

### Memory Setup (Entry Point)

At offset 0x2c (entry point + 8 bytes):
```asm
lea.l 0x0.l, a4    ; Set A4 = absolute address 0x0000
```

**Impact:** All A4-relative accesses become absolute addresses.

### Function Pointer Location

**Address 0x790:** Must contain a pointer to the BBS API dispatcher function

### Parameter Blocks

**Address 0x794:** Parameter block #1 (32 bytes)
**Address 0x79c:** Parameter block #2 (32 bytes)

### Calling Pattern

WHO uses this pattern twice (at 0x1148 and 0x116a):

```asm
; Pattern at 0x1148-0x115a:
subq.w #4, sp              ; Allocate 4 bytes on stack
lea.l 0x794, a0            ; Load param block address
move.l a0, (sp)            ; Push param block pointer to stack
beq.b 0x1164               ; [Never branches - a0 is never zero]
movea.l 0x790.l, a0        ; Load BBS function pointer from 0x790
jsr (a0)                   ; Call BBS API function
tst.l d0                   ; Test return value
beq.b 0x1164               ; If failed (d0=0), skip
moveq #1, d0               ; Success path
cmpi.w #0x7000, d0         ; [Purpose unclear]
```

**Stack layout when BBS function is called:**
```
(sp)   = Return address (from jsr)
4(sp)  = Pointer to parameter block (0x794 or 0x79c)
```

### Return Value

The BBS function returns a value in **D0**:
- `0` = Failure
- `Non-zero` = Success

WHO checks the return value with `tst.l d0` and branches if zero.

---

## Data Table Discovery

At offset 0x3770 in WHO binary:
```
Offset   Data (hex)      Interpretation
------   ----------      --------------
0x3770   0000 0794       Address of param block #1
0x3774   0000 0790       Address of function pointer
0x3778   0000 0005       Unknown value (function code?)
0x377c   0000 0001       Unknown value (flags?)
0x3780   0000 09b8       Unknown address/offset
0x3784   0000 097c       Unknown address/offset
0x3788   0000 08fe       Unknown address/offset
0x378c   0000 08dc       Unknown address/offset
0x3790   0000 08d4       Unknown address/offset
```

**Analysis:** This appears to be initialization or configuration data. The presence of 0x790 and 0x794 suggests this is setup information for the BBS API system.

---

## Parameter Block Structure (Hypothesis)

Based on the calling pattern and WHO's purpose, the parameter blocks likely contain:

### Hypothesis A: Simple Function Code

```c
struct BbsApiParams {
  uint16_t functionCode;     // Which BBS function to call
  uint16_t flags;            // Option flags
  void*    dataPtr;          // Pointer to input/output data
  uint32_t reserved[6];      // Reserved for future use
};
```

### Hypothesis B: Node Query Structure

```c
struct NodeQueryParams {
  uint16_t queryType;        // What to query (users, nodes, etc.)
  uint16_t nodeNumber;       // Which node (0 = all)
  char*    outputBuffer;     // Where to write results
  uint32_t bufferSize;       // Size of output buffer
  uint32_t resultCount;      // [OUT] Number of results
  uint32_t reserved[4];
};
```

### Hypothesis C: No Parameters

The parameter blocks might be **empty** - the BBS function at 0x790 might be a **dispatcher** that determines what to do based on which parameter block address is passed (0x794 vs 0x79c).

- Call with 0x794 → "Get online users"
- Call with 0x79c → "Get node information"

---

## A4-Relative Addresses Used by WHO

Throughout WHO's code, these A4-relative addresses are accessed (remember A4=0):

```
0x8d4(a4)  = absolute 0x8d4  - Some pointer/data
0xc48(a4)  = absolute 0xc48  - Some flag/status byte
0xc4c(a4)  = absolute 0xc4c  - Some pointer
0x8fe(a4)  = absolute 0x8fe  - Some pointer
```

These might be:
- BSS (uninitialized data) section addresses
- Global variables
- BBS-provided data structures

---

## Next Steps for Implementation

### Step 1: Minimal Stub Implementation

Create a BBS API function that:
1. Reads parameter block pointer from stack (4(sp))
2. Logs what it receives
3. Returns success (d0 = 1)

```typescript
public dispatch(): number {
  const sp = this.cpu.getSP();
  const paramBlockPtr = this.cpu.read32(sp + 4);

  console.log(`BBS API called with param block at 0x${paramBlockPtr.toString(16)}`);

  // Read first few longs from param block
  for (let i = 0; i < 8; i++) {
    const value = this.cpu.read32(paramBlockPtr + (i * 4));
    console.log(`  [+${i*4}] = 0x${value.toString(16)}`);
  }

  return 1; // Success
}
```

### Step 2: Run WHO and Analyze Logs

Execute WHO with the stub and see:
- What values are in the parameter blocks
- How many times it's called
- What WHO does with the results

### Step 3: Implement Real Functions

Based on the logged data, implement actual BBS functions like:
- Get node information
- Get user list
- Get node status
- etc.

---

## Questions to Answer

1. ✅ Where is the function pointer? **Answer: Absolute address 0x790**
2. ✅ Where are the parameters? **Answer: Absolute addresses 0x794, 0x79c**
3. ✅ How are they passed? **Answer: Pointer on stack at 4(sp)**
4. ✅ What's the return convention? **Answer: Success/failure in D0**
5. ❓ What's in the parameter blocks? **Answer: TBD via logging**
6. ❓ What do the BBS functions do? **Answer: TBD via analysis**
7. ❓ Are there multiple function codes? **Answer: Maybe - check param block contents**

---

## Implementation Priority

**Phase 1: Get WHO to not crash**
- Set up 0x790 with TRAP handler address
- Implement stub that logs and returns success
- Run WHO and collect data

**Phase 2: Implement first function**
- Analyze logged parameter block data
- Identify what WHO is requesting
- Implement minimal working version (maybe return empty user list)

**Phase 3: Full implementation**
- Connect to real BBS data (database, NodeManager)
- Return actual node/user information
- Format output correctly

---

## References

- WHO binary: `doors/who/who`
- WHO info file: `doors/who/who.info`
- Discovery session: `Documentation/6-Progress/SIM_DOOR_ARCHITECTURE_DISCOVERY_20251202.md`
- Implementation plan: `Documentation/4-Door-Developers/SIM_DOOR_0x790_IMPLEMENTATION_PLAN.md`
