# SIM Door 0x790 Function Table Implementation Plan

**Date Created:** 2025-12-02
**Status:** PLANNING
**Priority:** HIGH (blocks all non-express.e SIM doors)

---

## Overview

WHO door and potentially other SIM doors use a **function table calling convention** where they expect a BBS API dispatcher at absolute memory address **0x790**. Express.e does NOT implement this, so we must add it to the MOIRA emulation layer.

### The Problem

```asm
; WHO door at entry (0x2c):
lea.l 0x0.l, a4                ; Set A4 = absolute zero

; WHO door BBS API call (0x1148-0x115a):
lea.l 0x794, a0                ; Load parameter block address
move.l a0, (sp)                ; Push to stack
movea.l 0x790.l, a0            ; Load function ptr from ABSOLUTE 0x790
jsr (a0)                       ; Call BBS function ← CRASHES HERE
```

**Current behavior:**
- MOIRA starts with clean memory (all zeros)
- Address 0x790 contains 0x00000000
- WHO loads 0x00000000 into a0
- Tries to jsr to address 0x00000000
- **Result:** Crash, illegal instruction, or PC jumps to ROM

---

## Implementation Strategy

### 3-Phase Approach

**Phase 1:** Minimal working implementation
- Set up memory at 0x790 with a TRAP handler
- Implement ONE BBS function (identify which WHO needs first)
- Get WHO to run without crashing

**Phase 2:** Expand API coverage
- Reverse-engineer more BBS API functions from WHO
- Implement enough functions for WHO to work fully
- Test with other SIM doors

**Phase 3:** Complete implementation
- Document all BBS API functions
- Implement full function table
- Create reusable pattern for future SIM doors

---

## Phase 1: Minimal Implementation (Est: 1-2 days)

### Task 1.1: Research WHO's Exact Needs

**Goal:** Identify which BBS API function(s) WHO calls via 0x790

**Steps:**
1. Disassemble WHO completely to find all 0x790 calls
2. Examine what WHO does BEFORE each call (parameter setup)
3. Examine what WHO expects AFTER each call (return values)
4. Identify the BBS function being invoked

**Tools:**
```bash
# Find all 0x790 references
r2 -q -c "e asm.arch=m68k; /x 207900000790" doors/who/who

# Disassemble with context
r2 -q -c "e asm.arch=m68k; s 0x1148; pd 50" doors/who/who
```

**Output:** Document in `WHO_BBS_API_ANALYSIS.md`:
- Parameter block structure at 0x794
- Parameter block structure at 0x79c
- Expected return values
- Which BBS function(s) are being called

### Task 1.2: Design Low-Memory Setup

**Goal:** Reserve and initialize memory region 0x700-0x800 for BBS function tables

**File:** `web/backend/src/amiga-emulation/LibraryManager.ts`

**Additions:**
```typescript
private setupBbsFunctionTable(): void {
  // Reserve low-memory region for SIM door function tables
  const BBS_FUNCTION_TABLE_BASE = 0x790;
  const BBS_PARAM_BLOCK_1 = 0x794;
  const BBS_PARAM_BLOCK_2 = 0x79c;

  // Write function pointer to 0x790 (points to TRAP handler)
  const trapAddress = this.allocateTrapHandler('BBS_API_DISPATCHER');
  this.cpu.write32(BBS_FUNCTION_TABLE_BASE, trapAddress);

  // Initialize parameter blocks with zeros
  for (let i = 0; i < 32; i += 4) {
    this.cpu.write32(BBS_PARAM_BLOCK_1 + i, 0);
    this.cpu.write32(BBS_PARAM_BLOCK_2 + i, 0);
  }
}
```

**Integration Point:**
- Call from `LibraryManager.constructor()` after ROM setup
- Only for SIM-type doors (check `doorConfig.type === 'SIM'`)

### Task 1.3: Implement BBS API Dispatcher

**Goal:** Create TRAP handler that routes BBS API calls to TypeScript implementations

**File:** `web/backend/src/amiga-emulation/api/BbsApiLibrary.ts` (NEW)

```typescript
export class BbsApiLibrary {
  private session: AmigaDoorSession;
  private cpu: any; // MOIRA CPU instance

  constructor(session: AmigaDoorSession, cpu: any) {
    this.session = session;
    this.cpu = cpu;
  }

  /**
   * Main dispatcher - called when door does jsr to address at 0x790
   *
   * Parameters passed via stack:
   *   4(sp) = pointer to parameter block (0x794 or 0x79c)
   *
   * Return value in D0
   */
  public dispatch(): number {
    // Get parameter block pointer from stack
    const sp = this.cpu.getSP();
    const paramBlockPtr = this.cpu.read32(sp + 4);

    // Read function code from parameter block
    // Structure TBD based on research in Task 1.1
    const functionCode = this.cpu.read16(paramBlockPtr);

    // Route to appropriate handler
    switch (functionCode) {
      case 0x0001:
        return this.bbsFunction001(paramBlockPtr);
      case 0x0002:
        return this.bbsFunction002(paramBlockPtr);
      // More cases as discovered
      default:
        console.error(`Unknown BBS API function: 0x${functionCode.toString(16)}`);
        return 0; // Failure
    }
  }

  private bbsFunction001(paramBlockPtr: number): number {
    // Implementation based on research
    // Read params from paramBlockPtr
    // Call appropriate BBS methods
    // Write results back to param block
    // Return success/failure code
    return 1; // Success
  }
}
```

**TRAP Registration:**
```typescript
// In LibraryManager.ts
import { BbsApiLibrary } from './api/BbsApiLibrary';

this.bbsApi = new BbsApiLibrary(this.session, this.cpu);

this.registerTrap('BBS_API_DISPATCHER', () => {
  const result = this.bbsApi.dispatch();
  this.cpu.setD0(result);
});
```

### Task 1.4: Test with WHO Door

**Goal:** Verify WHO runs without crashing

**Test Script:** `dev/scripts/test-who-door.ts`

```typescript
import { AmigaDoorSession } from '../web/backend/src/amiga-emulation/AmigaDoorSession';

async function testWhoDoor() {
  const session = new AmigaDoorSession({
    doorPath: 'doors/who/who',
    doorType: 'SIM',
    nodeNumber: 1,
    userId: 'test-user',
    onOutput: (data) => console.log('WHO output:', data),
    onExit: (code) => console.log('WHO exit code:', code)
  });

  await session.start();

  // Wait for execution
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('Test complete');
}

testWhoDoor().catch(console.error);
```

**Success Criteria:**
- ✅ WHO loads without crashing
- ✅ WHO calls 0x790 dispatcher
- ✅ Dispatcher receives parameter block
- ✅ (May not produce correct output yet - that's Phase 2)

---

## Phase 2: Full WHO Support (Est: 2-3 days)

### Task 2.1: Reverse Engineer BBS API Functions

**Goal:** Understand ALL BBS functions WHO uses

**Methods:**
1. **Static analysis:** Disassemble WHO completely
2. **Dynamic analysis:** Add logging to dispatcher
3. **Compare:** Check if express.e has similar functions (via MCP)

**Output:** Document each function:
- Function code / ID
- Parameter structure
- What it does (get user list, node status, etc.)
- Return value format
- Express.e equivalent (if any)

### Task 2.2: Implement Required BBS Functions

**Goal:** Implement enough functions for WHO to work fully

**Example Functions** (TBD based on research):
```typescript
// Get node information
private bbsGetNodeInfo(paramBlock: number): number {
  const nodeNum = this.cpu.read16(paramBlock + 0);
  const resultPtr = this.cpu.read32(paramBlock + 2);

  // Query BBS database for node info
  const nodeInfo = await this.session.getNodeInfo(nodeNum);

  // Write result to memory
  this.writeNodeInfo(resultPtr, nodeInfo);

  return 1; // Success
}

// Get user information
private bbsGetUserInfo(paramBlock: number): number {
  const userName = this.readString(paramBlock);
  const userInfo = await this.session.getUserInfo(userName);

  // Write to result buffer
  this.writeUserInfo(paramBlock + 256, userInfo);

  return 1; // Success
}
```

### Task 2.3: Integrate with BBS Backend

**Goal:** Connect BBS API functions to real BBS data

**Required Access:**
- Database queries (user list, node status)
- File system (read node*.txt files)
- Session state (current user, node number)
- Configuration (BBS name, settings)

**Implementation:**
```typescript
export class BbsApiLibrary {
  private db: Database;
  private nodeManager: NodeManager;

  constructor(
    session: AmigaDoorSession,
    cpu: any,
    db: Database,
    nodeManager: NodeManager
  ) {
    this.session = session;
    this.cpu = cpu;
    this.db = db;
    this.nodeManager = nodeManager;
  }

  private async bbsGetUserList(paramBlock: number): Promise<number> {
    // Get list of online users from NodeManager
    const users = await this.nodeManager.getOnlineUsers();

    // Write to parameter block
    const resultPtr = this.cpu.read32(paramBlock + 4);
    for (let i = 0; i < users.length; i++) {
      this.writeUserEntry(resultPtr + (i * 64), users[i]);
    }

    return users.length;
  }
}
```

### Task 2.4: End-to-End WHO Testing

**Goal:** WHO door works completely

**Success Criteria:**
- ✅ WHO displays user list
- ✅ Shows correct node numbers
- ✅ Shows correct usernames
- ✅ Formats output properly
- ✅ Exits cleanly

---

## Phase 3: Generalization (Est: 1-2 days)

### Task 3.1: Test with Other SIM Doors

**Candidate doors:**
- WHAT (node activity display)
- SizeCheck (file size utility)
- MultiTop (statistics)

**For each door:**
1. Test with current implementation
2. Document any new BBS API functions needed
3. Implement missing functions
4. Repeat until door works

### Task 3.2: Documentation

**Files to create:**
```
Documentation/4-Door-Developers/
  ├── SIM_DOOR_BBS_API_REFERENCE.md
  │   └── Complete list of all BBS API functions
  │       - Function codes
  │       - Parameter structures
  │       - Return values
  │       - Examples
  │
  ├── SIM_DOOR_PORTING_GUIDE.md
  │   └── How to port SIM doors to TypeScript (alternative to emulation)
  │
  └── SIM_DOOR_TROUBLESHOOTING.md
      └── Common issues and solutions
```

### Task 3.3: Refactoring & Optimization

**Goal:** Clean, maintainable code

**Improvements:**
- Extract parameter block reading into helper functions
- Create TypeScript interfaces for all structures
- Add comprehensive error handling
- Add logging/debugging support
- Performance profiling

---

## Technical Details

### Memory Map (SIM Door Convention)

```
Address Range    Purpose
-------------    -------
0x000 - 0x3FF    AmigaOS exception vectors (DO NOT TOUCH)
0x400 - 0x6FF    Free (can use for other BBS structures)
0x700 - 0x78F    Reserved for future expansion
0x790            BBS API dispatcher function pointer
0x794            Parameter block #1 (32 bytes)
0x79C            Parameter block #2 (32 bytes)
0x7B0 - 0x7FF    Additional parameter blocks (as needed)
0x800 - 0x8FF    BBS global data (if needed)
0x1000+          Door code (loaded by MOIRA)
```

### TRAP Handler Pattern

All BBS API functions follow this pattern:

```typescript
1. Door prepares parameter block in memory (0x794 or 0x79c)
2. Door loads function pointer from 0x790 into a0
3. Door calls jsr (a0)
4. MOIRA triggers TRAP (illegal instruction)
5. LibraryManager routes to BbsApiLibrary.dispatch()
6. Dispatcher reads parameter block, identifies function
7. Dispatcher calls appropriate TypeScript implementation
8. Implementation updates parameter block with results
9. Dispatcher returns success/failure code in D0
10. Door continues execution
```

### Parameter Block Structure (TBD)

```c
// Example structure (to be confirmed via research)
struct BbsApiParams {
  uint16_t functionCode;     // +0x00: Which function to call
  uint16_t flags;            // +0x02: Option flags
  uint32_t param1;           // +0x04: First parameter
  uint32_t param2;           // +0x08: Second parameter
  uint32_t resultPtr;        // +0x0C: Pointer to result buffer
  uint32_t reserved[4];      // +0x10: For future use
};
```

---

## Files to Modify/Create

### New Files

- `web/backend/src/amiga-emulation/api/BbsApiLibrary.ts` - Main dispatcher
- `web/backend/src/amiga-emulation/api/BbsApiStructures.ts` - TypeScript interfaces
- `dev/scripts/test-who-door.ts` - Test script
- `Documentation/4-Door-Developers/SIM_DOOR_BBS_API_REFERENCE.md`
- `Documentation/4-Door-Developers/SIM_DOOR_PORTING_GUIDE.md`
- `Documentation/4-Door-Developers/WHO_BBS_API_ANALYSIS.md`

### Modified Files

- `web/backend/src/amiga-emulation/LibraryManager.ts`
  - Add `setupBbsFunctionTable()`
  - Register BBS_API_DISPATCHER trap
  - Initialize BbsApiLibrary

- `web/backend/src/amiga-emulation/AmigaDoorSession.ts`
  - Pass Database and NodeManager to LibraryManager
  - Add BBS API configuration options

- `web/backend/src/amiga-emulation/DoorLoader.ts`
  - Ensure SIM doors trigger low-memory setup
  - Add logging for BBS API calls

---

## Testing Strategy

### Unit Tests

```typescript
describe('BbsApiLibrary', () => {
  it('should dispatch function 0x0001 correctly', () => {
    const mockCpu = createMockCpu();
    const bbsApi = new BbsApiLibrary(session, mockCpu, db, nodeManager);

    // Set up parameter block
    mockCpu.write16(0x794, 0x0001); // Function code
    mockCpu.write32(0x798, 0x1000); // Result pointer

    const result = bbsApi.dispatch();

    expect(result).toBe(1); // Success
    expect(mockCpu.read32(0x1000)).toBeDefined();
  });
});
```

### Integration Tests

```bash
# Test WHO door end-to-end
npx ts-node dev/scripts/test-who-door.ts

# Test multiple SIM doors
npx ts-node dev/scripts/test-all-sim-doors.ts
```

### Manual Testing

```bash
# Start BBS
./dev/scripts/start-servers.sh

# Login as sysop
# Type: WHO
# Expected: List of online users

# Type: WHAT
# Expected: Node activity display
```

---

## Risks & Mitigation

### Risk 1: Unknown Parameter Structure

**Mitigation:**
- Start with minimal implementation
- Add logging to capture actual parameter values
- Compare with other Amiga BBS implementations if available

### Risk 2: Performance Impact

**Mitigation:**
- Profile dispatcher overhead
- Cache frequently-used data
- Consider compiling hot paths to WASM

### Risk 3: Incomplete API Coverage

**Mitigation:**
- Document all discovered functions
- Implement stubbed versions that return "not implemented"
- Let doors fail gracefully with clear error messages

---

## Success Metrics

**Phase 1 Complete:**
- ✅ WHO door launches without crashing
- ✅ Dispatcher receives at least 1 function call
- ✅ No illegal instruction errors

**Phase 2 Complete:**
- ✅ WHO door displays user list
- ✅ Output matches expected format
- ✅ All BBS API functions WHO needs are implemented

**Phase 3 Complete:**
- ✅ 3+ SIM doors working
- ✅ BBS API reference document complete
- ✅ Porting guide published
- ✅ Zero TypeScript errors

---

## Timeline Estimate

| Phase | Tasks | Est. Time | Dependencies |
|-------|-------|-----------|--------------|
| Phase 1 | Research & minimal impl | 1-2 days | None |
| Phase 2 | Full WHO support | 2-3 days | Phase 1 |
| Phase 3 | Generalization | 1-2 days | Phase 2 |
| **Total** | | **4-7 days** | |

**Assumptions:**
- Full-time work
- No major blockers
- BBS backend APIs already exist

---

## Next Actions

1. **Update handoff.md** with this plan reference
2. **Start Phase 1, Task 1.1:** Disassemble WHO completely
3. **Create research document:** `WHO_BBS_API_ANALYSIS.md`
4. **Schedule:** Block 1-2 days for focused implementation

---

## References

- **Discovery Session:** `Documentation/6-Progress/SIM_DOOR_ARCHITECTURE_DISCOVERY_20251202.md`
- **WHO Implementation (Nov 10):** `Documentation/6-Progress/WHO_DOOR_IMPLEMENTATION_20251110.md`
- **Express.e Source:** Via MCP tools (`mcp__amiexpress-docs__*`)
- **WHO Binary:** `doors/who/who`
- **Commit with SIM type support:** `855c2eea`

---

**Status:** READY TO START
**Owner:** TBD
**Priority:** HIGH (blocks multiple doors)
**Complexity:** MEDIUM (well-defined problem, clear solution)
